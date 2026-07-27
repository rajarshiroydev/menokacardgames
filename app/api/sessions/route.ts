import { neon } from "@neondatabase/serverless";

import {
  MAX_SESSIONS_PER_REQUEST,
  passwordMatches,
  validateSession,
} from "@/lib/poker/session-validation";
import type { PokerSession } from "@/lib/poker/types";

export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  played_at: Date | string;
  ended_at: Date | string;
  ante: number | string;
  starting_stack: number | string;
  hands: number | string;
  results: PokerSession["results"];
};

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  return neon(process.env.DATABASE_URL);
}

export async function GET() {
  try {
    const sql = getDatabase();
    const rows = (await sql`
      SELECT id, played_at, ended_at, ante, starting_stack, hands, results
      FROM poker_sessions
      ORDER BY played_at DESC, created_at DESC
    `) as SessionRow[];
    const sessions: PokerSession[] = rows.map((row) => ({
      id: row.id,
      date: new Date(row.played_at).getTime(),
      ended: new Date(row.ended_at).getTime(),
      ante: Number(row.ante),
      startStack: Number(row.starting_stack),
      hands: Number(row.hands),
      results: row.results,
    }));
    return json({ sessions });
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

    const results = await sql.transaction(
      sessions.map(
        (session) => sql`
          INSERT INTO poker_sessions (
            id, played_at, ended_at, ante, starting_stack, hands, results
          ) VALUES (
            ${session.id},
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
