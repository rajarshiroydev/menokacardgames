"use client";

import { FormEvent, useState } from "react";

import { Avatar } from "@/components/ledger/avatar";
import { ChipInput, useMoney } from "@/components/ledger/money";
import { describeRebuyRules, isUnusualBuyIn, isValidBuyIn } from "@/lib/poker/buy-ins";
import {
  canJoinGame,
  MAX_GAME_PLAYERS,
  nextBuyIn,
  rebuyBlockReason,
} from "@/lib/poker/game";
import { isLedgerGame } from "@/lib/poker/ledger";
import { chipCurrency } from "@/lib/poker/money";
import type { GameState, PlayerProfile } from "@/lib/poker/types";

/**
 * The amount box for a player choosing their own buy-in, in the game's chip
 * unit, with a warning for amounts far from the starting stack.
 */
function BuyInAmountField({
  game,
  id,
  value,
  onChange,
}: {
  game: GameState;
  id: string;
  value: number;
  onChange: (chips: number) => void;
}) {
  const { money } = useMoney();
  return (
    <>
      <label className="label" htmlFor={id}>
        Buy-in amount
      </label>
      <ChipInput className="field" id={id} value={value} onChange={onChange} />
      {!isValidBuyIn(value) ? (
        <p className="field-error" role="alert">
          The buy-in must be more than 0.
        </p>
      ) : isUnusualBuyIn(value, game.startStack) ? (
        <p className="field-error" role="note">
          That&apos;s far from the usual {money(game.startStack)}. Check the
          amount before you confirm.
        </p>
      ) : (
        <p className="muted small-note">
          The usual buy-in is {money(game.startStack)}.
        </p>
      )}
    </>
  );
}

export function BuyInSheet({
  game,
  playerIndex,
  onClose,
  onBuyIn,
}: {
  game: GameState;
  playerIndex: number;
  onClose: () => void;
  onBuyIn: (amount: number) => void;
}) {
  const { money } = useMoney();
  const player = game.players[playerIndex];
  const [amount, setAmount] = useState(game.startStack);
  const valid = isValidBuyIn(amount);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid) onBuyIn(amount);
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="buy-in-title"
        onSubmit={submit}
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="buy-in-title">Buy In {player.name}</h2>
        {game.hand ? (
          <p className="muted small-note">
            They sit out this hand and play from the next one.
          </p>
        ) : null}
        <BuyInAmountField
          game={game}
          id="buy-in-amount"
          value={amount}
          onChange={setAmount}
        />
        <button className="primary full" type="submit" disabled={!valid}>
          {valid ? `Buy In · ${money(amount)}` : "Buy In"}
        </button>
        <button className="ghost full" type="button" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}

export function JoinGameSheet({
  game,
  roster,
  selfPlayerId,
  onClose,
  onAdd,
}: {
  game: GameState;
  roster: PlayerProfile[];
  selfPlayerId: string | null;
  onClose: () => void;
  onAdd: (playerId: string, seat: number, amount: number) => void;
}) {
  const { money } = useMoney();
  // A quick ledger has no seats or deal: the player is just added.
  const ledger = isLedgerGame(game);
  const full = game.players.length >= MAX_GAME_PLAYERS;
  const candidates = [
    ...roster.filter((player) => player.id === selfPlayerId),
    ...roster.filter((player) => player.id !== selfPlayerId),
  ].filter((player) => canJoinGame(game, player));
  // A late player sits on the left of someone still at the table, which is
  // the next seat clockwise, the way the deal goes; the value is where they
  // go in the seat order.
  const seats = game.players.flatMap((player, index) =>
    player.left ? [] : [{ player, index }],
  );
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [seat, setSeat] = useState(() => (seats.at(-1)?.index ?? -1) + 1);
  const [amount, setAmount] = useState(game.startStack);
  const chosen = candidates.find((player) => player.id === chosenId);
  const amountValid = isValidBuyIn(amount);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chosen && amountValid) onAdd(chosen.id, seat, amount);
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-player-title"
        onSubmit={submit}
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="add-player-title">Add Player</h2>
        {ledger ? null : (
          <p className="muted small-note">
            They&apos;re dealt in from the next hand.
          </p>
        )}
        {full ? (
          <p className="field-error" role="alert">
            A game can have up to {MAX_GAME_PLAYERS} players, counting anyone
            who cashed out.
          </p>
        ) : !candidates.length ? (
          <p className="muted small-note">
            Everyone on your list is in this game. Add a guest on Profile, then
            come back to the table.
          </p>
        ) : (
          <>
            <span className="label">Who&apos;s joining</span>
            <div className="table-change-list">
              {candidates.map((player) => (
                <button
                  className={`contender${player.id === chosenId ? " selected" : ""}`}
                  key={player.id}
                  type="button"
                  aria-pressed={player.id === chosenId}
                  onClick={() => setChosenId(player.id)}
                >
                  <Avatar name={player.name} playerId={player.id} size="small" />
                  <span className="contender-name">{player.name}</span>
                  {player.id === selfPlayerId ? (
                    <span className="you-tag">You</span>
                  ) : null}
                </button>
              ))}
            </div>
            {ledger ? null : (
              <>
                <label className="label" htmlFor="late-seat">
                  Seat
                </label>
                <select
                  className="select-control"
                  id="late-seat"
                  value={seat}
                  onChange={(event) => setSeat(Number(event.target.value))}
                >
                  {seats.map(({ player, index }) => (
                    <option key={player.id || index} value={index + 1}>
                      After {player.name}
                      {index === game.dealerIndex ? " (dealer last hand)" : ""}
                    </option>
                  ))}
                </select>
              </>
            )}
            <BuyInAmountField
              game={game}
              id="late-amount"
              value={amount}
              onChange={setAmount}
            />
          </>
        )}
        <button
          className="primary full"
          type="submit"
          disabled={full || !chosen || !amountValid}
        >
          {chosen && amountValid
            ? `Add ${chosen.name} · ${money(amount)}`
            : "Add player"}
        </button>
        <button className="ghost full" type="button" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}

