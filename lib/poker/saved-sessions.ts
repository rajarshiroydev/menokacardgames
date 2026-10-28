import type { NeonQueryFunctionInTransaction } from "@neondatabase/serverless";

import type { ChipUnit } from "./money.ts";
import type { SavedSession } from "./session-conflict.ts";
import type { PokerSession } from "./types";

/**
 * Reading a host's saved games from the database, shared by the sessions API
 * and the results card.
 */

export type SessionRow = {
  discarded_at: Date | string | null;
  id: string;
  game_name: string | null;
  session_number: number | string;
  played_at: Date | string;
  ended_at: Date | string;
  chip_unit: ChipUnit;
  game_kind: "hands" | "ledger";
  ante: number | string;
  starting_stack: number | string;
  hands: number | string;
  blind_history: PokerSession["blindHistory"] | null;
  rebuy_rules: PokerSession["rebuyRules"] | null;
  big_blind_ante: boolean;
  rake_rules: PokerSession["rakeRules"] | null;
  rake: number | string;
  chip_value_chips: number | string | null;
  chip_value_cents: number | string | null;
  results: PokerSession["results"];
  has_action_log: boolean;
};

export function mapSession(row: SessionRow): SavedSession {
  return {
    ...(row.game_kind === "ledger" ? { kind: "ledger" as const } : {}),
    id: row.id,
    name: row.game_name?.trim() || `Game ${Number(row.session_number)}`,
    sessionNumber: Number(row.session_number),
    ...(row.discarded_at
      ? { discardedAt: new Date(row.discarded_at).getTime() }
      : {}),
    date: new Date(row.played_at).getTime(),
    ended: new Date(row.ended_at).getTime(),
    ...(row.chip_unit === "cents" ? { chipUnit: row.chip_unit } : {}),
    ante: Number(row.ante),
    ...(row.blind_history ? { blindHistory: row.blind_history } : {}),
    startStack: Number(row.starting_stack),
    ...(row.rebuy_rules ? { rebuyRules: row.rebuy_rules } : {}),
    ...(row.big_blind_ante ? { bigBlindAnte: true } : {}),
    ...(row.rake_rules ? { rakeRules: row.rake_rules } : {}),
    ...(Number(row.rake) > 0 ? { rake: Number(row.rake) } : {}),
    ...(row.chip_value_chips !== null && row.chip_value_cents !== null
      ? {
          chipValue: {
            chips: Number(row.chip_value_chips),
            cents: Number(row.chip_value_cents),
          },
        }
      : {}),
    hands: Number(row.hands),
    results: row.results,
    ...(row.has_action_log ? { hasActionLog: true as const } : {}),
  };
}

export type TransactionSql = NeonQueryFunctionInTransaction<false, false>;

/**
 * Saved sessions with their verified results; `ids` narrows to those IDs.
 * Each result is named as the owner's player list names that player now
 * (player_display_names: the chosen name for anyone with an account, the
 * guest's current name otherwise), not as it was when the game was saved;
 * the saved name is kept only for a player that no longer exists. Saving
 * matches players by ID, so the name is a label only. Runs as the owner.
 */
export function selectSessions(
  sql: TransactionSql,
  ownerId: string,
  ids: string[] | null,
) {
  return sql`
        WITH names AS MATERIALIZED (
          SELECT player_id, display_name FROM public.player_display_names()
        )
        SELECT
          id,
          game_name,
          owner_session_number AS session_number,
          played_at,
          ended_at,
          chip_unit,
          game_kind,
          ante,
          starting_stack,
          hands,
          blind_history,
          rebuy_rules,
          big_blind_ante,
          rake_rules,
          rake,
          chip_value_chips,
          chip_value_cents,
          normalized.results,
          discarded_at,
          -- Only whether there is a log; the log itself is fetched per game.
          action_log IS NOT NULL AS has_action_log
        FROM poker_sessions AS session
        JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'playerId', result.player_id,
              'name', COALESCE(
                (
                  SELECT names.display_name FROM names
                  WHERE names.player_id = result.player_id
                ),
                result.player_name
              ),
              'net', result.net,
              'end', result.ending_stack
            ) || CASE
              WHEN buy_ins.buy_ins IS NULL
                OR (
                  jsonb_array_length(buy_ins.buy_ins) = 1
                  AND (buy_ins.buy_ins->>0)::bigint = session.starting_stack
                ) THEN '{}'::jsonb
              ELSE jsonb_build_object('buyIns', buy_ins.buy_ins)
            END || public.result_seat_record(result)
            ORDER BY result.position
          ) AS results
          FROM session_results AS result
          LEFT JOIN LATERAL (
            SELECT jsonb_agg(event.amount ORDER BY event.sequence) AS buy_ins
            FROM buy_in_events AS event
            WHERE event.owner_id = result.owner_id
              AND event.session_record_id = result.session_record_id
              AND event.player_id = result.player_id
          ) AS buy_ins ON true
          WHERE result.owner_id = session.owner_id
            AND result.session_record_id = session.record_id
            AND result.accounting_status IN ('verified', 'legacy_verified')
          HAVING count(*) > 0
        ) AS normalized ON true
        WHERE session.owner_id = ${ownerId}::uuid
          AND (
            ${ids}::text[] IS NULL
            OR session.id = ANY(${ids}::text[])
          )
        ORDER BY session.played_at DESC, session.created_at DESC
  `;
}
