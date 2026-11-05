"use client";

import { type CSSProperties, useState } from "react";

import { Avatar } from "@/components/ledger/avatar";
import { TurnSeatsIcon } from "@/components/ledger/icons";
import { useMoney } from "@/components/ledger/money";
import { nameLength, seatPosition } from "@/components/ledger/table-hand";
import { totalBuyIns } from "@/lib/poker/game";
import { ledgerSeated, ledgerTotals } from "@/lib/poker/ledger";
import { readTableTurn, storeTableTurn } from "@/lib/poker/storage";
import type { GameState } from "@/lib/poker/types";

/**
 * A quick ledger drawn as the same oval as the hand-by-hand Table view: the
 * chips on the table in the middle, and everyone still seated around it with
 * what they have bought in altogether. Like the hand-by-hand table, the seats only show
 * the table (user decision 2026-11-05): buy-ins are made on the Players card under it.
 */
export function LedgerTable({ game }: { game: GameState }) {
  const { money } = useMoney();
  // Shared with the hand-by-hand table: turned per game, on this device.
  const [turn, setTurn] = useState(() => readTableTurn(game.startedAt));
  const totals = ledgerTotals(game);
  // Players who cashed out have left the table, so they get no seat.
  const seats = ledgerSeated(game);
  const count = seats.length;
  const crowded = count > 6;

  function turnSeats() {
    if (!count) return;
    const next = (turn + 1) % count;
    setTurn(next);
    storeTableTurn(game.startedAt, next);
  }

  const summary = totals.cashedOut
    ? `Bought ${money(totals.bought)} · Out ${money(totals.cashedOut)}`
    : `Bought ${money(totals.bought)}`;

  return (
    <section
      className={`poker-table ledger-table ${crowded ? "crowded" : ""}`}
      aria-label="Table"
    >
      {count > 1 ? (
        <button
          className="table-turn"
          type="button"
          aria-label="Move every seat one place clockwise"
          title="Move seats to match your table"
          onClick={turnSeats}
        >
          <TurnSeatsIcon />
        </button>
      ) : null}
      <div className="table-rim" aria-hidden="true">
        <div className="table-felt">
          <span className="table-line" />
        </div>
      </div>
      <div className="table-center">
        <span className="table-label">On the table</span>
        <span
          className="table-pot"
          style={{ "--chars": money(totals.onTable).length } as CSSProperties}
        >
          {money(totals.onTable)}
        </span>
        <span className="table-blinds">{summary}</span>
      </div>
      {seats.map((index, place) => {
        const player = game.players[index];
        const spot = seatPosition((place + turn) % count, count);
        const bought = money(totalBuyIns(game, index));
        return (
          <div
            className="table-seat"
            key={player.id || index}
            role="group"
            aria-label={`${player.name}, bought ${bought}`}
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
          >
            <span className="table-seat-ring">
              <Avatar
                name={player.name}
                playerId={player.id}
                size={crowded ? "small" : "large"}
              />
            </span>
            <span className="table-seat-pill">
              <b data-length={nameLength(player.name)}>{player.name}</b>
              {/* How many buy-ins is on the Players card below. */}
              <span className="table-seat-stack">{bought}</span>
            </span>
          </div>
        );
      })}
    </section>
  );
}

