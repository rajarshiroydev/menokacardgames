import { requireHostAccount } from "@/lib/auth/server";
import { createInviteToken, inviteTokenHashHex } from "@/lib/friends/invite-token";
import { inviteErrorFromDatabase, isInviteToken } from "@/lib/friends/invites";
import { friendErrorFromDatabase } from "@/lib/friends/requests";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import { readJsonBody, SMALL_JSON_BODY_LIMIT } from "@/lib/security/json-body";
import { withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

const PLAYER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Invites to Pokerize (migration 0030). "create" makes a link for one of the
 * host's own guests; "answer" is the invited person's yes or no on the
 * invite page. The database checks who may do what.
 */
async function handlePost(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const authUserId = authResult.session.user.id;

  const read = await readJsonBody(request, SMALL_JSON_BODY_LIMIT);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = (read.body ?? {}) as Record<string, unknown>;
  const action = body.action;

  try {
    if (action === "create") {
      const playerId = body.playerId;
      if (typeof playerId !== "string" || !PLAYER_ID_PATTERN.test(playerId)) {
        return json({ error: "Invalid player" }, 400);
      }
      const token = createInviteToken();
      const [rows] = await runAsAuthenticatedUser(authUserId, (sql) => [
        sql`SELECT public.guest_invite_create(${playerId}, decode(${inviteTokenHashHex(token)}, 'hex')) AS result`,
      ]);
      const created = (rows as Array<{ result: { expiresAt: number } }>)[0]?.result;
      return json({ token, expiresAt: created?.expiresAt ?? null }, 201);
    }

    if (action === "answer") {
      const token = body.token;
      if (!isInviteToken(token) || typeof body.accept !== "boolean") {
        return json({ error: "This invite has expired or was already used" }, 400);
      }
      const [rows] = await runAsAuthenticatedUser(authUserId, (sql) => [
        sql`SELECT public.guest_invite_answer(decode(${inviteTokenHashHex(token)}, 'hex'), ${body.accept}) AS result`,
      ]);
      const answer = (rows as Array<{ result: { accepted: boolean } }>)[0]?.result;
      return json({ answer });
    }

    return json({ error: "Unknown invite action" }, 400);
  } catch (error) {
    const known = inviteErrorFromDatabase(error) ?? friendErrorFromDatabase(error);
    if (known) {
      return json({ error: known.error, code: known.code }, known.status);
    }
    console.error(`invites ${String(action)} error`, error);
    return json({ error: "Could not update the invite" }, 500);
  }
}

export const POST = withServerTiming("POST /api/invites", handlePost);
