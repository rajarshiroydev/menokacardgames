import {
  requireHostAccount,
  requireRecentHostAccount,
} from "@/lib/auth/server";
import { deriveSessionAccounting } from "@/lib/poker/accounting";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import { playerNameKey } from "@/lib/poker/player-validation";
import {
  isSameSession,
  SESSION_CONFLICT,
  type SavedSession,
} from "@/lib/poker/session-conflict";
import {
  MAX_SESSIONS_PER_REQUEST,
  validateSession,
} from "@/lib/poker/session-validation";
import type { PokerSession, SessionResult } from "@/lib/poker/types";
import {
  readJsonBody,
  SESSION_BATCH_BODY_LIMIT,
  SMALL_JSON_BODY_LIMIT,
} from "@/lib/security/json-body";
import type { NeonQueryFunctionInTransaction } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

type SessionRow = {
  discarded_at: Date | string | null;
  id: string;
  game_name: string | null;
  session_number: number | string;
  played_at: Date | string;
  ended_at: Date | string;
  ante: number | string;
  starting_stack: number | string;
  hands: number | string;
  blind_history: PokerSession["blindHistory"] | null;
  results: PokerSession["results"];
};

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function mapSession(row: SessionRow): SavedSession {
  return {
    id: row.id,
    name: row.game_name?.trim() || `Game ${Number(row.session_number)}`,
    sessionNumber: Number(row.session_number),
    ...(row.discarded_at
      ? { discardedAt: new Date(row.discarded_at).getTime() }
      : {}),
    date: new Date(row.played_at).getTime(),
    ended: new Date(row.ended_at).getTime(),
    ante: Number(row.ante),
    ...(row.blind_history ? { blindHistory: row.blind_history } : {}),
    startStack: Number(row.starting_stack),
    hands: Number(row.hands),
    results: row.results,
  };
}

type TransactionSql = NeonQueryFunctionInTransaction<false, false>;

