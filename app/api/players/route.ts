import {
  requireHostAccount,
  requireRecentHostAccount,
} from "@/lib/auth/server";
import { isAvatarId } from "@/lib/avatars";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import {
  cleanPlayerName,
  playerNameKey,
} from "@/lib/poker/player-validation";
import type { PlayerProfile } from "@/lib/poker/types";
import { readJsonBody, SMALL_JSON_BODY_LIMIT } from "@/lib/security/json-body";
import { withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

type PlayerRow = {
  id: string;
  name: string;
  player_code: string;
  avatar: string;
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
    avatar: row.avatar,
    linked: Boolean(row.linked),
    createdAt: new Date(row.created_at).getTime(),
    hasHistory: Boolean(row.has_history),
    ...(row.deleted_at
      ? { discardedAt: new Date(row.deleted_at).getTime() }
      : {}),
  };
}

async function handleGet() {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  try {
    const [result] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`
        SELECT
          player.id,
          names.display_name AS name,
          player.player_code,
          avatars.avatar,
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
        -- People with an account go by the name they chose themselves.
        JOIN public.player_display_names() AS names
          ON names.player_id = player.id
        -- ...and show as the avatar they chose.
        JOIN public.player_avatars() AS avatars
          ON avatars.player_id = player.id
        WHERE player.owner_id = ${ownerId}::uuid
        ORDER BY
          player.deleted_at NULLS FIRST,
          lower(names.display_name),
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

async function handlePost(request: Request) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;

  const read = await readJsonBody(request, SMALL_JSON_BODY_LIMIT);
  if (!read.ok) return json({ error: read.error }, read.status);

  try {
    const body = read.body as { name?: unknown; avatar?: unknown } | null;
    let name: string;
    // Optional: without one, the database picks a random avatar.
    const avatar = body?.avatar ?? null;
    if (avatar !== null && !isAvatarId(avatar)) {
      return json({ error: "Choose an avatar from the list" }, 400);
    }

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
        INSERT INTO players (owner_id, name, name_key, avatar)
        VALUES (
          ${ownerId}::uuid,
          ${name},
          ${playerNameKey(name)},
          COALESCE(${avatar}::text, public.random_avatar())
        )
        ON CONFLICT (owner_id, name_key) WHERE owner_id IS NOT NULL DO UPDATE
        SET name = EXCLUDED.name,
          deleted_at = NULL,
          -- Restoring a removed guest takes the avatar chosen now; people with
          -- an account keep their own.
          avatar = CASE
            WHEN ${avatar}::text IS NOT NULL AND players.linked_account_id IS NULL
              THEN EXCLUDED.avatar
            ELSE players.avatar
          END
        RETURNING id, name, player_code, avatar, linked_account_id IS NOT NULL AS linked, created_at, deleted_at
      `,
    ]);
    const rows = result as PlayerRow[];

    return json({ player: mapPlayer(rows[0]) }, 201);
  } catch (error) {
    console.error("players POST error", error);
    return json({ error: "Could not add the player" }, 500);
  }
}

async function handlePatch(request: Request) {
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
      name?: unknown;
      avatar?: unknown;
    };
    const id = String(body?.id || "");
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(id)) {
      return json({ error: "Invalid player id" }, 400);
    }
    const action = body.action ?? "restore";
    if (action === "rename") return renamePlayer(authUserId, ownerId, id, body.name);
    if (action === "avatar") return setGuestAvatar(authUserId, ownerId, id, body.avatar);
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
              -- The account's own player stays in the list for good.
              AND NOT EXISTS (
                SELECT 1 FROM accounts
                WHERE id = ${ownerId}::uuid AND self_player_id = players.id
              )
            RETURNING id, name, player_code, avatar, linked_account_id IS NOT NULL AS linked, created_at, deleted_at
          `
        : sql`
            UPDATE players
            SET deleted_at = NULL
            WHERE id = ${id}
              AND owner_id = ${ownerId}::uuid
              AND deleted_at IS NOT NULL
            RETURNING id, name, player_code, avatar, linked_account_id IS NOT NULL AS linked, created_at, deleted_at
          `,
    ]);
    const rows = result as PlayerRow[];

    if (!rows.length) {
      return json(
        {
          error:
            action === "discard"
              ? "You can't remove yourself, and only active players can be removed"
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

/**
 * Renames a guest. People with an account (a linked friend, or the host's own
 * player) go by the name they chose, so they can't be renamed here. Saved
 * games keep the name each result was saved with.
 */
async function renamePlayer(
  authUserId: string,
  ownerId: string,
  id: string,
  input: unknown,
) {
  let name: string;
  try {
    name = cleanPlayerName(input);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Invalid player name" },
      400,
    );
  }

  try {
    const [result] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`
        UPDATE players AS player
        SET name = ${name}, name_key = ${playerNameKey(name)}
        FROM accounts AS account
        WHERE player.id = ${id}
          AND player.owner_id = ${ownerId}::uuid
          AND account.id = player.owner_id
          AND player.linked_account_id IS NULL
          AND account.self_player_id IS DISTINCT FROM player.id
        RETURNING player.id, player.name, player.player_code, player.avatar, false AS linked, player.created_at, player.deleted_at
      `,
    ]);
    const rows = result as PlayerRow[];
    if (!rows.length) {
      return json(
        { error: "Only guests can be renamed. People on Pokerize choose their own name" },
        409,
      );
    }
    return json({ player: mapPlayer(rows[0]) });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      return json({ error: "You already have a player with that name" }, 409);
    }
    console.error("players rename error", error);
    return json({ error: "Could not rename the player" }, 500);
  }
}

/**
 * Chooses a guest's avatar. People with an account (a linked friend, or the
 * host's own player) choose their own, so they can't be changed here.
 */
async function setGuestAvatar(
  authUserId: string,
  ownerId: string,
  id: string,
  avatar: unknown,
) {
  if (!isAvatarId(avatar)) {
    return json({ error: "Choose an avatar from the list" }, 400);
  }

  try {
    const [result] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`
        UPDATE players AS player
        SET avatar = ${avatar}
        FROM accounts AS account
        WHERE player.id = ${id}
          AND player.owner_id = ${ownerId}::uuid
          AND account.id = player.owner_id
          AND player.linked_account_id IS NULL
          AND account.self_player_id IS DISTINCT FROM player.id
        RETURNING player.id, player.name, player.player_code, player.avatar, false AS linked, player.created_at, player.deleted_at
      `,
    ]);
    const rows = result as PlayerRow[];
    if (!rows.length) {
      return json(
        { error: "Only guests' avatars can be changed. People on Pokerize choose their own" },
        409,
      );
    }
    return json({ player: mapPlayer(rows[0]) });
  } catch (error) {
    console.error("players avatar error", error);
    return json({ error: "Could not change the avatar" }, 500);
  }
}

async function handleDelete(request: Request) {
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

export const GET = withServerTiming("GET /api/players", handleGet);
export const POST = withServerTiming("POST /api/players", handlePost);
export const PATCH = withServerTiming("PATCH /api/players", handlePatch);
export const DELETE = withServerTiming("DELETE /api/players", handleDelete);
