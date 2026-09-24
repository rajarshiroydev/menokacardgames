import { deriveSessionAccounting } from "./accounting.ts";
import type {
  BlindHistory,
  BlindSchedule,
  PokerSession,
  SessionResult,
} from "./types";

export const MAX_SESSIONS_PER_REQUEST = 250;
const MAX_RESULTS_PER_SESSION = 10;
const MAX_GAME_NAME_LENGTH = 80;
const MAX_BLIND_EVENTS = 1000;

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
  return { plans, levels };
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

  const date = asSafeInteger(candidate.date, "date", { min: 1 });
  const ended = asSafeInteger(candidate.ended, "ended", { min: date });
  const ante = asSafeInteger(candidate.ante, "ante", { min: 1 });
  const startStack = asSafeInteger(candidate.startStack, "starting stack", {
    min: 1,
  });
  const hands = asSafeInteger(candidate.hands, "hands", { min: 1 });
  const blindHistory =
    candidate.blindHistory === undefined || candidate.blindHistory === null
      ? undefined
      : validateBlindHistory(candidate.blindHistory, hands, ante, date, ended);
  const name = String(candidate.name || "").trim();
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
        result.buyIns.length > 64
      ) {
        throw new Error("Invalid buy-in history");
      }
      const parsedBuyIns = result.buyIns.map((amount, index) =>
        asSafeInteger(amount, "buy-in amount", { min: index === 0 ? 0 : 1 }),
      );
      const validHalves = parsedBuyIns.every(
        (amount, index) =>
          index === 0 || amount === Math.floor(parsedBuyIns[index - 1] / 2),
      );
      if (parsedBuyIns[0] !== startStack || !validHalves) {
        throw new Error("Invalid buy-in sequence");
      }
      const invested = parsedBuyIns.reduce(
        (total, amount) => total + amount,
        0,
      );
      if (!Number.isSafeInteger(invested) || net !== end - invested) {
        throw new Error("Buy-ins do not match the net result");
      }
      buyIns = parsedBuyIns;
    }
    return {
      ...(playerId ? { playerId } : {}),
      name,
      net,
      end,
      ...(buyIns ? { buyIns } : {}),
    };
  });

  const session = {
    id,
    ...(name ? { name } : {}),
    date,
    ended,
    ante,
    ...(blindHistory ? { blindHistory } : {}),
    startStack,
    hands,
    results,
  };
  deriveSessionAccounting(session);
  return session;
}
