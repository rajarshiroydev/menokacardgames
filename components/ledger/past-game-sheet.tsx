"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Avatar, toneClass } from "@/components/ledger/avatar";
import {
  ChipCountSheet,
  type ColourCounts,
  type SaveChipSet,
} from "@/components/ledger/chip-count-sheet";
import { ChipStackIcon } from "@/components/ledger/icons";
import { ChipInput, ChipUnitContext, useMoney } from "@/components/ledger/money";
import type { ChipSet } from "@/lib/poker/chip-set";
import {
  type PastGamePlayer,
  pastGameBought,
  pastGameGap,
  pastGameSession,
} from "@/lib/poker/past-game";
import { formatDate } from "@/lib/poker/game";
import { DEFAULT_STACK } from "@/lib/poker/stakes";
import type { PlayerProfile, PokerSession } from "@/lib/poker/types";

const MAX_PLAYERS = 10;

/** 30 minutes to 12 hours, in half hours. */
const LENGTHS = Array.from({ length: 24 }, (_, index) => (index + 1) * 30);

function lengthLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** Today on this phone's clock, as a date input's value. */
function today() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Add A Past Game (plan entry "enter a past game (plan)"): a game played
 * without the app, entered afterwards and saved as a quick ledger. Amounts
 * are typed in hundredths (the cents unit), so small stakes work too; the
 * saved game uses whole chips unless an amount has cents.
 */
export function PastGameSheet(props: {
  players: PlayerProfile[];
  selfPlayerId: string | null;
  chipSet: ChipSet | null;
  onSaveChipSet: SaveChipSet;
  /** Saves the game; resolves false after showing why it failed. */
  onSave: (session: PokerSession) => Promise<boolean>;
  onClose: () => void;
}) {
  return createPortal(
    <ChipUnitContext.Provider value="cents">
      <PastGameForm {...props} />
    </ChipUnitContext.Provider>,
    document.body,
  );
}

