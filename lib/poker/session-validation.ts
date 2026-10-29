import { deriveSessionAccounting } from "./accounting.ts";
import { LOG_LIMIT } from "./action-log.ts";
import {
  isValidBuyIn,
  MAX_BUY_INS,
  parseRebuyRules,
} from "./buy-ins.ts";
import { normalizeRakeRules } from "./game.ts";
import { isChipUnit } from "./money.ts";
import { parseChipValue } from "./settle-up.ts";
import type {
  BlindHistory,
  BlindSchedule,
  GameKind,
  PokerSession,
  RakeRules,
  SavedActionLog,
  SessionResult,
} from "./types";
import { visibleText } from "../visible-text.ts";

export const MAX_SESSIONS_PER_REQUEST = 250;
const MAX_RESULTS_PER_SESSION = 10;
const MAX_GAME_NAME_LENGTH = 80;
const MAX_BLIND_EVENTS = 1000;
const MAX_LOG_LINE_LENGTH = 300;
const MAX_LOG_NAME_LENGTH = 80;

function asSafeInteger(
  value: unknown,
  field: string,
  { min = Number.MIN_SAFE_INTEGER }: { min?: number } = {},
) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min) {
    throw new Error(`${field} must be a valid whole number`);
  }
  return number;
}

/**
 * A saved game's action log: up to LOG_LIMIT lines of text and the players
 * they name. It is a record to read, not accounting, so only its shape and
 * sizes are checked. Absent or null is none.
 */
export function parseActionLog(value: unknown): SavedActionLog | undefined {
  if (value === undefined || value === null) return undefined;
  const log = asObject(value, "action log");
  if (
    !Array.isArray(log.lines) ||
    log.lines.length > LOG_LIMIT ||
    !log.lines.every(
      (line) =>
        typeof line === "string" &&
        line.length > 0 &&
        line.length <= MAX_LOG_LINE_LENGTH,
    )
  ) {
    throw new Error("Invalid action log");
  }
  if (
    !Array.isArray(log.players) ||
    log.players.length > MAX_RESULTS_PER_SESSION
  ) {
    throw new Error("Invalid action log players");
  }
  const players = log.players.map((entry) => {
    const player = asObject(entry, "action log player");
    const name = String(player.name ?? "").trim();
    if (!name || name.length > MAX_LOG_NAME_LENGTH) {
      throw new Error("Invalid action log player name");
    }
    if (
      player.id !== undefined &&
      (typeof player.id !== "string" || !/^[A-Za-z0-9._:-]{1,100}$/.test(player.id))
    ) {
      throw new Error("Invalid action log player");
    }
    return { ...(player.id ? { id: player.id as string } : {}), name };
  });
  return { players, lines: log.lines as string[] };
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value as Record<string, unknown>;
}

function validateBlindSchedule(value: unknown): BlindSchedule | null {
  if (value === null) return null;
  const input = asObject(value, "blind schedule");
  if (input.unit !== "hands" && input.unit !== "minutes") {
    throw new Error("Invalid blind schedule unit");
  }
  if (input.raiseType !== "multiply" && input.raiseType !== "add") {
    throw new Error("Invalid blind increase type");
  }
  const every = asSafeInteger(input.every, "blind interval", { min: 1 });
  const raiseBy = Number(input.raiseBy);
  if (
    !Number.isFinite(raiseBy) ||
    raiseBy <= (input.raiseType === "multiply" ? 1 : 0) ||
    (input.raiseType === "add" && !Number.isSafeInteger(raiseBy))
  ) {
    throw new Error("Invalid blind increase");
  }
  return { unit: input.unit, every, raiseType: input.raiseType, raiseBy };
}

