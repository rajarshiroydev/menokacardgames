import {
  hasSidePots,
  isShowdown,
  potsFor,
  seatStatusParts,
  STAGES,
} from "@/lib/poker/game";
import type { HandLayout } from "@/lib/poker/storage";
import type { GameState, PlayerAction } from "@/lib/poker/types";

/** The last action taken; seq tells two actions by one seat apart. */
export type LastTurn = {
  playerIndex: number;
  handNo: number;
  stage: number;
  seq: number;
};

/** The seq to flash a seat with, while its action is the latest on this street. */
export function flashFor(game: GameState, lastTurn: LastTurn | null, playerIndex: number) {
  const hand = game.hand;
  return lastTurn &&
    hand &&
    lastTurn.playerIndex === playerIndex &&
    lastTurn.handNo === hand.no &&
    lastTurn.stage === hand.stage &&
    hand.last[playerIndex]
    ? lastTurn.seq
    : undefined;
}

export type GameViewProps = {
  game: GameState;
  layout: HandLayout;
  lastTurn: LastTurn | null;
  onAct: (
    playerIndex: number,
    type: PlayerAction["type"],
    amount?: number,
  ) => void;
  onUndoAction: (playerIndex: number) => void;
  onUndoStreet: () => void;
  onNextStage: () => void;
  onPickWinner: (playerIndex: number) => void;
  onBeginSplit: () => void;
  onEndSplit: () => void;
  onToggleSplit: (playerIndex: number) => void;
  onSplitPot: () => void;
  onAwardPots: (winners: number[][]) => void;
  onCancelHand: () => void;
  onBuyIn: (playerIndex: number) => void;
  onNextHand: () => void;
  onEndSession: () => void;
  onUndoHand: () => void;
  onDiscard: () => void;
  onEditBlinds: () => void;
  onToggleBlindClock: () => void;
  onEditRebuys: () => void;
  onAddPlayer: () => void;
  onCashOut: () => void;
  liveSharing: boolean;
  liveFailing: boolean;
  onShareLive: () => void;
};

/**
 * What the pot says above its amount, in both views: the street while it's
 * bet, then what the showdown needs.
 */
export function potCardLabel(game: GameState) {
  const hand = game.hand;
  if (!hand) return "";
  if (!isShowdown(game)) return `Pot · ${STAGES[hand.stage]}`;
  if (hasSidePots(game) && potsFor(game).pots.length > 1) {
    return "Pick the winners";
  }
  return hand.splitSel ? "Split the pot" : "Pick the winner";
}

export function seatStatus(
  game: GameState,
  playerIndex: number,
  money: (value: number) => string,
) {
  const { label, amount } = seatStatusParts(game, playerIndex);
  return amount === undefined ? label : `${label} ${money(amount)}`;
}
