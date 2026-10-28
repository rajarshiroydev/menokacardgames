"use client";

import { useEffect, useState } from "react";

import { smallBlindFor, STAGES } from "@/lib/poker/game";
import { describeRebuyRules } from "@/lib/poker/buy-ins";
import {
  formatChips,
  formatSignedChips,
  plainChipsCode,
} from "@/lib/poker/money";
import {
  LIVE_VIEW_POLL_MS,
  LIVE_VIEW_REQUEST_TIMEOUT_MS,
  LIVE_VIEW_STALE_MS,
  type LiveHandResult,
  type LiveNextBlinds,
  type LiveStanding,
  type LiveView,
} from "@/lib/poker/live-view";
import { AvatarArt } from "@/components/avatar-art";
import {
  BlindsPill,
  BlindTimer,
  blindsLine,
  nextBlindsText,
  PotCard,
  SeatAvatar,
  shortBlinds,
  WinnerSummary,
} from "@/components/game-parts";
import { ThemeToggle } from "@/components/theme-toggle";

type LiveResponse = LiveView & { updatedAt: number };

type LoadState =
  | { kind: "loading" }
  | { kind: "ended" }
  | { kind: "live"; view: LiveResponse; failed: boolean };

// Keeps the pre-Pokerize prefix so a viewer's saved "this is me" survives the rename.
function meKey(token: string) {
  return `menoka-live-me.${token.slice(0, 12)}`;
}

function ago(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}

/** Statuses of players no longer playing this hand; their rows fade. */
const OUT_OF_HAND = new Set(["Folded", "Busted", "Next hand", "Cashed out"]);

/** "Arjun S. won ₹150", "Bikram and Chirag split ₹400", or per pot. */
function lastHandLine(result: LiveHandResult, money: (value: number) => string) {
  const who = (names: string[]) =>
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
      : names[0];
  const won = (names: string[], amount: number) =>
    `${who(names)} ${names.length > 1 ? "split" : "won"} ${money(amount)}`;
  return result.pots && result.pots.length > 1
    ? result.pots.map((pot) => `${pot.label}: ${won(pot.names, pot.amount)}`).join(" · ")
    : won(result.names, result.pot);
}

/** A stack in big blinds: whole numbers, one decimal under 10. */
function bigBlinds(stack: number, bigBlind: number) {
  const count = stack / bigBlind;
  return count < 10
    ? (Math.floor(count * 10) / 10).toLocaleString("en-IN")
    : Math.floor(count).toLocaleString("en-IN");
}

