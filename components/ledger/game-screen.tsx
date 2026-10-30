"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  blindsLine,
  BlindsPill,
  BlindTimer,
  nextBlindsText,
  PotCard,
  SeatStrip,
  shortBlinds,
  StandingRow,
} from "@/components/game-parts";
import { ActionLog } from "@/components/ledger/action-log";
import { Avatar, toneClass } from "@/components/ledger/avatar";
import { BuyInOptions } from "@/components/ledger/buy-in-sheets";
import {
  flashFor,
  type GameViewProps,
  potCardLabel,
} from "@/components/ledger/game-shared";
import {
  DealButton,
  HandButtons,
  UndoHandButton,
  UndoTurnButton,
} from "@/components/ledger/hand-buttons";
import { PauseIcon, PlayIcon } from "@/components/ledger/icons";
import { describeBlindSchedule, GameAmounts, useMoney } from "@/components/ledger/money";
import { PlayerRow } from "@/components/ledger/player-row";
import {
  PotBreakdown,
  SidePotPicker,
  SplitView,
  WinnerPicker,
} from "@/components/ledger/pot-winners";
import { TableHand } from "@/components/ledger/table-hand";
import {
  blindStatus,
  dealablePlayerCount,
  describeRakeRules,
  handContributions,
  hasBlindClock,
  hasSidePots,
  isShowdown,
  nextBuyIn,
  pendingBlindPlan,
  pendingIndexes,
  playerBuyIns,
  seatRole,
  seatStatusParts,
  STAGES,
  totalBuyIns,
} from "@/lib/poker/game";
import type { GameState } from "@/lib/poker/types";