function validateBlindHistory(
  value: unknown,
  hands: number,
  ante: number,
  date: number,
  ended: number,
): BlindHistory {
  const input = asObject(value, "blind history");
  if (
    !Array.isArray(input.plans) ||
    !Array.isArray(input.levels) ||
    input.plans.length < 1 ||
    input.levels.length < 1 ||
    input.plans.length > MAX_BLIND_EVENTS ||
    input.levels.length > MAX_BLIND_EVENTS
  ) {
    throw new Error("Invalid blind history");
  }
  const plans = input.plans.map((value) => {
    const plan = asObject(value, "blind plan");
    const effectiveHand = asSafeInteger(plan.effectiveHand, "blind plan hand", {
      min: 1,
    });
    const effectiveAt = asSafeInteger(plan.effectiveAt, "blind plan time", {
      min: date,
    });
    const baseBigBlind = asSafeInteger(
      plan.baseBigBlind,
      "blind plan big blind",
      { min: 1 },
    );
    if (effectiveHand > hands || effectiveAt > ended) {
      throw new Error("Blind plan is outside this session");
    }
    return {
      effectiveHand,
      effectiveAt,
      baseBigBlind,
      schedule: validateBlindSchedule(plan.schedule),
    };
  });
  const levels = input.levels.map((value) => {
    const level = asObject(value, "blind level");
    const handNo = asSafeInteger(level.handNo, "blind level hand", {
      min: 1,
    });
    const dealtAt = asSafeInteger(level.dealtAt, "blind level time", {
      min: date,
    });
    const bigBlind = asSafeInteger(level.bigBlind, "blind level big blind", {
      min: 1,
    });
    if (handNo > hands || dealtAt > ended) {
      throw new Error("Blind level is outside this session");
    }
    return { handNo, dealtAt, bigBlind };
  });
  if (
    plans[0].effectiveHand !== 1 ||
    plans[0].baseBigBlind !== ante ||
    levels[0].handNo !== 1 ||
    levels[0].bigBlind !== ante ||
    plans.some((plan, index) =>
      index > 0 && plan.effectiveHand <= plans[index - 1].effectiveHand,
    ) ||
    levels.some((level, index) =>
      index > 0 && level.handNo <= levels[index - 1].handNo,
    )
  ) {
    throw new Error("Invalid blind history order");
  }
  if (input.smallBlindRatio === undefined || input.smallBlindRatio === null) {
    return { plans, levels };
  }
  const ratio = asObject(input.smallBlindRatio, "small blind share");
  const big = asSafeInteger(ratio.big, "small blind share big blind", { min: 1 });
  const small = asSafeInteger(ratio.small, "small blind share small blind", {
    min: 1,
  });
  if (small > big) {
    throw new Error("The small blind can't be bigger than the big blind");
  }
  return { plans, levels, smallBlindRatio: { small, big } };
}

/** A saved game's chip unit; absent or null is whole chips. Throws on anything else. */
export function parseChipUnit(value: unknown) {
  if (value === undefined || value === null) return "whole";
  if (!isChipUnit(value)) throw new Error("Invalid chip unit");
  return value;
}

/** A saved game's kind; absent or null is a game played hand by hand. */
export function parseGameKind(value: unknown): GameKind | undefined {
  if (value === undefined || value === null) return undefined;
  if (value !== "ledger") throw new Error("Invalid game kind");
  return value;
}

export function parseBigBlindAnte(value: unknown) {
  if (value === undefined || value === null || value === false) return false;
  if (value !== true) throw new Error("Invalid big blind ante");
  return true;
}

export function parseRakeRules(value: unknown): RakeRules | undefined {
  if (value === undefined || value === null) return undefined;
  const rules = normalizeRakeRules(value);
  if (!rules) {
    throw new Error("Rake must be 0.1 to 10 percent with a cap of at least 1");
  }
  return rules;
}

type PlayerRecord = Pick<
  SessionResult,
  "handsPlayed" | "joinedHand" | "joinedAt" | "leftHand" | "leftAt"
>;

/**
 * A result's record of the player's time at the table (games that track
 * players). Hand numbers must fit the game's hands and times its start and
 * end; quick ledgers have times only. A late joiner's first hand is 2 or
 * later (hand 1 is the start), and a hand they joined before can't be one
 * they left after.
 */
