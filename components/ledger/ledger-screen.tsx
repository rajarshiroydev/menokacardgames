"use client";

import { type CSSProperties, FormEvent, useState } from "react";

import { ActionLog } from "@/components/ledger/action-log";
import { Avatar } from "@/components/ledger/avatar";
import { BankStatus } from "@/components/ledger/bank-sheet";
import {
  ChipCountSheet,
  type ColourCounts,
  type SaveChipSet,
} from "@/components/ledger/chip-count-sheet";
import { ChipStackIcon, UndoIcon } from "@/components/ledger/icons";
import { LedgerTable } from "@/components/ledger/ledger-table";
import { ChipInput, GameAmounts, useMoney } from "@/components/ledger/money";
import { useTimePlayed } from "@/components/ledger/time-played";
import { playerBuyIns, totalBuyIns } from "@/lib/poker/game";
import {
  ledgerCountGap,
  ledgerSeated,
  ledgerTotals,
  ledgerUndoLine,
} from "@/lib/poker/ledger";
import type { ChipSet } from "@/lib/poker/chip-set";
import type { HandLayout } from "@/lib/poker/storage";
import type { GameState } from "@/lib/poker/types";

type LedgerViewProps = {
  game: GameState;
  /** List or Table, the same switch and choice as a hand by hand game. */
  layout: HandLayout;
  onBuyIn: (playerIndex: number) => void;
  onAddPlayer: () => void;
  onCashOut: () => void;
  onReturn: (playerIndex: number) => void;
  onUndo: () => void;
  /** Chips counted for each player still at the table, by player index. */
  onSave: (counts: Array<number | null>) => void;
  onDiscard: () => void;
  /** The live link is on, and whether its updates are failing. */
  liveSharing: boolean;
  liveFailing: boolean;
  onShareLive: () => void;
  /** Bank games: open a player's payments (BankSheet). */
  onBankPayments: (playerIndex: number) => void;
  /** The host's chips, for counting a stack by colour; null until set up. */
  chipSet: ChipSet | null;
  onSaveChipSet: SaveChipSet;
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
  layout,
  onBuyIn,
  onAddPlayer,
  onCashOut,
  onReturn,
  onUndo,
  onSave,
  onDiscard,
  liveSharing,
  liveFailing,
  onShareLive,
  onBankPayments,
  chipSet,
  onSaveChipSet,
}: LedgerViewProps) {
  const { money, signedMoney } = useMoney();
  const played = useTimePlayed(game.startedAt);
  // A player's result colour. No gain or loss is green too, since it isn't
  // a loss (user decision 2026-11-05); plain "₹0" read as unclear.
  const tone = (net: number) => (net < 0 ? "neg" : "pos");
  const [counting, setCounting] = useState(false);
  // Chips counted for each player at the table, by player index; empty is 0.
  const [counts, setCounts] = useState<Array<number | null>>([]);
  // Colour counts behind a total, by player index, so reopening the colour
  // sheet shows them; typing the total by hand drops them.
  const [colourCounts, setColourCounts] = useState<Record<number, ColourCounts>>({});
  const [countingColours, setCountingColours] = useState<number | null>(null);
  const setCount = (index: number, chips: number | null) =>
    setCounts((current) => {
      const next = [...current];
      next[index] = chips;
      return next;
    });
  const totals = ledgerTotals(game);
  const seated = ledgerSeated(game);
  const undoLine = ledgerUndoLine(game);
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
                          <span className={tone(net)}>
                            {signedMoney(net)}
                          </span>
                        </>
                      ) : null}
                    </small>
                  </div>
                  <button
                    className="chip-count-button"
                    type="button"
                    aria-label={`Count ${player.name}'s chips by colour`}
                    onClick={() => setCountingColours(index)}
                  >
                    <ChipStackIcon />
                  </button>
                  <ChipInput
                    className="field ledger-count"
                    aria-label={`${player.name}'s chips`}
                    placeholder="0"
                    value={count}
                    onChange={(chips) => {
                      setCount(index, chips);
                      setColourCounts((current) => {
                        const next = { ...current };
                        delete next[index];
                        return next;
                      });
                    }}
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
                      <span className={tone(player.stack - totalBuyIns(game, index))}>
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
        {countingColours !== null && game.players[countingColours] ? (
          <ChipCountSheet
            name={game.players[countingColours].name}
            chipSet={chipSet}
            initialCounts={colourCounts[countingColours]}
            onSaveChipSet={onSaveChipSet}
            onUse={(chips, byColour) => {
              setCount(countingColours, chips);
              setColourCounts((current) => ({ ...current, [countingColours]: byColour }));
              setCountingColours(null);
            }}
            onClose={() => setCountingColours(null)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="stack-list game-view ledger-view">
      {layout === "table" ? <LedgerTable game={game} /> : null}
      <section className="glass card between-card">
        <h2 className="card-title">Table</h2>
        {/* Drawn like the Stack and In this hand tiles on the action card. */}
        <div
          className="bet-stats ledger-stats"
          style={
            {
              "--chars": Math.max(
                ...[totals.bought, totals.cashedOut, totals.onTable].map(
                  (amount) => money(amount).length,
                ),
              ),
            } as CSSProperties
          }
        >
          <div className="bet-stat">
            <span>Bought in</span>
            <b>{money(totals.bought)}</b>
          </div>
          <div className="bet-stat">
            <span>Cashed out</span>
            <b>{money(totals.cashedOut)}</b>
          </div>
          <div className="bet-stat">
            <span>On the table</span>
            <b>{money(totals.onTable)}</b>
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
          <h2 className="card-title">
            {game.players.length} {game.players.length === 1 ? "Player" : "Players"}
          </h2>
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
                        className={tone(player.stack - totalBuyIns(game, index))}
                      >
                        {signedMoney(player.stack - totalBuyIns(game, index))}
                      </span>
                    </>
                  ) : (
                    boughtNote(index)
                  )}
                </small>
              </div>
              {/* Left of the button, on the row's line (user request). */}
              <BankStatus
                game={game}
                playerIndex={index}
                onOpen={() => onBankPayments(index)}
                short
              />
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
        {/* Where hand by hand has Share live standings, under its list. */}
        <button
          className={`glass-button full live-share-button${
            liveSharing ? " sharing" : ""
          }`}
          type="button"
          onClick={onShareLive}
        >
          {liveSharing ? (
            <>
              <span className="live-dot" aria-hidden="true" />
              {liveFailing ? "Live link not updating" : "Sharing live · show link"}
            </>
          ) : (
            "Share live table"
          )}
        </button>
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
          <div className="card-row">
            <h2 className="card-title">Action Log</h2>
            <span className="card-note">{played} played</span>
          </div>
          <ActionLog lines={game.log} players={game.players} closedLines={6} />
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
  chipSet,
  onSaveChipSet,
}: {
  game: GameState;
  onClose: () => void;
  onCashOut: (playerIndex: number, chips: number) => void;
  onReturn: (playerIndex: number) => void;
  chipSet: ChipSet | null;
  onSaveChipSet: SaveChipSet;
}) {
  const { money } = useMoney();
  const [chosen, setChosen] = useState<number | null>(null);
  const [chips, setChips] = useState<number | null>(null);
  const [colourCounts, setColourCounts] = useState<ColourCounts | undefined>();
  const [countingColours, setCountingColours] = useState(false);
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
                onClick={() => {
                  if (index !== chosen) setColourCounts(undefined);
                  setChosen(index);
                }}
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
            <div className="chip-input-row">
              <ChipInput
                className="field"
                id="ledger-cash-out-chips"
                placeholder="0"
                value={chips}
                onChange={(typed) => {
                  setChips(typed);
                  setColourCounts(undefined);
                }}
              />
              <button
                className="chip-count-button"
                type="button"
                aria-label={`Count ${player.name}'s chips by colour`}
                onClick={() => setCountingColours(true)}
              >
                <ChipStackIcon />
              </button>
            </div>
            {countingColours ? (
              <ChipCountSheet
                name={player.name}
                chipSet={chipSet}
                initialCounts={colourCounts}
                onSaveChipSet={onSaveChipSet}
                onUse={(total, byColour) => {
                  setChips(total);
                  setColourCounts(byColour);
                  setCountingColours(false);
                }}
                onClose={() => setCountingColours(false)}
              />
            ) : null}
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
