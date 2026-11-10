"use client";

import { useMoney } from "@/components/ledger/money";
import { Segmented } from "@/components/ledger/segmented";
import {
  isBankPlayer,
  owedByBank,
  owedToBank,
  unpaidBuyIns,
} from "@/lib/poker/bank";
import { playerBuyIns } from "@/lib/poker/game";
import type { GameState } from "@/lib/poker/types";

/**
 * Games where the host is the bank (plan entry "buy-ins paid to the bank
 * (plan)"): a player's row says what they owe the bank, or what the bank
 * owes them, and opens BankSheet to mark payments as the money changes hands.
 * Nothing for the host, who is the bank, or in other games.
 */
export function BankStatus({
  game,
  playerIndex,
  onOpen,
  short = false,
}: {
  game: GameState;
  playerIndex: number;
  onOpen: () => void;
  /**
   * No amount ("Owes", "Bank owes"), for the quick ledger's rows where the
   * pill sits beside the button (user decision 2026-11-10); the amount is in
   * the payments sheet and the button's label.
   */
  short?: boolean;
}) {
  const { money } = useMoney();
  if (!game.hostIsBank || isBankPlayer(game, playerIndex)) return null;
  const owes = owedToBank(game, playerIndex);
  const owed = owedByBank(game, playerIndex);
  const player = game.players[playerIndex];
  const full = owes
    ? `${money(owes)} owed`
    : owed
      ? `Bank owes ${money(owed)}`
      : player.left
        ? "Paid out"
        : "Paid";
  const text = short ? (owes ? "Owes" : owed ? "Bank owes" : full) : full;
  return (
    <button
      className={`bank-status${owes || owed ? " owing" : ""}`}
      type="button"
      aria-label={`${player.name}: ${full}. Change what was paid`}
      onClick={onOpen}
    >
      {text}
    </button>
  );
}

/** Marks each of a player's buy-ins paid or owed, and a cash-out paid out. */
export function BankSheet({
  game,
  playerIndex,
  onSetBuyIn,
  onSetPaidOut,
  onClose,
}: {
  game: GameState;
  playerIndex: number;
  onSetBuyIn: (place: number, paid: boolean) => void;
  onSetPaidOut: (paid: boolean) => void;
  onClose: () => void;
}) {
  const { money } = useMoney();
  const player = game.players[playerIndex];
  if (!player) return null;
  const buyIns = playerBuyIns(game, playerIndex);
  const unpaid = unpaidBuyIns(game, playerIndex);
  const owes = owedToBank(game, playerIndex);
  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-sheet-title"
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="bank-sheet-title">{player.name}&apos;s Payments</h2>
        <p className="muted small-note">
          {owes
            ? `Owes the bank ${money(owes)}. Mark each buy-in as it's paid.`
            : "Every buy-in is paid to the bank."}
        </p>
        <div className="bank-list">
          {buyIns.map((amount, place) => (
            <div className="bank-line" key={place}>
              <span>
                <b>{place === 0 ? "Buy-in" : `Rebuy ${place}`}</b>
                <small>{money(amount)}</small>
              </span>
              <Segmented
                label={`${place === 0 ? "Buy-in" : `Rebuy ${place}`} paid`}
                options={[
                  { value: "paid", label: "Paid" },
                  { value: "owes", label: "Owes" },
                ]}
                value={unpaid.includes(place) ? "owes" : "paid"}
                onChange={(value) => onSetBuyIn(place, value === "paid")}
              />
            </div>
          ))}
          {player.left ? (
            <div className="bank-line">
              <span>
                <b>Cash-out</b>
                <small>{money(player.stack)}</small>
              </span>
              <Segmented
                label="Cash-out paid by the bank"
                options={[
                  { value: "paid", label: "Paid out" },
                  { value: "owed", label: "Owed" },
                ]}
                value={player.paidOut ? "paid" : "owed"}
                onChange={(value) => onSetPaidOut(value === "paid")}
              />
            </div>
          ) : null}
        </div>
        <button className="primary full" type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
