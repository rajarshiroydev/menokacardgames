"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ExpandingList } from "@/components/ledger/expanding-list";
import { CurrencyContext } from "@/components/ledger/money";
import { HostPicker } from "@/components/ledger/ranks-view";
import { FRIEND_GAME_PREFIX } from "@/components/ledger/results-card";
import { SessionCard } from "@/components/ledger/session-card";
import { SettleUpSheet } from "@/components/ledger/settle-up-sheet";
import {
  type GroupGame,
  type GroupStandings,
  hostedGameName,
} from "@/lib/friends/group-standings";
import type { PokerSession } from "@/lib/poker/types";

/**
 * The Games screen: your own saved games, or the games you played in at a
 * friend's table (picked like Ranks).
 */
export function SessionsView({
  initialHost,
  groups,
  groupsError,
  onCopied,
  ...props
}: Parameters<typeof OwnSessionsView>[0] & {
  /** "mine", or the friend's account id whose games open first. */
  initialHost: string;
  /** Settle up's Copy list on a friend's game. */
  onCopied: () => void;
  /** Friends' groups, kept by the app so the picker shows at once. */
  groups: GroupStandings[];
  groupsError: string;
}) {
  const [selected, setSelected] = useState(initialHost);
  const group = groups.find((item) => item.hostAccountId === selected);

  return (
    <div className="stack-list">
      <HostPicker
        label="Whose games"
        groups={groups}
        selected={selected}
        onSelect={setSelected}
      />
      {groupsError ? <p className="muted small-note">{groupsError}</p> : null}
      {group ? (
        <GroupGamesView group={group} onCopied={onCopied} />
      ) : (
        <OwnSessionsView {...props} />
      )}
    </div>
  );
}

/**
 * The games you played in at one friend's table, newest first, on the same
 * cards as your own games: Share, Details and Settle up, but no Continue game
 * or price changes, which stay with the host (user decisions 2026-10-26).
 */
function GroupGamesView({
  group,
  onCopied,
}: {
  group: GroupStandings;
  onCopied: () => void;
}) {
  const [settlingId, setSettlingId] = useState<string | null>(null);
  // Older answers from the server may not have the games yet.
  const games = useMemo(
    () => (group.sharedGames ?? []).map((game) => groupGameSession(group, game)),
    [group],
  );
  const settling = games.find((item) => item.session.id === settlingId);

  return (
    <CurrencyContext.Provider value={group.currency}>
      {games.length ? (
        <ExpandingList
          items={games}
          render={({ session, youIndex }) => (
            <SessionCard
              key={session.id}
              session={session}
              youIndex={youIndex}
              onSettle={setSettlingId}
            />
          )}
          more={(count) => `Show ${count} more game${count === 1 ? "" : "s"}`}
          all="Show all games"
        />
      ) : (
        <section className="glass card">
          <p className="muted">No games with this host yet.</p>
        </section>
      )}
      {settling
        ? createPortal(
            <SettleUpSheet
              key={settling.session.id}
              session={settling.session}
              onCopied={onCopied}
              onClose={() => setSettlingId(null)}
            />,
            document.body,
          )
        : null}
    </CurrencyContext.Provider>
  );
}

/**
 * A friend's game as a saved game, for the shared card and Settle up. Its id
 * is made up here (the server sends none; see resultsCardPath) and its name
 * is "Asha's game": a number would reveal how many games the host has.
 */
