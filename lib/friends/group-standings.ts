import {
  buildStandings,
  STANDINGS_METRIC_VERSION,
  standingsKey,
} from "../poker/standings.ts";
import type { PokerSession, SessionResult } from "../poker/types";

/** One linked host's saved games, as `public.friend_group_sessions()` returns them. */
export type GroupSessions = {
  hostAccountId: string;
  hostName: string | null;
  myPlayerId: string;
  myPlayerName: string;
  sessions: Array<{
    id: string;
    date: number;
    startStack: number;
    hands: number;
    results: Array<Required<Pick<SessionResult, "playerId">> & SessionResult>;
  }>;
};

/** A standings row as a friend sees it: no player, game or session IDs. */
export type GroupStandingRow = {
  rank: number | null;
  name: string;
  averageReturn: number | null;
  eligibleSessions: number;
  totalSessions: number;
  invested: number;
  net: number;
  hands: number;
  profitableSessions: number;
  isMe: boolean;
};

export type GroupStandings = {
  hostAccountId: string;
  hostName: string | null;
  myPlayerName: string;
  metricVersion: number;
  games: number;
  lastPlayed: number | null;
  rows: GroupStandingRow[];
};

/**
 * Ranks a host's games exactly as the host's own standings do, then keeps
 * only what the standings list shows. Games themselves never leave the server.
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
  const myKey = standingsKey({ playerId: group.myPlayerId, name: group.myPlayerName });

  return {
    hostAccountId: group.hostAccountId,
    hostName: group.hostName,
    myPlayerName: group.myPlayerName,
    metricVersion: STANDINGS_METRIC_VERSION,
    games: sessions.length,
    lastPlayed: sessions.length
      ? Math.max(...sessions.map((session) => session.date))
      : null,
    rows: standings.entries.map((entry) => ({
      rank: entry.rank,
      name: entry.name,
      averageReturn: entry.averageReturn,
      eligibleSessions: entry.eligibleSessions,
      totalSessions: entry.totalSessions,
      invested: entry.invested,
      net: entry.net,
      hands: entry.hands,
      profitableSessions: entry.profitableSessions,
      isMe: entry.key === myKey,
    })),
  };
}