/** "45 min" or "2 h 05 min" since the game began. */
function played(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** The next level's countdown in the app's words, ticking for a timed level. */
function nextBlindsNote(
  next: LiveNextBlinds,
  now: number,
  money: (value: number) => string,
) {
  const msLeft =
    next.pausedMsLeft ?? (next.endsAt === undefined ? undefined : next.endsAt - now);
  return nextBlindsText(
    {
      smallBlind: next.smallBlind,
      bigBlind: next.bigBlind,
      dueNow: next.dueNow || (msLeft !== undefined && msLeft <= 0),
      ...(next.handsLeft === undefined ? {} : { handsLeft: next.handsLeft }),
      ...(msLeft === undefined ? {} : { msLeft }),
    },
    money,
  );
}

/** "Big blind in 3 hands", for the line under your name. */
function bigBlindWhen(deals: number) {
  if (deals === 0) return "Big blind this hand";
  if (deals === 1) return "Big blind next hand";
  return `Big blind in ${deals} hands`;
}

/** What the host's limits still allow you, or null without limits. */
function rebuysNote(row: LiveStanding) {
  if (row.rebuysClosed) return "Rebuys closed";
  if (row.rebuysLeft === undefined) return null;
  if (row.rebuysLeft === 0) return "No rebuys left";
  return `${row.rebuysLeft} rebuy${row.rebuysLeft === 1 ? "" : "s"} left`;
}

/**
 * Your net after each recent hand: a line over a soft fill, scaled to your
 * own highs and lows so small swings show, with the zero line dashed when
 * it falls in that range, and a dot on where you are now.
 */
function NetChart({ nets, hands }: { nets: (number | null)[]; hands: number[] }) {
  const points = nets
    .map((net, index) => (net === null ? null : { net, hand: hands[index] }))
    .filter((point): point is { net: number; hand: number } => point !== null);
  if (points.length < 2) {
    return (
      <p className="muted small-note">
        Your chart starts once two hands are finished.
      </p>
    );
  }
  const values = points.map((point) => point.net);
  const high = Math.max(...values);
  const low = Math.min(...values);
  // A flat run still draws in the middle rather than on an edge.
  const span = high - low || Math.max(1, Math.abs(high));
  const top = high - low ? high : high + span / 2;
  const width = 320;
  const height = 72;
  const x = (index: number) => (index / (points.length - 1)) * width;
  const y = (value: number) => 6 + ((top - value) / span) * (height - 12);
  const line = points
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.net).toFixed(1)}`,
    )
    .join(" ");
  const showsZero = low <= 0 && high >= 0;
  const zero = y(0);
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = points.at(-1)!;
  const tone = last.net >= 0 ? "pos" : "neg";
  return (
    <figure className={`live-chart ${tone}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <path className="live-chart-area" d={area} />
        {showsZero ? (
          <line className="live-chart-zero" x1="0" x2={width} y1={zero} y2={zero} />
        ) : null}
        <path className="live-chart-line" d={line} />
      </svg>
      {/* The dot sits outside the stretched drawing so it stays round; the
          drawing is drawn at its own height, so its units are pixels. */}
      <span
        className="live-chart-dot"
        style={{ top: `${y(last.net)}px` }}
        aria-hidden="true"
      />
      <figcaption>
        <span>
          Hands {points[0].hand}–{last.hand}
        </span>
        <span>Net after each hand</span>
      </figcaption>
    </figure>
  );
}

