import { requireHostAccount } from "@/lib/auth/server";
import {
  buildGroupStandings,
  type FriendRelations,
  groupAccountIds,
  playedInGroup,
  type GroupSessions,
} from "@/lib/friends/group-standings";
import { friendErrorFromDatabase } from "@/lib/friends/requests";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import { withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * How the signed-in person stands with each of these accounts. Without it
 * (migration 0029 not applied, or a failure) the standings simply offer no
 * friend requests.
 */
async function readRelations(
  authUserId: string,
  accountIds: string[],
): Promise<FriendRelations> {
  if (!accountIds.length) return {};
  try {
    const [rows] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`SELECT public.friend_relations(${accountIds}::uuid[]) AS result`,
    ]);
    return (rows as Array<{ result: FriendRelations | null }>)[0]?.result ?? {};
  } catch (error) {
    console.error("groups relations error", error);
    return {};
  }
}

/**
 * The standings of every host who has the signed-in person as a linked
 * friend and has seated them in at least one game. The server ranks each
 * host's games and returns only the rows.
 */
async function handleGet() {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const authUserId = authResult.session.user.id;

  try {
    const [rows] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`SELECT public.friend_group_sessions() AS result`,
    ]);
    const groups = (
      (rows as Array<{ result: GroupSessions[] | null }>)[0]?.result ?? []
    ).filter(playedInGroup);
    const relations = await readRelations(authUserId, groupAccountIds(groups));
    return json({
      groups: groups.map((group) => buildGroupStandings(group, relations)),
    });
  } catch (error) {
    const known = friendErrorFromDatabase(error);
    if (known) {
      return json({ error: known.error, code: known.code }, known.status);
    }
    console.error("groups GET error", error);
    return json({ error: "Could not load your groups" }, 500);
  }
}

export const GET = withServerTiming("GET /api/groups", handleGet);
