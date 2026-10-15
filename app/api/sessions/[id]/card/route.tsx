import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { requireHostAccount } from "@/lib/auth/server";
import { isAvatarId } from "@/lib/avatars";
import { APP_NAME } from "@/lib/brand";
import { runAsAuthenticatedUser } from "@/lib/poker/database";
import {
  cardTimeZone,
  cardTitleSize,
  resultsCard,
  type CardPlayer,
  type ResultsCard,
  type ResultsCardRow,
} from "@/lib/poker/results-card";
import {
  mapSession,
  selectSessions,
  type SessionRow,
} from "@/lib/poker/saved-sessions";
import { timed, withServerTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

/** 4:5, the shape WhatsApp shows without cropping. */
const WIDTH = 1080;
const HEIGHT = 1350;
const PAD = 64;
const WINNER_PANEL_MAX_ROWS = 6;

// The app's dark Scoreboard colours (app/globals.css), as hex: the renderer
// doesn't read oklch().
const COLORS = {
  bg: "#05080a",
  ink: "#f3f6f4",
  ink2: "rgba(243, 246, 244, 0.64)",
  ink3: "rgba(243, 246, 244, 0.4)",
  glass: "rgba(255, 255, 255, 0.055)",
  line: "rgba(255, 255, 255, 0.09)",
  green: "#41ee86",
  blue: "#42b2ff",
  neg: "#f47a79",
};
const TONE = { pos: COLORS.green, neg: COLORS.neg, zero: COLORS.ink2 };
const DISPLAY = "Big Shoulders";
const BODY = "Barlow";

function json(body: object, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

// Fonts are cut-down copies of the app's own faces (assets/fonts, OFL); files
// are read once per server instance. next.config.ts traces them into this
// route.
type CardFont = {
  name: string;
  data: Buffer;
  weight: 600 | 700 | 900;
  style: "normal";
};

let assets: Promise<{ fonts: CardFont[]; logo: string }> | null = null;

function loadAssets() {
  assets ??= (async () => {
    const font = (file: string) =>
      readFile(join(process.cwd(), "assets/fonts", file));
    const [display, semibold, bold, logo] = await Promise.all([
      font("BigShoulders-Black.ttf"),
      font("Barlow-SemiBold.ttf"),
      font("Barlow-Bold.ttf"),
      readFile(join(process.cwd(), "public/icons/icon-192.png")),
    ]);
    const fonts: CardFont[] = [
      { name: DISPLAY, data: display, weight: 900, style: "normal" },
      { name: BODY, data: semibold, weight: 600, style: "normal" },
      { name: BODY, data: bold, weight: 700, style: "normal" },
    ];
    return {
      fonts,
      logo: `data:image/png;base64,${logo.toString("base64")}`,
    };
  })().catch((error) => {
    assets = null;
    throw error;
  });
  return assets!;
}

const avatarCache = new Map<string, Promise<string>>();

/** An avatar's SVG as a data URL; `id` must be a known avatar id. */
function avatarData(id: string) {
  let data = avatarCache.get(id);
  if (!data) {
    data = readFile(join(process.cwd(), "public/avatars", `${id}.svg`)).then(
      (svg) => `data:image/svg+xml;base64,${svg.toString("base64")}`,
    );
    avatarCache.set(id, data);
  }
  return data;
}

type PlayerRow = { id: string; name: string; avatar: string };

/**
 * The picture of a saved game's results, for the host to share. Only the
 * host's own saved, not discarded, games; nothing is stored, and the picture
 * is never cached.
 */
async function handleGet(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;
  const ownerId = authResult.account.id;
  const authUserId = authResult.session.user.id;
  const { id } = await context.params;
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(id)) {
    return json({ error: "Invalid session id" }, 400);
  }
  const timeZone = cardTimeZone(new URL(request.url).searchParams.get("tz"));

  let card: ResultsCard;
  try {
    const [sessionRows, playerRows] = await runAsAuthenticatedUser(
      authUserId,
      (sql) => [
        selectSessions(sql, ownerId, [id]),
        sql`
          SELECT player.id, names.display_name AS name, avatars.avatar
          FROM players AS player
          JOIN public.player_display_names() AS names
            ON names.player_id = player.id
          JOIN public.player_avatars() AS avatars
            ON avatars.player_id = player.id
          WHERE player.owner_id = ${ownerId}::uuid
        `,
      ],
    );
    const row = (sessionRows as SessionRow[])[0];
    const session = row ? mapSession(row) : null;
    if (!session || session.discardedAt) {
      return json({ error: "Game not found" }, 404);
    }
    const players = new Map<string, CardPlayer>(
      (playerRows as PlayerRow[]).map((player) => [
        player.id,
        { name: player.name, avatar: player.avatar },
      ]),
    );
    try {
      card = resultsCard(session, {
        currency: authResult.profile.currency,
        timeZone,
        players,
      });
    } catch {
      return json(
        { error: "This game's saved chips don't add up, so it has no card" },
        422,
      );
    }
  } catch (error) {
    console.error("results card GET error", error);
    return json({ error: "Could not reach the ledger database" }, 500);
  }

  try {
    const { fonts, logo } = await loadAssets();
    const avatarIds = new Set(
      card.rows.map((row) => row.avatar).filter((avatar) => isAvatarId(avatar)),
    );
    const avatars = new Map(
      await Promise.all(
        [...avatarIds].map(
          async (avatar) => [avatar, await avatarData(avatar)] as const,
        ),
      ),
    );
    // Drawn in full before replying: ImageResponse otherwise draws while the
    // body streams, after the 200 is sent, so a drawing error would reach the
    // phone as a broken download and never reach the logs.
    const png = await timed("render", () =>
      new ImageResponse(
        <CardImage card={card} logo={logo} avatars={avatars} />,
        { width: WIDTH, height: HEIGHT, fonts },
      ).arrayBuffer(),
    );
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(png.byteLength),
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${fileName(card.title)}"`,
      },
    });
  } catch (error) {
    console.error("results card render error", error);
    return json({ error: "Could not draw the card" }, 500);
  }
}

