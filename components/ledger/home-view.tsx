"use client";

import { useContext, useEffect, useState } from "react";

import { AvatarArt } from "@/components/avatar-art";
import { BrandMark } from "@/components/brand-mark";
import { toneClass } from "@/components/ledger/avatar";
import { groupGameSession } from "@/components/ledger/games-view";
import { CurrencyContext, GameAmounts, useMoney } from "@/components/ledger/money";
import { formatShortPercent } from "@/components/ledger/profile-view";
import { APP_NAME } from "@/lib/brand";
import type { GroupStandings } from "@/lib/friends/group-standings";
import type { FriendOverview } from "@/lib/friends/requests";
import { deriveSessionAccounting } from "@/lib/poker/accounting";
import { blindStatus, STAGES, totalBuyIns } from "@/lib/poker/game";
import type { GameBackupSummary } from "@/lib/poker/game-backup";
import { isLedgerGame, ledgerSeated, ledgerTotals } from "@/lib/poker/ledger";
import { formatSignedChips, formatSignedMoney } from "@/lib/poker/money";
import { sessionMoney } from "@/lib/poker/settle-up";
import { sessionReturn, standingsKey } from "@/lib/poker/standings";
import type { GameState, Player, PokerSession } from "@/lib/poker/types";

/** "Good evening": the greeting above your name on Home. */
function greeting(hour: number) {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "Sun 28 Sep": the date beside Last Session. */
function shortDay(timestamp: number) {
  const date = new Date(timestamp);
  const part = (options: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString("en-US", options);
  return `${part({ weekday: "short" })} ${date.getDate()} ${part({ month: "short" })}`;
}

export function HomeView({
  game,
  displayName,
  selfPlayerId,
  history,
  groups,
  friendRequests,
  legacyGame,
  legacySessionCount,
  gameBackups,
  restoringBackup,
  onRestoreBackup,
  onDeleteBackup,
  onAdoptLegacyGame,
  onGame,
  onNewGame,
  onSessions,
  onReviewRequests,
  onOpenHands,
  onOpenWhoWins,
  onReviewLegacySessions,
}: {
  game: GameState | null;
  displayName: string | null;
  selfPlayerId: string | null;
  history: PokerSession[];
  groups: GroupStandings[];
  friendRequests: FriendOverview["received"];
  legacyGame: GameState | null;
  legacySessionCount: number;
  gameBackups: GameBackupSummary[];
  restoringBackup: boolean;
  onRestoreBackup: (backup: GameBackupSummary) => void;
  onDeleteBackup: (backup: GameBackupSummary) => void;
  onAdoptLegacyGame: () => void;
  onGame: () => void;
  onNewGame: () => void;
  /** Opens Games, at a friend's table when `host` is their account id. */
  onSessions: (host?: string) => void;
  onReviewRequests: () => void;
  onOpenHands: () => void;
  onOpenWhoWins: () => void;
  onReviewLegacySessions: () => void;
}) {
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    // The server doesn't know the phone's clock, so the greeting waits for it.
    const timer = setTimeout(() => setHour(new Date().getHours()), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="home-view">
      <HomeFan />
      <div className="home-top">
        <div className="brand">
          <BrandMark className="brand-chip" />
          <span className="brand-name">{APP_NAME}</span>
        </div>
      </div>

      <div className="home-greeting">
        <span className="home-greeting-kicker">
          {game ? "Game in progress" : hour === null ? "\u00a0" : greeting(hour)}
        </span>
        <h1 className="literal-text">{displayName || APP_NAME}</h1>
      </div>

      <div className="home-stack">
        {!game && gameBackups[0] ? (
          <UnfinishedGameCard
            backup={gameBackups[0]}
            busy={restoringBackup}
            onRestore={() => onRestoreBackup(gameBackups[0])}
            onDelete={() => onDeleteBackup(gameBackups[0])}
          />
        ) : null}
        {game ? (
          <GameAmounts game={game}>
            <HomeLiveCard game={game} selfPlayerId={selfPlayerId} onOpen={onGame} />
          </GameAmounts>
        ) : (
          <button className="home-start-card" type="button" onClick={onNewGame}>
            <span className="home-start-watermark" aria-hidden="true">
              ♠
            </span>
            <span className="home-start-kicker">No game running</span>
            <span className="home-start-row">
              <span>
                <strong>Start a game</strong>
                <small>Hand by hand, or a quick ledger</small>
              </span>
              <span className="home-start-go" aria-hidden="true">
                ♦
              </span>
            </span>
          </button>
        )}

        {legacyGame || legacySessionCount ? (
          <section className="glass legacy-data-card" aria-labelledby="legacy-data-title">
            <div>
              <span className="eyebrow">Unassigned device data</span>
              <h2 id="legacy-data-title">Review Before Adding It</h2>
              <p>
                Data saved before accounts stays separate until you choose which
                account owns it.
              </p>
            </div>
            <div className="legacy-data-actions">
              {legacyGame ? (
                <button
                  className="ghost"
                  type="button"
                  disabled={Boolean(game)}
                  onClick={onAdoptLegacyGame}
                >
                  {game ? "Finish current game first" : "Review legacy game"}
                </button>
              ) : null}
              {legacySessionCount ? (
                <button
                  className="ghost"
                  type="button"
                  onClick={onReviewLegacySessions}
                >
                  Review {legacySessionCount} saved session
                  {legacySessionCount === 1 ? "" : "s"}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {friendRequests.length ? (
          <button
            className="glass home-notice"
            type="button"
            onClick={onReviewRequests}
          >
            <span className="home-notice-avatar" aria-hidden="true">
              <AvatarArt
                id={friendRequests[0].avatar}
                seed={friendRequests[0].displayName ?? "Someone"}
              />
            </span>
            <span className="home-notice-copy">
              <b className="literal-text">
                {friendRequests[0].displayName ?? "Someone"}
              </b>
              {friendRequests.length > 1
                ? ` and ${friendRequests.length - 1} other${friendRequests.length === 2 ? "" : "s"} want to be friends`
                : " wants to be friends"}
            </span>
            <span className="home-notice-action">Review</span>
          </button>
        ) : null}

        <HomeLastSession
          history={history}
          groups={groups}
          selfPlayerId={selfPlayerId}
          onOpen={onSessions}
        />

        <div className="home-links-list">
          <button className="glass home-link-row" type="button" onClick={onOpenHands}>
            <span className="home-mini-cards" aria-hidden="true">
              <span>A♠</span>
              <span className="red">K♥</span>
              <span className="red">Q♦</span>
            </span>
            <span className="home-link-copy">
              <b>Hand rankings</b>
              <small>Royal flush to high card</small>
            </span>
          </button>
          <button className="glass home-link-row" type="button" onClick={onOpenWhoWins}>
            <span className="home-mini-cards" aria-hidden="true">
              <span>?</span>
              <span className="red">A♥</span>
              <span>K♣</span>
            </span>
            <span className="home-link-copy">
              <b>Who wins?</b>
              <small>Enter the cards, see the winning hand and why</small>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

/** Design 6e: Home's background, a fanned hand of glass cards. */
const HOME_FAN = [
  { rank: "A", suit: "♠", tone: "g", turn: -38 },
  { rank: "K", suit: "♥", tone: "b", turn: -24 },
  { rank: "Q", suit: "♣", tone: "g", turn: -10 },
  { rank: "J", suit: "♦", tone: "b", turn: 4 },
  { rank: "10", suit: "♠", tone: "g", turn: 18 },
] as const;

function HomeFan() {
  return (
    <div className="home-fan" aria-hidden="true">
      <div className="home-fan-column">
        <span className="home-fan-glow" />
        {HOME_FAN.map((card) => (
          <span
            key={card.rank}
            className={`home-fan-card tone-${card.tone}`}
            style={{ transform: `rotate(${card.turn}deg)` }}
          >
            <span className="home-fan-corner">
              <span>{card.rank}</span>
              <span>{card.suit}</span>
            </span>
            <span className="home-fan-pip">{card.suit}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** How long ago, in words: "just now", "5 min ago", "3 hours ago", "2 days ago". */
function timeAgo(timestamp: number, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Home's offer to carry on a game backed up from this or another device. */
function UnfinishedGameCard({
  backup,
  busy,
  onRestore,
  onDelete,
}: {
  backup: GameBackupSummary;
  busy: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  // The time is read once the page is on the phone, which knows the clock.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <section
      className="glass legacy-data-card"
      aria-labelledby="unfinished-game-title"
    >
      <div>
        <span className="eyebrow">Unfinished game</span>
        <h2 id="unfinished-game-title" className="literal-text">
          {backup.name}
        </h2>
        <p>
          {backup.ledger
            ? "Quick ledger"
            : backup.handInProgress
              ? `Hand ${backup.handNo} in progress`
              : `${backup.handNo} hand${backup.handNo === 1 ? "" : "s"} played`}{" "}
          · {backup.players} players
          {now === null ? "" : ` · saved ${timeAgo(backup.updatedAt, now)}`}
          {backup.thisDevice ? "" : " on another device"}
        </p>
      </div>
      <div className="legacy-data-actions">
        <button className="primary" type="button" disabled={busy} onClick={onRestore}>
          {busy ? "Restoring…" : "Restore game"}
        </button>
        <button className="ghost danger-text" type="button" disabled={busy} onClick={onDelete}>
          Delete
        </button>
      </div>
    </section>
  );
}

/** Home's card while a game is on: the pot, blinds and stacks at a glance. */
function HomeLiveCard({
  game,
  selfPlayerId,
  onOpen,
}: {
  game: GameState;
  selfPlayerId: string | null;
  onOpen: () => void;
}) {
  const { money } = useMoney();
  if (isLedgerGame(game)) {
    return <HomeLedgerCard game={game} selfPlayerId={selfPlayerId} onOpen={onOpen} />;
  }
  const hand = game.hand;
  const blinds = blindStatus(game);
  const name = game.sessionLabel || game.gameName;
  const meta = [
    name,
    hand ? `Hand ${hand.no}` : "Between hands",
    hand ? STAGES[hand.stage] : null,
  ].filter(Boolean);
  const me = selfPlayerId
    ? game.players.find((player) => player.id === selfPlayerId)
    : undefined;
  const seated = game.players.filter((player) => !player.left);
  const leader = seated.reduce<Player | null>(
    (best, player) => (!best || player.stack > best.stack ? player : best),
    null,
  );

  return (
    <button className="glass home-live-card" type="button" onClick={onOpen}>
      <span className="home-live-glow" aria-hidden="true" />
      <span className="home-live-top">
        <span className="live-pill">
          <span aria-hidden="true" />
          Live
        </span>
        <span className="home-live-meta">{meta.join(" · ")}</span>
      </span>
      <span className="home-live-pot-row">
        <span>
          <span className="home-kicker">{hand ? "Pot" : "Hands dealt"}</span>
          <span className="home-live-pot">
            {hand ? money(hand.pot) : game.handNo}
          </span>
        </span>
        <span className="home-live-blinds">
          {money(blinds.smallBlind)} / {money(blinds.bigBlind)}
          {blinds.schedule ? <em> L{blinds.level + 1}</em> : null}
        </span>
      </span>
      <span className="home-live-stats">
        {me ? (
          <span>
            <small>Your stack</small>
            <b>{money(me.stack)}</b>
          </span>
        ) : (
          <span>
            <small>At the table</small>
            <b>
              {seated.length} player{seated.length === 1 ? "" : "s"}
            </b>
          </span>
        )}
        {leader ? (
          <span>
            <small>
              Chip leader · <span className="literal-text">{leader.name}</span>
            </small>
            <b>{money(leader.stack)}</b>
          </span>
        ) : null}
      </span>
      <span className="home-live-cta">Back to the table</span>
    </button>
  );
}

/** Home's card while a quick ledger is on: the chips bought and who's in. */
function HomeLedgerCard({
  game,
  selfPlayerId,
  onOpen,
}: {
  game: GameState;
  selfPlayerId: string | null;
  onOpen: () => void;
}) {
  const { money } = useMoney();
  const totals = ledgerTotals(game);
  const seated = ledgerSeated(game);
  const name = game.sessionLabel || game.gameName;
  const myIndex = selfPlayerId
    ? game.players.findIndex((player) => player.id === selfPlayerId)
    : -1;

  return (
    <button className="glass home-live-card" type="button" onClick={onOpen}>
      <span className="home-live-glow" aria-hidden="true" />
      <span className="home-live-top">
        <span className="live-pill">
          <span aria-hidden="true" />
          Live
        </span>
        <span className="home-live-meta">
          {[name, "Quick ledger"].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="home-live-pot-row">
        <span>
          <span className="home-kicker">Bought in</span>
          <span className="home-live-pot">{money(totals.bought)}</span>
        </span>
        <span className="home-live-blinds">
          {seated.length} at the table
        </span>
      </span>
      <span className="home-live-stats">
        {myIndex >= 0 ? (
          <span>
            <small>Your buy-ins</small>
            <b>{money(totalBuyIns(game, myIndex))}</b>
          </span>
        ) : (
          <span>
            <small>Players</small>
            <b>{game.players.length}</b>
          </span>
        )}
        <span>
          <small>Cashed out</small>
          <b>{money(totals.cashedOut)}</b>
        </span>
      </span>
      <span className="home-live-cta">Back to the game</span>
    </button>
  );
}

/**
 * Your most recent game on Home: the newest of your own saved games and the
 * games you played at a friend's table, so a game someone else hosted shows
 * too. A friend's game is in their currency and opens on their Games list.
 */
function HomeLastSession({
  history,
  groups,
  selfPlayerId,
  onOpen,
}: {
  history: PokerSession[];
  groups: GroupStandings[];
  selfPlayerId: string | null;
  onOpen: (host?: string) => void;
}) {
  const currency = useContext(CurrencyContext);
  const own = history
    .filter((item) => !item.discardedAt)
    .reduce<PokerSession | null>(
      (latest, item) =>
        !latest ||
        item.date > latest.date ||
        (item.date === latest.date &&
          (item.sessionNumber ?? 0) > (latest.sessionNumber ?? 0))
          ? item
          : latest,
      null,
    );
  let last: {
    session: PokerSession;
    youIndex?: number;
    currency: string;
    host?: string;
  } | null = own
    ? {
        session: own,
        youIndex: selfPlayerId
          ? own.results.findIndex((result) => result.playerId === selfPlayerId)
          : undefined,
        currency,
      }
    : null;
  for (const group of groups) {
    // Shared games come newest first.
    const game = group.sharedGames?.[0];
    if (!game || (last && game.date <= last.session.date)) continue;
    last = {
      ...groupGameSession(group, game),
      currency: group.currency,
      host: group.hostAccountId,
    };
  }
  if (!last || !last.session.results.length) return null;
  const { host } = last;
  return (
    <CurrencyContext.Provider value={last.currency}>
      <HomeLastSessionCard
        session={last.session}
        youIndex={last.youIndex}
        onOpen={() => onOpen(host)}
      />
    </CurrencyContext.Provider>
  );
}

/** Home's last game: your result, the top winner, everyone's net. */
function HomeLastSessionCard({
  session,
  youIndex,
  onOpen,
}: {
  session: PokerSession;
  /** Your row in `session.results`, if you played. */
  youIndex?: number;
  onOpen: () => void;
}) {
  const { currency } = useMoney();
  // Results in money at the game's chip value; chips if they don't balance.
  let moneyNets: Map<PokerSession["results"][number], number> | null = null;
  try {
    const inMoney = sessionMoney(session);
    moneyNets = new Map(
      session.results.map((result, index) => [
        result,
        inMoney.results[index].net,
      ]),
    );
  } catch {
    moneyNets = null;
  }
  const signedMoney = (result: PokerSession["results"][number]) =>
    moneyNets?.has(result)
      ? formatSignedMoney(moneyNets.get(result)! / 100, currency)
      : formatSignedChips(result.net, session.chipUnit, currency);

  let invested = new Map<string, number>();
  try {
    invested = new Map(
      deriveSessionAccounting(session).results.map((result) => [
        standingsKey(result),
        result.invested,
      ]),
    );
  } catch {
    // An unbalanced old session still shows its nets, just without a return.
  }
  const results = [...session.results].sort((a, b) => b.net - a.net);
  const mine =
    youIndex === undefined || youIndex < 0 ? undefined : session.results[youIndex];
  const winner = results[0];
  const featured = mine ?? winner;
  const featuredInvested = invested.get(standingsKey(featured));
  const featuredReturn =
    featuredInvested === undefined
      ? null
      : sessionReturn(featured.net, featuredInvested);
  const largest = Math.max(1, ...results.map((result) => Math.abs(result.net)));
  const title =
    session.name ||
    (session.sessionNumber ? `Game ${session.sessionNumber}` : "Game");
  const details = [
    title,
    session.kind === "ledger"
      ? "Quick ledger"
      : `${session.hands} hand${session.hands === 1 ? "" : "s"}`,
    `${results.length} player${results.length === 1 ? "" : "s"}`,
  ];

  return (
    <>
      <div className="home-section-heading">
        <h2>Last session</h2>
        <span>{shortDay(session.date)}</span>
      </div>
      <button className="glass home-last-card" type="button" onClick={onOpen}>
        <span className="home-last-top">
          <span className="home-last-main">
            <small className="literal-text">{details.join(" · ")}</small>
            <strong className={toneClass(featured.net)}>
              {signedMoney(featured)}
            </strong>
            <small>
              {mine ? "Your result" : (
                <>
                  Top winner · <span className="literal-text">{winner.name}</span>
                </>
              )}
              {featuredReturn === null
                ? ""
                : ` · ${formatShortPercent(featuredReturn)} return`}
            </small>
          </span>
          {mine && winner !== mine ? (
            <span className="home-last-winner">
              <small>Top winner</small>
              <b className="literal-text">{winner.name}</b>
              <em className={toneClass(winner.net)}>{signedMoney(winner)}</em>
            </span>
          ) : null}
        </span>
        <span className="home-last-bars">
          {results.map((result) => {
            const share = Math.round((Math.abs(result.net) / largest) * 100);
            const isMe = result === mine;
            return (
              <span
                className={`home-last-bar${isMe ? " me" : ""}`}
                key={standingsKey(result)}
              >
                <span className={isMe ? "" : "literal-text"}>
                  {isMe ? "You" : result.name}
                </span>
                <span className="home-bar-track" aria-hidden="true">
                  <span>
                    {result.net < 0 ? (
                      <i className="neg" style={{ width: `${share}%` }} />
                    ) : null}
                  </span>
                  <span>
                    {result.net > 0 ? (
                      <i className="pos" style={{ width: `${share}%` }} />
                    ) : null}
                  </span>
                </span>
                <b className={toneClass(result.net)}>{signedMoney(result)}</b>
              </span>
            );
          })}
        </span>
      </button>
    </>
  );
}
