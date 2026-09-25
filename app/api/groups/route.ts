import { requireHostAccount } from "@/lib/auth/server";
import {
  buildGroupStandings,
  type GroupSessions,
} from "@/lib/friends/group-standings";
import { friendErrorFromDatabase } from "@/lib/friends/requests";
import { runAsAuthenticatedUser } from "@/lib/poker/database";

export const dynamic = "force-dynamic";

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * The standings of every host who has the signed-in person as a linked
 * friend. The server ranks each host's games and returns only the rows.
 */
export async function GET() {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const authUserId = authResult.session.user.id;

  try {
    const [rows] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`SELECT public.friend_group_sessions() AS result`,
    ]);
    const groups =
      (rows as Array<{ result: GroupSessions[] | null }>)[0]?.result ?? [];
    return json({ groups: groups.map(buildGroupStandings) });
  } catch (error) {
    const known = friendErrorFromDatabase(error);
    if (known) {
      return json({ error: known.error, code: known.code }, known.status);
    }
    console.error("groups GET error", error);
    return json({ error: "Could not load your groups" }, 500);
  }
}
