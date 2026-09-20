import { requireHostAccount } from "@/lib/auth/server";
import { deriveSessionAccounting } from "@/lib/poker/accounting";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import { playerNameKey } from "@/lib/poker/player-validation";
import {
  MAX_SESSIONS_PER_REQUEST,
  passwordMatches,
  validateSession,
} from "@/lib/poker/session-validation";
import type { PokerSession } from "@/lib/poker/types";

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

function mapSession(row: SessionRow): PokerSession {
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

export async function GET() {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  try {
    const [sessionsResult, counterResult] = await runAsAuthenticatedUser(
      authUserId,
      (sql) => [
        sql`
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
        ORDER BY session.played_at DESC, session.created_at DESC
        `,
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

export async function POST(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  try {
    const body = (await request.json()) as {
      sessions?: unknown[];
    };
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
    const playerRows = playersResult as Array<{
      id: string;
      name: string;
      name_key: string;
    }>;
    const playersById = new Map(playerRows.map((player) => [player.id, player]));
    const playersByName = new Map(
      playerRows.map((player) => [player.name_key, player]),
    );

    const unknownPlayer = sessions
      .flatMap((session) => session.results)
      .find((result) =>
        result.playerId
          ? !playersById.has(result.playerId)
          : !playersByName.has(playerNameKey(result.name)),
      );
    if (unknownPlayer) {
      return json({ error: `Unknown player: ${unknownPlayer.name}` }, 400);
    }

    const resolvedSessions = sessions.map((session) => ({
      ...session,
      results: session.results.map((result) => {
        const player = result.playerId
          ? playersById.get(result.playerId)
          : playersByName.get(playerNameKey(result.name));
        return {
          playerId: player!.id,
          name: player!.name,
          net: result.net,
          end: result.end,
          ...(result.buyIns ? { buyIns: result.buyIns } : {}),
        };
      }),
    }));

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
    return json({
      saved: results.reduce((count, rows) => count + rows.length, 0),
    });
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

  try {
    const body = (await request.json()) as {
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
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  try {
    const deletionPassword =
      process.env.DELETE_PASSWORD || process.env.DELETION_PASSWORD;
    if (!deletionPassword) {
      console.error("Deletion password is not configured");
      return json({ error: "Deletion is not configured" }, 503);
    }
    if (
      !passwordMatches(
        request.headers.get("x-delete-password"),
        deletionPassword,
      )
    ) {
      return json({ error: "Wrong deletion password" }, 401);
    }

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
