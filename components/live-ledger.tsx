"use client";

import type { CSSProperties, ReactNode } from "react";

import { AvatarArt } from "@/components/avatar-art";
import { SeatAvatar } from "@/components/game-parts";
import { AverageStackLine } from "@/components/ledger/average-stack";
import { formatTimePlayed } from "@/components/ledger/time-played";
import type { LiveLedgerView } from "@/lib/poker/live-ledger";
import { formatChips, formatSignedChips, plainChipsCode } from "@/lib/poker/money";

/**
 * A quick ledger's live link: the table's totals, everyone's buy-ins and
 * cash-outs, and the latest changes. Nothing is ranked: there are no results
 * for players still at the table until the host counts the chips.
 */
export function LiveLedger({
  view,
  header,
  now,
  me,
  onToggleMe,
}: {
  view: LiveLedgerView;
  /** The page header, shared with the hand-by-hand link. */
  header: ReactNode;
  now: number;
  me: string | null;
  onToggleMe: (name: string) => void;
}) {
  // Chips with a value are counts, not money (lib/poker/settle-up.ts).
  const code = view.plainChips ? plainChipsCode(view.currency) : view.currency;
  const money = (value: number) => formatChips(value, view.chipUnit, code);
  const signed = (value: number) => formatSignedChips(value, view.chipUnit, code);
  const totals: [string, number][] = [
    ["Bought in", view.bought],
    ["Cashed out", view.cashedOut],
    ["On the table", view.onTable],
  ];
  // The three amounts shrink together to stay on one line, as on the host's
  // Table card.
  const chars = Math.max(...totals.map(([, amount]) => money(amount).length));

  return (
    <main className="ledger-shell live-shell">
      {header}

      <section className="glass card live-help" aria-label="How this page works">
        <span className="label">How this page works</span>
        <dl>
          <div>
            <dt>Tap your name</dt>
            <dd>Highlights your row</dd>
          </div>
          <div>
            <dt>Buy-ins and cash-outs</dt>
            <dd>Show a few seconds after the host notes them</dd>
          </div>
          <div>
            <dt>Results</dt>
            <dd>Come when the host counts the chips at the end</dd>
          </div>
        </dl>
      </section>

      <section className="glass card" aria-label="Table">
        <div className="card-row">
          <h2 className="card-title">Table</h2>
          {view.startedAt ? (
            <span className="card-note">
              {formatTimePlayed(now - view.startedAt)} played
            </span>
          ) : null}
        </div>
        <div
          className="bet-stats ledger-stats"
          style={{ "--chars": chars } as CSSProperties}
        >
          {totals.map(([label, amount]) => (
            <div className="bet-stat" key={label}>
              <span>{label}</span>
              <b>{money(amount)}</b>
            </div>
          ))}
        </div>
        <AverageStackLine
          onTable={view.onTable}
          seated={view.players.filter((player) => player.cashedOut === undefined).length}
          money={money}
        />
      </section>

      <section className="glass card" aria-label="Players">
        <h2 className="card-title">
          {view.players.length} {view.players.length === 1 ? "Player" : "Players"}
        </h2>
        <div className="rows">
          {view.players.map((player) => {
            const left = player.cashedOut !== undefined;
            return (
              <button
                key={player.name}
                type="button"
                className={`ledger-row live-ledger-row${me === player.name ? " me" : ""}${
                  left ? " left" : ""
                }`}
                aria-pressed={me === player.name}
                onClick={() => onToggleMe(player.name)}
              >
                <SeatAvatar
                  art={<AvatarArt id={player.avatar} seed={player.name} />}
                  size="small"
                />
                <span className="standing-name">
                  <b>{player.name}</b>
                  <small>
                    {left ? (
                      <>
                        Cashed out with {money(player.cashedOut!)} ·{" "}
                        {/* No gain or loss is green too: it isn't a loss
                            (user decision 2026-11-05, as in the app). */}
                        <span className={player.net! < 0 ? "neg" : "pos"}>
                          {signed(player.net!)}
                        </span>
                      </>
                    ) : (
                      `${player.buyIns} buy-in${player.buyIns === 1 ? "" : "s"} · ${money(
                        player.invested,
                      )}`
                    )}
                  </small>
                  {/* The host is the bank: what's still owed either way. */}
                  {player.owed ? (
                    <small className="neg">Owes the bank {money(player.owed)}</small>
                  ) : player.bankOwes ? (
                    <small className="neg">
                      The bank owes {money(player.bankOwes)}
                    </small>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {view.activity.length ? (
        <section className="glass card" aria-label="Latest changes">
          <span className="label">Latest changes</span>
          <div className="rows log">
            {view.activity.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
