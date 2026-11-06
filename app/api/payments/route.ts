import { requireHostAccount } from "@/lib/auth/server";
import { findSharedGame, type GroupSessions } from "@/lib/friends/group-standings";
import { friendErrorFromDatabase } from "@/lib/friends/requests";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import {
  parsePaymentBatch,
  parsePaymentRequest,
  paymentGameKey,
  type PaymentRequest,
  requestMatches,
} from "@/lib/poker/payments";
import { readVisiblePayments } from "@/lib/poker/payments-server";
import {
  mapSession,
  selectSessions,
  type SessionRow,
} from "@/lib/poker/saved-sessions";
import type { PokerSession } from "@/lib/poker/types";
import { PAYMENT_BATCH_BODY_LIMIT, readJsonBody } from "@/lib/security/json-body";
import { limitErrorResponse } from "@/lib/security/limits";
import { withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const NOT_FOUND = "This game's payments can't be marked here.";

type FoundGame = { hostAccountId: string; session: PokerSession };

/**
 * The games ticks are for, as Settle up shows them to this person: their own
 * saved games, or friends' games they played in (found by start time, as the
 * phone knows them). Null where there is no such game for them.
 */
async function findGames(
  authUserId: string,
  ownerId: string,
  requests: PaymentRequest[],
): Promise<Array<FoundGame | null>> {
  const ownIds = [
    ...new Set(
      requests.flatMap((request) =>
        request.hostAccountId === undefined ? [request.sessionId!] : [],
      ),
    ),
  ];
  const needsFriends = requests.some((request) => request.hostAccountId);
  const [ownRows, friendRows] = await runAsAuthenticatedUser(authUserId, (sql) => [
    ownIds.length ? selectSessions(sql, ownerId, ownIds) : sql`SELECT 1 WHERE false`,
    needsFriends
      ? sql`SELECT public.friend_group_sessions() AS result`
      : sql`SELECT NULL::jsonb AS result`,
  ]);
  const own = new Map(
    (ownRows as SessionRow[])
      .filter((row) => !row.discarded_at)
      .map((row) => [row.id, mapSession(row)]),
  );
  const groups =
    (friendRows as Array<{ result: GroupSessions[] | null }>)[0]?.result ?? [];
  return requests.map((request) => {
    if (request.hostAccountId === undefined) {
      const session = own.get(request.sessionId!);
      return session ? { hostAccountId: ownerId, session } : null;
    }
    const group = groups.find(
      (item) => item.hostAccountId === request.hostAccountId,
    );
    const session = group ? findSharedGame(group, request.date!) : null;
    return session ? { hostAccountId: group!.hostAccountId, session } : null;
  });
}

/**
 * Ticks or unticks one Settle up payment, or ticks a list (Mark all paid). Like Splitwise, the host and every
 * friend who played in the game may mark any payment in it (user decision
 * 2026-11-05); the database checks that right again (migration 0034).
 * Returns the game's ticks afterwards.
 */
async function handlePost(request: Request) {
  const authResult = await requireHostAccount("writes");
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  const read = await readJsonBody(request, PAYMENT_BATCH_BODY_LIMIT);
  if (!read.ok) return json({ error: read.error }, read.status);

  // One tick or untick, or Mark all paid's list (`items`).
  const raw = read.body as { items?: unknown } | null;
  const batch = Array.isArray(raw?.items);
  let requests: PaymentRequest[];
  try {
    requests = batch ? parsePaymentBatch(raw!.items) : [parsePaymentRequest(read.body)];
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Invalid payment" },
      400,
    );
  }

  try {
    const games = await findGames(authUserId, ownerId, requests);
    if (games.some((game) => !game)) return json({ error: NOT_FOUND }, 404);
    // Only payments Settle up shows now, at the amounts it shows; a list is
    // marked all or nothing.
    if (requests.some((request, index) => !requestMatches(games[index]!.session, request))) {
      return json(
        {
          error: batch
            ? "Some payments changed since Games was opened. It has been updated: try again."
            : "This game changed since it was opened. Settle up has been updated: try again.",
          code: "payment-changed",
        },
        409,
      );
    }
    await runAsAuthenticatedUser(authUserId, (sql) =>
      requests.map(
        (request, index) => sql`
          SELECT public.settlement_payment_set(
            ${games[index]!.hostAccountId}::uuid,
            ${games[index]!.session.id},
            ${request.from},
            ${request.to},
            ${request.cents}::bigint,
            ${request.paid}
          )
        `,
      ),
    );
    // Settle up's Save is one game's: send its ticks back. Mark all paid
    // spans games, and the phone reloads them.
    const game = games[0]!;
    const oneGame = games.every(
      (item) =>
        item!.hostAccountId === game.hostAccountId &&
        item!.session.id === game.session.id,
    );
    if (batch && !oneGame) return json({ marked: requests.length });
    const payments = await readVisiblePayments(authUserId);
    const ticks =
      payments.get(paymentGameKey(game.hostAccountId, game.session.id)) ?? [];
    return json(batch ? { marked: requests.length, payments: ticks } : { payments: ticks });
  } catch (error) {
    const limited = limitErrorResponse(error);
    if (limited) return limited;
    const friend = friendErrorFromDatabase(error);
    if (friend) {
      return json({ error: friend.error, code: friend.code }, friend.status);
    }
    if (error instanceof Error && error.message === "payment:not-found") {
      return json({ error: NOT_FOUND }, 404);
    }
    console.error("payments POST error", error);
    return json({ error: "Could not mark the payment" }, 500);
  }
}

export const POST = withServerTiming("POST /api/payments", handlePost);
