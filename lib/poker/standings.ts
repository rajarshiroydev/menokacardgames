import { deriveSessionAccounting } from "./accounting.ts";
import { sessionMoney, type MoneyResult } from "./settle-up.ts";
import type { PokerSession, SessionResult } from "./types";

/** Bump when the ranking formula or eligibility rules change. */
export const STANDINGS_METRIC_VERSION = 1;

export type IneligibleReason = "no-investment" | "unverified-accounting";

export type IneligibleResult = {
  sessionId: string;
  reason: IneligibleReason;
};

export type StandingsEntry = {
  key: string;
  playerId?: string;
  name: string;
  /** Shared by identical scores; null when the player has no eligible session. */
  rank: number | null;
  /** Unrounded mean of eligible session returns, in percent. */
  averageReturn: number | null;
  eligibleSessions: number;
  totalSessions: number;
  /**
   * Supporting stats below cover eligible sessions only, so they always
   * describe the same games. Amounts are in currency units and can have
   * cents when a game counted in cents.
   */
  invested: number;
  /** Raw result. */
  net: number;
  /** Hands dealt in the sessions the player took part in. */
  hands: number;
  profitableSessions: number;
  bestReturn: number | null;
  worstReturn: number | null;
  ineligible: IneligibleResult[];
};

export type StandingsTimelineSession = {
  id: string;
  sessionNumber?: number;
  date: number;
};

export type ReturnPoint = {
  /** One-based position in the chronological timeline. */
  sessionIndex: number;
  /** Present only when this session changed the player's score. */
  sessionReturn: number | null;
  runningAverage: number;
  sampleCount: number;
};

export type StandingsSeries = {
  key: string;
  /** Running average after each timeline session; null before the first eligible one. */
  returns: Array<ReturnPoint | null>;
  /** Cumulative raw net from eligible sessions in currency units, at the start and after each timeline session. */
  cumulativeNet: number[];
};

export type Standings = {
  metricVersion: number;
  entries: StandingsEntry[];
  timeline: StandingsTimelineSession[];
  series: Map<string, StandingsSeries>;
};

