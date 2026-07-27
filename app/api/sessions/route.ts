import { getDatabase } from "@/lib/poker/database";
import { playerNameKey } from "@/lib/poker/player-validation";
import {
  MAX_SESSIONS_PER_REQUEST,
  passwordMatches,
  validateSession,
} from "@/lib/poker/session-validation";
import type { PokerSession } from "@/lib/poker/types";

export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  game_name: string | null;
  session_number: number | string;
  played_at: Date | string;
  ended_at: Date | string;
  ante: number | string;
  starting_stack: number | string;
  hands: number | string;
  results: PokerSession["results"];
};

type SessionCounterRow = {
  is_called: boolean;
  last_value: number | string;
};

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    const sql = getDatabase();
    const rows = (await sql`
      SELECT
        id,
        game_name,
        session_number,
        played_at,
        ended_at,
        ante,
        starting_stack,
        hands,
        results
      FROM poker_sessions
      ORDER BY played_at DESC, created_at DESC
    `) as SessionRow[];
    const [counter] = (await sql`
      SELECT last_value, is_called
      FROM poker_sessions_session_number_seq
    `) as SessionCounterRow[];
    const sessions: PokerSession[] = rows.map((row) => ({
      id: row.id,
      name: row.game_name?.trim() || `Game ${Number(row.session_number)}`,
      sessionNumber: Number(row.session_number),
      date: new Date(row.played_at).getTime(),
      ended: new Date(row.ended_at).getTime(),
      ante: Number(row.ante),
      startStack: Number(row.starting_stack),
      hands: Number(row.hands),
      results: row.results,
    }));
    const nextSessionNumber = counter
      ? Number(counter.last_value) + (counter.is_called ? 1 : 0)
      : 1;
    return json({ sessions, nextSessionNumber });
  } catch (error) {
    console.error("sessions GET error", error);
    return json({ error: "Could not reach the ledger database" }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const sql = getDatabase();
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
      await sql.transaction(
        [...missingPlayerNames].map(
          ([nameKey, name]) => sql`
            INSERT INTO players (name, name_key)
            VALUES (${name}, ${nameKey})
            ON CONFLICT (name_key) DO NOTHING
          `,
        ),
      );
    }

    const playerRows = (await sql`
      SELECT id, name, name_key
      FROM players
    `) as Array<{ id: string; name: string; name_key: string }>;
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
        };
      }),
    }));

    const results = await sql.transaction(
      resolvedSessions.map(
        (session) => sql`
          INSERT INTO poker_sessions (
            id,
            game_name,
            played_at,
            ended_at,
            ante,
            starting_stack,
            hands,
            results
          ) VALUES (
            ${session.id},
            ${session.name || null},
            ${new Date(session.date).toISOString()},
            ${new Date(session.ended).toISOString()},
            ${session.ante},
            ${session.startStack},
            ${session.hands},
            ${JSON.stringify(session.results)}::jsonb
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `,
      ),
    );
    return json({
      saved: results.reduce((count, rows) => count + rows.length, 0),
    });
  } catch (error) {
    console.error("sessions POST error", error);
    return json({ error: "Could not reach the ledger database" }, 500);
  }
}

export async function DELETE(request: Request) {
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

    const sql = getDatabase();
    const rows = await sql`
      DELETE FROM poker_sessions
      WHERE id = ${id}
      RETURNING id
    `;
    if (!rows.length) return json({ error: "Session not found" }, 404);
    return json({ deleted: id });
  } catch (error) {
    console.error("sessions DELETE error", error);
    return json({ error: "Could not reach the ledger database" }, 500);
  }
}
