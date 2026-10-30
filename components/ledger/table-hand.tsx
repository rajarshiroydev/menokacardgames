"use client";

import { ReactNode, useState } from "react";

import { shortBlinds, StreetPips } from "@/components/game-parts";
import { Avatar } from "@/components/ledger/avatar";
import { BuyInOptions } from "@/components/ledger/buy-in-sheets";
import {
  flashFor,
  type GameViewProps,
  potCardLabel,
  seatStatus,
} from "@/components/ledger/game-shared";
import {
  DealButton,
  HandButtons,
  UndoTurnButton,
} from "@/components/ledger/hand-buttons";
import { TurnSeatsIcon } from "@/components/ledger/icons";
import { useMoney } from "@/components/ledger/money";
import { PlayerRow } from "@/components/ledger/player-row";
import {
  PotBreakdown,
  SidePotPicker,
  SplitView,
  WinnerPicker,
} from "@/components/ledger/pot-winners";
import {
  hasSidePots,
  isShowdown,
  pendingIndexes,
  seatRole,
  STAGES,
} from "@/lib/poker/game";
import { readTableTurn, storeTableTurn } from "@/lib/poker/storage";

/**
 * Where a seat sits around the oval, in percent of the table area. Seat 0 is
 * at the top and the rest follow clockwise, the order the deal goes round.
 */
function seatPosition(index: number, count: number, reach = 1) {
  const angle = ((-90 + (index * 360) / count) * Math.PI) / 180;
  return {
    x: 50 + 38 * reach * Math.cos(angle),
    y: 50 + 38 * reach * Math.sin(angle),
  };
}

