import {
  requireHostAccount,
  requireRecentHostAccount,
} from "@/lib/auth/server";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import {
  cleanPlayerName,
  playerNameKey,
} from "@/lib/poker/player-validation";
import type { PlayerProfile } from "@/lib/poker/types";
import { readJsonBody, SMALL_JSON_BODY_LIMIT } from "@/lib/security/json-body";

export const dynamic = "force-dynamic";

type PlayerRow = {
  id: string;
  name: string;
  player_code: string;
  linked: boolean;
  created_at: Date | string;
  deleted_at: Date | string | null;
  has_history?: boolean;
};

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function mapPlayer(row: PlayerRow): PlayerProfile {
  return {
    id: row.id,
    name: row.name,
    code: row.player_code,
    linked: Boolean(row.linked),
    createdAt: new Date(row.created_at).getTime(),
    hasHistory: Boolean(row.has_history),
    ...(row.deleted_at
      ? { discardedAt: new Date(row.deleted_at).getTime() }
      : {}),
  };
}

export async function GET() {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  try {
    const [result] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`
        SELECT
          player.id,
          player.name,
          player.player_code,
          player.linked_account_id IS NOT NULL AS linked,
          player.created_at,
          player.deleted_at,
          EXISTS (
            SELECT 1
            FROM session_results AS result
            WHERE result.owner_id = ${ownerId}::uuid
              AND result.player_id = player.id
          ) AS has_history
        FROM players AS player
        WHERE player.owner_id = ${ownerId}::uuid
        ORDER BY
          player.deleted_at NULLS FIRST,
          lower(player.name),
          player.created_at
      `,
    ]);
    const rows = result as PlayerRow[];

    const profiles = rows.map(mapPlayer);
    const discardedPlayers = profiles.filter((player) => player.discardedAt);
    return json({
      players: profiles.filter((player) => !player.discardedAt),
      discardedPlayers,
    });
  } catch (error) {
    console.error("players GET error", error);
    return json({ error: "Could not load the player list" }, 500);
  }
}

export async function POST(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  const read = await readJsonBody(request, SMALL_JSON_BODY_LIMIT);
  if (!read.ok) return json({ error: read.error }, read.status);

  try {
    const body = read.body as { name?: unknown } | null;
    let name: string;

    try {
      name = cleanPlayerName(body?.name);
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : "Invalid player name",
        },
        400,
      );
    }

    const [result] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`
        INSERT INTO players (owner_id, name, name_key)
        VALUES (${ownerId}::uuid, ${name}, ${playerNameKey(name)})
        ON CONFLICT (owner_id, name_key) WHERE owner_id IS NOT NULL DO UPDATE
        SET name = EXCLUDED.name, deleted_at = NULL
        RETURNING id, name, player_code, linked_account_id IS NOT NULL AS linked, created_at, deleted_at
      `,
    ]);
    const rows = result as PlayerRow[];

    return json({ player: mapPlayer(rows[0]) }, 201);
  } catch (error) {
    console.error("players POST error", error);
    return json({ error: "Could not add the player" }, 500);
  }
}

export async function PATCH(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  const read = await readJsonBody(request, SMALL_JSON_BODY_LIMIT);
  if (!read.ok) return json({ error: read.error }, read.status);

  try {
    const body = (read.body ?? {}) as {
      action?: unknown;
      id?: unknown;
    };
    const id = String(body?.id || "");
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(id)) {
      return json({ error: "Invalid player id" }, 400);
    }
    const action = body.action ?? "restore";
    if (action !== "discard" && action !== "restore") {
      return json({ error: "Invalid player action" }, 400);
    }

    const [result] = await runAsAuthenticatedUser(authUserId, (sql) => [
      action === "discard"
        ? sql`
            UPDATE players
            SET deleted_at = now()
            WHERE id = ${id}
              AND owner_id = ${ownerId}::uuid
              AND deleted_at IS NULL
            RETURNING id, name, player_code, linked_account_id IS NOT NULL AS linked, created_at, deleted_at
          `
        : sql`
            UPDATE players
            SET deleted_at = NULL
            WHERE id = ${id}
              AND owner_id = ${ownerId}::uuid
              AND deleted_at IS NOT NULL
            RETURNING id, name, player_code, linked_account_id IS NOT NULL AS linked, created_at, deleted_at
          `,
    ]);
    const rows = result as PlayerRow[];

    if (!rows.length) {
      return json(
        {
          error:
            action === "discard"
              ? "Active player not found"
              : "Discarded player not found",
        },
        404,
      );
    }
    return json({ player: mapPlayer(rows[0]) });
  } catch (error) {
    console.error("players PATCH error", error);
    return json({ error: "Could not update the player" }, 500);
  }
}

export async function DELETE(request: Request) {
  const authResult = await requireRecentHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(id)) {
      return json({ error: "Invalid player id" }, 400);
    }

    const [lookupResult] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`
        SELECT
          player.id,
          player.deleted_at,
          player.linked_account_id IS NOT NULL AS linked,
          EXISTS (
            SELECT 1
            FROM session_results AS result
            WHERE result.owner_id = ${ownerId}::uuid
              AND result.player_id = player.id
          ) AS has_history
        FROM players AS player
        WHERE player.id = ${id}
          AND player.owner_id = ${ownerId}::uuid
      `,
    ]);
    const playerRows = lookupResult as Array<{
      deleted_at: Date | string | null;
      has_history: boolean;
      id: string;
      linked: boolean;
    }>;

    const player = playerRows[0];
    if (!player) return json({ error: "Player not found" }, 404);
    if (!player.deleted_at) {
      return json({ error: "Discard the player before deleting them" }, 409);
    }
    if (player.linked) {
      return json(
        {
          error:
            "This player is linked to a friend. Remove the friend before deleting the player",
        },
        409,
      );
    }
    if (player.has_history) {
      return json(
        {
          error:
            "This player has saved session history and cannot be permanently deleted",
        },
        409,
      );
    }

    const [deleteResult] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`
        DELETE FROM players AS player
        WHERE player.id = ${id}
          AND player.owner_id = ${ownerId}::uuid
          AND player.deleted_at IS NOT NULL
          AND player.linked_account_id IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM session_results AS result
            WHERE result.owner_id = ${ownerId}::uuid
              AND result.player_id = player.id
          )
        RETURNING player.id
      `,
    ]);
    const rows = deleteResult;
    if (!rows.length) {
      return json(
        { error: "The player changed before permanent deletion; try again" },
        409,
      );
    }
    return json({ deleted: id });
  } catch (error) {
    console.error("players DELETE error", error);
    return json({ error: "Could not permanently delete the player" }, 500);
  }
}