function parsePlayerRecord(
  result: Record<string, unknown>,
  game: { ledger: boolean; hands: number; date: number; ended: number },
): PlayerRecord {
  const present = (key: string) => result[key] !== undefined && result[key] !== null;
  const hand = (key: string, label: string, min: number, max: number) => {
    if (!present(key)) return undefined;
    if (game.ledger) throw new Error("A quick ledger game has no hands");
    const value = asSafeInteger(result[key], label, { min });
    if (value > max) throw new Error(`${label} is outside the game's hands`);
    return value;
  };
  const time = (key: string, label: string) => {
    if (!present(key)) return undefined;
    const value = asSafeInteger(result[key], label, { min: game.date });
    if (value > game.ended) throw new Error(`${label} is after the game ended`);
    return value;
  };
  const handsPlayed = hand("handsPlayed", "Hands played", 0, game.hands);
  const joinedHand = hand("joinedHand", "The hand joined at", 2, game.hands + 1);
  const leftHand = hand("leftHand", "The hand cashed out after", 0, game.hands);
  const joinedAt = time("joinedAt", "The time joined");
  const leftAt = time("leftAt", "The time cashed out");
  if (
    (joinedHand !== undefined && joinedAt === undefined) ||
    (leftHand !== undefined && leftAt === undefined)
  ) {
    throw new Error("A join or cash-out needs its time");
  }
  if (joinedAt !== undefined && leftAt !== undefined && leftAt < joinedAt) {
    throw new Error("A player can't cash out before joining");
  }
  if (
    handsPlayed !== undefined &&
    handsPlayed > (leftHand ?? game.hands) - (joinedHand ?? 1) + 1
  ) {
    throw new Error("More hands played than the player was at the table for");
  }
  return {
    ...(handsPlayed !== undefined ? { handsPlayed } : {}),
    ...(joinedHand !== undefined ? { joinedHand } : {}),
    ...(joinedAt !== undefined ? { joinedAt } : {}),
    ...(leftHand !== undefined ? { leftHand } : {}),
    ...(leftAt !== undefined ? { leftAt } : {}),
  };
}

