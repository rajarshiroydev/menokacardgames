"use client";

import { useState } from "react";

import { WinnerSummary } from "@/components/game-parts";
import { Avatar } from "@/components/ledger/avatar";
import { SplitIcon } from "@/components/ledger/icons";
import { useMoney } from "@/components/ledger/money";
import {
  activeIndexes,
  handRake,
  payablePots,
  potLabel,
  potsFor,
  resolvePotWinners,
  splitShares,
} from "@/lib/poker/game";
import type { GameState, WinnerAnnouncement } from "@/lib/poker/types";

export function WinnerCard({
  announcement,
  onNext,
}: {
  announcement: WinnerAnnouncement;
  onNext: () => void;
}) {
  const { money } = useMoney();

  return (
    <div className="winner-overlay" role="presentation">
      <section
        className="winner-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="winner-title"
      >
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
        <WinnerSummary
          handNo={announcement.handNo}
          names={announcement.names}
          split={announcement.split}
          pot={money(announcement.pot)}
          pots={announcement.pots?.map((pot) => ({
            label: pot.label,
            names: pot.names,
            amount: money(pot.amount),
          }))}
        />
        <button className="cta" type="button" onClick={onNext}>
          Next
        </button>
      </section>
    </div>
  );
}

export function WinnerPicker({
  game,
  onPickWinner,
  onBeginSplit,
}: {
  game: GameState;
  onPickWinner: (playerIndex: number) => void;
  onBeginSplit: () => void;
}) {
  const { money } = useMoney();
  // The player tapped, for this hand only. Awarding takes a second tap on
  // the button under the list, which names them.
  const [picked, setPicked] = useState<{ hand: number; index: number } | null>(
    null,
  );
  const hand = game.hand;
  if (!hand) return null;
  const rake = handRake(game);
  const payout = hand.pot - rake;
  const active = activeIndexes(game);
  const winner =
    picked?.hand === hand.no && active.includes(picked.index)
      ? picked.index
      : null;

  return (
    <section className="glass card winner-picker">
      <PickerHead title="Pick the winner" amount={money(payout)} />
      {rake ? (
        <p className="muted small-note">
          After the house&apos;s {money(rake)} rake.
        </p>
      ) : null}
      {active.map((playerIndex) => {
        const isWinner = winner === playerIndex;
        return (
          <button
            className={`contender ${isWinner ? "won" : ""}`}
            type="button"
            aria-pressed={isWinner}
            key={playerIndex}
            onClick={() =>
              setPicked(
                isWinner ? null : { hand: hand.no, index: playerIndex },
              )
            }
          >
            <Avatar
              name={game.players[playerIndex].name}
              playerId={game.players[playerIndex].id}
              size="small"
            />
            <span className="contender-name">
              {game.players[playerIndex].name}
            </span>
            {/* The amount shows only on the player picked, as in a split. */}
            <span className={`contender-amount ${isWinner ? "" : "muted"}`}>
              {isWinner ? money(payout) : "Tap to pick"}
            </span>
          </button>
        );
      })}
      {/* Grey until a player is picked, then green and naming them. */}
      <button
        className={`${winner === null ? "glass-button" : "accent-button"} full tall`}
        type="button"
        disabled={winner === null}
        onClick={() => {
          if (winner !== null) onPickWinner(winner);
        }}
      >
        {winner === null
          ? "Pick a winner"
          : `${game.players[winner].name} wins ${money(payout)}`}
      </button>
      {active.length > 1 ? (
        <button
          className="split-button"
          type="button"
          onClick={onBeginSplit}
        >
          <SplitIcon />
          Split this pot
        </button>
      ) : null}
    </section>
  );
}

/** A showdown card's heading: the title with the pot beside it, centred. */
function PickerHead({ title, amount }: { title: string; amount?: string }) {
  return (
    <div className="picker-head">
      <h2 className="card-title">{title}</h2>
      {amount ? (
        <span className="card-title accent-amount">{amount}</span>
      ) : null}
    </div>
  );
}

/** "Main ₹3,000 · Side ₹8,000" once a short all-in has made side pots. */
export function PotBreakdown({
  game,
  className,
}: {
  game: GameState;
  className: string;
}) {
  const { money } = useMoney();
  const { pots } = potsFor(game);
  if (pots.length < 2) return null;
  return (
    <span className={className}>
      {pots
        .map(
          (pot, index) =>
            `${potLabel(index, pots.length).replace(" pot", "")} ${money(pot.amount)}`,
        )
        .join(" · ")}
    </span>
  );
}

