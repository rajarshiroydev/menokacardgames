import { getDatabase } from "@/lib/poker/database";
import { isLiveToken, type LiveView } from "@/lib/poker/live-view";
import { liveTokenHashHex } from "@/lib/poker/live-token";

export const dynamic = "force-dynamic";

type LiveViewRow = {
  snapshot: LiveView;
  updated_at: Date | string;
};

function ended() {
  return Response.json(
    { error: "This game has ended" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Public, read-only standings behind a share link. No sign-in: the token is
 * the only credential, and the database returns nothing once the link has
 * been stopped or has expired, or the host's account is locked.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/live/[token]">,
) {
  const { token } = await context.params;
  if (!isLiveToken(token)) return ended();

  try {
    const sql = getDatabase();
    const rows = (await sql`
      SELECT snapshot, updated_at
      FROM public.read_live_view(decode(${liveTokenHashHex(token)}, 'hex'))
    `) as LiveViewRow[];
    if (!rows.length) return ended();

    return Response.json(
      {
        ...rows[0].snapshot,
        updatedAt: new Date(rows[0].updated_at).getTime(),
      },
      {
        headers: {
          // Lets many phones share one database read every couple of seconds.
          "Cache-Control": "public, s-maxage=2, stale-while-revalidate=3",
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  } catch (error) {
    console.error("live GET error", error);
    return Response.json(
      { error: "Could not load live standings" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
