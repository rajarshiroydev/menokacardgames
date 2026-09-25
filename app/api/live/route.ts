import { requireHostAccount } from "@/lib/auth/server";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import {
  deriveLiveView,
  LIVE_VIEW_EXPIRY_HOURS,
  validateLiveSnapshot,
  type LiveView,
} from "@/lib/poker/live-view";
import { createLiveToken, liveTokenHashHex } from "@/lib/poker/live-token";
import { readJsonBody, SMALL_JSON_BODY_LIMIT } from "@/lib/security/json-body";

export const dynamic = "force-dynamic";

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Reads and checks the host's snapshot, returning the standings to store. */
async function readLiveView(
  request: Request,
): Promise<{ view: LiveView } | { response: Response }> {
  const read = await readJsonBody(request, SMALL_JSON_BODY_LIMIT);
  if (!read.ok) return { response: json({ error: read.error }, read.status) };
  try {
    const body = (read.body ?? {}) as { snapshot?: unknown };
    return { view: deriveLiveView(validateLiveSnapshot(body.snapshot)) };
  } catch (error) {
    return {
      response: json(
        {
          error:
            error instanceof Error ? error.message : "Invalid live standings",
        },
        400,
      ),
    };
  }
}

/** Starts sharing, or replaces the current link with a new one. */
export async function POST(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  const read = await readLiveView(request);
  if ("response" in read) return read.response;

  try {
    const token = createLiveToken();
    const hashHex = liveTokenHashHex(token);
    await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`
        INSERT INTO live_views (owner_id, token_hash, snapshot, created_at, updated_at, expires_at)
        VALUES (
          ${ownerId}::uuid,
          decode(${hashHex}, 'hex'),
          ${JSON.stringify(read.view)}::jsonb,
          now(),
          now(),
          now() + make_interval(hours => ${LIVE_VIEW_EXPIRY_HOURS}::int)
        )
        ON CONFLICT (owner_id) DO UPDATE
        SET token_hash = EXCLUDED.token_hash,
            snapshot = EXCLUDED.snapshot,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at,
            expires_at = EXCLUDED.expires_at
      `,
      sql`
        INSERT INTO audit_events (owner_id, actor_auth_user_id, action, target_kind)
        VALUES (${ownerId}::uuid, ${authUserId}::uuid, 'live_view.started', 'live_view')
      `,
    ]);
    return json({ token }, 201);
  } catch (error) {
    console.error("live POST error", error);
    return json({ error: "Could not start sharing live standings" }, 500);
  }
}

/** Updates the standings behind the current link. */
export async function PUT(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  const read = await readLiveView(request);
  if ("response" in read) return read.response;

  try {
    const [result] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`
        UPDATE live_views
        SET snapshot = ${JSON.stringify(read.view)}::jsonb,
            updated_at = now(),
            expires_at = now() + make_interval(hours => ${LIVE_VIEW_EXPIRY_HOURS}::int)
        WHERE owner_id = ${ownerId}::uuid
        RETURNING owner_id
      `,
    ]);
    if (!result.length) {
      return json({ error: "Live standings are not being shared" }, 404);
    }
    return json({ ok: true });
  } catch (error) {
    console.error("live PUT error", error);
    return json({ error: "Could not update live standings" }, 500);
  }
}

/** Stops sharing; the link shows that the game has ended. */
export async function DELETE() {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  try {
    await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`
        WITH stopped AS (
          DELETE FROM live_views
          WHERE owner_id = ${ownerId}::uuid
          RETURNING owner_id
        )
        INSERT INTO audit_events (owner_id, actor_auth_user_id, action, target_kind)
        SELECT owner_id, ${authUserId}::uuid, 'live_view.stopped', 'live_view'
        FROM stopped
      `,
    ]);
    return json({ ok: true });
  } catch (error) {
    console.error("live DELETE error", error);
    return json({ error: "Could not stop sharing live standings" }, 500);
  }
}
