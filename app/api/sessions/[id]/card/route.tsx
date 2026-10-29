import { requireHostAccount } from "@/lib/auth/server";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import {
  cardTimeZone,
  resultsCard,
  type CardPlayer,
  type ResultsCard,
} from "@/lib/poker/results-card";
import { renderResultsCard } from "@/lib/poker/results-card-image";
import {
  mapSession,
  selectSessions,
  type SessionRow,
} from "@/lib/poker/saved-sessions";
import { withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

function json(body: object, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

type PlayerRow = { id: string; name: string; avatar: string };

/**
 * The picture of a saved game's results, for the host to share. Only the
 * host's own saved, not discarded, games; nothing is stored, and the picture
 * is never cached.
 */
async function handleGet(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireHostAccount("cards");
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;
  const { id } = await context.params;
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(id)) {
    return json({ error: "Invalid session id" }, 400);
  }
  const timeZone = cardTimeZone(new URL(request.url).searchParams.get("tz"));

  let card: ResultsCard;
  try {
    const [sessionRows, playerRows] = await runAsAuthenticatedUser(
      authUserId,
      (sql) => [
        selectSessions(sql, ownerId, [id]),
        sql`
          SELECT player.id, names.display_name AS name, avatars.avatar
          FROM players AS player
          JOIN public.player_display_names() AS names
            ON names.player_id = player.id
          JOIN public.player_avatars() AS avatars
            ON avatars.player_id = player.id
          WHERE player.owner_id = ${ownerId}::uuid
        `,
      ],
    );
    const row = (sessionRows as SessionRow[])[0];
    const session = row ? mapSession(row) : null;
    if (!session || session.discardedAt) {
      return json({ error: "Game not found" }, 404);
    }
    const players = new Map<string, CardPlayer>(
      (playerRows as PlayerRow[]).map((player) => [
        player.id,
        { name: player.name, avatar: player.avatar },
      ]),
    );
    try {
      card = resultsCard(session, {
        currency: authResult.profile.currency,
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
    console.error("results card GET error", error);
    return json({ error: "Could not reach the ledger database" }, 500);
  }

  return renderResultsCard(card);
}


export const GET = withServerTiming("GET /api/sessions/[id]/card", handleGet);
