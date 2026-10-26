import { requireHostAccount } from "@/lib/auth/server";
import {
  findSharedGame,
  type GroupSessions,
} from "@/lib/friends/group-standings";
import { friendErrorFromDatabase } from "@/lib/friends/requests";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import { DEFAULT_CURRENCY } from "@/lib/poker/money";
import {
  cardTimeZone,
  resultsCard,
  type CardPlayer,
  type ResultsCard,
} from "@/lib/poker/results-card";
import { renderResultsCard } from "@/lib/poker/results-card-image";
import { withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

function json(body: object, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The results card of a game the signed-in person played in at a friend's
 * table (user request 2026-10-26), found by host and start time, since the
 * phone has no game IDs. Built from `friend_group_sessions()`, so only games
 * the caller can already see on Games; names and avatars are those the host's
 * games show. Nothing is stored, and the picture is never cached.
 */
async function handleGet(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const authUserId = authResult.session.user.id;
  const params = new URL(request.url).searchParams;
  const host = params.get("host") ?? "";
  const date = Number(params.get("date"));
  if (!UUID.test(host) || !Number.isSafeInteger(date) || date <= 0) {
    return json({ error: "Invalid game" }, 400);
  }
  const timeZone = cardTimeZone(params.get("tz"));

  let card: ResultsCard;
  try {
    const [rows] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`SELECT public.friend_group_sessions() AS result`,
    ]);
    const groups =
      (rows as Array<{ result: GroupSessions[] | null }>)[0]?.result ?? [];
    const group = groups.find((item) => item.hostAccountId === host);
    const session = group ? findSharedGame(group, date) : null;
    if (!group || !session) return json({ error: "Game not found" }, 404);
    // Names and avatars as this game's card in Games shows them.
    const raw = group.sessions.find((item) => item.id === session.id)!;
    const players = new Map<string, CardPlayer>(
      raw.results.map((result) => [
        result.playerId,
        { name: result.name, avatar: result.avatar ?? "" },
      ]),
    );
    try {
      card = resultsCard(session, {
        currency: group.currency ?? DEFAULT_CURRENCY,
        timeZone,
        players,
      });
    } catch {
      return json(
        { error: "This game's saved chips don't add up, so it has no card" },
        422,
      );
    }
  } catch (error) {
    const known = friendErrorFromDatabase(error);
    if (known) {
      return json({ error: known.error, code: known.code }, known.status);
    }
    console.error("friend results card GET error", error);
    return json({ error: "Could not reach the ledger database" }, 500);
  }

  return renderResultsCard(card);
}

export const GET = withServerTiming("GET /api/groups/card", handleGet);
