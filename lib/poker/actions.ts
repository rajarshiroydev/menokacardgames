import { LOG_LIMIT } from "./action-log.ts";
import {
  activeIndexes,
  applyRaiseRules,
  completedHandRecord,
  mayRaise,
  minimumRaise,
  nextPlayerToAct,
  recordHandResult,
  splitShares,
  STAGES,
  takeRake,
  undoRaiseRules,
} from "./game.ts";
import { chipCurrency, formatChips } from "./money.ts";
import type { GameState, PlayerAction } from "./types.ts";

// A player's turn in the hand (fold, check, call, bet or raise, all in),
// taking it back, and paying the pot to one winner or splitting it. Each
// changes the game it's given, like the rules in game.ts; the app passes a
// copy. A refusal leaves the game as it was. `money` writes amounts in the
// game's chip unit, for refusals and the action log.

type Money = (value: number) => string;

/** What a player's turn did: the action played and the street it was on. */
export type PlayedAction = {
  /** A call with nothing to call is played as a check. */
  type: PlayerAction["type"];
  handNo: number;
  stage: number;
};

export function recordAction(
  game: GameState,
  playerIndex: number,
  action: Omit<PlayerAction, "line">,
  text: string,
) {
  const hand = game.hand;
  if (!hand) return;
  const line = `Hand ${hand.no} ${STAGES[hand.stage]}: ${text}`;
  hand.last[playerIndex] = { ...action, line };
  game.log.unshift(line);
  game.log = game.log.slice(0, LOG_LIMIT);
}

export function recordWin(game: GameState, line: string) {
  game.log.unshift(line);
  game.log = game.log.slice(0, LOG_LIMIT);
}

export function awardPot(game: GameState, playerIndex: number, automatic = false) {
  const hand = game.hand;
  if (!hand) return;
  const record = completedHandRecord(game);
  const pot = hand.pot - takeRake(game);
  game.players[playerIndex].stack += pot;
  recordWin(
    game,
    `Hand ${hand.no}: ${game.players[playerIndex].name} wins ${formatChips(
      pot,
      game.chipUnit,
      chipCurrency(game.currency, game.chipValue),
    )}${automatic ? " (others folded)" : ""}`,
  );
  game.lastHand = record;
  game.winnerAnnouncement = {
    names: [game.players[playerIndex].name],
    pot,
    handNo: hand.no,
    split: false,
  };
  recordHandResult(game);
  game.hand = null;
}

/**
 * Plays a player's action on their turn; `amount` is the chips a bet or
 * raise adds (the minimum raise if left out). Returns null when it isn't
 * their turn, `{ error }` when the action isn't allowed, or what was played.
 * When everyone else has folded, the last player wins the pot.
 */