export function validateSession(input: unknown): PokerSession {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid session");
  }

  const candidate = input as Record<string, unknown>;
  const id = String(candidate.id || "");
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(id)) {
    throw new Error("Invalid session id");
  }

  const kind = parseGameKind(candidate.kind);
  const ledger = kind === "ledger";
  const date = asSafeInteger(candidate.date, "date", { min: 1 });
  const ended = asSafeInteger(candidate.ended, "ended", { min: date });
  // A quick ledger has no blinds and deals no hands, so both are 0.
  const ante = asSafeInteger(candidate.ante, "ante", { min: ledger ? 0 : 1 });
  const startStack = asSafeInteger(candidate.startStack, "starting stack", {
    min: 1,
  });
  const hands = asSafeInteger(candidate.hands, "hands", { min: ledger ? 0 : 1 });
  if (
    ledger &&
    (ante !== 0 ||
      hands !== 0 ||
      (candidate.blindHistory ?? null) !== null ||
      (candidate.rebuyRules ?? null) !== null ||
      (candidate.bigBlindAnte ?? false) !== false ||
      (candidate.rakeRules ?? null) !== null ||
      (candidate.rake ?? 0) !== 0)
  ) {
    throw new Error(
      "A quick ledger game has no hands, blinds, ante, rake or rebuy limits",
    );
  }
  const blindHistory =
    candidate.blindHistory === undefined || candidate.blindHistory === null
      ? undefined
      : validateBlindHistory(candidate.blindHistory, hands, ante, date, ended);
  const rebuyRules = parseRebuyRules(candidate.rebuyRules);
  const bigBlindAnte = parseBigBlindAnte(candidate.bigBlindAnte);
  const rakeRules = parseRakeRules(candidate.rakeRules);
  const rake =
    candidate.rake === undefined || candidate.rake === null
      ? 0
      : asSafeInteger(candidate.rake, "rake", { min: 0 });
  // The house takes at most the cap a hand, and nothing without rules.
  if (rake > 0 && (!rakeRules || rake > rakeRules.cap * hands)) {
    throw new Error("The rake doesn't match the game's rake rules");
  }
  const chipUnit = parseChipUnit(candidate.chipUnit);
  const chipValue = parseChipValue(candidate.chipValue);
  const actionLog = parseActionLog(candidate.actionLog);
  const name = visibleText(candidate.name || "");
  if (name.length > MAX_GAME_NAME_LENGTH) {
    throw new Error(
      `Game names must be ${MAX_GAME_NAME_LENGTH} characters or fewer`,
    );
  }

  if (
    !Array.isArray(candidate.results) ||
    candidate.results.length < 2 ||
    candidate.results.length > MAX_RESULTS_PER_SESSION
  ) {
    throw new Error("A session must have 2 to 10 player results");
  }

  const results: SessionResult[] = candidate.results.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid player result");
    }
    const result = value as Record<string, unknown>;
    const name = String(result.name || "").trim();
    const playerId = result.playerId
      ? String(result.playerId).trim()
      : undefined;
    if (!name || name.length > 80) {
      throw new Error("Player names must be 1 to 80 characters");
    }
    if (playerId && !/^[A-Za-z0-9._:-]{1,100}$/.test(playerId)) {
      throw new Error("Invalid player id");
    }
    const net = asSafeInteger(result.net, "net result");
    const end = asSafeInteger(result.end, "ending stack", { min: 0 });
    let buyIns: number[] | undefined;
    if (result.buyIns !== undefined) {
      if (
        !Array.isArray(result.buyIns) ||
        result.buyIns.length < 1 ||
        result.buyIns.length > MAX_BUY_INS
      ) {
        throw new Error("Invalid buy-in history");
      }
      const parsedBuyIns = result.buyIns.map((amount, index) =>
        asSafeInteger(amount, "buy-in amount", { min: index === 0 ? 0 : 1 }),
      );
      // Amounts are the player's own choice; only rebuys must be positive.
      if (!parsedBuyIns.slice(1).every(isValidBuyIn)) {
        throw new Error("Invalid buy-in sequence");
      }
      const invested = parsedBuyIns.reduce(
        (total, amount) => total + amount,
        0,
      );
      if (!Number.isSafeInteger(invested) || net !== end - invested) {
        throw new Error("Buy-ins do not match the net result");
      }
      // The closing big blind isn't checked: buy-ins don't record their hand.
      const maxRebuys = rebuyRules?.maxRebuys ?? null;
      if (maxRebuys !== null && parsedBuyIns.length - 1 > maxRebuys) {
        throw new Error("More rebuys than the game's rebuy limit");
      }
      buyIns = parsedBuyIns;
    }
    return {
      ...(playerId ? { playerId } : {}),
      name,
      net,
      end,
      ...(buyIns ? { buyIns } : {}),
      ...parsePlayerRecord(result, { ledger, hands, date, ended }),
    };
  });
  // A hand-by-hand game that tracked players records everyone's hands.
  const counted = results.filter((result) => result.handsPlayed !== undefined);
  if (counted.length && counted.length !== results.length) {
    throw new Error("Every player's hands played must be saved, or none");
  }

  const session = {
    ...(ledger ? { kind } : {}),
    id,
    ...(name ? { name } : {}),
    date,
    ended,
    ...(chipUnit === "cents" ? { chipUnit } : {}),
    ...(chipValue ? { chipValue } : {}),
    ante,
    ...(blindHistory ? { blindHistory } : {}),
    startStack,
    ...(rebuyRules ? { rebuyRules } : {}),
    ...(bigBlindAnte ? { bigBlindAnte } : {}),
    ...(rakeRules ? { rakeRules } : {}),
    ...(rake > 0 ? { rake } : {}),
    hands,
    results,
    ...(actionLog ? { actionLog } : {}),
  };
  deriveSessionAccounting(session);
  return session;
}
