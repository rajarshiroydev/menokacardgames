import { getDatabase } from "@/lib/poker/database";
import {
  cleanPlayerName,
  playerNameKey,
} from "@/lib/poker/player-validation";
import type { PlayerProfile } from "@/lib/poker/types";

export const dynamic = "force-dynamic";

type PlayerRow = {
  id: string;
  name: string;
  created_at: Date | string;
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
  };
}

export async function GET() {
  try {
    const sql = getDatabase();
    const rows = (await sql`
      SELECT id, name, created_at
      FROM players
      ORDER BY lower(name), created_at
    `) as PlayerRow[];

    return json({ players: rows.map(mapPlayer) });
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
      SET name_key = EXCLUDED.name_key
      RETURNING id, name, created_at
    `) as PlayerRow[];

    return json({ player: mapPlayer(rows[0]) }, 201);
  } catch (error) {
    console.error("players POST error", error);
    return json({ error: "Could not add the player" }, 500);
  }
}
