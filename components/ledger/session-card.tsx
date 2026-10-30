"use client";

import { useContext, useEffect, useMemo, useState } from "react";

import { ActionLog } from "@/components/ledger/action-log";
import { sessionsApi } from "@/components/ledger/api";
import { toneClass } from "@/components/ledger/avatar";
import {
  CurrencyContext,
  describeBlindSchedule,
  describeChipValue,
  GameAmounts,
  useMoney,
} from "@/components/ledger/money";
import { ShareResultsButton } from "@/components/ledger/results-card";
import { describeRebuyRules } from "@/lib/poker/buy-ins";
import {
  describeRakeRules,
  formatDate,
  formatTime,
  sessionBlindHistory,
  smallBlindFor,
} from "@/lib/poker/game";
import { formatSignedMoney } from "@/lib/poker/money";
import { sessionMoney } from "@/lib/poker/settle-up";
import type { PokerSession, SavedActionLog } from "@/lib/poker/types";

/** A saved game's card, with its amounts in that game's chip unit. */
export function SessionCard(
  props: Omit<Parameters<typeof SessionCardBody>[0], "moneyCurrency">,
) {
  const currency = useContext(CurrencyContext);
  return (
    <GameAmounts game={props.session}>
      <SessionCardBody {...props} moneyCurrency={currency} />
    </GameAmounts>
  );
}

