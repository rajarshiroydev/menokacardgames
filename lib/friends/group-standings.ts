import {
  buildStandings,
  STANDINGS_METRIC_VERSION,
  standingsKey,
} from "../poker/standings.ts";
import { type ChipUnit, DEFAULT_CURRENCY } from "../poker/money.ts";
import { normalizeChipValue } from "../poker/settle-up.ts";
import type { ChipValue, GameKind, PokerSession, SessionResult } from "../poker/types";
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
    /** "cents" for a game counted in hundredths (migration 0020). */
    chipUnit?: ChipUnit;
    startStack: number;
    hands: number;
    /** Chips the house raked (migration 0023); absent or 0 is none. */
    rake?: number;
    /** What the chips cost (migration 0026); absent or null is none. */
    chipValue?: ChipValue | null;
    /** How the game was played (migration 0027); absent before it. */
    ended?: number;
    kind?: GameKind | "hands";
    ante?: number;
    blindHistory?: PokerSession["blindHistory"] | null;
    rebuyRules?: PokerSession["rebuyRules"] | null;
    bigBlindAnte?: boolean;
    rakeRules?: PokerSession["rakeRules"] | null;
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

/**
 * A standings row as a friend sees it: no player, game or session IDs.
 * `invested` and `net` are sent only on the friend's own row; other players'
 * money stays on the server (user decision, 2026-10-05).
 */
