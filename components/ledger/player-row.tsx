"use client";

import { useState } from "react";

import { Avatar } from "@/components/ledger/avatar";
import { type GameViewProps, seatStatus } from "@/components/ledger/game-shared";
import { ClearIcon, PencilIcon } from "@/components/ledger/icons";
import { InfoSheet } from "@/components/ledger/info-sheet";
import { useMoney } from "@/components/ledger/money";
import {
  handContributions,
  mayRaise,
  minimumRaise,
  raiseSize,
  seatRole,
} from "@/lib/poker/game";
import { chipsToInput, parseChips } from "@/lib/poker/money";
import type { GameState } from "@/lib/poker/types";

export function PlayerRow({
  game,
  playerIndex,
  onAct,
  roundClosed = false,
  dock = false,
  flash,
}: {
  game: GameState;
  playerIndex: number;
  onAct: GameViewProps["onAct"];
  /** This player's action closed the round; keep the card open but locked. */
  roundClosed?: boolean;
  /** Set while this player's action is the latest; its status flashes. */
  flash?: number;
  /** The table's action dock under the oval, which names who is to act. */
  dock?: boolean;
}) {
  const { money, symbol, unit } = useMoney();
  // What is typed, in the game's unit ("0.75" in a cents game): the total
  // this player's bet reaches this street, like "raise to 300".
  const [amount, setAmount] = useState("");
  // The quick size last tapped and the amount it set; it stays highlighted
  // only while the amount is unchanged, so typing clears it.
  const [picked, setPicked] = useState<{ label: string; amount: string } | null>(
    null,
  );
  const [showRaiseHelp, setShowRaiseHelp] = useState(false);
  const hand = game.hand;
  if (!hand) return null;
  const player = game.players[playerIndex];
  const folded = !hand.in[playerIndex];
  const done = hand.acted[playerIndex];
  const isTurn = hand.currentPlayer === playerIndex;
  const owed = hand.roundHigh - hand.committed[playerIndex];
  const minimum = minimumRaise(game, playerIndex);
  // After a short all-in, a player who already acted may only call or fold.
  const raiseClosed = !mayRaise(game, playerIndex) && player.stack > owed;
  const committed = hand.committed[playerIndex];
  // Once a bet stands (the big blind counts), putting in more is a raise.
  // The box, the quick sizes and the button all speak in the total the bet
  // reaches this street ("raise to 1,300"); chips to put in now are worked
  // out from it.
  const raising = hand.roundHigh > 0;
  const hasAmount = amount.trim() !== "";
  // Text that isn't an amount (like "1.234" in cents) bets nothing, which
  // disables the bet button. With nothing typed the button offers the minimum.
  const betAmount = hasAmount
    ? (parseChips(amount, unit) ?? 0) - committed
    : Math.min(minimum, player.stack);
  const allIn = betAmount >= player.stack;
  const role = seatRole(game, playerIndex);
  // Everything this player has put in this hand, blinds and ante included,
  // since players ask for the hand's total more than this street's.
  const inHand = handContributions(game)[playerIndex];
  // The stack on its own line, larger, with the hand's total under it.
  const stackLine = (
    <>
      <b className="seat-stack-inline">{money(player.stack)}</b>
      {money(inHand)} in hand
    </>
  );
  // The stack and the hand's total as two tiles, above the amount box.
  const moneyStats = (
    <div className="bet-stats">
      <div className="bet-stat">
        <span>Stack</span>
        <b>{money(player.stack)}</b>
      </div>
      <div className="bet-stat">
        <span>In this hand</span>
        <b>{money(inHand)}</b>
      </div>
    </div>
  );

  if (roundClosed) {
    // The status sits on the right of the name, as on the other rows, so
    // the card is as tall as the betting card. In the dock the seat on the
    // table already shows it.
    return (
      <div className={`glass seat-card round-closed ${dock ? "dock" : ""}`}>
        <div className="seat-main">
          <Avatar name={player.name} playerId={player.id} role={role} />
          <div className="seat-copy">
            <b>{player.name}</b>
          </div>
          {dock ? null : (
            <span
              className={`status-pill ${flash ? "just-acted" : ""}`}
              key={flash ?? "status"}
            >
              {seatStatus(game, playerIndex, money)}
            </span>
          )}
        </div>
        <div className="bet-panel" aria-hidden="true" inert>
          {moneyStats}
          <div className="bet-input">
            <span className="bet-input-caption">Round complete</span>
            <span className="bet-input-box">
              <span className="bet-input-symbol">{symbol.trim()}</span>
              <input type="text" disabled />
              <PencilIcon />
            </span>
          </div>
          <div className="quick-sizes">
            {["⅓ Pot", "½ Pot", "Pot", "All in"].map((label) => (
              <button key={label} type="button" disabled>
                {label}
              </button>
            ))}
          </div>
          <div className="action-row">
            <button className="glass-button" type="button" disabled>
              Fold
            </button>
            <button className="blue-button" type="button" disabled>
              Check
            </button>
            <button className="accent-button" type="button" disabled>
              Bet
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (folded || done || !isTurn) {
    // Buy-ins are on the Buy in card, not here.
    return (
      <div className={`glass seat-card ${folded ? "folded" : ""}`}>
        <div className="seat-main">
          <Avatar name={player.name} playerId={player.id} role={role} />
          <div className="seat-copy">
            <b>{player.name}</b>
            <small>{stackLine}</small>
          </div>
          <span
            className={`status-pill ${flash ? "just-acted" : ""}`}
            key={flash ?? "status"}
          >
            {seatStatus(game, playerIndex, money)}
          </span>
        </div>
      </div>
    );
  }

  // Quick sizes are chips to put in now, clamped to what the rules allow.
  const quickAmount = (target: number) =>
    Math.max(minimum, Math.min(player.stack, Math.round(target)));
  const quickSizes = [
    { label: "⅓ Pot", value: quickAmount(hand.pot / 3) },
    { label: "½ Pot", value: quickAmount(hand.pot / 2) },
    { label: "Pot", value: quickAmount(hand.pot) },
    { label: "All in", value: player.stack },
  ];
  const raiseLabel = !(betAmount > 0)
    ? raising
      ? "Raise"
      : "Bet"
    : allIn
      ? "All in"
      : raising
        ? `Raise ${money(committed + betAmount)}`
        : `Bet ${money(betAmount)}`;

  return (
    <div className={`glass seat-card active ${dock ? "dock" : ""}`}>
      <div className="seat-main">
        <Avatar name={player.name} playerId={player.id} role={role} />
        <div className="seat-copy">
          <b>{player.name}</b>
        </div>
      </div>
      <div className="bet-panel">
        {moneyStats}
        {/* To call and the minimum live on the Call and Raise buttons, so
            they aren't repeated here. */}
        {raiseClosed ? null : (
          // Not a <label>: it holds the i button, which a label would
          // take as its control.
          <div className="bet-input">
            <span className="bet-input-caption">
              {raising ? "Raise to" : "Bet"}
              <button
                className="info-button inline"
                type="button"
                aria-label="About the raise amount"
                onClick={() => setShowRaiseHelp(true)}
              >
                i
              </button>
            </span>
            {/* Empty until something is typed or a quick size is tapped,
                so it never shows a figure nobody chose. */}
            <span className="bet-input-box">
              <span className="bet-input-symbol">{symbol.trim()}</span>
              <input
                type="text"
                inputMode={unit === "cents" ? "decimal" : "numeric"}
                autoComplete="off"
                aria-label={raising ? "Raise to" : "Bet amount"}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              {/* With an amount in, the pencil becomes a clear button,
                  which also turns Fold and Check or Call back on. */}
              {hasAmount ? (
                <button
                  className="bet-input-clear"
                  type="button"
                  aria-label="Clear amount"
                  onClick={() => setAmount("")}
                >
                  <ClearIcon />
                </button>
              ) : (
                <PencilIcon />
              )}
            </span>
          </div>
        )}
        {showRaiseHelp ? (
          <RaiseHelp game={game} onClose={() => setShowRaiseHelp(false)} />
        ) : null}
        {raiseClosed ? (
          <p className="raise-closed">
            Short all-in: call or fold. It was less than a full raise, so
            betting isn&apos;t reopened for you.
          </p>
        ) : (
          <>
            <div className="quick-sizes">
              {quickSizes.map((size) => {
                const sizeAmount = chipsToInput(committed + size.value, unit);
                const selected =
                  picked?.label === size.label && picked.amount === amount;
                return (
                  <button
                    key={size.label}
                    type="button"
                    className={selected ? "selected" : undefined}
                    aria-pressed={selected}
                    // Tapping the highlighted size again clears it and the
                    // amount, like the clear button.
                    onClick={() => {
                      if (selected) {
                        setAmount("");
                        setPicked(null);
                        return;
                      }
                      setAmount(sizeAmount);
                      setPicked({ label: size.label, amount: sizeAmount });
                    }}
                  >
                    {size.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className={`action-row ${raiseClosed ? "two" : ""}`}>
          <button
            className="glass-button"
            type="button"
            disabled={hasAmount}
            onClick={() => onAct(playerIndex, "fold")}
          >
            Fold
          </button>
          <button
            className="blue-button"
            type="button"
            disabled={hasAmount}
            onClick={() => onAct(playerIndex, owed > 0 ? "call" : "check")}
          >
            {owed > 0
              ? `Call ${money(Math.min(owed, player.stack))}`
              : "Check"}
          </button>
          {raiseClosed ? null : (
            <button
              className="accent-button"
              type="button"
              disabled={!(betAmount > 0)}
              onClick={() =>
                allIn
                  ? onAct(playerIndex, "all-in")
                  : onAct(playerIndex, "bet", betAmount)
              }
            >
              {raiseLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Explains the betting panel's minimum with this hand's numbers: the
 * standard rule that a raise adds at least the last bet or raise.
 */
function RaiseHelp({
  game,
  onClose,
}: {
  game: GameState;
  onClose: () => void;
}) {
  const { money } = useMoney();
  const hand = game.hand!;
  const step = raiseSize(game);

  return (
    <InfoSheet label="About the raise amount" onClose={onClose}>
      {hand.roundHigh > 0 ? (
        <p>
          Standard poker rule: a raise must go up by at least the last bet or
          raise. <b>Min raise = current bet + last raise</b>, so here{" "}
          {money(hand.roundHigh)} + {money(step)} ={" "}
          <b>{money(hand.roundHigh + step)}</b>.
        </p>
      ) : (
        <p>
          Standard poker rule: with no bet yet this round, the smallest bet is
          the big blind, <b>{money(step)}</b>.
        </p>
      )}
    </InfoSheet>
  );
}
