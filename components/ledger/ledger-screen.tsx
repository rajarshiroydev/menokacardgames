"use client";

import { FormEvent, useState } from "react";

import { Avatar, toneClass } from "@/components/ledger/avatar";
import { UndoIcon } from "@/components/ledger/icons";
import { ChipInput, GameAmounts, useMoney } from "@/components/ledger/money";
import { playerBuyIns, totalBuyIns } from "@/lib/poker/game";
import {
  ledgerCountGap,
  ledgerSeated,
  ledgerTotals,
  ledgerUndoLine,
} from "@/lib/poker/ledger";
import type { GameState } from "@/lib/poker/types";

type LedgerViewProps = {
  game: GameState;
  onBuyIn: (playerIndex: number) => void;
  onAddPlayer: () => void;
  onCashOut: () => void;
  onReturn: (playerIndex: number) => void;
  onUndo: () => void;
  /** Chips counted for each player still at the table, by player index. */
  onSave: (counts: Array<number | null>) => void;
  onDiscard: () => void;
};

/** A quick ledger's screen, with its amounts in the game's own chip unit. */
export function LedgerView(props: LedgerViewProps) {
  return (
    <GameAmounts game={props.game}>
      <LedgerScreen {...props} />
    </GameAmounts>
  );
}

function LedgerScreen({
  game,
  onBuyIn,
  onAddPlayer,
  onCashOut,
  onReturn,
  onUndo,
  onSave,
  onDiscard,
}: LedgerViewProps) {
  const { money, signedMoney } = useMoney();
  const [counting, setCounting] = useState(false);
  // Chips counted for each player at the table, by player index; empty is 0.
  const [counts, setCounts] = useState<Array<number | null>>([]);
  const [showFullLog, setShowFullLog] = useState(false);
  const totals = ledgerTotals(game);
  const seated = ledgerSeated(game);
  const undoLine = ledgerUndoLine(game);
  const logLines = showFullLog ? game.log : game.log.slice(0, 6);
  const boughtNote = (index: number) => {
    const buyIns = playerBuyIns(game, index);
    return `${buyIns.length} buy-in${buyIns.length === 1 ? "" : "s"} · ${money(
      totalBuyIns(game, index),
    )}`;
  };

  if (counting) {
    const gap = ledgerCountGap(game, counts);
    return (
      <div className="stack-list game-view ledger-view">
        <section className="glass card">
          <span className="eyebrow">Final count</span>
          <h2 className="card-title">Count The Chips</h2>
          <p className="muted small-note">
            Enter the chips in front of everyone still at the table. Together
            they must come to the chips on the table.
          </p>
          <div className="rows">
            {seated.map((index) => {
              const player = game.players[index];
              const count = counts[index] ?? null;
              const net = (count ?? 0) - totalBuyIns(game, index);
              return (
                <div className="ledger-row" key={player.id || index}>
                  <Avatar name={player.name} playerId={player.id} size="small" />
                  <div className="standing-name">
                    <b>{player.name}</b>
                    <small>
                      Bought {money(totalBuyIns(game, index))}
                      {count !== null ? (
                        <>
                          {" · "}
                          <span className={toneClass(net)}>
                            {signedMoney(net)}
                          </span>
                        </>
                      ) : null}
                    </small>
                  </div>
                  <ChipInput
                    className="field ledger-count"
                    aria-label={`${player.name}'s chips`}
                    placeholder="0"
                    value={count}
                    onChange={(chips) =>
                      setCounts((current) => {
                        const next = [...current];
                        next[index] = chips;
                        return next;
                      })
                    }
                  />
                </div>
              );
            })}
            {game.players.map((player, index) =>
              player.left ? (
                <div className="ledger-row left" key={player.id || index}>
                  <Avatar name={player.name} playerId={player.id} size="small" />
                  <div className="standing-name">
                    <b>{player.name}</b>
                    <small>
                      Cashed out ·{" "}
                      <span className={toneClass(player.stack - totalBuyIns(game, index))}>
                        {signedMoney(player.stack - totalBuyIns(game, index))}
                      </span>
                    </small>
                  </div>
                  <span className="ledger-amount">{money(player.stack)}</span>
                </div>
              ) : null,
            )}
          </div>
          <div
            className={`ledger-balance${gap === 0 ? " balanced" : ""}`}
            role="status"
          >
            <span>
              Counted {money(totals.onTable - gap)} of {money(totals.onTable)}
            </span>
            <b>
              {gap === 0
                ? "Balanced"
                : gap > 0
                  ? `${money(gap)} short`
                  : `${money(-gap)} over`}
            </b>
          </div>
        </section>
        <button
          className="cta"
          type="button"
          disabled={gap !== 0}
          onClick={() => onSave(counts)}
        >
          Save Game
        </button>
        <button
          className="glass-button full"
          type="button"
          onClick={() => setCounting(false)}
        >
          Back to buy-ins
        </button>
      </div>
    );
  }

  return (
    <div className="stack-list game-view ledger-view">
      <section className="glass card between-card">
        <span className="eyebrow">
          {seated.length} at the table
        </span>
        <h2 className="card-title">Buy-Ins</h2>
        <div className="profile-tiles ledger-tiles">
          <div>
            <strong>{money(totals.bought)}</strong>
            <small>Bought in</small>
          </div>
          <div>
            <strong>{money(totals.cashedOut)}</strong>
            <small>Cashed out</small>
          </div>
          <div>
            <strong className="blue">{money(totals.onTable)}</strong>
            <small>On the table</small>
          </div>
        </div>
        <div className="button-pair">
          <button className="glass-button" type="button" onClick={onAddPlayer}>
            Add player
          </button>
          <button className="glass-button" type="button" onClick={onCashOut}>
            Cash out
          </button>
        </div>
      </section>

      <section className="glass card">
        <div className="card-row">
          <h2 className="card-title">Players</h2>
          <span className="card-note">Usual buy-in {money(game.startStack)}</span>
        </div>
        <div className="rows">
          {game.players.map((player, index) => (
            <div
              className={`ledger-row${player.left ? " left" : ""}`}
              key={player.id || index}
            >
              <Avatar name={player.name} playerId={player.id} size="small" />
              <div className="standing-name">
                <b>{player.name}</b>
                <small>
                  {player.left ? (
                    <>
                      Cashed out with {money(player.stack)} ·{" "}
                      <span
                        className={toneClass(player.stack - totalBuyIns(game, index))}
                      >
                        {signedMoney(player.stack - totalBuyIns(game, index))}
                      </span>
                    </>
                  ) : (
                    boughtNote(index)
                  )}
                </small>
              </div>
              {player.left ? (
                <button
                  className="pill-button"
                  type="button"
                  onClick={() => onReturn(index)}
                >
                  Return
                </button>
              ) : (
                <button
                  className="pill-button"
                  type="button"
                  aria-label={`Buy in ${player.name} again`}
                  onClick={() => onBuyIn(index)}
                >
                  + Buy in
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {undoLine ? (
        <button
          className="glass-button full undo-turn ledger-undo"
          type="button"
          onClick={onUndo}
        >
          <UndoIcon />
          <span>Undo: {undoLine}</span>
        </button>
      ) : null}
      <button
        className="cta"
        type="button"
        onClick={() => {
          setCounting(true);
          window.scrollTo({ top: 0 });
        }}
      >
        Count Chips And Finish
      </button>
      <button
        className="glass-button full danger-text"
        type="button"
        onClick={onDiscard}
      >
        Discard game
      </button>

      {game.log.length ? (
        <section className="glass card">
          <span className="label">Log</span>
          <div className="rows log">
            {logLines.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
          {game.log.length > 6 ? (
            <button
              className="text-button"
              type="button"
              onClick={() => setShowFullLog((shown) => !shown)}
            >
              {showFullLog ? "Show fewer" : `Show all ${game.log.length} lines`}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/**
 * Cash out in a quick ledger: pick who's leaving, then type the chips they
 * leave with. Players who left can come back from here too.
 */
export function LedgerCashOutSheet({
  game,
  onClose,
  onCashOut,
  onReturn,
}: {
  game: GameState;
  onClose: () => void;
  onCashOut: (playerIndex: number, chips: number) => void;
  onReturn: (playerIndex: number) => void;
}) {
  const { money } = useMoney();
  const [chosen, setChosen] = useState<number | null>(null);
  const [chips, setChips] = useState<number | null>(null);
  const seated = ledgerSeated(game);
  const gone = game.players.flatMap((player, index) =>
    player.left ? [index] : [],
  );
  const player = chosen === null ? null : game.players[chosen];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chosen !== null && chips !== null) onCashOut(chosen, chips);
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
        aria-labelledby="ledger-cash-out-title"
        onSubmit={submit}
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="ledger-cash-out-title">Cash Out</h2>
        <p className="muted small-note">
          Pick who&apos;s leaving, then count the chips they leave with. That&apos;s
          their result for the game.
        </p>
        {seated.length ? (
          <div className="table-change-list">
            {seated.map((index) => (
              <button
                className={`contender${index === chosen ? " selected" : ""}`}
                key={game.players[index].id || index}
                type="button"
                aria-pressed={index === chosen}
                onClick={() => setChosen(index)}
              >
                <Avatar
                  name={game.players[index].name}
                  playerId={game.players[index].id}
                  size="small"
                />
                <span className="contender-name">{game.players[index].name}</span>
                <span className="contender-amount muted">
                  Bought {money(totalBuyIns(game, index))}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small-note">Everyone has cashed out.</p>
        )}
        {player ? (
          <>
            <label className="label" htmlFor="ledger-cash-out-chips">
              {player.name}&apos;s chips
            </label>
            <ChipInput
              className="field"
              id="ledger-cash-out-chips"
              placeholder="0"
              value={chips}
              onChange={setChips}
            />
          </>
        ) : null}
        <button
          className="primary full"
          type="submit"
          disabled={!player || chips === null}
        >
          {player && chips !== null
            ? `Cash Out · ${money(chips)}`
            : "Cash out"}
        </button>
        {gone.length ? (
          <>
            <span className="label">Left the game</span>
            <div className="table-change-list">
              {gone.map((index) => (
                <button
                  className="contender"
                  key={game.players[index].id || index}
                  type="button"
                  onClick={() => onReturn(index)}
                >
                  <Avatar
                    name={game.players[index].name}
                    playerId={game.players[index].id}
                    size="small"
                  />
                  <span className="contender-name">{game.players[index].name}</span>
                  <span className="contender-amount">Return</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        <button className="ghost full" type="button" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}