function PastGameForm({
  players,
  selfPlayerId,
  chipSet,
  onSaveChipSet,
  onSave,
  onClose,
}: {
  players: PlayerProfile[];
  selfPlayerId: string | null;
  chipSet: ChipSet | null;
  onSaveChipSet: SaveChipSet;
  /** Saves the game; resolves false after showing why it failed. */
  onSave: (session: PokerSession) => Promise<boolean>;
  onClose: () => void;
}) {
  const { money, signedMoney } = useMoney();
  const [name, setName] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [minutes, setMinutes] = useState<number | null>(null);
  const [picked, setPicked] = useState<PastGamePlayer[]>([]);
  const [colourCounts, setColourCounts] = useState<Record<string, ColourCounts>>({});
  const [counting, setCounting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The checked game, waiting for "Save this past game?" to be answered.
  const [confirming, setConfirming] = useState<PokerSession | null>(null);
  const [saving, setSaving] = useState(false);
  const confirmBox = useRef<HTMLDivElement>(null);
  // The question appears at the foot of a long sheet; bring it into view.
  useEffect(() => {
    if (confirming) confirmBox.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [confirming]);

  const ordered = [
    ...players.filter((player) => player.id === selfPlayerId),
    ...players.filter((player) => player.id !== selfPlayerId),
  ];
  const gap = pastGameGap(picked);
  const bought = pastGameBought(picked);
  const allEnded = picked.length > 0 && picked.every((player) => player.end !== null);

  function change(playerId: string, update: (player: PastGamePlayer) => PastGamePlayer) {
    setError(null);
    setConfirming(null);
    setPicked((current) =>
      current.map((player) => (player.playerId === playerId ? update(player) : player)),
    );
  }

  function toggle(player: PlayerProfile) {
    setError(null);
    setConfirming(null);
    setPicked((current) =>
      current.some((item) => item.playerId === player.id)
        ? current.filter((item) => item.playerId !== player.id)
        : [
            ...current,
            { playerId: player.id, name: player.name, buyIns: [DEFAULT_STACK], end: null },
          ],
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setConfirming(pastGameSession({ name, date, time, minutes, players: picked }, Date.now()));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Check the game");
    }
  }

  const countingPlayer = picked.find((player) => player.playerId === counting);

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet profile-sheet past-game-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="past-game-title"
        onSubmit={submit}
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="past-game-title">Add A Past Game</h2>
        <p className="muted small-note">
          A game played without the app. It&apos;s saved as a quick ledger and counts
          towards the standings.
        </p>

        <label className="label" htmlFor="past-game-name">
          Game name (optional)
        </label>
        <input
          id="past-game-name"
          type="text"
          maxLength={80}
          autoComplete="off"
          placeholder="Next game number"
          value={name}
          onChange={(event) => {
            setConfirming(null);
            setName(event.target.value);
          }}
        />

        <div className="past-game-when">
          <label>
            <span className="label">Date</span>
            <input
              type="date"
              required
              max={today()}
              value={date}
              onChange={(event) => {
                setError(null);
                setConfirming(null);
                setDate(event.target.value);
              }}
            />
          </label>
          <label>
            <span className="label">Start (optional)</span>
            <input
              type="time"
              value={time}
              onChange={(event) => {
                setError(null);
                setConfirming(null);
                setTime(event.target.value);
              }}
            />
          </label>
        </div>
        <label>
          <span className="label">Length (optional)</span>
          <select
            value={minutes ?? ""}
            onChange={(event) => {
              setError(null);
              setConfirming(null);
              setMinutes(event.target.value ? Number(event.target.value) : null);
            }}
          >
            <option value="">Not set</option>
            {LENGTHS.map((length) => (
              <option key={length} value={length}>
                {lengthLabel(length)}
              </option>
            ))}
          </select>
        </label>

        <span className="label">Players</span>
        {ordered.length ? (
          <div className="seat-chips">
            {ordered.map((player) => {
              const place = picked.findIndex((item) => item.playerId === player.id);
              return (
                <button
                  key={player.id}
                  type="button"
                  className={`seat-chip ${place >= 0 ? "seated" : ""}`}
                  aria-pressed={place >= 0}
                  disabled={place < 0 && picked.length >= MAX_PLAYERS}
                  onClick={() => toggle(player)}
                >
                  <span className="seat-chip-dot" aria-hidden="true">
                    {place >= 0 ? place + 1 : "+"}
                  </span>
                  {player.name}
                  {player.id === selfPlayerId ? <span className="you-tag">You</span> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted small-note">Add players on Profile first.</p>
        )}

        {picked.map((player) => {
          const spent = player.buyIns.reduce<number>((total, amount) => total + (amount ?? 0), 0);
          const net = player.end === null ? null : player.end - spent;
          return (
            <div className="past-game-player" key={player.playerId}>
              <div className="past-game-player-head">
                <Avatar name={player.name} playerId={player.playerId} size="small" />
                <b>{player.name}</b>
                {net !== null ? (
                  <span className={toneClass(net) || "pos"}>{signedMoney(net)}</span>
                ) : null}
              </div>
              {player.buyIns.map((amount, place) => (
                <div className="past-game-line" key={place}>
                  <span>{place === 0 ? "Buy-in" : `Rebuy ${place}`}</span>
                  <ChipInput
                    className="field"
                    aria-label={`${player.name}'s ${place === 0 ? "buy-in" : `rebuy ${place}`}`}
                    placeholder="0"
                    value={amount}
                    onChange={(chips) =>
                      change(player.playerId, (current) => ({
                        ...current,
                        buyIns: current.buyIns.map((value, index) =>
                          index === place ? chips : value,
                        ),
                      }))
                    }
                  />
                  {place > 0 ? (
                    <button
                      className="chip-remove"
                      type="button"
                      aria-label={`Remove ${player.name}'s rebuy ${place}`}
                      onClick={() =>
                        change(player.playerId, (current) => ({
                          ...current,
                          buyIns: current.buyIns.filter((_, index) => index !== place),
                        }))
                      }
                    >
                      ×
                    </button>
                  ) : (
                    <span className="chip-remove" aria-hidden="true" />
                  )}
                </div>
              ))}
              <button
                className="text-button past-game-rebuy"
                type="button"
                onClick={() =>
                  change(player.playerId, (current) => ({
                    ...current,
                    buyIns: [...current.buyIns, current.buyIns.at(-1) ?? DEFAULT_STACK],
                  }))
                }
              >
                + Rebuy
              </button>
              <div className="past-game-line">
                <span>Chips at the end</span>
                <ChipInput
                  className="field"
                  aria-label={`${player.name}'s chips at the end`}
                  placeholder="0"
                  value={player.end}
                  onChange={(chips) => {
                    change(player.playerId, (current) => ({ ...current, end: chips }));
                    setColourCounts((current) => {
                      const next = { ...current };
                      delete next[player.playerId];
                      return next;
                    });
                  }}
                />
                <button
                  className="chip-count-button"
                  type="button"
                  aria-label={`Count ${player.name}'s chips by colour`}
                  onClick={() => setCounting(player.playerId)}
                >
                  <ChipStackIcon />
                </button>
              </div>
            </div>
          );
        })}

        {picked.length ? (
          <div
            className={`ledger-balance${allEnded && gap === 0 ? " balanced" : ""}`}
            role="status"
          >
            <span>
              Ended with {money(bought - gap)} of {money(bought)}
            </span>
            <b>
              {gap === 0
                ? allEnded
                  ? "Balanced"
                  : "Enter every player's chips"
                : gap > 0
                  ? `${money(gap)} short`
                  : `${money(-gap)} over`}
            </b>
          </div>
        ) : null}

        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        {confirming ? (
          <div className="past-game-confirm" role="alert" ref={confirmBox}>
            <b>Save this past game?</b>
            <p className="muted small-note">
              {formatDate(confirming.date)}, {confirming.results.length} players,{" "}
              {money(bought)} bought in. It goes to Games and counts towards the
              standings.
            </p>
            <button
              className="primary full"
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                const saved = await onSave(confirming);
                setSaving(false);
                if (!saved) setConfirming(null);
              }}
            >
              {saving ? "Saving…" : "Save game"}
            </button>
            <button
              className="ghost full"
              type="button"
              disabled={saving}
              onClick={() => setConfirming(null)}
            >
              Back
            </button>
          </div>
        ) : (
          <>
            <button className="primary full" type="submit" disabled={picked.length < 2}>
              Save game
            </button>
            <button className="ghost full" type="button" onClick={onClose}>
              Cancel
            </button>
          </>
        )}

        {countingPlayer ? (
          <ChipCountSheet
            name={countingPlayer.name}
            chipSet={chipSet}
            initialCounts={colourCounts[countingPlayer.playerId]}
            onSaveChipSet={onSaveChipSet}
            onUse={(chips, byColour) => {
              change(countingPlayer.playerId, (current) => ({ ...current, end: chips }));
              setColourCounts((current) => ({
                ...current,
                [countingPlayer.playerId]: byColour,
              }));
              setCounting(null);
            }}
            onClose={() => setCounting(null)}
          />
        ) : null}
      </form>
    </div>
  );
}
