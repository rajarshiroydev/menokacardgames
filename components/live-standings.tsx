"use client";

import { useEffect, useState } from "react";

import { formatChipChange, smallBlindFor } from "@/lib/poker/game";
import { describeRebuyRules } from "@/lib/poker/buy-ins";
import { chipsToAmount, formatChips } from "@/lib/poker/money";
import {
  LIVE_VIEW_POLL_MS,
  LIVE_VIEW_REQUEST_TIMEOUT_MS,
  LIVE_VIEW_STALE_MS,
  type LiveView,
} from "@/lib/poker/live-view";
import { AvatarArt } from "@/components/avatar-art";
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
  const rebuyNote = describeRebuyRules(view.rebuyRules, view.currency, view.chipUnit);

  return (
    <main className="ledger-shell live-shell">
      <header className="screen-header">
        <div className="screen-heading">
          <span className="eyebrow">Live standings</span>
          <h1 style={{ ["--chars" as string]: Math.max(8, view.gameName.length) }}>
            {view.gameName}
          </h1>
        </div>
        <ThemeToggle />
      </header>

      <section className="glass card live-blinds" aria-label="Current blinds">
        <span className="blinds-label">Blinds</span>
        <span className="live-blinds-value">
          {formatChips(view.smallBlind ?? smallBlindFor(view.bigBlind), view.chipUnit, view.currency)}
          <span className="blinds-separator"> / </span>
          {formatChips(view.bigBlind, view.chipUnit, view.currency)}
        </span>
        {rebuyNote ? <span className="muted small-note">{rebuyNote}</span> : null}
      </section>

      <section className="glass card live-list" aria-label="Standings">
        {view.standings.map((row) => (
          <button
            key={row.name}
            type="button"
            className={`live-row${me === row.name ? " me" : ""}`}
            aria-pressed={me === row.name}
            onClick={() => toggleMe(row.name)}
          >
            <span
              className={`medal${
                row.rank === 1
                  ? " gold"
                  : row.rank === 2
                    ? " silver"
                    : row.rank === 3
                      ? " bronze"
                      : ""
              }`}
            >
              {row.rank}
            </span>
            <span className="avatar avatar-small">
              <AvatarArt id={row.avatar} seed={row.name} />
            </span>
            <span className="live-player">
              <b>{row.name}</b>
              <span className="live-stack">
                <small>Stack</small>
                {formatChips(row.stack, view.chipUnit, view.currency)}
              </span>
            </span>
            <span className="live-values">
              <b className={row.net > 0 ? "pos" : row.net < 0 ? "neg" : undefined}>
                {row.net > 0 ? "▲ " : row.net < 0 ? "▼ " : ""}
                {formatChipChange(chipsToAmount(row.net, view.chipUnit))}
              </b>
              <small>Buy-In {formatChips(row.invested, view.chipUnit, view.currency)}</small>
              {row.rebuys > 0 ? (
                <small>
                  {row.rebuys} rebuy{row.rebuys === 1 ? "" : "s"}
                </small>
              ) : null}
            </span>
          </button>
        ))}
      </section>

      <section className="glass card live-summary">
        <span className="label">
          {view.handInProgress
            ? `Hand ${view.handNo} in progress`
            : view.handNo > 0
              ? `After hand ${view.handNo}`
              : "Before the first hand"}
        </span>
        <p className={`small-note live-updated${stale ? " stale" : ""}`} role="status">
          <span className="live-dot" aria-hidden="true" />
          {failed
            ? `This phone can't reach the app. Last update ${ago(age)}.`
            : stale
              ? `Last update ${ago(age)}. The host's phone may be offline or asleep.`
              : `Updated ${ago(age)}`}
        </p>
      </section>

      <p className="small-note muted live-footnote">
        Tap your name to highlight it. Stacks update after every action; net
        and rank update when each hand ends. Read-only: only the host can
        change the game.
      </p>
    </main>
  );
}
