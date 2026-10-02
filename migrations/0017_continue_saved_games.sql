BEGIN;

-- Continue a saved game. When a host plays on with a saved game and saves
-- it again, the API updates the poker_sessions row in place (keeping its
-- record ID, game number and provenance) and replaces that game's verified
-- results and buy-ins. Row security on both tables is already FOR ALL and
-- limited to the caller's own account (0005), so this only adds DELETE.
GRANT DELETE ON session_results TO menoka_app;
GRANT DELETE ON buy_in_events TO menoka_app;

INSERT INTO app_migrations (version)
VALUES ('0017_continue_saved_games')
ON CONFLICT (version) DO NOTHING;

COMMIT;
