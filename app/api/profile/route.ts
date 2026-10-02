import { requireHostAccount } from "@/lib/auth/server";
import type { GroupSessions } from "@/lib/friends/group-standings";
import { friendErrorFromDatabase } from "@/lib/friends/requests";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import { DEFAULT_CURRENCY } from "@/lib/poker/money";
import { buildProfileStats, type ProfileLedger } from "@/lib/profile/stats";
import { buildGamesTogether } from "@/lib/profile/together";
import { withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * The signed-in person's own record: their games as the player they marked
 * as themselves in their own list, plus every friend's games where that
 * friend linked them. The server works the numbers out and sends only those,
 * with the number of games played together with each player in their list.
 */
async function handleGet() {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;
  const { currency, selfPlayerId } = authResult.profile;

  try {
    const [ownRows, groupRows, linkedRows] = await runAsAuthenticatedUser(authUserId, (sql) => [
      // The same shape as friend_group_sessions(), for the owner's own saved
      // games that the owner played in.
      sql`
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', session.id,
            'date', (extract(epoch FROM session.played_at) * 1000)::bigint,
            'startStack', session.starting_stack,
            'hands', session.hands,
            'results', normalized.results
          )
          ORDER BY session.played_at, session.created_at
        ), '[]'::jsonb) AS sessions
        FROM poker_sessions AS session
        JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'playerId', result.player_id,
              'name', result.player_name,
              'net', result.net,
              'end', result.ending_stack,
              'buyIns', COALESCE(buy_ins.buy_ins, '[]'::jsonb)
            )
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
          AND session.discarded_at IS NULL
          AND ${selfPlayerId}::text IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM session_results AS mine
            WHERE mine.owner_id = session.owner_id
              AND mine.session_record_id = session.record_id
              AND mine.player_id = ${selfPlayerId}::text
          )
      `,
      sql`SELECT public.friend_group_sessions() AS result`,
      sql`
        SELECT id, linked_account_id
        FROM players
        WHERE owner_id = ${ownerId}::uuid
          AND linked_account_id IS NOT NULL
      `,
    ]);

    const ownSessions =
      (ownRows as Array<{ sessions: GroupSessions["sessions"] }>)[0]?.sessions ?? [];
    const groups =
      (groupRows as Array<{ result: GroupSessions[] | null }>)[0]?.result ?? [];
    const ledgers: ProfileLedger[] = [
      ...(selfPlayerId
        ? [{ currency, myPlayerId: selfPlayerId, sessions: ownSessions }]
        : []),
      ...groups.map((group) => ({
        currency: group.currency ?? DEFAULT_CURRENCY,
        myPlayerId: group.myPlayerId,
        sessions: group.sessions,
      })),
    ];
    const linkedPlayers = new Map(
      (linkedRows as Array<{ id: string; linked_account_id: string }>).map(
        (row) => [row.linked_account_id, row.id] as const,
      ),
    );
    return json({
      stats: {
        ...buildProfileStats(ledgers, currency),
        gamesTogether: buildGamesTogether(
          { myPlayerId: selfPlayerId, sessions: ownSessions },
          groups,
          linkedPlayers,
        ),
      },
    });
  } catch (error) {
    const known = friendErrorFromDatabase(error);
    if (known) {
      return json({ error: known.error, code: known.code }, known.status);
    }
    console.error("profile GET error", error);
    return json({ error: "Could not load your stats" }, 500);
  }
}

export const GET = withServerTiming("GET /api/profile", handleGet);
