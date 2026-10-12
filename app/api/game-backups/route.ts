import { requireHostAccount } from "@/lib/auth/server";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import {
  GAME_BACKUP_BODY_LIMIT,
  GAME_BACKUP_EXPIRY_DAYS,
  isDeviceId,
  isGameBackupId,
  summarizeGameBackup,
  validateGameBackupState,
} from "@/lib/poker/game-backup";
import type { GameState } from "@/lib/poker/types";
import { readJsonBody, SMALL_JSON_BODY_LIMIT } from "@/lib/security/json-body";
import { withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

type BackupRow = {
  game_id: string;
  device_id: string;
  state: GameState;
  updated_at: string | Date;
};

/** The host's unexpired backups, as summaries for Home. */
async function handleGet(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const deviceId = new URL(request.url).searchParams.get("deviceId");

  try {
    const [rows] = await runAsAuthenticatedUser(
      authResult.session.user.id,
      (sql) => [
        // A game saved since its last backup isn't unfinished any more.
        sql`
          SELECT backup.game_id, backup.device_id, backup.state, backup.updated_at
          FROM game_backups AS backup
          WHERE backup.owner_id = ${authResult.account.id}::uuid
            AND backup.expires_at > now()
            AND NOT EXISTS (
              SELECT 1
              FROM poker_sessions AS session
              WHERE session.owner_id = backup.owner_id
                AND session.id = backup.game_id
                AND (
                  backup.state->'continues' IS NULL
                  OR jsonb_typeof(backup.state->'continues') <> 'object'
                  OR session.hands::text <> backup.state->'continues'->>'hands'
                )
            )
          ORDER BY backup.updated_at DESC
        `,
      ],
    );
    const backups = (rows as BackupRow[]).flatMap((row) => {
      try {
        const state = validateGameBackupState(row.state, row.game_id);
        return [
          summarizeGameBackup(
            row.game_id,
            state,
            new Date(row.updated_at).getTime(),
            row.device_id === deviceId,
          ),
        ];
      } catch {
        // A backup the app can't open again isn't offered.
        return [];
      }
    });
    return json({ backups });
  } catch (error) {
    console.error("game-backups GET error", error);
    return json({ error: "Could not load unfinished games" }, 500);
  }
}

/**
 * Stores this device's backup of a game. Refused with 409 `moved` once
 * another device has restored the game, and with 410 `finished` once the
 * game is saved (a late update must not bring back a finished game).
 */
async function handlePut(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;

  const read = await readJsonBody(request, GAME_BACKUP_BODY_LIMIT);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = (read.body ?? {}) as {
    gameId?: unknown;
    deviceId?: unknown;
    state?: unknown;
  };
  if (!isGameBackupId(body.gameId) || !isDeviceId(body.deviceId)) {
    return json({ error: "Invalid game backup" }, 400);
  }
  let state: GameState;
  try {
    state = validateGameBackupState(body.state, body.gameId);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Invalid game backup" },
      400,
    );
  }
  const gameId = body.gameId;
  const deviceId = body.deviceId;
  // A continued game shares its saved game's ID; it is finished once that
  // game has more hands than when it was reopened.
  const continuedHands = state.continues?.hands ?? null;

  try {
    const [[outcome]] = await runAsAuthenticatedUser(
      authResult.session.user.id,
      (sql) => [
        sql`
          WITH saved AS (
            SELECT 1
            FROM poker_sessions AS session
            WHERE session.owner_id = ${ownerId}::uuid
              AND session.id = ${gameId}
              AND (
                ${continuedHands}::integer IS NULL
                OR session.hands <> ${continuedHands}::integer
              )
          ),
          written AS (
            INSERT INTO game_backups (
              owner_id, game_id, device_id, state, updated_at, expires_at
            )
            SELECT
              ${ownerId}::uuid,
              ${gameId},
              ${deviceId},
              ${JSON.stringify(state)}::jsonb,
              now(),
              now() + make_interval(days => ${GAME_BACKUP_EXPIRY_DAYS}::int)
            WHERE NOT EXISTS (SELECT 1 FROM saved)
            ON CONFLICT (owner_id, game_id) DO UPDATE
            SET device_id = EXCLUDED.device_id,
                state = EXCLUDED.state,
                updated_at = EXCLUDED.updated_at,
                expires_at = EXCLUDED.expires_at
            WHERE game_backups.device_id = EXCLUDED.device_id
              OR game_backups.expires_at <= now()
            RETURNING game_id
          )
          SELECT
            EXISTS (SELECT 1 FROM saved) AS saved,
            EXISTS (SELECT 1 FROM written) AS written
        `,
        // One game in progress per device: its older backups go.
        sql`
          DELETE FROM game_backups
          WHERE owner_id = ${ownerId}::uuid
            AND device_id = ${deviceId}
            AND game_id <> ${gameId}
            AND EXISTS (
              SELECT 1 FROM game_backups AS current
              WHERE current.owner_id = ${ownerId}::uuid
                AND current.game_id = ${gameId}
                AND current.device_id = ${deviceId}
            )
        `,
      ],
    );
    const result = outcome as { saved: boolean; written: boolean };
    if (result.saved) {
      return json({ error: "This game is already saved", code: "finished" }, 410);
    }
    if (!result.written) {
      return json(
        { error: "This game moved to another device", code: "moved" },
        409,
      );
    }
    return json({ ok: true });
  } catch (error) {
    console.error("game-backups PUT error", error);
    return json({ error: "Could not back up the game" }, 500);
  }
}

