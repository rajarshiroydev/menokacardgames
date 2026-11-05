"use client";

import { useState } from "react";

import { Avatar } from "@/components/ledger/avatar";
import {
  BlindsSetIcon,
  BlindsUpIcon,
  ChevronIcon,
  NoteIcon,
  RakeIcon,
} from "@/components/ledger/icons";
import {
  groupLog,
  linesToSave,
  LOG_LIMIT,
  type LogEntry,
  type LogGroup,
} from "@/lib/poker/action-log";
import type { GameState, SavedActionLog } from "@/lib/poker/types";

// The mark beside lines that aren't about one player.
function LogIcon({ entry }: { entry: LogEntry }) {
  if (entry.kind === "blinds") {
    return entry.verb === "Blinds up" ? <BlindsUpIcon /> : <BlindsSetIcon />;
  }
  return entry.kind === "rake" ? <RakeIcon /> : <NoteIcon />;
}

/** The game's log as it is saved, with the players its lines name. */
export function savedActionLog(game: GameState): SavedActionLog {
  return {
    players: game.players.map((player) => ({
      ...(player.id ? { id: player.id } : {}),
      name: player.name,
    })),
    lines: linesToSave(game.log, game.hand?.no ?? null),
  };
}

/** How many groups the closed log shows: up to and including the second hand. */
function recentGroups(groups: LogGroup[]) {
  let hands = 0;
  const index = groups.findIndex(
    (group) => group.hand !== null && ++hands === 2,
  );
  return index < 0 ? groups.length : index + 1;
}

/** The groups cut down to their first `limit` lines, newest first. */
function firstLines(groups: LogGroup[], limit: number) {
  let left = limit;
  return groups.flatMap((group) => {
    const streets = group.streets.flatMap((street) => {
      const entries = street.entries.slice(0, Math.max(left, 0));
      left -= entries.length;
      return entries.length ? [{ ...street, entries }] : [];
    });
    return streets.length ? [{ ...group, streets }] : [];
  });
}

/**
 * The action log, newest first: each hand in its own box headed by its
 * number, split by street, one row per action with who, what and how much.
 * Every hand starts folded to its heading and result until tapped; breaks
 * between hands ("Before hand 30") and notes always show in full. Closed,
 * the log lists the latest two hands; Show all lists every hand.
 */