export function playerAction(
  game: GameState,
  playerIndex: number,
  type: PlayerAction["type"],
  amount: number | undefined,
  money: Money,
): PlayedAction | { error: string } | null {
  const hand = game.hand;
  if (
    !hand ||
    !hand.in[playerIndex] ||
    hand.currentPlayer !== playerIndex
  )
    return null;
  const player = game.players[playerIndex];

  if (type === "fold") {
    hand.in[playerIndex] = false;
    const raiseBefore = applyRaiseRules(game, playerIndex);
    recordAction(
      game,
      playerIndex,
      { type, chips: 0, raiseBefore },
      `${player.name} folds`,
    );
  } else if (type === "check") {
    if (hand.roundHigh > hand.committed[playerIndex]) {
      return {
        error: `Cannot check — must call ${money(
          hand.roundHigh - hand.committed[playerIndex],
        )}`,
      };
    }
    const raiseBefore = applyRaiseRules(game, playerIndex);
    recordAction(
      game,
      playerIndex,
      { type, chips: 0, raiseBefore },
      `${player.name} checks`,
    );
  } else if (type === "call") {
    const needed = Math.min(
      hand.roundHigh - hand.committed[playerIndex],
      player.stack,
    );
    if (needed <= 0) {
      return playerAction(game, playerIndex, "check", undefined, money);
    }
    player.stack -= needed;
    hand.committed[playerIndex] += needed;
    hand.pot += needed;
    const raiseBefore = applyRaiseRules(game, playerIndex);
    recordAction(
      game,
      playerIndex,
      { type, chips: needed, raiseBefore },
      `${player.name} calls ${money(needed)}`,
    );
  } else {
    const chips =
      type === "all-in"
        ? player.stack
        : (amount ?? minimumRaise(game, playerIndex));
    if (!Number.isSafeInteger(chips) || chips <= 0) {
      return { error: "Enter an amount" };
    }
    // Amounts are typed as the total for the street, so the messages
    // name totals too.
    if (chips > player.stack) {
      return {
        error: `The most is ${money(hand.committed[playerIndex] + player.stack)} (all in)`,
      };
    }
    const minimum = minimumRaise(game, playerIndex);
    if (chips < minimum && chips < player.stack) {
      return { error: `Minimum is ${money(hand.committed[playerIndex] + minimum)}` };
    }

    const total = hand.committed[playerIndex] + chips;
    const wasRaise = total > hand.roundHigh;
    if (wasRaise && !mayRaise(game, playerIndex)) {
      return { error: "Only call or fold: the all-in was less than a full raise" };
    }
    const opening = !hand.committed.some(
      (committed, index) => index !== playerIndex && committed > 0,
    );
    player.stack -= chips;
    hand.committed[playerIndex] += chips;
    hand.pot += chips;
    const raiseBefore = applyRaiseRules(game, playerIndex);
    const description =
      type === "all-in"
        ? `goes all-in for ${money(chips)}${
            wasRaise ? ` (to ${money(total)})` : ""
          }${wasRaise && !raiseBefore.full ? ", short of a full raise" : ""}`
        : wasRaise
          ? opening
            ? `bets ${money(chips)}`
            : `raises to ${money(total)}`
          : `calls ${money(chips)}`;
    recordAction(
      game,
      playerIndex,
      { type, chips, raiseBefore },
      `${player.name} ${description}`,
    );
  }

  const played = { type, handNo: hand.no, stage: hand.stage };
  const active = activeIndexes(game);
  if (active.length === 1) {
    const winner = active[0];
    // The winner card announces it; no toast as well.
    awardPot(game, winner, true);
    return played;
  }
  hand.currentPlayer = nextPlayerToAct(game, playerIndex);
  return played;
}

/** Takes back a player's last action this street; false when there's none. */
export function undoPlayerAction(game: GameState, playerIndex: number) {
  const hand = game.hand;
  const action = hand?.last[playerIndex];
  if (!hand || !hand.acted[playerIndex] || !action) return false;

  game.players[playerIndex].stack += action.chips;
  hand.committed[playerIndex] -= action.chips;
  hand.pot -= action.chips;
  if (action.type === "fold") hand.in[playerIndex] = true;
  hand.acted[playerIndex] = false;
  hand.last[playerIndex] = null;
  hand.roundHigh = Math.max(0, ...hand.committed);
  undoRaiseRules(game, playerIndex, action.raiseBefore);
  hand.currentPlayer = playerIndex;
  const logIndex = game.log.indexOf(action.line);
  if (logIndex >= 0) game.log.splice(logIndex, 1);
  return true;
}

/**
 * Splits the pot between the players picked to share it, after any rake.
 * Returns the refusal when fewer than two are picked, otherwise null.
 */
export function splitPotBetween(game: GameState, money: Money) {
  const hand = game.hand;
  if (!hand?.splitSel || hand.splitSel.length < 2) {
    return "Select at least 2 players";
  }
  const winners = [...hand.splitSel].sort((a, b) => a - b);
  const record = completedHandRecord(game);
  const pot = hand.pot - takeRake(game);
  splitShares(
    pot,
    winners,
    hand.dealerIndex,
    game.players.length,
  ).forEach((share, playerIndex) => {
    game.players[playerIndex].stack += share;
  });
  recordWin(
    game,
    `Hand ${hand.no}: split ${money(pot)} between ${winners
      .map((index) => game.players[index].name)
      .join(", ")}`,
  );
  game.lastHand = record;
  game.winnerAnnouncement = {
    names: winners.map((index) => game.players[index].name),
    pot,
    handNo: hand.no,
    split: true,
  };
  recordHandResult(game);
  game.hand = null;
  return null;
}
