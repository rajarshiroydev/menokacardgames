import { fallbackAvatarId, isAvatarId } from "../avatars.ts";
import { deriveSessionAccounting } from "./accounting.ts";
import { sessionBlindHistory, smallBlindFor } from "./game.ts";
import { formatChips, formatSignedChips, plainChipsCode } from "./money.ts";
import type { PokerSession } from "./types";

/**
 * The shareable picture of a saved game's results (the Results card in
 * Settle up). Amounts are plain chip counts and returns, never money: the
 * card is meant to travel beyond the table with the Pokerize name on it, and
 * money stays in Settle up's text (user decision 2026-10-13).
 */

/** Longest name shown in full; longer ones are cut with "…". */
export const CARD_NAME_LENGTH = 18;
/** The time zone used when the phone's own isn't given or isn't known. */
export const CARD_DEFAULT_TIME_ZONE = "Asia/Kolkata";

export type ResultsCardRow = {
  /** 1 for the biggest winner; players with the same result share a rank. */
  rank: number;
  name: string;
  avatar: string;
  /** "+12,000", "−4,000" or "0". */
  result: string;
  /** "+120%", "−40%", "+2.5%" or "0%". */
  return: string;
  tone: "pos" | "neg" | "zero";
  /** "2 rebuys", or null without any. */
  rebuys: string | null;
};

export type ResultsCard = {
  title: string;
  /** "13 Oct 2026 · 3 h 20 min" */
  when: string;
  /** "42 hands · Blinds 50/100 to 200/400", or "Quick ledger". */
  played: string;
  /** The biggest winner, when someone finished ahead. */
  winner: ResultsCardRow | null;
  rows: ResultsCardRow[];
  /** "House rake 1,200", or null without rake. */
  rake: string | null;
};

/** Who a saved result belongs to now: their current name and avatar. */
export type CardPlayer = { name: string; avatar: string };

/** The time zone to show dates in: the phone's, if it's a real one. */
export function cardTimeZone(value: string | null | undefined) {
  if (!value || value.length > 64) return CARD_DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-IN", { timeZone: value });
    return value;
  } catch {
    return CARD_DEFAULT_TIME_ZONE;
  }
}

/** A name cut to CARD_NAME_LENGTH characters, counting each emoji once. */
export function cardName(name: string) {
  const characters = Array.from(name.trim().replace(/\s+/g, " "));
  if (characters.length <= CARD_NAME_LENGTH) return characters.join("");
  return `${characters
    .slice(0, CARD_NAME_LENGTH - 1)
    .join("")
    .trimEnd()}…`;
}

/** "3 h 20 min", "45 min", "2 h"; under a minute counts as one. */
export function cardLength(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** A game's return: whole percents, one decimal below 10% ("+2.5%"). */
export function cardReturn(net: number, invested: number) {
  if (!net || !invested) return "0%";
  const percent = (net / invested) * 100;
  const digits = Math.abs(percent) < 10 ? 1 : 0;
  const text = Math.abs(percent).toLocaleString("en-IN", {
    maximumFractionDigits: digits,
  });
  return `${percent > 0 ? "+" : "−"}${text}%`;
}

/**
 * What the card shows for a saved game, biggest winner first (as on the
 * saved game card). `players` maps a result's player to their current name
 * and avatar; results without one keep their saved name and get a stand-in
 * avatar. Throws, as Settle up does, when the game's chips don't add up.
 */
export function resultsCard(
  session: PokerSession,
  options: {
    currency: string;
    timeZone: string;
    players?: Map<string, CardPlayer>;
  },
): ResultsCard {
  const accounting = deriveSessionAccounting(session);
  const code = plainChipsCode(options.currency);
  const unit = session.chipUnit;
  const chips = (value: number) => formatChips(value, unit, code);

  const entries = accounting.results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => b.result.net - a.result.net || a.index - b.index);
  const rows: ResultsCardRow[] = [];
  entries.forEach(({ result }, position) => {
    const previous = rows.at(-1);
    const tied = previous && entries[position - 1].result.net === result.net;
    const player = result.playerId
      ? options.players?.get(result.playerId)
      : undefined;
    const name = player?.name ?? result.name;
    const rebuys = result.buyIns.length - 1;
    rows.push({
      rank: tied ? previous.rank : position + 1,
      name: cardName(name),
      avatar:
        player && isAvatarId(player.avatar)
          ? player.avatar
          : fallbackAvatarId(name),
      result: formatSignedChips(result.net, unit, code),
      return: cardReturn(result.net, result.invested),
      tone: result.net > 0 ? "pos" : result.net < 0 ? "neg" : "zero",
      rebuys: rebuys ? `${rebuys} ${rebuys === 1 ? "rebuy" : "rebuys"}` : null,
    });
  });

  const date = new Date(session.date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: options.timeZone,
  });
  let played = "Quick ledger";
  if (session.kind !== "ledger") {
    const history = sessionBlindHistory(session);
    const blinds = (bigBlind: number) =>
      `${chips(smallBlindFor(bigBlind, history.smallBlindRatio))}/${chips(bigBlind)}`;
    const first = history.levels[0].bigBlind;
    const last = history.levels.at(-1)!.bigBlind;
    const hands = `${session.hands} ${session.hands === 1 ? "hand" : "hands"}`;
    played = `${hands} · Blinds ${blinds(first)}${
      last !== first ? ` to ${blinds(last)}` : ""
    }`;
  }

  return {
    title: session.name || `Game ${session.sessionNumber ?? ""}`.trim(),
    when: `${date} · ${cardLength(session.ended - session.date)}`,
    played,
    winner: rows[0]?.tone === "pos" && rows[1]?.rank !== 1 ? rows[0] : null,
    rows,
    rake: session.rake ? `House rake ${chips(session.rake)}` : null,
  };
}