/** The live hand drawn as a table, with the action docked below it. */
export function TableHand({
  game,
  blindsText,
  blindSchedule,
  onAct,
  onUndoAction,
  onUndoStreet,
  onBuyIn,
  onNextStage,
  onPickWinner,
  onBeginSplit,
  onEndSplit,
  onToggleSplit,
  onSplitPot,
  onAwardPots,
  onCancelHand,
  onUndoHand,
  lastTurn,
}: GameViewProps & {
  blindsText: string;
  blindSchedule: ReactNode;
}) {
  const { money } = useMoney();
  // Places the seats are turned clockwise to match the real table; the deal
  // order is unchanged.
  const [turn, setTurn] = useState(() => readTableTurn(game.startedAt));
  const hand = game.hand;
  if (!hand) return null;
  // Players who cashed out have left the table, so they get no seat.
  const seats = game.players.flatMap((player, index) =>
    player.left ? [] : [index],
  );
  const count = seats.length;
  const place = (index: number) =>
    seatPosition((seats.indexOf(index) + turn) % count, count);

  function turnSeats() {
    const next = (turn + 1) % count;
    setTurn(next);
    storeTableTurn(game.startedAt, next);
  }
  const lastStage = STAGES.length - 1;
  const pending = pendingIndexes(game).length > 0;
  const showdown = isShowdown(game);
  const splitting = Boolean(hand.splitSel);
  // With side pots the winners are picked per pot on the card below.
  const multiPot = showdown && hasSidePots(game);
  const crowded = count > 6;
  const current = hand.currentPlayer;
  // Like the List view: when a round has just closed, the player whose
  // action closed it keeps a locked card in the dock until the next street
  // is dealt, so the Deal button under it stays where the betting buttons
  // were.
  const closer =
    !splitting && hand.stage < lastStage && !pending
      ? hand.last.findIndex((action) => action?.line === game.log[0])
      : -1;
  // A player bust at the deal can buy in by tapping their seat.

  return (
    <>
      <section
        className={`poker-table ${crowded ? "crowded" : ""}`}
        aria-label={`Table, hand ${hand.no}`}
      >
        <button
          className="table-turn"
          type="button"
          aria-label="Move every seat one place clockwise"
          title="Move seats to match your table"
          onClick={turnSeats}
        >
          <TurnSeatsIcon />
        </button>
        <div className="table-rim" aria-hidden="true">
          <div className="table-felt">
            <span className="table-line" />
          </div>
        </div>
        <div className="table-center">
          <StreetPips stage={hand.stage} showdown={showdown} />
          <span className="table-label">{potCardLabel(game)}</span>
          <span
            className="table-pot"
            style={
              { "--chars": money(hand.pot).length } as React.CSSProperties
            }
          >
            {money(hand.pot)}
          </span>
          <PotBreakdown game={game} className="table-sidepots" />
          <span className="table-blinds">{blindsText}</span>
        </div>
        {showdown
          ? null
          : game.players.map((_, index) => {
              const chips = hand.committed[index];
              if (!(chips > 0)) return null;
              // Chips sit in front of the seat, clear of the pot: under the
              // name for seats along the top, over the avatar for the rest.
              const spot = place(index);
              const upper = spot.y < 40;
              // On a full table, chips over a side seat would touch the seat
              // above it, so they go beside the avatar, towards the pot.
              const beside = crowded && !upper && Math.abs(spot.x - 50) > 23;
              const dx = beside
                ? Math.sign(50 - spot.x) * 52
                : Math.round((50 - spot.x) * 0.5);
              // A seat is centred on its avatar and name together.
              const dy = beside ? -18 : (upper ? 1 : -1) * (crowded ? 54 : 62);
              return (
                <span
                  className="table-chips"
                  key={index}
                  style={{
                    left: `calc(${spot.x}% + ${dx}px)`,
                    top: `calc(${spot.y}% + ${dy}px)`,
                  }}
                >
                  <span className="chip-icon" aria-hidden="true" />
                  {money(chips)}
                </span>
              );
            })}
        {seats.map((index) => {
          const player = game.players[index];
          const spot = place(index);
          const folded = !hand.in[index];
          const isTurn = !showdown && current === index;
          const flash = showdown ? undefined : flashFor(game, lastTurn, index);
          const contender = showdown && !folded;
          const inSplit = hand.splitSel?.includes(index) ?? false;
          const status = isTurn ? "To act" : shortBlinds(seatStatus(game, index, money));
          const state = [
            folded ? "folded" : "",
            isTurn ? "turn" : "",
            contender ? (inSplit ? "in-split" : "contender") : "",
            flash ? "just-acted" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            // Seats only show the table (user decision 2026-10-27): the
            // winner is picked and buy-ins made on the cards under it.
            <div
              className={`table-seat ${state}`}
              key={player.id || index}
              role="group"
              aria-label={`${player.name}, ${money(player.stack)}, ${status}`}
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            >
              <span className="table-seat-ring">
                <Avatar
                  name={player.name}
                  playerId={player.id}
                  role={seatRole(game, index)}
                  size={crowded ? "small" : "large"}
                />
              </span>
              <span className="table-seat-pill" key={flash ?? "pill"}>
                {/* The whole chosen name, never cut: long names wrap and step down a size. */}
                <b data-length={nameLength(player.name)}>{player.name}</b>
                <span className="table-seat-stack">{money(player.stack)}</span>
                <small>{status}</small>
              </span>
            </div>
          );
        })}
      </section>

      {blindSchedule ? <div className="table-schedule">{blindSchedule}</div> : null}

      {splitting ? (
        <SplitView
          game={game}
          onToggle={onToggleSplit}
          onSplit={onSplitPot}
          onBack={onEndSplit}
        />
      ) : multiPot ? (
        <SidePotPicker key={hand.no} game={game} onAward={onAwardPots} />
      ) : showdown ? (
        <WinnerPicker
          game={game}
          onPickWinner={onPickWinner}
          onBeginSplit={onBeginSplit}
        />
      ) : current !== null && hand.in[current] ? (
        <PlayerRow
          key={`${hand.no}-${hand.stage}-${current}`}
          game={game}
          playerIndex={current}
          dock
          onAct={onAct}
        />
      ) : closer >= 0 ? (
        <PlayerRow
          key={`${hand.no}-${hand.stage}-${closer}-closed`}
          game={game}
          playerIndex={closer}
          dock
          roundClosed
          onAct={onAct}
        />
      ) : null}

      {/* Always there from the deal to the showdown, faded when it can't be
          used, so it never jumps into place or leaves a gap. */}
      <DealButton game={game} onDeal={onNextStage} />
      <BuyInOptions game={game} onBuyIn={onBuyIn} />
      <UndoTurnButton
        game={game}
        tall
        onUndo={onUndoAction}
        onUndoStreet={onUndoStreet}
      />
      <HandButtons
        game={game}
        onUndoHand={onUndoHand}
        onCancelHand={onCancelHand}
      />
    </>
  );
}

function nameLength(name: string): "long" | "longer" | undefined {
  if (name.length > 28) return "longer";
  if (name.length > 14) return "long";
  return undefined;
}
