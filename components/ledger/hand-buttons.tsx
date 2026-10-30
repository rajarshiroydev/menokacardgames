"use client";

import { UndoIcon } from "@/components/ledger/icons";
import { lastHandNumber, pendingIndexes, STAGES, undoableStreet } from "@/lib/poker/game";
import type { GameState, PlayerAction } from "@/lib/poker/types";

/**
 * Takes back the last completed hand, named by its number ("Undo hand 23"),
 * greyed when there is none to undo.
 */
export function UndoHandButton({
  game,
  onUndoHand,
  tall = false,
}: {
  game: GameState;
  onUndoHand: () => void;
  tall?: boolean;
}) {
  const undoable = lastHandNumber(game);
  return (
    <button
      className={`glass-button ${tall ? "tall" : ""}`}
      type="button"
      disabled={undoable === null}
      onClick={onUndoHand}
    >
      {undoable === null ? "Undo hand" : `Undo hand ${undoable}`}
    </button>
  );
}

/**
 * During a hand, in both views: undo the last hand beside cancelling this
 * one, each named by its number.
 */
export function HandButtons({
  game,
  onUndoHand,
  onCancelHand,
}: {
  game: GameState;
  onUndoHand: () => void;
  onCancelHand: () => void;
}) {
  return (
    <div className="button-pair">
      <UndoHandButton game={game} onUndoHand={onUndoHand} tall />
      <button
        className="glass-button tall danger-text"
        type="button"
        onClick={onCancelHand}
      >
        Cancel hand {game.hand?.no}
      </button>
    </div>
  );
}

/**
 * Deals the next street, in both views. It stays from the deal to the
 * showdown, greyed while the street is being bet, while a pot is being split
 * and once the river is out ("River dealt").
 */
export function DealButton({ game, onDeal }: { game: GameState; onDeal: () => void }) {
  const hand = game.hand;
  if (!hand) return null;
  const lastStage = STAGES.length - 1;
  const pending = pendingIndexes(game).length > 0;
  return (
    <button
      className="blue-button full tall"
      type="button"
      disabled={Boolean(hand.splitSel) || pending || hand.stage >= lastStage}
      onClick={onDeal}
    >
      {hand.stage < lastStage
        ? `Deal ${STAGES[hand.stage + 1]}`
        : `${STAGES[lastStage]} dealt`}
    </button>
  );
}

/**
 * One Undo for the live hand, in both views: it takes back the latest action
 * this street and names it, like "Undo Asha's call". Before anyone acts on a
 * new street it takes back the street ("Undo Flop"), so a whole hand can be
 * stepped back to the first preflop action. Greyed while a pot is being split
 * or before anyone has acted.
 */
export function UndoTurnButton({
  game,
  tall = false,
  onUndo,
  onUndoStreet,
}: {
  game: GameState;
  tall?: boolean;
  onUndo: (playerIndex: number) => void;
  onUndoStreet: () => void;
}) {
  const className = `glass-button full ${tall ? "tall " : ""}undo-turn`;
  const street = game.hand?.splitSel ? null : undoableStreet(game);
  if (street) {
    return (
      <button className={className} type="button" onClick={onUndoStreet}>
        <UndoIcon />
        Undo {titleCase(street.toLowerCase())}
      </button>
    );
  }
  const seat = game.hand?.splitSel ? null : latestActor(game);
  const action = seat === null ? null : game.hand?.last[seat];
  // With nothing to undo it stays, greyed, so the buttons under it don't
  // move.
  if (seat === null || !action) {
    return (
      <button className={className} type="button" disabled>
        <UndoIcon />
        Undo
      </button>
    );
  }
  // First name only, unless another player shares it ("Arjun S.").
  const name = game.players[seat].name;
  const first = name.split(" ")[0];
  const shared = game.players.some(
    (player, index) => index !== seat && player.name.split(" ")[0] === first,
  );
  return (
    <button
      className={className}
      type="button"
      onClick={() => onUndo(seat)}
    >
      <UndoIcon />
      {/* Cased here: the house capitalising would also lift the "s" in
          "Arjun S.'s". */}
      Undo {titleCase(shared ? name : first)}&apos;s{" "}
      {titleCase(actionNoun(action))}
    </button>
  );
}

/**
 * The seat whose action this street came last, or null before anyone acts.
 * The log is newest first, so the earliest line is the latest action.
 */
function latestActor(game: GameState) {
  const hand = game.hand;
  if (!hand) return null;
  let seat: number | null = null;
  let newest = Infinity;
  hand.last.forEach((action, index) => {
    if (!action) return;
    const at = game.log.indexOf(action.line);
    if (at >= 0 && at < newest) {
      newest = at;
      seat = index;
    }
  });
  return seat;
}

/** Every word starting with a capital, like the house style. */
export function titleCase(text: string) {
  return text.replace(/(^|\s)(\S)/g, (_, gap, letter) => gap + letter.toUpperCase());
}

/** A short name for an action, as in "Undo Asha's raise". */
function actionNoun(action: PlayerAction) {
  if (action.type === "bet") {
    return action.line.includes(" raises to ")
      ? "raise"
      : action.line.includes(" bets ")
        ? "bet"
        : "call";
  }
  return action.type === "all-in" ? "all in" : action.type;
}