export type GroupStandingRow = {
  rank: number | null;
  name: string;
  avatar: string;
  averageReturn: number | null;
  eligibleSessions: number;
  totalSessions: number;
  invested?: number;
  net?: number;
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

/**
 * One game a friend played in, as they saw it at the table: every player's
 * result and how it was played, for its Details and Settle up (user
 * decisions 2026-10-26, which relax the 2026-10-05 "no money for others"
 * rule for single games only; standings keep it). No game, session or player
 * IDs, and no game name or number, which would reveal how many games the
 * host has. The fields from migration 0027 are absent before it.
 */
/** A player's late join, cash-out and hands played (migration 0028). */
type SeatRecord = Pick<
  SessionResult,
  "handsPlayed" | "joinedHand" | "joinedAt" | "leftHand" | "leftAt"
>;

export type GroupGame = {
  date: number;
  ended?: number;
  chipUnit?: ChipUnit;
  kind?: GameKind;
  ante?: number;
  blindHistory?: PokerSession["blindHistory"];
  startStack: number;
  hands: number;
  rebuyRules?: PokerSession["rebuyRules"];
  bigBlindAnte?: boolean;
  rakeRules?: PokerSession["rakeRules"];
  rake?: number;
  chipValue?: ChipValue;
  /** In the host's seating order, as the host's own card gets them. */
  results: Array<
    {
      name: string;
      avatar: string;
      net: number;
      end: number;
      buyIns?: number[];
      isMe: boolean;
    } & SeatRecord
  >;
};

export type GroupStandings = {
  hostAccountId: string;
  hostName: string | null;
  currency: string;
  myPlayerName: string;
  metricVersion: number;
  /** Games the friend played in: the graph's x axis, not the host's total. */
  games: number;
  lastPlayed: number | null;
  rows: GroupStandingRow[];
  chart: GroupChartLine[];
  /** The games the friend played in, newest first, for the Games screen. */
  sharedGames: GroupGame[];
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
 * A friend's view of a host's group, built only from the games the friend
 * played in ("what you could have seen at the table", user decision
 * 2026-10-05): the players they sat with, ranked among themselves 1…N with
 * the same rules as the host's own standings, the graph over those games,
 * and the games themselves for the Games screen. Nothing reveals how many
 * games or players the host has in total, and only the friend's own row
 * carries money in the standings. `friend_group_sessions()` already returns
 * only those games (migration 0022); they are filtered here too. Game,
 * session and player IDs never leave the server.
 */
export function buildGroupStandings(group: GroupSessions): GroupStandings {
  const shared = group.sessions.filter((session) =>
    session.results.some((result) => result.playerId === group.myPlayerId),
  );
  const sessions: PokerSession[] = shared.map((session) => ({
    id: session.id,
    date: session.date,
    ended: session.date,
    ...(session.chipUnit === "cents" ? { chipUnit: session.chipUnit } : {}),
    ante: 0,
    startStack: session.startStack,
    ...(session.rake ? { rake: Number(session.rake) } : {}),
    ...(normalizeChipValue(session.chipValue)
      ? { chipValue: normalizeChipValue(session.chipValue)! }
      : {}),
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
  for (const session of shared) {
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
    rows: standings.entries.map((entry) => {
      const isMe = entry.key === myKey;
      return {
        rank: entry.rank,
        name: entry.name,
        avatar:
          (entry.playerId && avatars.get(entry.playerId)) ||
          fallbackAvatarId(entry.name),
        averageReturn: entry.averageReturn,
        eligibleSessions: entry.eligibleSessions,
        totalSessions: entry.totalSessions,
        ...(isMe ? { invested: entry.invested, net: entry.net } : {}),
        hands: entry.hands,
        profitableSessions: entry.profitableSessions,
        isMe,
      };
    }),
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
    sharedGames: shared
      .map((session): GroupGame => {
        const chipValue = normalizeChipValue(session.chipValue);
        return {
          date: session.date,
          ...(session.ended ? { ended: Number(session.ended) } : {}),
          ...(session.chipUnit === "cents" ? { chipUnit: session.chipUnit } : {}),
          ...(session.kind === "ledger" ? { kind: session.kind } : {}),
          ...(session.ante ? { ante: Number(session.ante) } : {}),
          ...(session.blindHistory ? { blindHistory: session.blindHistory } : {}),
          startStack: session.startStack,
          hands: session.hands,
          ...(session.rebuyRules ? { rebuyRules: session.rebuyRules } : {}),
          ...(session.bigBlindAnte ? { bigBlindAnte: true } : {}),
          ...(session.rakeRules ? { rakeRules: session.rakeRules } : {}),
          ...(session.rake ? { rake: Number(session.rake) } : {}),
          ...(chipValue ? { chipValue } : {}),
          results: session.results.map((result) => ({
            name: result.name,
            avatar: result.avatar || fallbackAvatarId(result.name),
            net: result.net,
            end: result.end,
            ...(result.buyIns?.length ? { buyIns: result.buyIns } : {}),
            ...seatRecord(result),
            isMe: result.playerId === group.myPlayerId,
          })),
        };
      })
      .sort((a, b) => b.date - a.date),
  };
}

/** "Asha's game": a game at a friend's table has no name or number. */
export function hostedGameName(hostName: string | null) {
  return `${hostName ?? "Friend"}'s game`;
}

/**
 * One of the friend's shared games, found by its start time (the phone has
 * no game IDs), as a saved game for the results card. Null when the friend
 * didn't play in it or there is no such game.
 */
export function findSharedGame(
  group: GroupSessions,
  date: number,
): PokerSession | null {
  const session = group.sessions.find(
    (item) =>
      Number(item.date) === date &&
      item.results.some((result) => result.playerId === group.myPlayerId),
  );
  if (!session) return null;
  const chipValue = normalizeChipValue(session.chipValue);
  return {
    id: session.id,
    name: hostedGameName(group.hostName),
    date: session.date,
    ended: session.ended ? Number(session.ended) : session.date,
    ...(session.kind === "ledger" ? { kind: session.kind } : {}),
    ...(session.chipUnit === "cents" ? { chipUnit: session.chipUnit } : {}),
    ante: Number(session.ante ?? 0),
    ...(session.blindHistory ? { blindHistory: session.blindHistory } : {}),
    startStack: session.startStack,
    hands: session.hands,
    ...(session.rake ? { rake: Number(session.rake) } : {}),
    ...(chipValue ? { chipValue } : {}),
    results: session.results.map((result) => ({
      playerId: result.playerId,
      name: result.name,
      net: result.net,
      end: result.end,
      ...(result.buyIns?.length ? { buyIns: result.buyIns } : {}),
    })),
  };
}

/** The parts of a result's seat record that are set. */
function seatRecord(result: SeatRecord): SeatRecord {
  const keys = ["handsPlayed", "joinedHand", "joinedAt", "leftHand", "leftAt"] as const;
  return Object.fromEntries(
    keys.flatMap((key) =>
      result[key] === undefined || result[key] === null
        ? []
        : [[key, Number(result[key])]],
    ),
  );
}

