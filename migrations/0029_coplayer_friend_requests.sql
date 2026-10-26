BEGIN;

-- Friend requests from a friend's standings (0029): a player with an account
-- who sat at the same table as the caller, in a game a friend hosted, can be
-- sent a request without their user code. friend_relations() tells the
-- standings which players already are friends or have a request waiting;
-- friend_send_coplayer() checks the shared game, then sends as friend_send()
-- does, with the same limits and refusals. No table changes.

-- How the caller stands with each of these accounts ('self', 'friends',
-- 'request-sent', 'request-received' or 'none'), as one JSON object keyed by
-- account id. Accounts that aren't active are left out, so the app offers
-- no request to them.
CREATE OR REPLACE FUNCTION public.friend_relations(p_accounts uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
BEGIN
  IF cardinality(p_accounts) > 500 THEN
    RAISE EXCEPTION 'friend:not-found';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(other.id, public.friend_relation(caller, other.id))
    FROM public.accounts AS other
    WHERE other.id = ANY (p_accounts)
      AND other.lifecycle_state = 'active'
  ), '{}'::jsonb);
END
$$;

-- Sends a request to an account the caller has played with: both have a
-- verified result in the same saved game of a host who is the caller's
-- active friend and has the caller as a linked player, which is a game the
-- caller sees in friend_group_sessions(). The target is the host's own
-- player or a player linked to them. Anything else is 'friend:not-found'.
CREATE OR REPLACE FUNCTION public.friend_send_coplayer(p_account uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
  target_code text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.players AS linked
    JOIN public.accounts AS host ON host.id = linked.owner_id
    JOIN public.poker_sessions AS session
      ON session.owner_id = host.id AND session.discarded_at IS NULL
    JOIN public.session_results AS mine
      ON mine.owner_id = session.owner_id
      AND mine.session_record_id = session.record_id
      AND mine.player_id = linked.id
      AND mine.accounting_status IN ('verified', 'legacy_verified')
    JOIN public.session_results AS theirs
      ON theirs.owner_id = session.owner_id
      AND theirs.session_record_id = session.record_id
      AND theirs.accounting_status IN ('verified', 'legacy_verified')
    LEFT JOIN public.players AS their_player
      ON their_player.owner_id = theirs.owner_id
      AND their_player.id = theirs.player_id
    WHERE linked.linked_account_id = caller
      AND host.lifecycle_state = 'active'
      AND EXISTS (
        SELECT 1 FROM public.friend_connections
        WHERE account_low = LEAST(caller, host.id)
          AND account_high = GREATEST(caller, host.id)
      )
      AND (
        (theirs.player_id = host.self_player_id AND host.id = p_account)
        OR their_player.linked_account_id = p_account
      )
  ) THEN
    RAISE EXCEPTION 'friend:not-found';
  END IF;

  SELECT user_code INTO target_code
  FROM public.accounts
  WHERE id = p_account AND lifecycle_state = 'active';
  IF target_code IS NULL THEN
    RAISE EXCEPTION 'friend:not-found';
  END IF;

  RETURN public.friend_send(target_code, NULL, NULL);
END
$$;

REVOKE ALL ON FUNCTION public.friend_relations(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friend_send_coplayer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.friend_relations(uuid[]) TO menoka_app;
GRANT EXECUTE ON FUNCTION public.friend_send_coplayer(uuid) TO menoka_app;

INSERT INTO app_migrations (version)
VALUES ('0029_coplayer_friend_requests')
ON CONFLICT (version) DO NOTHING;

COMMIT;
