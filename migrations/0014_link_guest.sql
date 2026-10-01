BEGIN;

-- Linking a guest to a friend after the request was accepted. A request no
-- longer names a guest when it is sent, so accepting gives the sender a new
-- player for the friend. This moves the friend link from that player to one
-- of the caller's guests and deletes the player the link came from. Any games
-- that player has move to the guest first (the normalised results, their
-- buy-ins and the session's stored results), which can't be undone; it is
-- refused when both played in the same game. Runs as the owner, so the link
-- guard on players doesn't apply.
CREATE OR REPLACE FUNCTION public.friend_link_guest(
  p_friend_account_id uuid,
  p_guest_player_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
  current_player text;
  guest public.players%ROWTYPE;
  moved_games int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.friend_connections
    WHERE account_low = LEAST(caller, p_friend_account_id)
      AND account_high = GREATEST(caller, p_friend_account_id)
  ) THEN
    RAISE EXCEPTION 'friend:not-friends';
  END IF;

  SELECT id INTO current_player
  FROM public.players
  WHERE owner_id = caller AND linked_account_id = p_friend_account_id
  FOR UPDATE;

  SELECT * INTO guest
  FROM public.players AS player
  WHERE player.id = p_guest_player_id
    AND player.owner_id = caller
    AND player.deleted_at IS NULL
    AND player.linked_account_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = caller AND self_player_id = player.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.friend_requests AS request
      WHERE request.from_account_id = caller
        AND request.status = 'pending'
        AND request.from_player_id = player.id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'friend:player-unavailable';
  END IF;

  IF current_player IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.session_results AS mine
      JOIN public.session_results AS theirs
        ON theirs.owner_id = mine.owner_id
       AND theirs.session_record_id = mine.session_record_id
      WHERE mine.owner_id = caller
        AND mine.player_id = current_player
        AND theirs.player_id = guest.id
    ) THEN
      RAISE EXCEPTION 'friend:same-game';
    END IF;

    -- One statement, so the buy-ins' foreign key to the results is checked
    -- only once both have moved.
    WITH moved_results AS (
      UPDATE public.session_results
      SET player_id = guest.id
      WHERE owner_id = caller AND player_id = current_player
      RETURNING 1
    ), moved_buy_ins AS (
      UPDATE public.buy_in_events
      SET player_id = guest.id
      WHERE owner_id = caller AND player_id = current_player
      RETURNING 1
    )
    SELECT count(*) INTO moved_games FROM moved_results;

    UPDATE public.poker_sessions AS session
    SET results = (
      SELECT jsonb_agg(
        CASE
          WHEN entry.value->>'playerId' = current_player
            THEN entry.value || jsonb_build_object('playerId', guest.id)
          ELSE entry.value
        END
        ORDER BY entry.ordinality
      )
      FROM jsonb_array_elements(session.results) WITH ORDINALITY AS entry(value, ordinality)
    )
    WHERE session.owner_id = caller
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(session.results) AS entry(value)
        WHERE entry.value->>'playerId' = current_player
      );

    -- Unlink first: a host links each friend to one player at most.
    UPDATE public.players SET linked_account_id = NULL WHERE id = current_player;
  END IF;

  UPDATE public.players
  SET linked_account_id = p_friend_account_id
  WHERE id = guest.id;

  IF current_player IS NOT NULL THEN
    DELETE FROM public.players WHERE id = current_player;
  END IF;

  PERFORM public.friend_audit(caller, 'friend.guest_linked', 'player', guest.id);
  RETURN jsonb_build_object(
    'playerId', guest.id,
    'name', guest.name,
    'movedGames', moved_games
  );
END
$$;

REVOKE ALL ON FUNCTION public.friend_link_guest(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.friend_link_guest(uuid, text) TO menoka_app;

INSERT INTO app_migrations (version)
VALUES ('0014_link_guest')
ON CONFLICT (version) DO NOTHING;

COMMIT;