export function CashOutSheet({
  game,
  onClose,
  onCashOut,
  onReturn,
}: {
  game: GameState;
  onClose: () => void;
  onCashOut: (playerIndex: number) => void;
  onReturn: (playerIndex: number) => void;
}) {
  const { money } = useMoney();
  const seated = game.players.flatMap((player, index) =>
    player.left ? [] : [{ player, index }],
  );
  const gone = game.players.flatMap((player, index) =>
    player.left ? [{ player, index }] : [],
  );

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
        aria-labelledby="cash-out-title"
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="cash-out-title">Cash Out</h2>
        <p className="muted small-note">
          Pick who&apos;s leaving. The chips in front of them become their
          result for the game.
        </p>
        <div className="table-change-list">
          {seated.map(({ player, index }) => (
            <button
              className="contender"
              key={player.id || index}
              type="button"
              onClick={() => onCashOut(index)}
            >
              <Avatar name={player.name} playerId={player.id} size="small" />
              <span className="contender-name">{player.name}</span>
              <span className="contender-amount">{money(player.stack)}</span>
            </button>
          ))}
        </div>
        {gone.length ? (
          <>
            <span className="label">Left the table</span>
            <div className="table-change-list">
              {gone.map(({ player, index }) => (
                <button
                  className="contender"
                  key={player.id || index}
                  type="button"
                  onClick={() => onReturn(index)}
                >
                  <Avatar name={player.name} playerId={player.id} size="small" />
                  <span className="contender-name">{player.name}</span>
                  <span className="contender-amount">
                    Return · {money(player.stack)}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        <button className="ghost full" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export function BuyInOptions({
  game,
  onBuyIn,
}: {
  game: GameState;
  onBuyIn: (playerIndex: number) => void;
}) {
  const { money } = useMoney();
  const hand = game.hand;
  // Hidden while a pot is being split, so the screen stays on the split.
  if (hand?.splitSel) return null;
  const offers = game.players.flatMap((player, index) => {
    const amount = nextBuyIn(game, index);
    return amount === null ? [] : [{ player, index, amount }];
  });
  // Busted players the host's rebuy limits stop, with the reason. During a
  // hand only those who were bust when it was dealt; a player who went all
  // in this hand is still in it.
  const blocked = game.players.flatMap((player, index) => {
    if (hand && (hand.in[index] || (hand.stacksBeforeHand[index] ?? 0) > 0)) {
      return [];
    }
    const reason = player.stack === 0 ? rebuyBlockReason(game, index) : null;
    return reason ? [{ player, index, reason }] : [];
  });
  if (!offers.length && !blocked.length) return null;
  const rules = describeRebuyRules(game.rebuyRules, chipCurrency(game.currency, game.chipValue), game.chipUnit);

  // During a hand it is its own card, in the same place in List and Table
  // view (above Undo), so a buy-in is always found in one spot.
  return (
    <div className={`buy-in-options ${hand ? "glass card" : ""}`}>
      <span className="label">Buy in</span>
      <p className="muted small-note">
        {game.customBuyIns
          ? `A busted player can buy back in for any amount, usually ${money(game.startStack)}.`
          : "A busted player can buy back in for the starting stack."}
        {rules ? ` ${rules}.` : ""}
        {hand ? " They sit out this hand and play from the next one." : ""}
      </p>
      {offers.map(({ player, index, amount }) => (
        <button
          className="contender"
          key={player.id || index}
          type="button"
          onClick={() => onBuyIn(index)}
        >
          <Avatar name={player.name} playerId={player.id} size="small" />
          <span className="contender-name">{player.name}</span>
          <span className="contender-amount">
            {game.customBuyIns ? "Buy in" : `Buy in · ${money(amount)}`}
          </span>
        </button>
      ))}
      {blocked.map(({ player, index, reason }) => (
        <div className="contender" key={player.id || index} aria-disabled="true">
          <Avatar name={player.name} playerId={player.id} size="small" />
          <span className="contender-name">{player.name}</span>
          <span className="contender-amount muted">
            {reason === "max" ? "No rebuys left" : "Rebuys closed"}
          </span>
        </div>
      ))}
    </div>
  );
}