/** Restores a backup on this device, which takes the game over. */
async function handlePost(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;

  const read = await readJsonBody(request, SMALL_JSON_BODY_LIMIT);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = (read.body ?? {}) as { gameId?: unknown; deviceId?: unknown };
  if (!isGameBackupId(body.gameId) || !isDeviceId(body.deviceId)) {
    return json({ error: "Invalid game backup" }, 400);
  }
  const gameId = body.gameId;
  const deviceId = body.deviceId;

  try {
    const [rows] = await runAsAuthenticatedUser(
      authResult.session.user.id,
      (sql) => [
        sql`
          UPDATE game_backups
          SET device_id = ${deviceId},
              updated_at = now(),
              expires_at = now() + make_interval(days => ${GAME_BACKUP_EXPIRY_DAYS}::int)
          WHERE owner_id = ${ownerId}::uuid
            AND game_id = ${gameId}
            AND expires_at > now()
          RETURNING state
        `,
        sql`
          DELETE FROM game_backups
          WHERE owner_id = ${ownerId}::uuid
            AND device_id = ${deviceId}
            AND game_id <> ${gameId}
        `,
        sql`
          INSERT INTO audit_events (owner_id, actor_auth_user_id, action, target_kind, target_id)
          SELECT ${ownerId}::uuid, ${authResult.session.user.id}::uuid,
            'game_backup.restored', 'game_backup', ${gameId}
          WHERE EXISTS (
            SELECT 1 FROM game_backups
            WHERE owner_id = ${ownerId}::uuid
              AND game_id = ${gameId}
              AND device_id = ${deviceId}
          )
        `,
      ],
    );
    const row = (rows as Array<{ state: GameState }>)[0];
    if (!row) return json({ error: "This unfinished game is gone" }, 404);
    return json({ state: row.state });
  } catch (error) {
    console.error("game-backups POST error", error);
    return json({ error: "Could not restore the game" }, 500);
  }
}

/**
 * Deletes a backup. With a device ID, only while that device owns it (a
 * discarded game); without one, whichever device wrote it (Home's Delete).
 */
async function handleDelete(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const params = new URL(request.url).searchParams;
  const gameId = params.get("gameId");
  const deviceId = params.get("deviceId");
  if (!isGameBackupId(gameId) || (deviceId !== null && !isDeviceId(deviceId))) {
    return json({ error: "Invalid game backup" }, 400);
  }

  try {
    await runAsAuthenticatedUser(authResult.session.user.id, (sql) => [
      sql`
        DELETE FROM game_backups
        WHERE owner_id = ${authResult.account.id}::uuid
          AND game_id = ${gameId}
          AND (${deviceId}::text IS NULL OR device_id = ${deviceId}::text)
      `,
    ]);
    return json({ ok: true });
  } catch (error) {
    console.error("game-backups DELETE error", error);
    return json({ error: "Could not delete the unfinished game" }, 500);
  }
}

export const GET = withServerTiming("GET /api/game-backups", handleGet);
export const PUT = withServerTiming("PUT /api/game-backups", handlePut);
export const POST = withServerTiming("POST /api/game-backups", handlePost);
export const DELETE = withServerTiming("DELETE /api/game-backups", handleDelete);