/**
 * The showdown when an all-in player can't win everything: one winner (or a
 * split) per pot, then one Award button. A pot only one player can win, and
 * chips nobody called, are shown and handed out without a choice.
 */
export function SidePotPicker({
  game,
  onAward,
}: {
  game: GameState;
  onAward: (winners: number[][]) => void;
}) {
  const { money } = useMoney();
  const [choice, setChoice] = useState<number[][]>([]);
  const [splitting, setSplitting] = useState<boolean[]>([]);
  const { pots, refund, rake } = payablePots(game);
  const name = (index: number) => game.players[index].name;
  const several = pots.length > 1;
  const total = pots.reduce((sum, pot) => sum + pot.amount, 0);
  // A pot being split isn't decided until two or more players are in it.
  const picks = picksFor(choice, splitting);
  // Pots an earlier pot's winners are in follow from that pick.
  const resolved = resolvePotWinners(pots, picks);
  // "the main pot", "side pot 1": how a note names the pot it follows.
  const potPhrase = (index: number) =>
    index === 0 ? "the main pot" : potLabel(index, pots.length).toLowerCase();
  const decided = pots.map((pot, index) =>
    pot.eligible.length === 1 || resolved[index].from !== null
      ? true
      : splitting[index]
        ? resolved[index].winners.length >= 2
        : resolved[index].winners.length === 1,
  );
  const ready = decided.every(Boolean);
  const decidedCount = decided.filter(Boolean).length;

  // What's picked, counting a split as no pick until two or more are in it.
  function picksFor(nextChoice: number[][], nextSplitting: boolean[]) {
    return pots.map((_, index) =>
      nextSplitting[index] && (nextChoice[index]?.length ?? 0) < 2
        ? []
        : (nextChoice[index] ?? []),
    );
  }

  // A changed pick only matters to later pots its winners are in: those now
  // follow it, so their own picks and splits are dropped (and don't come back
  // if they open up again). Pots it doesn't reach keep theirs.
  function update(nextChoice: number[][], nextSplitting: boolean[]) {
    const followed = resolvePotWinners(
      pots,
      picksFor(nextChoice, nextSplitting),
    );
    followed.forEach((result, index) => {
      if (result.from !== null) {
        nextChoice[index] = [];
        nextSplitting[index] = false;
      }
    });
    setChoice(nextChoice);
    setSplitting(nextSplitting);
  }

  function pick(potIndex: number, playerIndex: number) {
    const nextChoice = [...choice];
    const chosen = nextChoice[potIndex] ?? [];
    nextChoice[potIndex] = splitting[potIndex]
      ? chosen.includes(playerIndex)
        ? chosen.filter((index) => index !== playerIndex)
        : [...chosen, playerIndex]
      : [playerIndex];
    update(nextChoice, [...splitting]);
  }

  function toggleSplit(potIndex: number) {
    const nextChoice = [...choice];
    const nextSplitting = [...splitting];
    nextSplitting[potIndex] = !nextSplitting[potIndex];
    nextChoice[potIndex] = [];
    update(nextChoice, nextSplitting);
  }

  return (
    <section className="glass card winner-picker">
      {/* With several pots each pot's own heading leads, so the card has
          no title of its own. */}
      {several ? null : (
        <>
          <PickerHead title="Pick the winner" amount={money(total)} />
          <p className="muted small-note">
            An all-in player can only win what each player matched.
          </p>
        </>
      )}
      {refund ? (
        <p className="pot-refund">
          {money(refund.amount)} goes back to {name(refund.playerIndex)} ·
          nobody called it
        </p>
      ) : null}
      {rake ? (
        <p className="muted small-note">
          Pots are after the house&apos;s {money(rake)} rake.
        </p>
      ) : null}
      {pots.map((pot, potIndex) => {
        const chosen = choice[potIndex] ?? [];
        const split = splitting[potIndex] ?? false;
        const follows = resolved[potIndex].from;
        // A pot that follows an earlier one shows its winners, locked.
        const winners = follows !== null ? resolved[potIndex].winners : chosen;
        const splitShown = follows !== null ? winners.length > 1 : split;
        const shares = splitShares(
          pot.amount,
          winners,
          game.hand?.dealerIndex ?? 0,
          game.players.length,
        );
        return (
          <div className={several ? "side-pot" : "stack-list"} key={potIndex}>
            {several ? (
              // The pot's name and amount, with what it still needs (or
              // who has it) on the right.
              <div className="side-pot-head">
                <PickerHead
                  title={potLabel(potIndex, pots.length)}
                  amount={money(pot.amount)}
                />
                <span
                  className={`side-pot-status ${decided[potIndex] ? "done" : ""}`}
                >
                  {decided[potIndex]
                    ? `✓ ${
                        pot.eligible.length === 1
                          ? name(pot.eligible[0])
                          : winners.length > 1
                            ? "Split"
                            : name(winners[0])
                      }`
                    : split
                      ? "Pick two or more"
                      : "Pick the winner"}
                </span>
              </div>
            ) : null}
            {pot.eligible.length === 1 ? (
              <p className="muted small-note">
                Goes to {name(pot.eligible[0])} · nobody else is in it
              </p>
            ) : (
              <>
                {pot.eligible.map((playerIndex) => {
                  const isChosen = winners.includes(playerIndex);
                  const share = shares.get(playerIndex) ?? 0;
                  return (
                    // Like the single-pot card: the amount shows only on the
                    // player picked, green for one winner, blue in a split.
                    <button
                      className={`contender ${
                        isChosen ? (splitShown ? "selected" : "won") : ""
                      }`}
                      type="button"
                      aria-pressed={isChosen}
                      disabled={follows !== null}
                      key={playerIndex}
                      onClick={() => pick(potIndex, playerIndex)}
                    >
                      <Avatar
                        name={name(playerIndex)}
                        playerId={game.players[playerIndex].id}
                        size="small"
                      />
                      <span className="contender-name">{name(playerIndex)}</span>
                      <span
                        className={`contender-amount ${isChosen ? "" : "muted"}`}
                      >
                        {isChosen
                          ? money(share)
                          : follows !== null
                            ? ""
                            : split
                              ? "Tap to include"
                              : "Tap to pick"}
                      </span>
                    </button>
                  );
                })}
                {follows !== null ? (
                  <p className="muted small-note">
                    {winners.length > 1
                      ? `Split by ${winners.map(name).join(" and ")} · they split ${potPhrase(follows)}`
                      : `Goes to ${name(winners[0])} · best hand in ${potPhrase(follows)}`}
                  </p>
                ) : (
                  <button
                    className={split ? "glass-button" : "split-button"}
                    type="button"
                    onClick={() => toggleSplit(potIndex)}
                  >
                    {split ? null : <SplitIcon />}
                    {split ? "Back to one winner" : "Split this pot"}
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
      {/* Grey until every pot has a winner, then green, like the
          single-pot card's award button. */}
      <button
        className={`${ready ? "accent-button" : "glass-button"} full tall`}
        type="button"
        disabled={!ready}
        onClick={() => onAward(picks)}
      >
        {!several
          ? "Award pot"
          : ready
            ? `Award ${money(total)}`
            : decidedCount === 0
              ? "Pick a winner for each pot"
              : `${decidedCount} of ${pots.length} pots picked`}
      </button>
    </section>
  );
}

export function SplitView({
  game,
  onToggle,
  onSplit,
  onBack,
}: {
  game: GameState;
  onToggle: (index: number) => void;
  onSplit: () => void;
  onBack: () => void;
}) {
  const { money } = useMoney();
  const hand = game.hand;
  if (!hand?.splitSel) return null;
  const payout = hand.pot - handRake(game);
  const shares = splitShares(
    payout,
    hand.splitSel,
    hand.dealerIndex,
    game.players.length,
  );

  return (
    <section className="glass card winner-picker">
      <PickerHead title="Split the pot" amount={money(payout)} />
      {activeIndexes(game).map((playerIndex) => {
        const isSelected = hand.splitSel?.includes(playerIndex) ?? false;
        const share = shares.get(playerIndex) ?? 0;
        return (
          <button
            className={`contender ${isSelected ? "selected" : ""}`}
            type="button"
            aria-pressed={isSelected}
            key={playerIndex}
            onClick={() => onToggle(playerIndex)}
          >
            <Avatar
              name={game.players[playerIndex].name}
              playerId={game.players[playerIndex].id}
              size="small"
            />
            <span className="contender-name">
              {game.players[playerIndex].name}
            </span>
            <span className={`contender-amount ${isSelected ? "" : "muted"}`}>
              {isSelected ? money(share) : "Tap to include"}
            </span>
          </button>
        );
      })}
      {hand.splitSel.length > 1 ? (
        <button className="blue-button full tall" type="button" onClick={onSplit}>
          Split {money(payout)} {hand.splitSel.length} ways
        </button>
      ) : (
        <p className="muted small-note">Select at least 2 players.</p>
      )}
      {/* A solid button like Undo, so the way back isn't missed. */}
      <button className="glass-button full" type="button" onClick={onBack}>
        Back to one winner
      </button>
    </section>
  );
}