export function standingsKey(result: Pick<SessionResult, "playerId" | "name">) {
  return result.playerId
    ? `id:${result.playerId}`
    : `name:${result.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** Percentage return for one session, calculated without early rounding. */
export function sessionReturn(net: number, invested: number) {
  if (!(invested > 0)) return null;
  const scaled = net * 100;
  return Number.isSafeInteger(scaled) ? scaled / invested : (net / invested) * 100;
}

/** Sorting before summing makes equal sets of returns produce identical means. */
function mean(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
}

function chronological(sessions: PokerSession[]) {
  return sessions
    .filter((session) => !session.discardedAt)
    .sort(
      (a, b) =>
        a.date - b.date ||
        (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0) ||
        a.id.localeCompare(b.id),
    );
}

type Accumulator = StandingsEntry & { returns: number[] };

/**
 * Ranks players by the arithmetic mean of their eligible session returns.
 * Each session counts equally regardless of chip scale. Invested and net are
 * money: each game's chips at its chip value (lib/poker/settle-up.ts), added
 * up in hundredths so games counted in cents and in whole chips add exactly,
 * and converted to currency units at the end.
 */
export function buildStandings(sessions: PokerSession[]): Standings {
  const timeline = chronological(sessions);
  const players = new Map<string, Accumulator>();
  const series = new Map<string, StandingsSeries>();

  timeline.forEach((session, timelineIndex) => {
    let invested: Map<SessionResult, number> | null = null;
    let money: Map<SessionResult, MoneyResult> | null = null;
    try {
      const accounting = deriveSessionAccounting(session);
      invested = new Map(
        session.results.map((result, index) => [
          result,
          accounting.results[index].invested,
        ]),
      );
      const inMoney = sessionMoney(session);
      money = new Map(
        session.results.map((result, index) => [
          result,
          inMoney.results[index],
        ]),
      );
    } catch {
      invested = null;
    }

    const played = new Set<string>();
    const eligibleNet = new Map<string, number>();
    session.results.forEach((result) => {
      const key = standingsKey(result);
      const player: Accumulator = players.get(key) ?? {
        key,
        playerId: result.playerId,
        name: result.name,
        rank: null,
        averageReturn: null,
        eligibleSessions: 0,
        totalSessions: 0,
        invested: 0,
        net: 0,
        hands: 0,
        profitableSessions: 0,
        bestReturn: null,
        worstReturn: null,
        ineligible: [],
        returns: [],
      };
      players.set(key, player);
      if (!series.has(key)) {
        series.set(key, {
          key,
          returns: Array(timelineIndex).fill(null),
          cumulativeNet: Array(timelineIndex + 1).fill(0),
        });
      }
      if (played.has(key)) return;
      played.add(key);

      player.name = result.name;
      player.totalSessions += 1;

      const playerInvested = invested?.get(result);
      const value =
        playerInvested === undefined ? null : sessionReturn(result.net, playerInvested);
      if (value === null) {
        player.ineligible.push({
          sessionId: session.id,
          reason: invested ? "no-investment" : "unverified-accounting",
        });
        return;
      }

      player.eligibleSessions += 1;
      // Eligible means the chips balance, so the money is known.
      const resultMoney = money?.get(result) ?? { net: 0, invested: 0 };
      player.invested += resultMoney.invested;
      player.net += resultMoney.net;
      player.hands += session.hands;
      if (result.net > 0) player.profitableSessions += 1;
      eligibleNet.set(key, resultMoney.net);
      player.returns.push(value);
      player.bestReturn = Math.max(player.bestReturn ?? value, value);
      player.worstReturn = Math.min(player.worstReturn ?? value, value);
      player.averageReturn = mean(player.returns);
    });

    series.forEach((line, key) => {
      const player = players.get(key);
      const previous = line.returns.at(-1) ?? null;
      const changed =
        player !== undefined &&
        player.returns.length > (previous?.sampleCount ?? 0);
      line.returns.push(
        changed && player.averageReturn !== null
          ? {
              sessionIndex: timelineIndex + 1,
              sessionReturn: player.returns.at(-1) ?? null,
              runningAverage: player.averageReturn,
              sampleCount: player.returns.length,
            }
          : previous && { ...previous, sessionIndex: timelineIndex + 1, sessionReturn: null },
      );
      line.cumulativeNet.push(
        (line.cumulativeNet.at(-1) ?? 0) + (eligibleNet.get(key) ?? 0),
      );
    });
  });

  const entries = [...players.values()]
    .map((player) => {
      const { returns, ...entry } = player;
      void returns;
      return {
        ...entry,
        invested: entry.invested / 100,
        net: entry.net / 100,
      };
    })
    .sort((a, b) => {
      if (a.averageReturn === null || b.averageReturn === null) {
        if (a.averageReturn !== b.averageReturn) {
          return a.averageReturn === null ? 1 : -1;
        }
        return a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
      }
      return b.averageReturn - a.averageReturn || a.key.localeCompare(b.key);
    });

  entries.forEach((entry, index) => {
    if (entry.averageReturn === null) return;
    const previous = entries[index - 1];
    entry.rank =
      previous && previous.averageReturn === entry.averageReturn
        ? previous.rank
        : index + 1;
  });

  return {
    metricVersion: STANDINGS_METRIC_VERSION,
    entries,
    timeline: timeline.map(({ id, sessionNumber, date }) => ({
      id,
      sessionNumber,
      date,
    })),
    series: new Map(
      [...series].map(([key, line]) => [
        key,
        { ...line, cumulativeNet: line.cumulativeNet.map((net) => net / 100) },
      ]),
    ),
  };
}

/**
 * Players with this many ranked sessions or fewer count as new: a couple of
 * lucky games can put them above regulars, so the standings hide them unless
 * the reader turns on "New players" (user request, 2026-10-26; regulars from 5
 * sessions, not 6, by the user's later decision that day).
 */
export const NEW_PLAYER_MAX_SESSIONS = 4;

export function isNewPlayer(entry: Pick<StandingsEntry, "eligibleSessions">) {
  return entry.eligibleSessions <= NEW_PLAYER_MAX_SESSIONS;
}

/**
 * Leaves out new players and ranks the rest 1…N again, sharing a rank between
 * identical scores as `buildStandings` does. Rows must already be in ranked
 * order. Returns the kept rows' positions too, for lists kept in step with
 * the rows (a friend's group sends its graph lines that way).
 */
export function withoutNewPlayers<
  Row extends Pick<StandingsEntry, "rank" | "averageReturn" | "eligibleSessions">,
>(rows: readonly Row[]): { rows: Row[]; kept: number[] } {
  const kept = rows.flatMap((row, index) => (isNewPlayer(row) ? [] : [index]));
  const ranked: Row[] = [];
  kept.forEach((index, position) => {
    const row = rows[index];
    const previous = ranked[position - 1];
    ranked.push({
      ...row,
      rank:
        row.averageReturn === null
          ? null
          : previous && previous.averageReturn === row.averageReturn
            ? previous.rank
            : position + 1,
    });
  });
  return { rows: ranked, kept };
}

/**
 * New players are hidden only once this many players have more than
 * `NEW_PLAYER_MAX_SESSIONS` ranked sessions (enough for gold, silver and
 * bronze). Before that, a new group or a friend who has just joined would see
 * an empty list, so everyone is shown (user decision 2026-10-26).
 */
export const NEW_PLAYER_FILTER_MIN_REGULARS = 3;

type FilterRow = Pick<StandingsEntry, "rank" | "averageReturn" | "eligibleSessions"> & {
  isMe?: boolean;
};

/**
 * What the standings show for the New players switch. `filtering` is whether
 * new players are hidden: the switch is off and there are enough regulars.
 * When the reader is new and hidden, their own row comes back unranked as
 * `pinnedSelf`, so nobody disappears from their own standings.
 */
export function filterNewPlayers<Row extends FilterRow>(
  rows: readonly Row[],
  showNew: boolean,
): {
  rows: Row[];
  kept: number[];
  /** False while there are too few regulars for the switch to do anything. */
  applies: boolean;
  filtering: boolean;
  pinnedSelf: Row | null;
} {
  const regulars = rows.filter((row) => !isNewPlayer(row)).length;
  const applies = regulars >= NEW_PLAYER_FILTER_MIN_REGULARS;
  if (!applies || showNew) {
    return {
      rows: [...rows],
      kept: rows.map((_, index) => index),
      applies,
      filtering: false,
      pinnedSelf: null,
    };
  }
  const shown = withoutNewPlayers(rows);
  const self = rows.find((row) => row.isMe && isNewPlayer(row));
  return {
    ...shown,
    applies,
    filtering: true,
    pinnedSelf: self ? { ...self, rank: null } : null,
  };
}