/** Saved sessions with their verified results; `ids` narrows to those IDs. */
function selectSessions(
  sql: TransactionSql,
  ownerId: string,
  ids: string[] | null,
) {
  return sql`
        SELECT
          id,
          game_name,
          owner_session_number AS session_number,
          played_at,
          ended_at,
          ante,
          starting_stack,
          hands,
          blind_history,
          normalized.results,
          discarded_at
        FROM poker_sessions AS session
        JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'playerId', result.player_id,
              'name', result.player_name,
              'net', result.net,
              'end', result.ending_stack
            ) || CASE
              WHEN buy_ins.buy_ins IS NULL
                OR (
                  jsonb_array_length(buy_ins.buy_ins) = 1
                  AND (buy_ins.buy_ins->>0)::bigint = session.starting_stack
                ) THEN '{}'::jsonb
              ELSE jsonb_build_object('buyIns', buy_ins.buy_ins)
            END
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

export async function GET() {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  try {
    const [sessionsResult, counterResult] = await runAsAuthenticatedUser(
      authUserId,
      (sql) => [
        selectSessions(sql, ownerId, null),
        sql`
          SELECT next_session_number
          FROM accounts
          WHERE id = ${ownerId}::uuid
        `,
      ],
    );
    const rows = sessionsResult as SessionRow[];
    const [counter] = counterResult as Array<{
      next_session_number: number | string;
    }>;
    const allSessions = rows.map(mapSession);
    const sessions = allSessions.filter((session) => !session.discardedAt);
    const discardedSessions = allSessions.filter(
      (session) => session.discardedAt,
    );
    const nextSessionNumber = counter
      ? Number(counter.next_session_number)
      : 1;
    return json({ discardedSessions, sessions, nextSessionNumber });
  } catch (error) {
    console.error("sessions GET error", error);
    return json({ error: "Could not reach the ledger database" }, 500);
  }
}

type PlayerRecord = { id: string; name: string; name_key: string };

type PlayerDirectory = {
  byId: Map<string, PlayerRecord>;
  byName: Map<string, PlayerRecord>;
};

function playerDirectory(rows: PlayerRecord[]): PlayerDirectory {
  return {
    byId: new Map(rows.map((player) => [player.id, player])),
    byName: new Map(rows.map((player) => [player.name_key, player])),
  };
}

function findPlayer(result: SessionResult, players: PlayerDirectory) {
  return result.playerId
    ? players.byId.get(result.playerId)
    : players.byName.get(playerNameKey(result.name));
}

/** Replaces each result's player with the owner's record, or returns null. */
function resolveSession(
  session: PokerSession,
  players: PlayerDirectory,
): PokerSession | null {
  const results: SessionResult[] = [];
  for (const result of session.results) {
    const player = findPlayer(result, players);
    if (!player) return null;
    results.push({
      playerId: player.id,
      name: player.name,
      net: result.net,
      end: result.end,
      ...(result.buyIns ? { buyIns: result.buyIns } : {}),
    });
  }
  return { ...session, results };
}

/** IDs of incoming sessions that differ from the saved session with that ID. */
function conflictingSessionIds(
  sessions: PokerSession[],
  saved: Map<string, SavedSession>,
  players: PlayerDirectory,
) {
  return sessions
    .filter((session) => {
      const existing = saved.get(session.id);
      if (!existing) return false;
      const resolved = resolveSession(session, players);
      return !resolved || !isSameSession(existing, resolved);
    })
    .map((session) => session.id);
}

function sessionConflictResponse(ids: string[], savedOthers: number) {
  return json(
    {
      error:
        "A different session with the same ID is already saved. " +
        (savedOthers
          ? "The other sessions in this request were saved."
          : "Nothing was saved."),
      code: SESSION_CONFLICT,
      conflicts: ids,
      saved: savedOthers,
    },
    409,
  );
}

function savedSessionMap(rows: SessionRow[]) {
  return new Map(
    rows.map((row) => {
      const session = mapSession(row);
      return [session.id, session];
    }),
  );
}

async function loadSavedSessions(
  authUserId: string,
  ownerId: string,
  ids: string[],
) {
  const [result] = await runAsAuthenticatedUser(authUserId, (sql) => [
    selectSessions(sql, ownerId, ids),
  ]);
  return savedSessionMap(result as SessionRow[]);
}

export async function POST(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  const read = await readJsonBody(request, SESSION_BATCH_BODY_LIMIT);
  if (!read.ok) return json({ error: read.error }, read.status);

  try {
    const body = read.body as { sessions?: unknown[] } | null;
    const inputs = Array.isArray(body?.sessions) ? body.sessions : [body];
    if (!inputs.length || inputs.length > MAX_SESSIONS_PER_REQUEST) {
      return json(
        {
          error: `Send between 1 and ${MAX_SESSIONS_PER_REQUEST} sessions`,
        },
        400,
      );
    }

    let sessions: PokerSession[];
    try {
      sessions = inputs.map(validateSession);
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : "Invalid session",
        },
        400,
      );
    }
    const sessionIds = sessions.map((session) => session.id);
    if (new Set(sessionIds).size !== sessionIds.length) {
      return json({ error: "Each session in a request needs its own ID" }, 400);
    }

    // A retry with the same ID must describe the same session. Check before
    // writing anything, so a conflicting request saves nothing.
    const [existingPlayers, existingSessionsResult] =
      await runAsAuthenticatedUser(authUserId, (sql) => [
        sql`
          SELECT id, name, name_key
          FROM players
          WHERE owner_id = ${ownerId}::uuid
        `,
        selectSessions(sql, ownerId, sessionIds),
      ]);
    const savedBefore = savedSessionMap(
      existingSessionsResult as SessionRow[],
    );
    const conflicts = conflictingSessionIds(
      sessions,
      savedBefore,
      playerDirectory(existingPlayers as PlayerRecord[]),
    );
    if (conflicts.length) return sessionConflictResponse(conflicts, 0);

    const missingPlayerNames = new Map<string, string>();
    sessions.forEach((session) => {
      session.results.forEach((result) => {
        if (!result.playerId) {
          missingPlayerNames.set(playerNameKey(result.name), result.name);
        }
      });
    });

    if (missingPlayerNames.size) {
      await runAsAuthenticatedUser(authUserId, (sql) =>
        [...missingPlayerNames].map(
          ([nameKey, name]) => sql`
            INSERT INTO players (owner_id, name, name_key)
            VALUES (${ownerId}::uuid, ${name}, ${nameKey})
            ON CONFLICT (owner_id, name_key) WHERE owner_id IS NOT NULL
            DO NOTHING
          `,
        ),
      );
    }

    const [playersResult] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`
        SELECT id, name, name_key
        FROM players
        WHERE owner_id = ${ownerId}::uuid
      `,
    ]);
    const players = playerDirectory(playersResult as PlayerRecord[]);

    const unknownPlayer = sessions
      .flatMap((session) => session.results)
      .find((result) => !findPlayer(result, players));
    if (unknownPlayer) {
      return json({ error: `Unknown player: ${unknownPlayer.name}` }, 400);
    }

    const resolvedSessions = sessions.map(
      (session) => resolveSession(session, players)!,
    );

    const results = await runAsAuthenticatedUser(authUserId, (sql) =>
      resolvedSessions.map((session) => {
        const accounting = deriveSessionAccounting(session);
        return sql`
            WITH owner_lock AS MATERIALIZED (
              SELECT pg_advisory_xact_lock(
                hashtextextended(${ownerId}, 0)
              )
            ),
            existing AS MATERIALIZED (
              SELECT session.record_id
              FROM poker_sessions AS session, owner_lock
              WHERE session.owner_id = ${ownerId}::uuid
                AND session.id = ${session.id}
            ),
            allocated AS (
              UPDATE accounts
              SET
                next_session_number = next_session_number + 1,
                updated_at = now()
              WHERE id = ${ownerId}::uuid
                AND lifecycle_state = 'active'
                AND NOT EXISTS (SELECT 1 FROM existing)
              RETURNING next_session_number - 1 AS session_number
            ),
            inserted_session AS (
              INSERT INTO poker_sessions (
              owner_id,
              owner_session_number,
              id,
              game_name,
              played_at,
              ended_at,
              ante,
              starting_stack,
              hands,
              blind_history,
              results
              ) SELECT
                ${ownerId}::uuid,
                allocated.session_number,
                ${session.id},
                ${session.name || null},
                ${new Date(session.date).toISOString()},
                ${new Date(session.ended).toISOString()},
                ${session.ante},
                ${session.startStack},
                ${session.hands},
                ${session.blindHistory ? JSON.stringify(session.blindHistory) : null}::jsonb,
                ${JSON.stringify(session.results)}::jsonb
              FROM allocated
              ON CONFLICT (owner_id, id) WHERE owner_id IS NOT NULL DO NOTHING
              RETURNING record_id, id
            ),
            source_results AS MATERIALIZED (
              SELECT result.value, result.position
              FROM jsonb_array_elements(
                ${JSON.stringify(accounting.results)}::jsonb
              ) WITH ORDINALITY AS result(value, position)
            ),
            inserted_results AS (
              INSERT INTO session_results (
                owner_id,
                session_record_id,
                player_id,
                position,
                player_name,
                invested,
                ending_stack,
                accounting_status
              )
              SELECT
                ${ownerId}::uuid,
                inserted_session.record_id,
                source.value->>'playerId',
                source.position,
                source.value->>'name',
                (source.value->>'invested')::bigint,
                (source.value->>'end')::bigint,
                'verified'
              FROM inserted_session
              CROSS JOIN source_results AS source
              RETURNING owner_id, session_record_id, player_id
            ),
            inserted_buy_ins AS (
              INSERT INTO buy_in_events (
                owner_id,
                session_record_id,
                player_id,
                sequence,
                kind,
                amount
              )
              SELECT
                inserted.owner_id,
                inserted.session_record_id,
                inserted.player_id,
                buy_in.position,
                CASE WHEN buy_in.position = 1 THEN 'initial' ELSE 'rebuy' END,
                buy_in.value::bigint
              FROM inserted_results AS inserted
              JOIN source_results AS source
                ON source.value->>'playerId' = inserted.player_id
              CROSS JOIN LATERAL jsonb_array_elements_text(
                source.value->'buyIns'
              ) WITH ORDINALITY AS buy_in(value, position)
              RETURNING 1
            )
            SELECT inserted_session.id
            FROM inserted_session
            CROSS JOIN (SELECT count(*) FROM inserted_buy_ins) AS completed
          `;
      }),
    );
    const saved = results.reduce((count, rows) => count + rows.length, 0);

    // A session that was neither saved now nor seen above was saved by a
    // concurrent request; it must still match what this request sent.
    const raced = resolvedSessions.filter(
      (session, index) => !results[index].length && !savedBefore.has(session.id),
    );
    if (raced.length) {
      const savedNow = await loadSavedSessions(
        authUserId,
        ownerId,
        raced.map((session) => session.id),
      );
      const racedConflicts = raced
        .filter((session) => {
          const existing = savedNow.get(session.id);
          return !existing || !isSameSession(existing, session);
        })
        .map((session) => session.id);
      if (racedConflicts.length) {
        return sessionConflictResponse(racedConflicts, saved);
      }
    }

    return json({ saved });
  } catch (error) {
    console.error("sessions POST error", error);
    return json({ error: "Could not reach the ledger database" }, 500);
  }
}

export async function PATCH(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  const read = await readJsonBody(request, SMALL_JSON_BODY_LIMIT);
  if (!read.ok) return json({ error: read.error }, read.status);

  try {
    const body = (read.body ?? {}) as {
      action?: unknown;
      id?: unknown;
    };
    const id = String(body?.id || "");
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(id)) {
      return json({ error: "Invalid session id" }, 400);
    }
    if (body.action !== "discard" && body.action !== "restore") {
      return json({ error: "Invalid session action" }, 400);
    }

    const [result] = await runAsAuthenticatedUser(authUserId, (sql) => [
      body.action === "discard"
        ? sql`
            UPDATE poker_sessions
            SET discarded_at = now()
            WHERE id = ${id}
              AND owner_id = ${ownerId}::uuid
              AND discarded_at IS NULL
            RETURNING id
          `
        : sql`
            UPDATE poker_sessions
            SET discarded_at = NULL
            WHERE id = ${id}
              AND owner_id = ${ownerId}::uuid
              AND discarded_at IS NOT NULL
            RETURNING id
          `,
    ]);
    const rows = result;

    if (!rows.length) {
      return json(
        {
          error:
            body.action === "discard"
              ? "Active session not found"
              : "Discarded session not found",
        },
        404,
      );
    }
    return json({ id, state: body.action });
  } catch (error) {
    console.error("sessions PATCH error", error);
    return json({ error: "Could not update the session" }, 500);
  }
}

export async function DELETE(request: Request) {
  const authResult = await requireRecentHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(id)) {
      return json({ error: "Invalid session id" }, 400);
    }

    const [result] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`
        DELETE FROM poker_sessions
        WHERE id = ${id}
          AND owner_id = ${ownerId}::uuid
          AND discarded_at IS NOT NULL
        RETURNING id
      `,
    ]);
    const rows = result;
    if (!rows.length) {
      return json({ error: "Discarded session not found" }, 404);
    }
    return json({ deleted: id });
  } catch (error) {
    console.error("sessions DELETE error", error);
    return json({ error: "Could not reach the ledger database" }, 500);
  }
}
