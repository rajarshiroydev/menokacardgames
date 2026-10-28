import { requireHostAccount } from "@/lib/auth/server";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import type { SavedActionLog } from "@/lib/poker/types";
import { withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * A saved game's action log, for its Details and for Continue game. Only the
 * host's own games, discarded ones included; `log` is null for games saved
 * without one. Kept out of the game list, since a long night's log is about
 * 100 KB.
 */
async function handleGet(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const { id } = await context.params;
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(id)) {
    return json({ error: "Invalid session id" }, 400);
  }

  try {
    const [rows] = await runAsAuthenticatedUser(
      authResult.session.user.id,
      (sql) => [
        sql`
          SELECT action_log
          FROM poker_sessions
          WHERE owner_id = ${ownerId}::uuid AND id = ${id}
        `,
      ],
    );
    const row = (rows as Array<{ action_log: SavedActionLog | null }>)[0];
    if (!row) return json({ error: "Game not found" }, 404);
    return json({ log: row.action_log });
  } catch (error) {
    console.error("action log GET error", error);
    return json({ error: "Could not reach the ledger database" }, 500);
  }
}

export const GET = withServerTiming("GET /api/sessions/[id]/log", handleGet);
