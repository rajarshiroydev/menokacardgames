import type { GroupSessions } from "../friends/group-standings.ts";
import { deriveSessionAccounting } from "../poker/accounting.ts";
import { chipsInCents } from "../poker/money.ts";
import { sessionReturn } from "../poker/standings.ts";

/** Games shown as bars on the profile card. */
export const PROFILE_RECENT_GAMES = 10;

/**
 * One ledger the signed-in person played in: their own (through the player
 * they marked as themselves) or a friend's (through the player that friend
 * linked to them). Sessions come in the shape `friend_group_sessions()` uses.
 */
export type ProfileLedger = {
  currency: string;
  myPlayerId: string;
  sessions: GroupSessions["sessions"];
};

export type ProfileStats = {
  /** Games that count: the person played, and the buy-ins are verified. */
  games: number;
  /** Mean of those games' returns, in percent, as the standings work it out. */
  averageReturn: number | null;
  profitableGames: number;
  /**
   * Net result of the games counted in the person's own currency, in
   * currency units; it has cents when a game counted in cents.
   */
  net: number;
  /** Games left out of `net` and `recent` because they used another currency. */
  otherCurrencyGames: number;
  /** Net of the latest games in the person's currency, oldest first. */
  recent: Array<{ date: number; net: number }>;
  /** Date of the first game that counts, in any currency. */
  firstPlayed: number | null;
};

/** What `GET /api/profile` sends: the stats, plus games played together. */
export type ProfileSummary = ProfileStats & {
  /** Games played together with each player in the person's list, by player id. */
  gamesTogether: Record<string, number>;
};

/** `net` is in hundredths of a currency unit, so chip units add exactly. */
type Game = { date: number; net: number; return: number; currency: string };

/** Mean of sorted values, so equal sets of returns give identical means. */
function mean(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
}

/**
 * The person's own record across every ledger they played in. A game counts
 * exactly when it would count for them in that host's standings. Amounts in
 * different currencies are never added together.
 */
export function buildProfileStats(
  ledgers: ProfileLedger[],
  currency: string,
): ProfileStats {
  const games: Game[] = [];
  for (const ledger of ledgers) {
    for (const session of ledger.sessions) {
      const index = session.results.findIndex(
        (result) => result.playerId === ledger.myPlayerId,
      );
      if (index === -1) continue;
      let invested: number;
      try {
        invested = deriveSessionAccounting(session).results[index].invested;
      } catch {
        continue;
      }
      const net = session.results[index].net;
      const value = sessionReturn(net, invested);
      if (value === null) continue;
      games.push({
        date: session.date,
        net: chipsInCents(net, session.chipUnit),
        return: value,
        currency: ledger.currency,
      });
    }
  }
  games.sort((a, b) => a.date - b.date);

  const own = games.filter((game) => game.currency === currency);
  return {
    games: games.length,
    averageReturn: games.length ? mean(games.map((game) => game.return)) : null,
    profitableGames: games.filter((game) => game.net > 0).length,
    net: own.reduce((sum, game) => sum + game.net, 0) / 100,
    otherCurrencyGames: games.length - own.length,
    recent: own
      .slice(-PROFILE_RECENT_GAMES)
      .map(({ date, net }) => ({ date, net: net / 100 })),
    firstPlayed: games[0]?.date ?? null,
  };
}