export function ActionLog({
  lines,
  players,
  liveHand = null,
  closedLines,
}: {
  lines: string[];
  /** The game's players in order, as the log's names refer to them. */
  players: ReadonlyArray<{ id?: string; name: string }>;
  /** The hand being played, marked In play. */
  liveHand?: number | null;
  /**
   * For a log with no hands (a quick ledger): how many lines it lists
   * closed, with Show all for the rest.
   */
  closedLines?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  // At the limit old lines may have been dropped, so the oldest hand isn't
  // numbered.
  const groups = groupLog(
    lines,
    players.map((player) => player.name),
    { complete: lines.length < LOG_LIMIT },
  );
  const handCount = groups.filter((group) => group.hand !== null).length;
  const lineCount = groups.reduce(
    (count, group) =>
      count +
      group.streets.reduce((sum, street) => sum + street.entries.length, 0),
    0,
  );
  // Without hands, the log closes to its latest lines instead.
  const byLines = closedLines !== undefined && handCount === 0;
  const recent = byLines ? groups.length : recentGroups(groups);
  const shown =
    showAll || (byLines && lineCount <= closedLines)
      ? groups
      : byLines
        ? firstLines(groups, closedLines)
        : groups.slice(0, recent);
  const more = byLines ? lineCount > closedLines : groups.length > recent;
  // Inside a hand every row but the result keeps the number's place, so
  // the avatars line up.
  const row = (entry: LogEntry, index: number, inHand: boolean) => {
    const player = entry.player === null ? null : players[entry.player];
    // A split shows its winners' faces, overlapping.
    const sharers =
      entry.kind === "split" && entry.note
        ? entry.note
            .split(", ")
            .flatMap((name) => players.filter((each) => each.name === name))
            .slice(0, 3)
        : [];
    return (
      <li key={`${entry.line}-${index}`} className={`log-row log-${entry.kind}`}>
        {entry.number !== null ? (
          <span className="log-number" aria-label={`Action ${entry.number}`}>
            {entry.number}
          </span>
        ) : inHand && entry.kind !== "win" && entry.kind !== "split" ? (
          <span className="log-number" aria-hidden="true" />
        ) : null}
        {player ? (
          <Avatar name={player.name} playerId={player.id} size="small" />
        ) : sharers.length ? (
          <span className="log-avatars">
            {sharers.map((sharer, sharerIndex) => (
              <Avatar
                key={sharer.id ?? `${sharer.name}-${sharerIndex}`}
                name={sharer.name}
                playerId={sharer.id}
                size="small"
              />
            ))}
          </span>
        ) : (
          <span className="log-icon" aria-hidden="true">
            <LogIcon entry={entry} />
          </span>
        )}
        <span className="log-copy">
          <span className="log-what">
            {player ? <b>{player.name}</b> : null}
            <span className="log-verb">{entry.verb}</span>
          </span>
          {entry.note ? <small>{entry.note}</small> : null}
        </span>
        {entry.amount ? <span className="log-amount">{entry.amount}</span> : null}
      </li>
    );
  };
  return (
    <>
      <div className="action-log">
        {shown.map((group, groupIndex) => {
          // Counted from the oldest box, so an opened hand stays open as new
          // ones arrive on top.
          const key = `${group.title}-${groups.length - groupIndex}`;
          const isHand = group.hand !== null;
          // Only hands fold, to their result until tapped.
          const folded = isHand && !opened.has(key);
          // A hand's actions are the rows under its streets.
          const actions = group.streets.reduce(
            (count, street) => count + (street.street ? street.entries.length : 0),
            0,
          );
          const streets = !folded
            ? group.streets
            : group.streets
                .filter((street) => street.street === null)
                .map((street) => ({
                  ...street,
                  entries: street.entries.filter(
                    (entry) => entry.kind === "win" || entry.kind === "split",
                  ),
                }))
                .filter((street) => street.entries.length);
          const live =
            group.hand !== null && group.hand === liveHand ? (
              <span className="log-live">In play</span>
            ) : null;
          const toggle = () =>
            setOpened((current) => {
              const next = new Set(current);
              if (!next.delete(key)) next.add(key);
              return next;
            });
          return (
            <section
              key={key}
              className={`log-hand ${group.title ? "" : "plain"} ${folded ? "folded" : ""}`}
            >
              {isHand ? (
                <button
                  className="log-hand-head"
                  type="button"
                  aria-expanded={!folded}
                  onClick={toggle}
                >
                  <span className="log-hand-title">
                    <b>{group.title}</b>
                    {live}
                  </span>
                  <span className="log-hand-count">
                    {actions} action{actions === 1 ? "" : "s"}
                    <ChevronIcon open={!folded} />
                  </span>
                </button>
              ) : group.title ? (
                <header className="log-hand-head">
                  <b>{group.title}</b>
                </header>
              ) : null}
              {streets.map((street, streetIndex) => (
                <div key={`${street.street}-${streetIndex}`} className="log-street">
                  {street.street ? (
                    <span className="log-street-name">{street.street}</span>
                  ) : null}
                  <ul>
                    {street.entries.map((entry, index) =>
                      row(entry, index, isHand),
                    )}
                  </ul>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      {more ? (
        <button
          className="text-button"
          type="button"
          onClick={() => setShowAll((all) => !all)}
        >
          {showAll
            ? "Show fewer"
            : byLines
              ? `Show all ${lineCount} lines`
              : `Show all ${handCount} hands`}
        </button>
      ) : null}
    </>
  );
}