/** "game-14-results.png": letters, digits and dashes only. */
function fileName(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${slug || "game"}-results.png`;
}

function CardImage({
  card,
  logo,
  avatars,
}: {
  card: ResultsCard;
  logo: string;
  avatars: Map<string, string>;
}) {
  // A big table has no room for the winner's panel as well as readable rows,
  // so from 7 players the winner's row is lit up instead.
  const winnerPanel = card.winner && card.rows.length <= WINNER_PANEL_MAX_ROWS;
  // Rows share what's left once the fixed parts are placed, so 2 players get
  // roomy rows and 10 still fit.
  const title = cardTitleSize(card.title);
  // The name's lines, then the date and how it was played (14 + 2 × 40).
  const titleBlock = title.lines * title.fontSize + 94;
  const fixed =
    96 +
    36 +
    titleBlock +
    36 +
    (winnerPanel ? 236 + 36 : 0) +
    16 +
    70 +
    (card.rake ? 52 : 0);
  const rowHeight = Math.max(
    56,
    Math.min(112, Math.floor((HEIGHT - PAD * 2 - fixed) / card.rows.length)),
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: PAD,
        backgroundColor: COLORS.bg,
        backgroundImage:
          "radial-gradient(circle at 15% 0%, rgba(65, 238, 134, 0.22), transparent 55%), radial-gradient(circle at 100% 100%, rgba(66, 178, 255, 0.2), transparent 55%)",
        color: COLORS.ink,
        fontFamily: BODY,
        fontWeight: 600,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", height: 96 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          width={84}
          height={84}
          alt=""
          style={{ borderRadius: 22 }}
        />
        <span
          style={{
            marginLeft: 20,
            fontFamily: DISPLAY,
            fontWeight: 900,
            fontSize: 60,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          {APP_NAME}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 26,
            fontWeight: 700,
            color: COLORS.green,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          Results
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flexGrow: 1,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontFamily: DISPLAY,
              fontWeight: 900,
              fontSize: title.fontSize,
              lineHeight: 1,
              textTransform: "uppercase",
              wordBreak: "break-word",
            }}
          >
            {card.title}
          </span>
          <span style={{ marginTop: 14, fontSize: 32, color: COLORS.ink2 }}>
            {card.when}
          </span>
          <span style={{ marginTop: 4, fontSize: 32, color: COLORS.ink2 }}>
            {card.played}
          </span>
        </div>

        {winnerPanel && card.winner ? (
          <Winner row={card.winner} avatar={avatars.get(card.winner.avatar)} />
        ) : null}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 36,
            borderRadius: 28,
            backgroundColor: COLORS.glass,
            border: `2px solid ${COLORS.line}`,
            padding: "8px 12px",
          }}
        >
          {card.rows.map((row, index) => (
            <Row
              key={index}
              row={row}
              height={rowHeight}
              avatar={avatars.get(row.avatar)}
              last={index === card.rows.length - 1}
              lit={!winnerPanel && card.winner === row}
            />
          ))}
        </div>

        {card.rake ? (
          <span style={{ marginTop: 20, fontSize: 28, color: COLORS.ink2 }}>
            {card.rake}
          </span>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          height: 70,
          fontSize: 30,
          color: COLORS.ink3,
        }}
      >
        <span>Scored with {APP_NAME} ·&nbsp;</span>
        <span style={{ color: COLORS.ink, fontWeight: 700 }}>pokerize.app</span>
      </div>
    </div>
  );
}

function Winner({ row, avatar }: { row: ResultsCardRow; avatar?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        marginTop: 36,
        height: 236,
        padding: "0 36px",
        borderRadius: 32,
        border: `3px solid ${COLORS.green}`,
        backgroundImage:
          "linear-gradient(120deg, rgba(65, 238, 134, 0.2), rgba(66, 178, 255, 0.12))",
      }}
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          width={164}
          height={164}
          alt=""
          style={{ borderRadius: 82 }}
        />
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", marginLeft: 32 }}>
        <span
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: COLORS.green,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          Winner of the night
        </span>
        <span
          style={{
            fontFamily: DISPLAY,
            fontWeight: 900,
            fontSize: 76,
            lineHeight: 1.05,
            textTransform: "uppercase",
          }}
        >
          {row.name}
        </span>
        <span style={{ fontSize: 40, fontWeight: 700, color: COLORS.green }}>
          {row.result} · {row.return}
        </span>
      </div>
    </div>
  );
}

function Row({
  row,
  height,
  avatar,
  last,
  lit,
}: {
  row: ResultsCardRow;
  height: number;
  avatar?: string;
  last: boolean;
  /** The winner's row, when there's no winner's panel. */
  lit: boolean;
}) {
  const size = Math.round(height * 0.66);
  const text = Math.min(38, Math.round(height * 0.44));
  const medal = ["#f5c84b", "#c9d1d6", "#d8915a"][row.rank - 1];
  const stacked = height >= 72;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height,
        padding: "0 16px",
        borderRadius: lit ? 18 : 0,
        backgroundColor: lit ? "rgba(65, 238, 134, 0.14)" : "transparent",
        borderBottom: last || lit ? "none" : `2px solid ${COLORS.line}`,
      }}
    >
      <span
        style={{
          width: 56,
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: text,
          color: medal ?? COLORS.ink3,
        }}
      >
        {row.rank}
      </span>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          width={size}
          height={size}
          alt=""
          style={{ borderRadius: size / 2 }}
        />
      ) : (
        <div style={{ width: size, height: size }} />
      )}
      <div
        style={{
          display: "flex",
          // Short rows put the rebuys beside the name instead of under it.
          flexDirection: stacked ? "column" : "row",
          alignItems: stacked ? "flex-start" : "baseline",
          marginLeft: 20,
          flexGrow: 1,
        }}
      >
        <span style={{ fontSize: text, fontWeight: 700 }}>{row.name}</span>
        {row.rebuys ? (
          <span
            style={{
              marginLeft: stacked ? 0 : 14,
              fontSize: Math.round(text * 0.62),
              color: COLORS.ink3,
            }}
          >
            {row.rebuys}
          </span>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
        }}
      >
        <span
          style={{
            fontFamily: DISPLAY,
            fontWeight: 900,
            fontSize: Math.round(text * 1.15),
            color: TONE[row.tone],
            lineHeight: 1,
          }}
        >
          {row.result}
        </span>
        <span style={{ fontSize: Math.round(text * 0.62), color: COLORS.ink2 }}>
          {row.return}
        </span>
      </div>
    </div>
  );
}

export const GET = withServerTiming("GET /api/sessions/[id]/card", handleGet);
