import { requireHostAccount } from "@/lib/auth/server";
import {
  friendErrorFromDatabase,
  type FoundAccount,
  type FriendOverview,
  parseCodeInput,
} from "@/lib/friends/requests";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import { readJsonBody, SMALL_JSON_BODY_LIMIT } from "@/lib/security/json-body";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Runs one friend function as the signed-in person and returns its result. */
async function callFriendFunction<T>(
  authUserId: string,
  build: Parameters<typeof runAsAuthenticatedUser>[1],
) {
  const [rows] = await runAsAuthenticatedUser(authUserId, build);
  return (rows as Array<{ result: T }>)[0]?.result ?? null;
}

function optionalPlayerId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" && PLAYER_ID_PATTERN.test(value)
    ? value
    : undefined;
}

export async function GET() {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const authUserId = authResult.session.user.id;

  try {
    const overview = await callFriendFunction<FriendOverview>(
      authUserId,
      (sql) => [sql`SELECT public.friend_overview() AS result`],
    );
    return json({ overview });
  } catch (error) {
    const known = friendErrorFromDatabase(error);
    if (known) {
      return json({ error: known.error, code: known.code }, known.status);
    }
    console.error("friends GET error", error);
    return json({ error: "Could not load your friends" }, 500);
  }
}

export async function POST(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const authUserId = authResult.session.user.id;

  const read = await readJsonBody(request, SMALL_JSON_BODY_LIMIT);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = (read.body ?? {}) as Record<string, unknown>;
  const action = body.action;

  try {
    if (action === "find" || action === "send") {
      const parsed = parseCodeInput(body.code);
      if (!parsed) {
        return json({ error: "Enter an 8-character user code" }, 400);
      }
      if (parsed.kind === "player") {
        return json(
          {
            error:
              "That's a player code (P-…). Ask your friend for their user code, shown at the top of their Players screen",
          },
          400,
        );
      }

      if (action === "find") {
        const found = await callFriendFunction<FoundAccount>(
          authUserId,
          (sql) => [sql`SELECT public.friend_find(${parsed.code}) AS result`],
        );
        if (!found) {
          return json(
            { error: "No one has that user code. Check it and try again" },
            404,
          );
        }
        return json({ found });
      }

      const myPlayerId = optionalPlayerId(body.myPlayerId);
      if (myPlayerId === undefined) {
        return json({ error: "Invalid player" }, 400);
      }
      let claimedPlayerCode: string | null = null;
      if (body.claimedPlayerCode) {
        const claimed = parseCodeInput(body.claimedPlayerCode);
        if (!claimed || claimed.kind !== "player") {
          return json(
            { error: "Player codes look like P-7KQ4-M2XP. Check it, or leave it empty" },
            400,
          );
        }
        claimedPlayerCode = claimed.code;
      }

      const sent = await callFriendFunction<{ requestId: string }>(
        authUserId,
        (sql) => [
          sql`SELECT public.friend_send(${parsed.code}, ${myPlayerId}, ${claimedPlayerCode}) AS result`,
        ],
      );
      return json({ sent }, 201);
    }

    if (
      action === "accept" ||
      action === "decline" ||
      action === "cancel"
    ) {
      const requestId = body.requestId;
      if (typeof requestId !== "string" || !UUID_PATTERN.test(requestId)) {
        return json({ error: "Invalid request" }, 400);
      }

      if (action === "accept") {
        const myPlayerId = optionalPlayerId(body.myPlayerId);
        if (myPlayerId === undefined) {
          return json({ error: "Invalid player" }, 400);
        }
        const newPlayerName =
          myPlayerId === null && typeof body.newPlayerName === "string"
            ? body.newPlayerName
            : null;
        if (newPlayerName !== null && newPlayerName.length > 200) {
          return json({ error: "Player names must be 1 to 80 characters" }, 400);
        }
        const accepted = await callFriendFunction<{ myPlayerId: string }>(
          authUserId,
          (sql) => [
            sql`SELECT public.friend_accept(${requestId}::uuid, ${myPlayerId}, ${newPlayerName}) AS result`,
          ],
        );
        return json({ accepted });
      }

      await callFriendFunction(authUserId, (sql) => [
        action === "decline"
          ? sql`SELECT public.friend_decline(${requestId}::uuid) AS result`
          : sql`SELECT public.friend_cancel(${requestId}::uuid) AS result`,
      ]);
      return json({ ok: true });
    }

    if (action === "remove") {
      const accountId = body.accountId;
      if (typeof accountId !== "string" || !UUID_PATTERN.test(accountId)) {
        return json({ error: "Invalid friend" }, 400);
      }
      await callFriendFunction(authUserId, (sql) => [
        sql`SELECT public.friend_remove(${accountId}::uuid) AS result`,
      ]);
      return json({ ok: true });
    }

    return json({ error: "Unknown friend action" }, 400);
  } catch (error) {
    const known = friendErrorFromDatabase(error);
    if (known) {
      return json({ error: known.error, code: known.code }, known.status);
    }
    console.error(`friends ${String(action)} error`, error);
    return json({ error: "Could not update your friends" }, 500);
  }
}
