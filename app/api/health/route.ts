import { getDatabase } from "@/lib/poker/database";

export const dynamic = "force-dynamic";

/**
 * For the uptime monitor (audit step 6): 200 when the app can reach its
 * database, 503 when it can't. It reads no data and says nothing else.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await getDatabase()`SELECT 1`;
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    console.error("health check: database unreachable", error);
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
