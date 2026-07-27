import { getDatabase } from "@/lib/poker/database";
import {
  cleanPlayerName,
  playerNameKey,
} from "@/lib/poker/player-validation";
import { passwordMatches } from "@/lib/poker/session-validation";
import type { PlayerProfile } from "@/lib/poker/types";

export const dynamic = "force-dynamic";

type PlayerRow = {
  id: string;
  name: string;
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
    createdAt: new Date(row.created_at).getTime(),
    hasHistory: Boolean(row.has_history),
    ...(row.deleted_at
      ? { discardedAt: new Date(row.deleted_at).getTime() }
      : {}),
  };
}

export async function GET() {
  try {
    const sql = getDatabase();
    const rows = (await sql`
      SELECT
        player.id,
        player.name,
        player.created_at,
        player.deleted_at,
        EXISTS (
          SELECT 1
          FROM poker_sessions AS session
          CROSS JOIN LATERAL jsonb_array_elements(session.results) AS result
          WHERE result->>'playerId' = player.id
        ) AS has_history
      FROM players AS player
      ORDER BY
        player.deleted_at NULLS FIRST,
        lower(player.name),
        player.created_at
    `) as PlayerRow[];

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
  try {
    const body = (await request.json()) as { name?: unknown };
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

    const sql = getDatabase();
    const rows = (await sql`
      INSERT INTO players (name, name_key)
      VALUES (${name}, ${playerNameKey(name)})
      ON CONFLICT (name_key) DO UPDATE
      SET name = EXCLUDED.name, deleted_at = NULL
      RETURNING id, name, created_at, deleted_at
    `) as PlayerRow[];

    return json({ player: mapPlayer(rows[0]) }, 201);
  } catch (error) {
    console.error("players POST error", error);
    return json({ error: "Could not add the player" }, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
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

    const sql = getDatabase();
    const rows =
      action === "discard"
        ? ((await sql`
            UPDATE players
            SET deleted_at = now()
            WHERE id = ${id} AND deleted_at IS NULL
            RETURNING id, name, created_at, deleted_at
          `) as PlayerRow[])
        : ((await sql`
            UPDATE players
            SET deleted_at = NULL
            WHERE id = ${id} AND deleted_at IS NOT NULL
            RETURNING id, name, created_at, deleted_at
          `) as PlayerRow[]);

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
  try {
    const deletionPassword =
      process.env.DELETE_PASSWORD || process.env.DELETION_PASSWORD;
    if (!deletionPassword) {
      console.error("Deletion password is not configured");
      return json({ error: "Deletion is not configured" }, 503);
    }
    if (
      !passwordMatches(
        request.headers.get("x-delete-password"),
        deletionPassword,
      )
    ) {
      return json({ error: "Wrong deletion password" }, 401);
    }

    const id = new URL(request.url).searchParams.get("id") || "";
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(id)) {
      return json({ error: "Invalid player id" }, 400);
    }

    const sql = getDatabase();
    const playerRows = (await sql`
      SELECT
        player.id,
        player.deleted_at,
        EXISTS (
          SELECT 1
          FROM poker_sessions AS session
          CROSS JOIN LATERAL jsonb_array_elements(session.results) AS result
          WHERE result->>'playerId' = player.id
        ) AS has_history
      FROM players AS player
      WHERE player.id = ${id}
    `) as Array<{
      deleted_at: Date | string | null;
      has_history: boolean;
      id: string;
    }>;

    const player = playerRows[0];
    if (!player) return json({ error: "Player not found" }, 404);
    if (!player.deleted_at) {
      return json({ error: "Discard the player before deleting them" }, 409);
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

    const rows = await sql`
      DELETE FROM players AS player
      WHERE player.id = ${id}
        AND player.deleted_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM poker_sessions AS session
          CROSS JOIN LATERAL jsonb_array_elements(session.results) AS result
          WHERE result->>'playerId' = player.id
        )
      RETURNING player.id
    `;
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
