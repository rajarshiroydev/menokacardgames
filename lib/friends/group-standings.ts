import {
  buildStandings,
  STANDINGS_METRIC_VERSION,
  standingsKey,
} from "../poker/standings.ts";
import { DEFAULT_CURRENCY } from "../poker/money.ts";
import type { PokerSession, SessionResult } from "../poker/types";
import { fallbackAvatarId } from "../avatars.ts";

/** One linked host's saved games, as `public.friend_group_sessions()` returns them. */
export type GroupSessions = {
  hostAccountId: string;
  hostName: string | null;
  /** The host's currency code; absent before migration 0013 (INR). */
  currency?: string;
  myPlayerId: string;
  myPlayerName: string;
  sessions: Array<{
    id: string;
    date: number;
    startStack: number;
    hands: number;
    /**
     * `avatar` is what the player shows as in the host's list (migration
     * 0015). `accountId` is the account that player is, if any (migration
     * 0016); it stays on the server.
     */
    results: Array<
      Required<Pick<SessionResult, "playerId">> &
        SessionResult & { avatar?: string; accountId?: string | null }
    >;
  }>;
};

/** A standings row as a friend sees it: no player, game or session IDs. */
export type GroupStandingRow = {
  rank: number | null;
  name: string;
  avatar: string;
  averageReturn: number | null;
  eligibleSessions: number;
  totalSessions: number;
  invested: number;
  net: number;
  hands: number;
  profitableSessions: number;
  isMe: boolean;
};

/**
 * One player's graph line, in the same order as `rows`: only the games that
 * changed their score, as [game number in date order, running average after
 * it, that game's return], both in percent to two decimals. Games they missed
 * repeat the previous average, so the phone fills those in.
 */
export type GroupChartLine = Array<[number, number, number]>;

export type GroupStandings = {
  hostAccountId: string;
  hostName: string | null;
  currency: string;
  myPlayerName: string;
  metricVersion: number;
  games: number;
  lastPlayed: number | null;
  rows: GroupStandingRow[];
  chart: GroupChartLine[];
};

/**
 * Whether the friend has played in at least one of this host's games. A host
 * who has the friend linked but never seated them has nothing to show on
 * Ranks, so the API leaves that group out (user request, 2026-10-02).
 */
export function playedInGroup(group: GroupSessions): boolean {
  return group.sessions.some((session) =>
    session.results.some((result) => result.playerId === group.myPlayerId),
  );
}

const twoDecimals = (value: number) => Math.round(value * 100) / 100;

/**
 * Ranks a host's games exactly as the host's own standings do, then keeps
 * only what the standings list and its graph show. Games themselves, and any
 * game, session or player IDs, never leave the server. The user accepted
 * (2026-09-27) that the graph lets friends see each player's per-game return.
 */
export function buildGroupStandings(group: GroupSessions): GroupStandings {
  const sessions: PokerSession[] = group.sessions.map((session) => ({
    id: session.id,
    date: session.date,
    ended: session.date,
    ante: 0,
    startStack: session.startStack,
    hands: session.hands,
    results: session.results.map((result) => ({
      playerId: result.playerId,
      name: result.name,
      net: result.net,
      end: result.end,
      ...(result.buyIns?.length ? { buyIns: result.buyIns } : {}),
    })),
  }));
  const standings = buildStandings(sessions);
  const avatars = new Map<string, string>();
  for (const session of group.sessions) {
    for (const result of session.results) {
      if (result.avatar) avatars.set(result.playerId, result.avatar);
    }
  }
  const myKey = standingsKey({ playerId: group.myPlayerId, name: group.myPlayerName });

  return {
    hostAccountId: group.hostAccountId,
    hostName: group.hostName,
    currency: group.currency ?? DEFAULT_CURRENCY,
    myPlayerName: group.myPlayerName,
    metricVersion: STANDINGS_METRIC_VERSION,
    games: sessions.length,
    lastPlayed: sessions.length
      ? Math.max(...sessions.map((session) => session.date))
      : null,
    rows: standings.entries.map((entry) => ({
      rank: entry.rank,
      name: entry.name,
      avatar:
        (entry.playerId && avatars.get(entry.playerId)) ||
        fallbackAvatarId(entry.name),
      averageReturn: entry.averageReturn,
      eligibleSessions: entry.eligibleSessions,
      totalSessions: entry.totalSessions,
      invested: entry.invested,
      net: entry.net,
      hands: entry.hands,
      profitableSessions: entry.profitableSessions,
      isMe: entry.key === myKey,
    })),
    chart: standings.entries.map((entry) =>
      (standings.series.get(entry.key)?.returns ?? []).flatMap((point) =>
        point && point.sessionReturn !== null
          ? [
              [
                point.sessionIndex,
                twoDecimals(point.runningAverage),
                twoDecimals(point.sessionReturn),
              ] as [number, number, number],
            ]
          : [],
      ),
    ),
  };
}