export function LiveStandings({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [me, setMe] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Read after the first paint; the server render has no storage.
    const timer = setTimeout(() => {
      try {
        setMe(window.localStorage.getItem(meKey(token)));
      } catch {
        // Blocked storage: highlighting just isn't remembered.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [token]);

  // A once-a-second tick decides when to check, rather than each check
  // booking the next one: on phones a request can hang after sleep or a
  // network switch, and a chain of checks would then stop for good.
  useEffect(() => {
    let stopped = false;
    let ended = false;
    let inFlight: { controller: AbortController; startedAt: number } | null = null;
    let lastDone = 0;

    async function load() {
      const controller = new AbortController();
      const request = { controller, startedAt: Date.now() };
      inFlight = request;
      const timeout = setTimeout(() => controller.abort(), LIVE_VIEW_REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`/api/live/${encodeURIComponent(token)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 404) {
          ended = true;
          if (!stopped) setState({ kind: "ended" });
          return;
        }
        if (!response.ok) throw new Error(String(response.status));
        const view = (await response.json()) as LiveResponse;
        if (!stopped && inFlight === request) {
          setState({ kind: "live", view, failed: false });
        }
      } catch {
        if (!stopped && inFlight === request) {
          setState((current) =>
            current.kind === "live" ? { ...current, failed: true } : current,
          );
        }
      } finally {
        clearTimeout(timeout);
        if (inFlight === request) {
          inFlight = null;
          lastDone = Date.now();
        }
      }
    }

    function tick() {
      setNow(Date.now());
      // Hidden pages don't check; coming back checks at once (see onReturn).
      if (stopped || ended || inFlight || document.visibilityState !== "visible") {
        return;
      }
      if (Date.now() - lastDone >= LIVE_VIEW_POLL_MS) void load();
    }

    /** The page is on screen again: drop a request left over from before. */
    function onReturn() {
      if (stopped || ended || document.visibilityState !== "visible") return;
      // Several of these events arrive together; keep a check just started.
      if (inFlight && Date.now() - inFlight.startedAt < 1000) return;
      inFlight?.controller.abort();
      inFlight = null;
      void load();
    }

    void load();
    const clock = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", onReturn);
    // Some in-app browsers and back/forward restores skip visibilitychange.
    window.addEventListener("pageshow", onReturn);
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    return () => {
      stopped = true;
      clearInterval(clock);
      inFlight?.controller.abort();
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("pageshow", onReturn);
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("online", onReturn);
    };
  }, [token]);

  function toggleMe(name: string) {
    const next = me === name ? null : name;
    setMe(next);
    try {
      if (next) window.localStorage.setItem(meKey(token), next);
      else window.localStorage.removeItem(meKey(token));
    } catch {
      // Blocked storage: the highlight lasts for this visit only.
    }
  }

  if (state.kind === "loading") {
    return (
      <main className="ledger-shell live-shell">
        <ThemeToggle className="page-theme-toggle" />
        <p className="muted live-status">Loading live standings…</p>
      </main>
    );
  }

  if (state.kind === "ended") {
    return (
      <main className="ledger-shell live-shell">
        <ThemeToggle className="page-theme-toggle" />
        <section className="glass card live-ended">
          <span className="eyebrow">Live standings</span>
          <h1 className="card-title">This game has ended</h1>
          <p className="muted">
            The host saved or closed the game, or stopped sharing. Ask the host
            for the final results.
          </p>
        </section>
      </main>
    );
  }

  const { view, failed } = state;
  const age = now - view.updatedAt;
  const stale = failed || age > LIVE_VIEW_STALE_MS;
  // Chips with a value are counts, not money (lib/poker/settle-up.ts).
  const code = view.plainChips ? plainChipsCode(view.currency) : view.currency;
  const rebuyNote = describeRebuyRules(view.rebuyRules, code, view.chipUnit);
  const money = (value: number) => formatChips(value, view.chipUnit, code);
  const smallBlind = view.smallBlind ?? smallBlindFor(view.bigBlind);
  const blindsText = blindsLine(
    {
      smallBlind,
      bigBlind: view.bigBlind,
      ante: view.bigBlindAnte,
      level: view.blindLevel,
    },
    money,
  );
  const timer = view.nextBlinds ? (
    <BlindTimer
      text={nextBlindsNote(view.nextBlinds, now, money)}
      due={view.nextBlinds.dueNow}
      paused={view.nextBlinds.pausedMsLeft !== undefined}
    />
  ) : null;
  const toAct =
    view.hand && view.hand.toAct !== null
      ? view.standings.find((row) => row.seat === view.hand!.toAct)
      : undefined;
  // Who acts after the player to act: the next seat round the table that
  // can still bet (not folded, out or all in).
  const canAct = (row: LiveStanding) =>
    !row.left && !!row.status && !OUT_OF_HAND.has(row.status.label) &&
    row.status.label !== "All in";
  const next = (() => {
    if (!toAct || toAct.seat === undefined || view.hand?.showdown) return undefined;
    const bySeat = [...view.standings]
      .filter((row) => row.seat !== undefined)
      .sort((a, b) => a.seat! - b.seat!);
    const from = bySeat.indexOf(toAct);
    for (let step = 1; step < bySeat.length; step += 1) {
      const row = bySeat[(from + step) % bySeat.length];
      if (canAct(row)) return row;
    }
    return undefined;
  })();
  // A row's status chip during a hand: whose turn it is, who's next, or what
  // they did.
  const chip = (row: LiveStanding): { text: string; tone: string } | null => {
    if (!view.hand || !row.status || row.left) return null;
    if (row === toAct) return { text: "To act", tone: "turn" };
    if (row === next) return { text: "Next", tone: "next" };
    const { label, amount } = row.status;
    return {
      text: amount === undefined ? label : `${shortBlinds(label)} ${money(amount)}`,
      tone: OUT_OF_HAND.has(label) ? "out" : "",
    };
  };
  const handsPlayed = view.handInProgress ? view.handNo - 1 : view.handNo;
  // The player who tapped their name, and what only they'd want to know.
  const mine = me ? view.standings.find((row) => row.name === me) : undefined;
  const mineRebuys = mine ? rebuysNote(mine) : null;
  const mineFacts = [
    ...(mine?.bigBlindIn !== undefined ? [bigBlindWhen(mine.bigBlindIn)] : []),
    ...(mineRebuys ? [mineRebuys] : []),
  ];
  const stats: [string, string][] = [
    ...(view.startedAt
      ? ([["Time played", played(now - view.startedAt)]] as [string, string][])
      : []),
    ["Hands played", String(Math.max(0, handsPlayed))],
    ...(view.averageStack !== undefined
      ? ([["Average stack", money(view.averageStack)]] as [string, string][])
      : []),
    ...(view.chipsInPlay !== undefined
      ? ([["Chips in play", money(view.chipsInPlay)]] as [string, string][])
      : []),
    ...(view.biggestPot
      ? ([
          [
            "Biggest pot",
            `${money(view.biggestPot.amount)} · hand ${view.biggestPot.no}`,
          ],
        ] as [string, string][])
      : []),
  ];

  return (
    <main className="ledger-shell live-shell">
      <header className="screen-header">
        <div className="screen-heading">
          <h1 style={{ ["--chars" as string]: Math.max(8, view.gameName.length) }}>
            {view.gameName}
          </h1>
          {/* Whether the page is live, right under the game's name. */}
          <p className={`live-updated${stale ? " stale" : ""}`} role="status">
            <span className="live-dot" aria-hidden="true" />
            <span>
              Live standings ·{" "}
              {failed
                ? `This phone can't reach the app. Last update ${ago(age)}`
                : stale
                  ? `Last update ${ago(age)}. The host's phone may be offline or asleep`
                  : `Updated ${ago(age)}`}
            </span>
          </p>
        </div>
        <ThemeToggle />
      </header>

      <section className="glass card live-help" aria-label="How this page works">
        <span className="label">How this page works</span>
        <dl>
          <div>
            <dt>Tap your name</dt>
            <dd>
              Highlights your row and shows your game: your next big blind,
              rebuys left and net hand by hand
            </dd>
          </div>
          <div>
            <dt>Stacks</dt>
            <dd>Change with every bet</dd>
          </div>
          <div>
            <dt>Net and rank</dt>
            <dd>Change when a hand ends</dd>
          </div>
        </dl>
      </section>

      {view.hand ? (
        <PotCard
          stage={view.hand.stage}
          showdown={view.hand.showdown}
          label={view.hand.showdown ? "Showdown" : `Pot · ${STAGES[view.hand.stage]}`}
          pot={money(view.hand.pot)}
          blinds={blindsText}
          timer={timer}
        />
      ) : (
        <section className="glass card live-between">
          <span className="label">
            {view.handNo > 0 ? `After hand ${view.handNo}` : "Before the first hand"}
          </span>
          <BlindsPill
            smallBlind={money(smallBlind)}
            bigBlind={money(view.bigBlind)}
            level={view.blindLevel}
          >
            {view.bigBlindAnte ? (
              <span className="muted small-note">
                Big blind ante {money(view.bigBlind)}
              </span>
            ) : null}
            {timer}
          </BlindsPill>
        </section>
      )}

      {/* The last hand in full between hands; once the next is dealt it
          shrinks to one line so the hand being played leads. */}
      {view.lastHand && view.hand ? (
        <section className="glass card live-last" aria-label="Last hand">
          <span className="label">Last hand {view.lastHand.no}</span>
          <span>{lastHandLine(view.lastHand, money)}</span>
        </section>
      ) : view.lastHand ? (
        <section className="winner-card inline" aria-label="Last hand">
          <WinnerSummary
            handNo={view.lastHand.no}
            names={view.lastHand.names}
            split={view.lastHand.split}
            pot={money(view.lastHand.pot)}
            pots={view.lastHand.pots?.map((pot) => ({
              label: pot.label,
              names: pot.names,
              amount: money(pot.amount),
            }))}
          />
        </section>
      ) : null}

      <section className="glass card" aria-label="Standings">
        <h2 className="card-title">Session Standings</h2>
        {rebuyNote ? <p className="muted small-note">{rebuyNote}</p> : null}
        {view.rake ? (
          <p className="muted small-note">
            House has taken {money(view.rake)} rake
          </p>
        ) : null}
        <div className="rows">
          {view.standings.map((row) => {
            const status = chip(row);
            const out = status?.tone === "out" || row.left;
            return (
              <button
                key={row.name}
                type="button"
                className={`live-player${me === row.name ? " me" : ""}${
                  out ? " out" : ""
                }`}
                aria-pressed={me === row.name}
                onClick={() => toggleMe(row.name)}
              >
                <span className="live-player-rank">
                  {row.rank}
                  {row.move ? (
                    <small className={row.move > 0 ? "pos" : "neg"}>
                      {row.move > 0 ? "▲" : "▼"}
                      {Math.abs(row.move)}
                    </small>
                  ) : null}
                </span>
                <span className="live-player-body">
                  <span className="live-player-head">
                    <SeatAvatar
                      art={<AvatarArt id={row.avatar} seed={row.name} />}
                      role={view.hand ? row.role : undefined}
                      size="small"
                    />
                    <b>{row.name}</b>
                    {status ? (
                      <span className={`status-pill ${status.tone}`}>
                        {status.text}
                      </span>
                    ) : row.left ? (
                      <span className="status-pill out">Cashed out</span>
                    ) : null}
                  </span>
                  <span className="bet-stats live-player-stats">
                    <span className="bet-stat stack">
                      <span>Stack</span>
                      <b>{money(row.stack)}</b>
                    </span>
                    <span className="bet-stat">
                      <span>Net</span>
                      <b className={row.net > 0 ? "pos" : row.net < 0 ? "neg" : undefined}>
                        {formatSignedChips(row.net, view.chipUnit, code)}
                      </b>
                    </span>
                    {view.hand ? (
                      <span className="bet-stat">
                        <span>In hand</span>
                        <b>{money(row.inHand ?? 0)}</b>
                      </span>
                    ) : (
                      <span className="bet-stat">
                        <span>Bought in</span>
                        <b>{money(row.invested)}</b>
                      </span>
                    )}
                  </span>
                  {/* What they put in, as thin boxes: label and amount on one line. */}
                  <span className="live-player-thin">
                    {/* The stack in big blinds, how players size each other up. */}
                    {row.left ? null : (
                      <span className="bb">
                        BB&apos;s left <b>{bigBlinds(row.stack, view.bigBlind)}</b>
                      </span>
                    )}
                    {row.start === undefined ? (
                      <span>
                        Rebuys <b>{row.rebuys}</b>
                      </span>
                    ) : (
                      <>
                        <span>
                          Start <b>{money(row.start)}</b>
                        </span>
                        <span>
                          Buy-ins{" "}
                          <b>
                            {row.invested > row.start
                              ? money(row.invested - row.start)
                              : "None"}
                          </b>
                        </span>
                      </>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {mine ? (
        <section className="glass card live-you" aria-label="Your game">
          <span className="label">Your game</span>
          <div className="live-you-head">
            <SeatAvatar
              art={<AvatarArt id={mine.avatar} seed={mine.name} />}
              role={mine.role}
              size="small"
            />
            <div className="live-you-name">
              <b>{mine.name}</b>
              {mineFacts.length ? <small>{mineFacts.join(" · ")}</small> : null}
            </div>
            <b className={mine.net > 0 ? "pos" : mine.net < 0 ? "neg" : undefined}>
              {formatSignedChips(mine.net, view.chipUnit, code)}
            </b>
          </div>
          {mine.nets && view.historyHands ? (
            <NetChart nets={mine.nets} hands={view.historyHands} />
          ) : null}
        </section>
      ) : null}

      {stats.length ? (
        <section className="glass card" aria-label="Game so far">
          <span className="label">Game so far</span>
          <div className="bet-stats">
            {stats.map(([label, value]) => (
              <div className="bet-stat" key={label}>
                <span>{label}</span>
                <b>{value}</b>
              </div>
            ))}
          </div>
        </section>
      ) : null}

    </main>
  );
}