/** Ticks once a second, but only while a timed blind schedule is running. */
function useBlindClock(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** The game screen, with its amounts in the game's own chip unit. */
export function GameView(props: GameViewProps) {
  return (
    <GameAmounts game={props.game}>
      <GameScreen {...props} />
    </GameAmounts>
  );
}

function GameScreen(props: GameViewProps) {
  const { currency, unit, money, signedMoney } = useMoney();
  const { game } = props;
  const hand = game.hand;
  const net = (index: number) =>
    game.players[index].stack - totalBuyIns(game, index);
  const enoughPlayers = dealablePlayerCount(game) >= 2;
  // Timed levels run on the clock between hands too, so keep the countdown
  // live, unless the host paused it.
  const now = useBlindClock(
    game.blinds?.unit === "minutes" && game.blindClockPausedAt === undefined,
  );
  const blinds = blindStatus(game, now);
  const pendingPlan = pendingBlindPlan(game);
  const blindNote = !blinds.schedule
    ? ""
    : nextBlindsText(
        {
          smallBlind: blinds.nextSmallBlind,
          bigBlind: blinds.nextBigBlind,
          dueNow: blinds.dueNow,
          ...(blinds.schedule.unit === "hands"
            ? { handsLeft: blinds.handsLeft }
            : { msLeft: blinds.msLeft }),
        },
        money,
      );
  const clock = hasBlindClock(game);
  const pausedNote = blinds.paused ? "Clock paused · " : "";
  const clockButton = clock ? (
    <button
      type="button"
      className="clock-toggle"
      aria-pressed={blinds.paused}
      aria-label={blinds.paused ? "Resume blind clock" : "Pause blind clock"}
      onClick={props.onToggleBlindClock}
    >
      {blinds.paused ? <PlayIcon /> : <PauseIcon />}
      <span>{blinds.paused ? "Resume" : "Pause"}</span>
    </button>
  ) : null;
  const blindSchedule = (
    <BlindTimer
      text={blinds.schedule && !pendingPlan ? blindNote : ""}
      due={blinds.dueNow}
      paused={blinds.paused}
    >
      {pendingPlan ? (
        <div className={`blind-timer due ${blinds.paused ? "paused" : ""}`}>
          {pausedNote}From hand {pendingPlan.effectiveHand}:{" "}
          {describeBlindSchedule(pendingPlan.schedule, currency, unit)}
        </div>
      ) : null}
      {clockButton}
    </BlindTimer>
  );
  const blindsDisplay = (
    <BlindsPill
      smallBlind={money(blinds.smallBlind)}
      bigBlind={money(blinds.bigBlind)}
      level={blinds.schedule ? blinds.level : undefined}
    >
      {game.bigBlindAnte ? (
        <span className="muted small-note">
          Big blind ante {money(blinds.bigBlind)}
        </span>
      ) : null}
      {blindSchedule}
    </BlindsPill>
  );

  // The blinds on one line, for the middle of the table and the List view's
  // pot card alike.
  const blindsText = blindsLine(
    {
      smallBlind: blinds.smallBlind,
      bigBlind: blinds.bigBlind,
      ante: Boolean(game.bigBlindAnte),
      level: blinds.schedule ? blinds.level : undefined,
    },
    money,
  );

  const lastStage = STAGES.length - 1;
  const pending = hand ? pendingIndexes(game).length > 0 : false;
  const standings = game.players
    .map((player, index) => ({ player, index }))
    .sort((a, b) => b.player.stack - a.player.stack);
  // When a round has just closed, the player whose action closed it keeps an
  // open (locked) card until the next street is dealt, so nothing above the
  // Deal button changes height and the button stays under the same finger.
  const closer =
    hand && !hand.splitSel && hand.stage < lastStage && !pending
      ? hand.last.findIndex((action) => action?.line === game.log[0])
      : -1;
  const rowOrder = hand ? listOrder(game, closer) : [];
  const rowRef = useTurnShift(rowOrder);
  // The player with the action card: the one to act, or the one whose
  // action just closed the round. Everyone else is a tile above it.
  const lead = closer >= 0 ? closer : (hand?.currentPlayer ?? null);
  const waiting = rowOrder.filter((playerIndex) => playerIndex !== lead);

  return (
    <div className="stack-list game-view">
      {!hand ? (
        <section className="glass card between-card">
          <span className="eyebrow">
            {enoughPlayers ? `${game.handNo} hands dealt` : "Game over"}
          </span>
          <h2 className="card-title">
            {enoughPlayers ? "Ready For The Next Hand" : "Not Enough Chips"}
          </h2>
          <p className="muted">
            {enoughPlayers
              ? "The table has enough players with chips to deal again."
              : game.players.some((_, index) => nextBuyIn(game, index) !== null)
                ? "Fewer than two players have chips remaining. A busted player can buy in to continue."
                : "Fewer than two players have chips remaining, and nobody can rebuy under this game's rebuy rules. Finish and save the game, or edit the rebuys."}
          </p>
          {blindsDisplay}
          {!game.winnerAnnouncement ? (
            <>
              {enoughPlayers ? (
                <button className="cta" type="button" onClick={props.onNextHand}>
                  Deal The Next Hand
                </button>
              ) : null}
              <BuyInOptions game={game} onBuyIn={props.onBuyIn} />
              <div className="button-pair">
                <button
                  className="glass-button"
                  type="button"
                  onClick={props.onAddPlayer}
                >
                  Add player
                </button>
                <button
                  className="glass-button"
                  type="button"
                  onClick={props.onCashOut}
                >
                  Cash out
                </button>
              </div>
              <button
                className="glass-button full"
                type="button"
                onClick={props.onEditBlinds}
              >
                Edit blind plan
              </button>
              <button
                className="glass-button full"
                type="button"
                onClick={props.onEditRebuys}
              >
                Edit rebuys
              </button>
            </>
          ) : null}
        </section>
      ) : props.layout === "table" ? (
        <TableHand
          blindsText={blindsText}
          blindSchedule={blinds.schedule || pendingPlan ? blindSchedule : null}
          {...props}
        />
      ) : (
        <>
          {/* The same as the middle of the table: the streets as small
              bars, "Pot · Turn", the pot and the blinds. */}
          <PotCard
            stage={hand.stage}
            showdown={isShowdown(game)}
            label={potCardLabel(game)}
            pot={money(hand.pot)}
            breakdown={<PotBreakdown game={game} className="table-sidepots" />}
            blinds={blindsText}
            timer={blinds.schedule || pendingPlan ? blindSchedule : null}
          />

          {/* Everyone not acting, in the order they act next, as strips
              above the action card, so the buttons sit right under it as in
              the Table view. */}
          {waiting.length ? (
            <div className="glass waiting-list">
              {waiting.map((playerIndex) => (
                // The wrapper keeps its place in the DOM across turns, so
                // it can move from its old spot.
                <div
                  className="player-slot"
                  key={playerIndex}
                  ref={rowRef(playerIndex)}
                >
                  <WaitingStrip
                    game={game}
                    playerIndex={playerIndex}
                    flash={flashFor(game, props.lastTurn, playerIndex)}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {lead !== null ? (
            <PlayerRow
              key={`${hand.no}-${hand.stage}-${lead}-${hand.acted[lead]}`}
              game={game}
              playerIndex={lead}
              roundClosed={lead === closer}
              flash={flashFor(game, props.lastTurn, lead)}
              onAct={props.onAct}
            />
          ) : null}
          {/* A split keeps the player rows above it, like a side pot's. As
              in the Table view, the winner is picked once the river betting
              is over, not while it is still going. */}
          {hand.splitSel ? (
            <SplitView
              game={game}
              onToggle={props.onToggleSplit}
              onSplit={props.onSplitPot}
              onBack={props.onEndSplit}
            />
          ) : hand.stage < lastStage || pending ? null : hasSidePots(game) ? (
            <SidePotPicker
              key={hand.no}
              game={game}
              onAward={props.onAwardPots}
            />
          ) : (
            <WinnerPicker
              game={game}
              onPickWinner={props.onPickWinner}
              onBeginSplit={props.onBeginSplit}
            />
          )}
          {/* Always there from the deal to the showdown, faded when it
              can't be used, so it never jumps into place or leaves a gap. */}
          <DealButton game={game} onDeal={props.onNextStage} />
          <BuyInOptions game={game} onBuyIn={props.onBuyIn} />
          <UndoTurnButton
            game={game}
            tall
            onUndo={props.onUndoAction}
            onUndoStreet={props.onUndoStreet}
          />
          <HandButtons
            game={game}
            onUndoHand={props.onUndoHand}
            onCancelHand={props.onCancelHand}
          />
        </>
      )}

      <section className="glass card session-standings">
        <h2 className="card-title">Session Standings</h2>
        {game.rakeRules ? (
          <p className="muted small-note">
            {describeRakeRules(game.rakeRules, money)} · house has taken{" "}
            {money(game.rake ?? 0)}
          </p>
        ) : null}
        <div className="rows">
          {standings.map(({ player, index }, rank) => (
            <StandingRow
              key={index}
              rank={rank + 1}
              name={player.name}
              note={`${player.left ? "Cashed out · " : ""}${standingBuyIns(game, index, money)}`}
              stack={money(player.stack)}
              net={signedMoney(net(index))}
              netTone={toneClass(net(index))}
            />
          ))}
        </div>
        <button
          className={`glass-button full live-share-button${
            props.liveSharing ? " sharing" : ""
          }`}
          type="button"
          onClick={props.onShareLive}
        >
          {props.liveSharing ? (
            <>
              <span className="live-dot" aria-hidden="true" />
              {props.liveFailing
                ? "Live link not updating"
                : "Sharing live · show link"}
            </>
          ) : (
            "Share live standings"
          )}
        </button>
      </section>

      <button className="cta" type="button" onClick={props.onEndSession}>
        Finish And Save Session
      </button>
      {/* During a hand Undo hand sits beside Cancel hand instead. */}
      <div className={hand ? "" : "button-pair"}>
        {hand ? null : (
          <UndoHandButton game={game} onUndoHand={props.onUndoHand} />
        )}
        <button
          className={`glass-button danger-text ${hand ? "full" : ""}`}
          type="button"
          onClick={props.onDiscard}
        >
          Discard game
        </button>
      </div>

      {game.log.length ? (
        <section className="glass card">
          <h2 className="card-title">Action Log</h2>
          <ActionLog
            lines={game.log}
            players={game.players}
            liveHand={hand?.no ?? null}
          />
        </section>
      ) : null}
    </div>
  );
}

/**
 * What a player put in, for the standings: their own starting buy-in, then
 * any rebuys together ("Start ₹10,000 · Buy-ins ₹20,000").
 */
function standingBuyIns(
  game: GameState,
  playerIndex: number,
  money: (value: number) => string,
) {
  const [start = 0, ...rebuys] = playerBuyIns(game, playerIndex);
  const more = rebuys.reduce((total, amount) => total + amount, 0);
  return more > 0
    ? `Start ${money(start)} · Buy-ins ${money(more)}`
    : `Start ${money(start)}`;
}

/**
 * The List view's player order. The player to act, or the one whose action
 * just closed the round, comes first, so the action card always sits in the
 * same place under the pot; the others still in follow in turn order from
 * them, then those who folded, in seat order. With nobody to act (the
 * showdown) it is seat order.
 */
function listOrder(game: GameState, closer: number) {
  const hand = game.hand;
  if (!hand) return [];
  const lead = closer >= 0 ? closer : (hand.currentPlayer ?? -1);
  const count = game.players.length;
  const fromLead = Array.from(
    { length: count },
    (_, offset) => (Math.max(lead, 0) + offset) % count,
  );
  return [
    // A closing fold keeps its place until the next street.
    ...fromLead.filter((index) => hand.in[index] || index === lead),
    ...game.players
      .map((_, index) => index)
      .filter(
        (index) =>
          !hand.in[index] && index !== lead && !game.players[index].left,
      ),
  ];
}

/**
 * When the turn order moves on, the waiting players' tiles move from where
 * they were to their new place, each one step nearer their turn. The new
 * action card is left to its own slide-in, and the tile of the player who
 * just left the action card rises into its place from one tile below.
 * Positions are measured within the grid, so scrolling in between doesn't
 * count; nothing moves under reduced motion.
 */
function useTurnShift(order: number[]) {
  const nodes = useRef(new Map<number, HTMLElement>());
  const places = useRef(new Map<number, { left: number; top: number }>());
  const lastOrder = useRef<number[]>([]);
  const orderKey = order.join(",");

  useLayoutEffect(() => {
    const previous = lastOrder.current;
    const moved = previous.length > 0 && previous.join(",") !== orderKey;
    lastOrder.current = order;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const easing = "cubic-bezier(0.2, 0, 0, 1)";
    const next = new Map<number, { left: number; top: number }>();
    nodes.current.forEach((node, id) => {
      const now = { left: node.offsetLeft, top: node.offsetTop };
      next.set(id, now);
      if (!moved || still || id === order[0]) return;
      // The player who just left the action card has no old tile: theirs
      // rises into its place from one tile below.
      if (id === previous[0]) {
        const gap = parseFloat(getComputedStyle(node.parentElement!).rowGap);
        const below = node.offsetHeight + (Number.isNaN(gap) ? 0 : gap);
        node.animate(
          [
            { transform: `translateY(${below}px)`, opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 240, easing },
        );
        return;
      }
      const before = places.current.get(id);
      if (!before || (before.left === now.left && before.top === now.top)) {
        return;
      }
      node.animate(
        [
          {
            transform: `translate(${before.left - now.left}px, ${before.top - now.top}px)`,
          },
          { transform: "none" },
        ],
        { duration: 240, easing },
      );
    });
    places.current = next;
  });

  return (id: number) => (node: HTMLDivElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };
}

/**
 * A waiting player in the List view: the avatar, and beside it the name
 * over three boxes like the action card's, for the stack, what's in this hand and the status. An
 * amount in the status is the box's value, under its words ("Raised to",
 * "₹1,200"), so long statuses still fit.
 */
function WaitingStrip({
  game,
  playerIndex,
  flash,
}: {
  game: GameState;
  playerIndex: number;
  flash?: number;
}) {
  const { money } = useMoney();
  const hand = game.hand;
  if (!hand) return null;
  const player = game.players[playerIndex];
  const status = seatStatusParts(game, playerIndex);
  return (
    <SeatStrip
      avatar={
        <Avatar
          name={player.name}
          playerId={player.id}
          role={seatRole(game, playerIndex)}
          size="small"
        />
      }
      name={player.name}
      folded={!hand.in[playerIndex]}
      stack={{ label: "Stack", value: money(player.stack) }}
      inHand={{
        label: "In hand",
        value: money(handContributions(game)[playerIndex]),
      }}
      status={
        status.amount === undefined
          ? { label: "Status", value: status.label }
          : { label: shortBlinds(status.label), value: money(status.amount) }
      }
      flash={flash}
    />
  );
}
