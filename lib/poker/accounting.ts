import type { PokerSession, SessionResult } from "./types";

export type DerivedSessionResult = SessionResult & {
  buyIns: number[];
  invested: number;
};

export type DerivedSessionAccounting = {
  results: DerivedSessionResult[];
  totalEnding: number;
  totalInvested: number;
  totalNet: number;
};

function safeSum(values: number[], label: string) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) {
    throw new Error(`${label} exceeds the supported chip range`);
  }
  return total;
}

function participantNameKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function deriveSessionAccounting(
  session: Pick<PokerSession, "results" | "startStack">,
): DerivedSessionAccounting {
  const participantKeys = new Set<string>();
  const results = session.results.map((result) => {
    const participantKey = result.playerId
      ? `id:${result.playerId}`
      : `name:${participantNameKey(result.name)}`;
    if (participantKeys.has(participantKey)) {
      throw new Error(`Duplicate player result: ${result.name}`);
    }
    participantKeys.add(participantKey);

    const buyIns = result.buyIns?.length
      ? [...result.buyIns]
      : [session.startStack];
    const invested = safeSum(buyIns, `${result.name}'s investment`);
    if (result.net !== result.end - invested) {
      throw new Error(`Investment does not match ${result.name}'s result`);
    }

    return { ...result, buyIns, invested };
  });

  const totalInvested = safeSum(
    results.map((result) => result.invested),
    "Total investment",
  );
  const totalEnding = safeSum(
    results.map((result) => result.end),
    "Total ending chips",
  );
  const totalNet = safeSum(
    results.map((result) => result.net),
    "Total net result",
  );

  if (totalEnding !== totalInvested || totalNet !== 0) {
    throw new Error("Session chips must balance across all players");
  }

  return { results, totalEnding, totalInvested, totalNet };
}
