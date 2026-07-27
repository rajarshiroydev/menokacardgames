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
    ...(row.deleted_at
      ? { deletedAt: new Date(row.deleted_at).getTime() }
      : {}),
  };
}

export async function GET() {
  try {
    const sql = getDatabase();
    const rows = (await sql`
      SELECT id, name, created_at, deleted_at
      FROM players
      ORDER BY deleted_at NULLS FIRST, lower(name), created_at
    `) as PlayerRow[];

    const profiles = rows.map(mapPlayer);
    return json({
      players: profiles.filter((player) => !player.deletedAt),
      archivedPlayers: profiles.filter((player) => player.deletedAt),
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
    const body = (await request.json()) as { id?: unknown };
    const id = String(body?.id || "");
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(id)) {
      return json({ error: "Invalid player id" }, 400);
    }

    const sql = getDatabase();
    const rows = (await sql`
      UPDATE players
      SET deleted_at = NULL
      WHERE id = ${id}
      RETURNING id, name, created_at, deleted_at
    `) as PlayerRow[];

    if (!rows.length) return json({ error: "Player not found" }, 404);
    return json({ player: mapPlayer(rows[0]) });
  } catch (error) {
    console.error("players PATCH error", error);
    return json({ error: "Could not reconnect the player" }, 500);
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
    const rows = (await sql`
      UPDATE players
      SET deleted_at = now()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id
    `) as Array<{ id: string }>;

    if (!rows.length) return json({ error: "Active player not found" }, 404);
    return json({ archived: id });
  } catch (error) {
    console.error("players DELETE error", error);
    return json({ error: "Could not archive the player" }, 500);
  }
}
