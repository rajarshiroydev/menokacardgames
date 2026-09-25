"use client";

import { useEffect, useState } from "react";

import { formatChipChange, formatRupees, smallBlindFor } from "@/lib/poker/game";
import {
  LIVE_VIEW_POLL_MS,
  LIVE_VIEW_STALE_MS,
  type LiveView,
} from "@/lib/poker/live-view";

type LiveResponse = LiveView & { updatedAt: number };

type LoadState =
  | { kind: "loading" }
  | { kind: "ended" }
  | { kind: "live"; view: LiveResponse; failed: boolean };

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

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const response = await fetch(`/api/live/${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        if (stopped) return;
        if (response.status === 404) {
          setState({ kind: "ended" });
          return;
        }
        if (!response.ok) throw new Error(String(response.status));
        const view = (await response.json()) as LiveResponse;
        if (!stopped) setState({ kind: "live", view, failed: false });
      } catch {
        if (!stopped) {
          setState((current) =>
            current.kind === "live" ? { ...current, failed: true } : current,
          );
        }
      }
      schedule();
    }

    function schedule() {
      clearTimeout(timer);
      // Hidden tabs stop checking; returning to the page checks at once.
      if (!stopped && document.visibilityState === "visible") {
        timer = setTimeout(load, LIVE_VIEW_POLL_MS);
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void load();
      } else {
        clearTimeout(timer);
      }
    }

    void load();
    document.addEventListener("visibilitychange", onVisibility);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisibility);
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
        <p className="muted live-status">Loading live standings…</p>
      </main>
    );
  }

  if (state.kind === "ended") {
    return (
      <main className="ledger-shell live-shell">
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

  return (
    <main className="ledger-shell live-shell">
      <header className="screen-header">
        <div className="screen-heading">
          <span className="eyebrow">Live standings</span>
          <h1 style={{ ["--chars" as string]: Math.max(8, view.gameName.length) }}>
            {view.gameName}
          </h1>
        </div>
      </header>

      <section className="glass card live-blinds" aria-label="Current blinds">
        <span className="blinds-label">Blinds</span>
        <span className="live-blinds-value">
          {formatRupees(smallBlindFor(view.bigBlind))}
          <span className="blinds-separator"> / </span>
          {formatRupees(view.bigBlind)}
        </span>
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
              className={`medal${row.rank === 1 ? " first" : row.rank <= 3 ? " podium" : ""}`}
            >
              {row.rank}
            </span>
            <span className="live-player">
              <b>{row.name}</b>
              <span className="live-stack">
                <small>Stack</small>
                {formatRupees(row.stack)}
              </span>
            </span>
            <span className="live-values">
              <b className={row.net > 0 ? "pos" : row.net < 0 ? "neg" : undefined}>
                {row.net > 0 ? "▲ " : row.net < 0 ? "▼ " : ""}
                {formatChipChange(row.net)}
              </b>
              <small>Buy-In {formatRupees(row.invested)}</small>
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
            ? `Can't reach the app. Last update ${ago(age)}.`
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