function SessionCardBody({
  session,
  moneyCurrency,
  discarded = false,
  youIndex,
  onContinue,
  onSettle,
  onRestore,
  onDeletePermanently,
  showLog = false,
}: {
  session: PokerSession;
  /** The host's currency; chip amounts may be plain counts (GameAmounts). */
  moneyCurrency: string;
  discarded?: boolean;
  /** Which result is the viewer's, marked You (friends' games). */
  youIndex?: number;
  onContinue?: (id: string) => void;
  onSettle?: (id: string) => void;
  /** Not shown for now: the Discard button is hidden (user decision 2026-10-01). */
  onDiscard?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDeletePermanently?: (id: string) => void;
  /** The host's own games: an Action log toggle beside Details. */
  showLog?: boolean;
}) {
  const { currency, unit, money, signedMoney } = useMoney();
  const sortedResults = [...session.results].sort((a, b) => b.net - a.net);
  // Results in money, at the chip value; chips if they don't balance.
  const netMoney = useMemo(() => {
    try {
      const inMoney = sessionMoney(session);
      return new Map(
        session.results.map((result, index) => [
          result,
          inMoney.results[index].net,
        ]),
      );
    } catch {
      return null;
    }
  }, [session]);
  const you = youIndex === undefined ? undefined : session.results[youIndex];
  const ledger = session.kind === "ledger";
  // A friend's game sent before migration 0027 has no big blind: its blinds
  // are unknown rather than zero. Every saved hand-by-hand game has one.
  const blindsKnown = !ledger && session.ante > 0;
  const blinds = blindsKnown ? sessionBlindHistory(session) : null;
  const lastBigBlind = blinds?.levels.at(-1)!.bigBlind ?? 0;
  // Each player's buy-ins in seat order; none saved means the starting
  // stack. The first is what they started with (their own amount when the
  // game let players choose), the rest are rebuys.
  const buyIns = session.results.map((result) => ({
    name: result.name,
    amounts: result.buyIns?.length ? result.buyIns : [session.startStack],
  }));
  const sameStart = buyIns.every(
    (player) => player.amounts[0] === buyIns[0]?.amounts[0],
  );
  const rebought = buyIns.filter((player) => player.amounts.length > 1);
  // Everything but the date, kind and player count sits under Details.
  const details: [string, string][] = [];
  if (sameStart && buyIns.length) {
    details.push(["Starting stack", money(buyIns[0].amounts[0])]);
  }
  if (!ledger) details.push(["Hands", String(session.hands)]);
  if (blinds) {
    details.push([
      "Blinds",
      `${money(smallBlindFor(session.ante, blinds.smallBlindRatio))}/${money(session.ante)}`,
    ]);
  }
  // Games that tracked players (since 2026-10-26): hands each played, late
  // joins and cash-outs. Older games have none of these.
  const handsPlayed = session.results.every(
    (result) => result.handsPlayed !== undefined,
  )
    ? session.results
    : [];
  const showHandsPlayed = handsPlayed.some(
    (result) => result.handsPlayed !== session.hands,
  );
  const joined = session.results.filter((result) => result.joinedAt !== undefined);
  const cashedOut = session.results.filter((result) => result.leftAt !== undefined);
  if (blinds) {
    details.push([
      "Finished at",
      `${money(smallBlindFor(lastBigBlind, blinds.smallBlindRatio))}/${money(lastBigBlind)}`,
    ]);
  }
  if (session.chipValue) {
    details.push([
      "Chip value",
      describeChipValue(session.chipValue, session.chipUnit, moneyCurrency),
    ]);
  }
  const rebuys = describeRebuyRules(session.rebuyRules, currency, session.chipUnit);
  if (session.rebuyRules && rebuys) details.push(["Rebuys", rebuys]);
  if (session.bigBlindAnte) details.push(["Big blind ante", "On"]);
  if (session.rakeRules) {
    details.push([
      "Rake",
      `${describeRakeRules(session.rakeRules, money)} · house took ${money(session.rake ?? 0)}`,
    ]);
  }

  const hasDetails = details.length > 0 || !sameStart || blinds !== null;
  const [showDetails, setShowDetails] = useState(false);
  // The log has its own toggle, so Details stays short (user request).
  const [logOpen, setLogOpen] = useState(false);

  return (
    <article className={`glass card session-card ${discarded ? "discarded" : ""}`}>
      <div className="session-head">
        <div>
          <h2 className="card-title">
            {session.name || `Game ${session.sessionNumber || ""}`}
          </h2>
          <p className="muted session-meta">
            {formatDate(session.date)} ·{" "}
            {ledger ? "Quick ledger" : "Hand by hand"} ·{" "}
            {session.results.length} players
          </p>
        </div>
        {/* The results card needs chips that add up, like Settle up. */}
        {!discarded && netMoney ? (
          <ShareResultsButton
            session={session}
            className="pill-button share-pill"
            label="Share"
          />
        ) : null}
      </div>
      <div className="rows">
        {sortedResults.map((result, index) => (
          <div
            className="result-row"
            key={`${result.playerId || result.name}-${index}`}
          >
            {index === 0 && result.net > 0 ? (
              <span className="win-tag">Win</span>
            ) : null}
            <span className="result-name">
              {result.name}
              {result === you ? <span className="you-tag">You</span> : null}
            </span>
            <span className={`result-amount ${toneClass(result.net)}`}>
              {netMoney?.has(result)
                ? formatSignedMoney(netMoney.get(result)! / 100, moneyCurrency)
                : signedMoney(result.net)}
            </span>
          </div>
        ))}
      </div>
      <div className="session-foot">
        {hasDetails ? (
          <button
            className="session-details-toggle"
            type="button"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((open) => !open)}
          >
            Details
          </button>
        ) : null}
        {showLog ? (
          <button
            className="session-details-toggle"
            type="button"
            aria-expanded={logOpen}
            onClick={() => setLogOpen((open) => !open)}
          >
            Action log
          </button>
        ) : null}
        <div className="session-actions">
          {discarded ? (
            <>
              <button
                className="pill-button"
                type="button"
                onClick={() => onRestore?.(session.id)}
              >
                Restore
              </button>
              <button
                className="pill-button danger-text"
                type="button"
                onClick={() => onDeletePermanently?.(session.id)}
              >
                Delete
              </button>
            </>
          ) : (
            <>
              {/* Continue game (host only) comes first, so Settle up sits
                  in the same place on friends' games (user request
                  2026-10-26). */}
              {onContinue && !ledger ? (
                <button
                  className="pill-button"
                  type="button"
                  onClick={() => onContinue(session.id)}
                >
                  Continue game
                </button>
              ) : null}
              {onSettle ? (
                <button
                  className="pill-button"
                  type="button"
                  onClick={() => onSettle(session.id)}
                >
                  Settle up
                </button>
              ) : null}
            </>
          )}
          {/* Discard is hidden until users ask for it back (user decision
              2026-10-01); onDiscard and discardSession stay for that. */}
        </div>
      </div>
      {hasDetails && showDetails ? (
        <div className="session-details-content">
          {details.length ? (
            <dl>
              {details.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {!sameStart ? (
            <>
              <b>Starting stacks</b>
              <dl>
                {buyIns.map((player, index) => (
                  <div key={`${player.name}-${index}`}>
                    <dt>{player.name}</dt>
                    <dd>{money(player.amounts[0])}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
          {rebought.length ? (
            <>
              {/* Moved here from beside each name (user request
                  2026-10-26): every buy-in, then the total. */}
              <b>Buy-ins</b>
              <dl>
                {rebought.map((player, index) => (
                  <div key={`${player.name}-${index}`}>
                    <dt>{player.name}</dt>
                    <dd>
                      {player.amounts.map(money).join(" + ")} ={" "}
                      {money(player.amounts.reduce((sum, amount) => sum + amount, 0))}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
          {showHandsPlayed ? (
            <>
              <b>Hands played</b>
              <dl>
                {handsPlayed.map((result, index) => (
                  <div key={`${result.name}-${index}`}>
                    <dt>{result.name}</dt>
                    <dd>{result.handsPlayed}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
          {joined.length ? (
            <>
              <b>Joined late</b>
              <dl>
                {joined.map((result, index) => (
                  <div key={`${result.name}-${index}`}>
                    <dt>{result.name}</dt>
                    <dd>
                      {result.joinedHand !== undefined
                        ? `From hand ${result.joinedHand} · `
                        : ""}
                      {/* "am"/"pm" keep their case under Title Case. */}
                      <span className="literal-text">
                        {formatTime(result.joinedAt!)}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
          {cashedOut.length ? (
            <>
              <b>Cashed out</b>
              <dl>
                {cashedOut.map((result, index) => (
                  <div key={`${result.name}-${index}`}>
                    <dt>{result.name}</dt>
                    <dd>
                      {result.leftHand === undefined
                        ? ""
                        : result.leftHand === 0
                          ? "Before hand 1 · "
                          : `After hand ${result.leftHand} · `}
                      <span className="literal-text">
                        {formatTime(result.leftAt!)}
                      </span>{" "}
                      · {money(result.end)}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
          {blinds ? (
            <>
              <b>Blind plans</b>
              {blinds.plans.map((plan) => (
                <div key={plan.effectiveHand}>
                  From hand {plan.effectiveHand}: {money(
                    smallBlindFor(plan.baseBigBlind, blinds.smallBlindRatio),
                  )}/{money(plan.baseBigBlind)} ·{" "}
                  {describeBlindSchedule(plan.schedule, currency, unit)}
                </div>
              ))}
              <b>Blind history</b>
              {blinds.levels.map((level) => (
                <div key={level.handNo}>
                  Hand {level.handNo}: {money(
                    smallBlindFor(level.bigBlind, blinds.smallBlindRatio),
                  )}/{money(level.bigBlind)}
                </div>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
      {showLog && logOpen ? (
        <SavedLog sessionId={session.id} saved={session.hasActionLog === true} />
      ) : null}
    </article>
  );
}

// Saved logs already loaded this visit, by game ID. Saving a continued game
// changes its log, so finishSession drops its entry.
export const savedLogs = new Map<string, SavedActionLog | null>();

/**
 * A saved game's action log under its toggle, loaded when first opened.
 * A game saved without one says so at once, with no request.
 */
function SavedLog({ sessionId, saved }: { sessionId: string; saved: boolean }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "loaded"; log: SavedActionLog | null }
    | { status: "failed"; message: string }
  >(() =>
    !saved
      ? { status: "loaded", log: null }
      : savedLogs.has(sessionId)
        ? { status: "loaded", log: savedLogs.get(sessionId)! }
        : { status: "loading" },
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!saved || savedLogs.has(sessionId)) return;
    let current = true;
    sessionsApi<{ log: SavedActionLog | null }>(
      `/${encodeURIComponent(sessionId)}/log`,
    ).then(
      ({ log }) => {
        savedLogs.set(sessionId, log);
        if (current) setState({ status: "loaded", log });
      },
      (error: unknown) => {
        if (current) {
          setState({
            status: "failed",
            message:
              error instanceof Error ? error.message : "Couldn't load the log",
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [sessionId, saved, attempt]);

  return (
    <div className="saved-log">
      {state.status === "loading" ? (
        <p className="muted">Loading…</p>
      ) : state.status === "failed" ? (
        <p className="muted">
          {state.message}.{" "}
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setState({ status: "loading" });
              setAttempt((count) => count + 1);
            }}
          >
            Try again
          </button>
        </p>
      ) : state.log?.lines.length ? (
        <ActionLog lines={state.log.lines} players={state.log.players} />
      ) : (
        <p className="muted">
          No action log was saved with this game. Games keep their log from
          28 October 2026.
        </p>
      )}
    </div>
  );
}
