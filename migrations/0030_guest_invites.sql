BEGIN;

-- Invite a guest to Pokerize (0030). A host makes a one-person link for one
-- of their own guests (never a friend's guest: user decision 2026-10-26).
-- Whoever opens it, signs in and confirms "that's me" becomes the host's
-- friend, and the guest is linked to their account with every game kept, as
-- if the host had sent a request naming that guest. The link is a random
-- token; only its SHA-256 is stored. A link works once, for 30 days, and
-- stops working once the guest is linked, removed or invited again.
CREATE TABLE IF NOT EXISTS guest_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  player_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  used_at timestamptz,
  used_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  outcome text CHECK (outcome IN ('accepted', 'declined', 'replaced')),
  FOREIGN KEY (owner_id, player_id) REFERENCES players (owner_id, id) ON DELETE CASCADE,
  CONSTRAINT guest_invites_expiry_bounded CHECK (
    expires_at <= created_at + interval '30 days'
  ),
  CONSTRAINT guest_invites_used_shape CHECK (
    (used_at IS NULL) = (outcome IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS guest_invites_owner_idx
  ON guest_invites (owner_id, player_id);

-- No grants: the runtime role reaches invites only through the functions.
ALTER TABLE guest_invites ENABLE ROW LEVEL SECURITY;

-- The guest an invite names, when the invite can still be used: unused, not
-- expired, the host active and named, and the guest one of the host's
-- current, unlinked guests (not the host's own player).
CREATE OR REPLACE FUNCTION public.guest_invite_valid(p_token_hash bytea)
RETURNS TABLE (invite_id uuid, owner_id uuid, owner_name text, owner_avatar text, player_id text, player_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT invite.id, host.id, host.display_name, host.avatar, player.id, player.name
  FROM public.guest_invites AS invite
  JOIN public.accounts AS host ON host.id = invite.owner_id
  JOIN public.players AS player
    ON player.owner_id = invite.owner_id AND player.id = invite.player_id
  WHERE invite.token_hash = p_token_hash
    AND invite.used_at IS NULL
    AND invite.expires_at > now()
    AND host.lifecycle_state = 'active'
    AND host.display_name IS NOT NULL
    AND player.deleted_at IS NULL
    AND player.linked_account_id IS NULL
    AND player.id IS DISTINCT FROM host.self_player_id
$$;

-- Makes an invite for one of the caller's own guests. A newer invite for the
-- same guest replaces an unused older one. At most 20 usable invites at once.
CREATE OR REPLACE FUNCTION public.guest_invite_create(p_player_id text, p_token_hash bytea)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
  caller_account public.accounts%ROWTYPE;
  created public.guest_invites%ROWTYPE;
BEGIN
  -- Serialises one host's invites, so the limit holds.
  SELECT * INTO caller_account FROM public.accounts WHERE id = caller FOR UPDATE;
  IF caller_account.display_name IS NULL THEN
    RAISE EXCEPTION 'friend:name-required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.players AS player
    WHERE player.owner_id = caller
      AND player.id = p_player_id
      AND player.deleted_at IS NULL
      AND player.linked_account_id IS NULL
      AND player.id IS DISTINCT FROM caller_account.self_player_id
  ) THEN
    RAISE EXCEPTION 'invite:player-unavailable';
  END IF;

  UPDATE public.guest_invites
  SET used_at = now(), outcome = 'replaced'
  WHERE owner_id = caller AND player_id = p_player_id AND used_at IS NULL;

  IF (
    SELECT count(*) FROM public.guest_invites
    WHERE owner_id = caller AND used_at IS NULL AND expires_at > now()
  ) >= 20 THEN
    RAISE EXCEPTION 'invite:too-many';
  END IF;

  INSERT INTO public.guest_invites (token_hash, owner_id, player_id)
  VALUES (p_token_hash, caller, p_player_id)
  RETURNING * INTO created;

  PERFORM public.friend_audit(caller, 'invite.created', 'guest_invite', created.id::text);
  RETURN jsonb_build_object(
    'expiresAt', (extract(epoch FROM created.expires_at) * 1000)::bigint
  );
END
$$;

-- What the invite page shows before anyone signs in: the host's name and
-- avatar and the guest's name, while the invite can be used. Nothing else
-- reaches the phone; the host's account id stays on the server, which uses
-- it to tell the host their own link apart.
CREATE OR REPLACE FUNCTION public.guest_invite_preview(p_token_hash bytea)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'hostAccountId', valid.owner_id,
    'hostName', valid.owner_name,
    'hostAvatar', valid.owner_avatar,
    'guestName', valid.player_name
  )
  FROM public.guest_invite_valid(p_token_hash) AS valid
$$;

-- The signed-in person answers "Are you <guest>?". Yes: any pending request
-- between them and the host is cancelled, then a request from the host
-- naming the guest is made and accepted for them by friend_accept, which
-- links the guest to the caller and gives the caller a player for the host.
-- No: the invite is used up and nothing else changes.
CREATE OR REPLACE FUNCTION public.guest_invite_answer(p_token_hash bytea, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
  caller_name text;
  valid record;
  request_id uuid;
  host_player_name text;
  suffix int := 1;
BEGIN
  SELECT display_name INTO caller_name FROM public.accounts WHERE id = caller;
  IF caller_name IS NULL THEN
    RAISE EXCEPTION 'friend:name-required';
  END IF;

  SELECT * INTO valid FROM public.guest_invite_valid(p_token_hash);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite:not-found';
  END IF;
  -- One answer per invite, even if two arrive at once.
  PERFORM 1 FROM public.guest_invites
  WHERE id = valid.invite_id AND used_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite:not-found';
  END IF;
  IF valid.owner_id = caller THEN
    RAISE EXCEPTION 'invite:self';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.guest_invites
    SET used_at = now(), used_by = caller, outcome = 'declined'
    WHERE id = valid.invite_id;
    PERFORM public.friend_audit(valid.owner_id, 'invite.declined', 'guest_invite', valid.invite_id::text);
    RETURN jsonb_build_object('accepted', false);
  END IF;

  IF public.friend_relation(caller, valid.owner_id) = 'friends' THEN
    RAISE EXCEPTION 'invite:already-friends';
  END IF;

  UPDATE public.friend_requests
  SET status = 'cancelled', responded_at = now()
  WHERE status = 'pending'
    AND (
      (from_account_id = caller AND to_account_id = valid.owner_id)
      OR (from_account_id = valid.owner_id AND to_account_id = caller)
    );

  INSERT INTO public.friend_requests (from_account_id, to_account_id, from_player_id)
  VALUES (valid.owner_id, caller, valid.player_id)
  RETURNING id INTO request_id;

  -- The caller's player for the host: the host's name, numbered if taken.
  host_player_name := valid.owner_name;
  WHILE EXISTS (
    SELECT 1 FROM public.players
    WHERE owner_id = caller AND name_key = lower(host_player_name)
  ) LOOP
    suffix := suffix + 1;
    host_player_name := valid.owner_name || ' (' || suffix || ')';
  END LOOP;

  PERFORM public.friend_accept(request_id, NULL, host_player_name);

  IF NOT EXISTS (
    SELECT 1 FROM public.players
    WHERE owner_id = valid.owner_id
      AND id = valid.player_id
      AND linked_account_id = caller
  ) THEN
    RAISE EXCEPTION 'invite:not-found';
  END IF;

  UPDATE public.guest_invites
  SET used_at = now(), used_by = caller, outcome = 'accepted'
  WHERE id = valid.invite_id;
  PERFORM public.friend_audit(valid.owner_id, 'invite.accepted', 'guest_invite', valid.invite_id::text);
  RETURN jsonb_build_object('accepted', true, 'hostName', valid.owner_name);
END
$$;

REVOKE ALL ON FUNCTION public.guest_invite_valid(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_invite_create(text, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_invite_preview(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_invite_answer(bytea, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_invite_create(text, bytea) TO menoka_app;
GRANT EXECUTE ON FUNCTION public.guest_invite_preview(bytea) TO menoka_app;
GRANT EXECUTE ON FUNCTION public.guest_invite_answer(bytea, boolean) TO menoka_app;

INSERT INTO app_migrations (version)
VALUES ('0030_guest_invites')
ON CONFLICT (version) DO NOTHING;

COMMIT;