export function groupGameSession(group: GroupStandings, game: GroupGame) {
  const session: PokerSession = {
    id: `${FRIEND_GAME_PREFIX}${group.hostAccountId}:${game.date}`,
    name: hostedGameName(group.hostName),
    date: game.date,
    ended: game.ended ?? game.date,
    ...(game.kind ? { kind: game.kind } : {}),
    ...(game.chipUnit ? { chipUnit: game.chipUnit } : {}),
    ante: game.ante ?? 0,
    ...(game.blindHistory ? { blindHistory: game.blindHistory } : {}),
    startStack: game.startStack,
    hands: game.hands,
    ...(game.rebuyRules ? { rebuyRules: game.rebuyRules } : {}),
    ...(game.bigBlindAnte ? { bigBlindAnte: true } : {}),
    ...(game.rakeRules ? { rakeRules: game.rakeRules } : {}),
    ...(game.rake ? { rake: game.rake } : {}),
    ...(game.chipValue ? { chipValue: game.chipValue } : {}),
    // Everything the card shows; the avatar and You tag are handled apart.
    results: game.results.map((result) => ({
      name: result.name,
      net: result.net,
      end: result.end,
      ...(result.buyIns ? { buyIns: result.buyIns } : {}),
      ...(result.handsPlayed !== undefined ? { handsPlayed: result.handsPlayed } : {}),
      ...(result.joinedHand !== undefined ? { joinedHand: result.joinedHand } : {}),
      ...(result.joinedAt !== undefined ? { joinedAt: result.joinedAt } : {}),
      ...(result.leftHand !== undefined ? { leftHand: result.leftHand } : {}),
      ...(result.leftAt !== undefined ? { leftAt: result.leftAt } : {}),
    })),
  };
  const you = game.results.findIndex((result) => result.isMe);
  return { session, youIndex: you >= 0 ? you : undefined };
}

function OwnSessionsView({
  history,
  discardedSessions,
  loading,
  error,
  onRetry,
  onDiscard,
  onContinue,
  onSettle,
  onRestore,
  onDeletePermanently,
  onExport,
  onImport,
}: {
  history: PokerSession[];
  discardedSessions: PokerSession[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onDiscard: (id: string) => void;
  onContinue: (id: string) => void;
  onSettle: (id: string) => void;
  onRestore: (id: string) => void;
  onDeletePermanently: (id: string) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const latestSessions = useMemo(
    () => [...history].sort((a, b) => b.date - a.date),
    [history],
  );
  const importInput = useRef<HTMLInputElement>(null);

  return (
    <div className="stack-list">
      {error ? (
        <section className="glass card">
          <p className="muted">{error}</p>
          <button className="glass-button full" type="button" onClick={onRetry}>
            Try again
          </button>
        </section>
      ) : loading ? (
        <section className="glass card">
          <p className="muted">Loading the shared ledger…</p>
        </section>
      ) : history.length ? (
        <ExpandingList
          items={latestSessions}
          render={(session) => (
            <SessionCard
              key={session.id}
              session={session}
              onDiscard={onDiscard}
              onContinue={onContinue}
              onSettle={onSettle}
              showLog
            />
          )}
          more={(count) => `Show ${count} more game${count === 1 ? "" : "s"}`}
          all="Show all games"
        />
      ) : (
        <section className="glass card">
          <p className="muted">
            No saved games yet. Finished games appear here, newest first.
          </p>
        </section>
      )}

      {!error && discardedSessions.length ? (
        <>
          <div className="section-heading">
            <h2>Discarded</h2>
            <span className="card-note">
              Not counted in the standings · {discardedSessions.length}
            </span>
          </div>
          {discardedSessions.map((session) => (
            <SessionCard
              discarded
              key={session.id}
              session={session}
              onRestore={onRestore}
              onDeletePermanently={onDeletePermanently}
              showLog
            />
          ))}
        </>
      ) : null}

      <section className="glass card">
        <div className="button-pair">
          <button className="glass-button raised" type="button" onClick={onExport}>
            Export backup
          </button>
          <button
            className="glass-button raised"
            type="button"
            onClick={() => importInput.current?.click()}
          >
            Import
          </button>
        </div>
        <input
          ref={importInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={onImport}
        />
        <p className="muted small-note">
          History is shared from Neon across every device. Export gives you an
          extra offline backup; importing never overwrites and only adds
          sessions that are not already in the ledger.
        </p>
      </section>
    </div>
  );
}
