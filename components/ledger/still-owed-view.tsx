"use client";

import { useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { groupGameSession } from "@/components/ledger/games-view";
import { CurrencyContext, formatCents } from "@/components/ledger/money";
import { SettleUpSheet } from "@/components/ledger/settle-up-sheet";
import type { GroupStandings } from "@/lib/friends/group-standings";
import { formatDate } from "@/lib/poker/game";
import { paymentLines, type SettlementPayment } from "@/lib/poker/payments";
import type { PokerSession } from "@/lib/poker/types";

/*
 * Still owed: the payments nobody has ticked yet, on a page of its own opened
 * from Profile (user request 2026-11-06; before, a card at the top of Games).
 */

/** One payment still owed, for the Still owed page. */
type OwedItem = {
  key: string;
  from: string;
  to: string;
  fromKey: string;
  toKey: string;
  cents: number;
  currency: string;
  session: PokerSession;
  /** A friend's game: its host, to open its Settle up. */
  hostAccountId?: string;
};

/**
 * Payments nobody has ticked yet (user decision 2026-11-05): every one in
 * your own games, and those to or from you in friends' games. Newest game
 * first.
 */
export function owedItems(
  history: PokerSession[],
  groups: GroupStandings[],
  currency: string,
): OwedItem[] {
  const items: OwedItem[] = [];
  for (const session of history) {
    if (session.discardedAt) continue;
    for (const { transfer, paid } of paymentLines(session)) {
      if (paid) continue;
      items.push({
        key: `mine:${session.id}:${transfer.fromKey}>${transfer.toKey}`,
        from: transfer.from,
        to: transfer.to,
        fromKey: transfer.fromKey,
        toKey: transfer.toKey,
        cents: transfer.cents,
        currency,
        session,
      });
    }
  }
  for (const group of groups) {
    for (const game of group.sharedGames ?? []) {
      const { session, youIndex } = groupGameSession(group, game);
      if (youIndex === undefined) continue;
      const you = String(youIndex);
      for (const { transfer, paid } of paymentLines(session)) {
        if (paid || (transfer.fromKey !== you && transfer.toKey !== you)) continue;
        items.push({
          key: `${group.hostAccountId}:${game.date}:${transfer.fromKey}>${transfer.toKey}`,
          from: transfer.from,
          to: transfer.to,
          fromKey: transfer.fromKey,
          toKey: transfer.toKey,
          cents: transfer.cents,
          currency: group.currency,
          session,
          hostAccountId: group.hostAccountId,
        });
      }
    }
  }
  return items.sort((a, b) => b.session.date - a.session.date);
}

/** How many Still owed lines show before "Show all". */
const OWED_SHOWN = 5;

/** What the server is sent to tick a Still owed line. */
function owedRequest(item: OwedItem) {
  return {
    ...(item.hostAccountId
      ? { hostAccountId: item.hostAccountId, date: item.session.date }
      : { sessionId: item.session.id }),
    from: item.fromKey,
    to: item.toKey,
    cents: item.cents,
    paid: true,
  };
}

/** The games Still owed lists, newest first, each once. */
function owedGames(items: OwedItem[]) {
  const games = new Map<string, OwedItem>();
  for (const item of items) {
    const key = `${item.hostAccountId ?? "mine"}:${item.session.id}`;
    if (!games.has(key)) games.set(key, item);
  }
  return [...games.entries()].map(([key, item]) => ({ key, item }));
}

/**
 * Mark all paid (user decision 2026-11-05): ticks every Still owed payment
 * in games played on or before the one picked, so payments settled long ago
 * stop showing. The newest game is picked at first, which marks them all.
 */
function MarkAllSheet({
  items,
  onMark,
  onClose,
}: {
  items: OwedItem[];
  onMark: (requests: object[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const games = useMemo(() => owedGames(items), [items]);
  const [upTo, setUpTo] = useState(games[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const cutoff = games.find((game) => game.key === upTo)?.item.session.date ?? 0;
  const chosen = items.filter((item) => item.session.date <= cutoff);
  const gameCount = owedGames(chosen).length;

  return (
    <div
      className="modal show"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-all-title"
      >
        <h2 id="mark-all-title">Mark All Paid</h2>
        <p className="muted rule-note">
          For payments that were settled outside the app. Each is marked as
          paid by you, and can be unticked in its game&apos;s Settle up.
        </p>
        <label className="label" htmlFor="mark-all-up-to">
          Games played on or before
        </label>
        <select
          className="select-control"
          id="mark-all-up-to"
          value={upTo}
          disabled={busy}
          onChange={(event) => setUpTo(event.target.value)}
        >
          {games.map(({ key, item }, index) => (
            <option key={key} value={key}>
              {item.session.name} · {formatDate(item.session.date)}
              {index === 0 ? " (all)" : ""}
            </option>
          ))}
        </select>
        <p className="muted small-note">
          {chosen.length} payment{chosen.length === 1 ? "" : "s"} in {gameCount} game
          {gameCount === 1 ? "" : "s"}
        </p>
        <button
          className="primary full"
          type="button"
          disabled={busy || !chosen.length}
          onClick={async () => {
            setBusy(true);
            const done = await onMark(chosen.map(owedRequest));
            setBusy(false);
            if (done) onClose();
          }}
        >
          {busy
            ? "Marking…"
            : `Mark ${chosen.length} as paid`}
        </button>
        <button className="ghost full" type="button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function StillOwedCard({
  items,
  onOpen,
  onMarkAll,
}: {
  items: OwedItem[];
  onOpen: (item: OwedItem) => void;
  onMarkAll: (requests: object[]) => Promise<boolean>;
}) {
  const [all, setAll] = useState(false);
  const [marking, setMarking] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, OWED_SHOWN);
  return (
    <section className="glass card still-owed" aria-label="Still owed">
      {/* The screen's title already says Still Owed, so only the count. */}
      <span className="label">
        {items.length} payment{items.length === 1 ? "" : "s"} not ticked as paid
      </span>
      <div className="rows">
        {shown.map((item) => (
          <button
            key={item.key}
            className="result-row still-owed-row"
            type="button"
            onClick={() => onOpen(item)}
          >
            <span className="result-name">
              {item.from} <span className="muted">pays</span> {item.to}
              <small>
                {item.session.name} · {formatDate(item.session.date)}
              </small>
            </span>
            <span className="result-amount">
              {formatCents(item.cents, item.currency)}
            </span>
          </button>
        ))}
      </div>
      <div className="still-owed-foot">
        {items.length > OWED_SHOWN ? (
          <button className="text-button" type="button" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show all ${items.length}`}
          </button>
        ) : (
          <span />
        )}
        <button
          className="pill-button"
          type="button"
          onClick={() => setMarking(true)}
        >
          Mark all paid
        </button>
      </div>
      {marking
        ? createPortal(
            <MarkAllSheet
              items={items}
              onMark={onMarkAll}
              onClose={() => setMarking(false)}
            />,
            document.body,
          )
        : null}
    </section>
  );
}

/**
 * The Still owed page. A line opens its game's Settle up: your own through
 * the app's sheet, a friend's game here.
 */
export function StillOwedView({
  history,
  groups,
  loading,
  onSettle,
  onMarkAll,
  onGroupPayments,
  onStale,
  onError,
  onCopied,
}: {
  history: PokerSession[];
  groups: GroupStandings[];
  /** Your games are still loading, so an empty list isn't final yet. */
  loading: boolean;
  /** Opens Settle up for one of your own games. */
  onSettle: (sessionId: string) => void;
  /** Mark all paid: ticks these payments, then the lists reload. */
  onMarkAll: (requests: object[]) => Promise<boolean>;
  /** A friend's game's ticks changed (found by host and start time). */
  onGroupPayments: (
    hostAccountId: string,
    date: number,
    payments: SettlementPayment[],
  ) => void;
  /** A friend's game changed since it was loaded: reload friends' games. */
  onStale: () => void;
  onError: (message: string) => void;
  onCopied: () => void;
}) {
  const currency = useContext(CurrencyContext);
  const owed = useMemo(
    () => owedItems(history, groups, currency),
    [history, groups, currency],
  );
  // A friend's game opened from Still owed.
  const [friendSettle, setFriendSettle] = useState<{
    hostAccountId: string;
    date: number;
  } | null>(null);
  const friendGroup = friendSettle
    ? groups.find((item) => item.hostAccountId === friendSettle.hostAccountId)
    : undefined;
  const friendGame = friendGroup?.sharedGames.find(
    (game) => game.date === friendSettle?.date,
  );

  return (
    <div className="stack-list">
      {owed.length ? (
        <StillOwedCard
          items={owed}
          onMarkAll={onMarkAll}
          onOpen={(item) =>
            item.hostAccountId
              ? setFriendSettle({
                  hostAccountId: item.hostAccountId,
                  date: item.session.date,
                })
              : onSettle(item.session.id)
          }
        />
      ) : (
        <section className="glass card">
          <p className="muted">
            {loading ? "Loading your games…" : "Nothing is owed. Every payment is ticked as paid."}
          </p>
        </section>
      )}
      {friendGroup && friendGame
        ? createPortal(
            <CurrencyContext.Provider value={friendGroup.currency}>
              <SettleUpSheet
                session={groupGameSession(friendGroup, friendGame).session}
                paymentTarget={{
                  hostAccountId: friendGroup.hostAccountId,
                  date: friendGame.date,
                }}
                onPayments={(payments) =>
                  onGroupPayments(friendGroup.hostAccountId, friendGame.date, payments)
                }
                onStale={onStale}
                onError={onError}
                onCopied={onCopied}
                onClose={() => setFriendSettle(null)}
              />
            </CurrencyContext.Provider>,
            document.body,
          )
        : null}
    </div>
  );
}
