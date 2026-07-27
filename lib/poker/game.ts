import type {
  GameState,
  LeaderboardEntry,
  PokerSession,
  RaiseRule,
} from "./types";

export const GAME_STORAGE_KEY = "pokerLedger.v1";
export const HISTORY_STORAGE_KEY = "pokerLedger.history.v1";
export const STAGES = ["FLOP", "TURN", "RIVER"] as const;

export const RAISE_RULES: Record<
  RaiseRule,
  { name: string; note: string }
> = {
  ante: {
    name: "Buy-in increment",
    note: "A raise must go at least one buy-in above the current bet.",
  },
  double: {
    name: "Match last raise",
    note: "A raise must increase by at least the size of the last raise.",
  },
  free: {
    name: "Any amount",
    note: "A raise only has to beat the current bet.",
  },
};

export function formatRupees(value: number) {
  return `₹${Number(value).toLocaleString("en-IN")}`;
}

export function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function playerKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function activeIndexes(game: GameState) {
  if (!game.hand) return [];
  return game.players
    .map((_, index) => index)
    .filter((index) => game.hand?.in[index]);
}

export function pendingIndexes(game: GameState) {
  if (!game.hand) return [];
  return activeIndexes(game).filter((index) => !game.hand?.acted[index]);
}

export function getRaiseRule(game: GameState): RaiseRule {
  return game.raiseRule in RAISE_RULES ? game.raiseRule : "ante";
}

export function minimumRaise(game: GameState, playerIndex: number) {
  const hand = game.hand;
  if (!hand) return 0;

  let target: number;
  const rule = getRaiseRule(game);
  if (hand.roundHigh === 0) {
    target = game.ante;
  } else if (rule === "double") {
    target =
      hand.roundHigh + Math.max(hand.lastRaise || game.ante, game.ante);
  } else if (rule === "free") {
    target = hand.roundHigh + 1;
  } else {
    target = hand.roundHigh + game.ante;
  }

  return Math.max(
    1,
    Math.min(
      target - hand.committed[playerIndex],
      game.players[playerIndex].stack,
    ),
  );
}

export function dealNewHand(game: GameState) {
  const alive = game.players.filter(
    (player) => player.stack >= game.ante,
  ).length;
  if (alive < 2) {
    game.hand = null;
    return;
  }

  game.handNo += 1;
  const inHand = game.players.map((player) => player.stack >= game.ante);
  let pot = 0;
  game.players.forEach((player, index) => {
    if (inHand[index]) {
      player.stack -= game.ante;
      pot += game.ante;
    }
  });

  game.hand = {
    no: game.handNo,
    pot,
    stage: 0,
    in: inHand,
    committed: game.players.map(() => 0),
    acted: game.players.map(() => false),
    last: game.players.map(() => null),
    roundHigh: 0,
    lastRaise: game.ante,
    stacksBeforeHand: game.players.map(
      (player, index) => player.stack + (inHand[index] ? game.ante : 0),
    ),
  };
}

export function buildLeaderboard(sessions: PokerSession[]) {
  const entries = new Map<string, LeaderboardEntry>();

  sessions.filter((session) => !session.discardedAt).forEach((session) => {
    session.results.forEach((result) => {
      const key = result.playerId
        ? `id:${result.playerId}`
        : `name:${playerKey(result.name)}`;
      const entry = entries.get(key) ?? {
        playerId: result.playerId,
        name: result.name,
        net: 0,
        sessions: 0,
        hands: 0,
        wins: 0,
        best: result.net,
        worst: result.net,
      };

      entry.name = result.name;
      entry.net += result.net;
      entry.sessions += 1;
      entry.hands += session.hands;
      if (result.net > 0) entry.wins += 1;
      entry.best = Math.max(entry.best, result.net);
      entry.worst = Math.min(entry.worst, result.net);
      entries.set(key, entry);
    });
  });

  return [...entries.values()].sort((a, b) => b.net - a.net);
}
