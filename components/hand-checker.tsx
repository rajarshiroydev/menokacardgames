"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  BOARD_SIZE,
  cardName,
  cardSuit,
  handDetail,
  handName,
  HOLE_SIZE,
  isRed,
  judgeShowdown,
  MAX_PLAYERS,
  MIN_PLAYERS,
  RANK_CODES,
  rankLabel,
  shownOrder,
  SUITS,
  suitSymbol,
  type PlayerResult,
  type Suit,
} from "@/lib/poker/hands";

/**
 * Who Wins?: the host enters the board and each player's two cards; the app
 * says who wins and why. The cards live in the app's memory only (see
 * `WhoWinsDraft`): they outlast a visit to another screen, never the page.
 */

type Seat = {
  id: number;
  name: string;
  /** Typing a name instead of choosing one of the host's players. */
  typed: boolean;
  cards: Array<string | null>;
};
type Slot = { kind: "board"; index: number } | { kind: "seat"; id: number; index: number };

const SUIT_NAMES: Record<Suit, string> = {
  s: "Spades",
  h: "Hearts",
  d: "Diamonds",
  c: "Clubs",
};
const BOARD_LABELS = ["Flop", "Flop", "Flop", "Turn", "River"];
/** The player dropdown's last choice; no real name starts with a NUL. */
const TYPE_A_NAME = "\u0000type";

function emptySeat(id: number): Seat {
  return { id, name: "", typed: false, cards: Array(HOLE_SIZE).fill(null) };
}

/**
 * Everything entered on Who Wins?. The app shell holds it, so leaving the
 * screen by mistake loses nothing; a reload or signing out clears it, and it
 * is never stored or sent anywhere.
 */
export type WhoWinsDraft = {
  board: Array<string | null>;
  seats: Seat[];
  /** Check Winner was pressed and nothing has changed since. */
  checked: boolean;
};

export function emptyWhoWinsDraft(): WhoWinsDraft {
  return {
    board: Array(BOARD_SIZE).fill(null),
    seats: [emptySeat(1), emptySeat(2)],
    checked: false,
  };
}

function seatName(seat: Seat, position: number) {
  return seat.name.trim() || `Player ${position + 1}`;
}

/**
 * "Enter the cards for Player 3, or remove them, to check the winner."
 * Removing is only offered while there are more than two rows. No "Player
 * 3's": the house Title Case would show it as "3'S".
 */
function missingCardsWarning(names: readonly string[], canRemove: boolean) {
  const list = joinNames(names);
  return canRemove
    ? `Enter the cards for ${list}, or remove them, to check the winner.`
    : `Enter the cards for ${list} to check the winner.`;
}

/** "Asha", "Asha and Bikram", "Asha, Bikram and Farhan". */
function joinNames(names: readonly string[]) {
  return names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Two Pair · Kings and Queens", or just "High Card" when there's no detail. */
function handLine(entry: PlayerResult) {
  const detail = handDetail(entry.hand);
  return detail ? `${handName(entry.hand)} · ${detail}` : handName(entry.hand);
}

function sameSlot(a: Slot | null, b: Slot) {
  if (!a || a.kind !== b.kind || a.index !== b.index) return false;
  return a.kind === "board" || (b.kind === "seat" && a.id === b.id);
}

/**
 * `knownPlayers` are the host's player names, their own first; each player
 * row offers them in a dropdown, with "Type a name…" for anyone else.
 */
export function HandChecker({
  draft,
  setDraft,
  knownPlayers = [],
}: {
  draft: WhoWinsDraft;
  setDraft: Dispatch<SetStateAction<WhoWinsDraft>>;
  knownPlayers?: string[];
}) {
  // The answer shows only after Check Winner, and hides again when a card or
  // player changes, so it never describes cards that are no longer there.
  const { board, seats, checked } = draft;
  const setBoard = (next: SetStateAction<WhoWinsDraft["board"]>) =>
    setDraft((current) => ({
      ...current,
      board: typeof next === "function" ? next(current.board) : next,
    }));
  const setSeats = (next: SetStateAction<WhoWinsDraft["seats"]>) =>
    setDraft((current) => ({
      ...current,
      seats: typeof next === "function" ? next(current.seats) : next,
    }));
  const setChecked = (next: boolean) =>
    setDraft((current) => ({ ...current, checked: next }));
  // The picker and its suit are this visit's only: coming back shows the page.
  const [picking, setPicking] = useState<Slot | null>(null);
  const [suit, setSuit] = useState<Suit>("s");
  // Scrolls to the answer when Check Winner is pressed, not when coming back
  // to an answer already shown.
  const revealing = useRef(false);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!checked || !revealing.current) return;
    revealing.current = false;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [checked]);

  function cardAt(slot: Slot) {
    if (slot.kind === "board") return board[slot.index];
    return seats.find((seat) => seat.id === slot.id)?.cards[slot.index] ?? null;
  }

  function slotLabel(slot: Slot) {
    if (slot.kind === "board") return BOARD_LABELS[slot.index];
    const position = seats.findIndex((seat) => seat.id === slot.id);
    return `${seatName(seats[position], position)} · card ${slot.index + 1}`;
  }

  function setCard(slot: Slot, card: string | null) {
    setChecked(false);
    if (slot.kind === "board") {
      setBoard((current) => current.map((old, index) => (index === slot.index ? card : old)));
    } else {
      setSeats((current) =>
        current.map((seat) =>
          seat.id === slot.id
            ? {
                ...seat,
                cards: seat.cards.map((old, index) => (index === slot.index ? card : old)),
              }
            : seat,
        ),
      );
    }
  }

  function pick(card: string) {
    if (!picking) return;
    setCard(picking, card);
    // Go on to the next empty slot of the same part (the community cards, or
    // this player's two), so each part is a run of taps. With none left it
    // stays on this one: only Done closes the picker.
    const at = shownSlots.findIndex((slot) => sameSlot(picking, slot));
    const next = [...shownSlots.slice(at + 1), ...shownSlots.slice(0, at)].find(
      (slot) => !cardAt(slot),
    );
    setPicking(next ?? picking);
  }

  /** Opens the picker on a slot, at its card's suit when it has one. */
  function openSlot(slot: Slot) {
    const card = cardAt(slot);
    if (card) setSuit(cardSuit(card));
    setPicking(slot);
  }

  function updateSeat(id: number, change: Partial<Seat>) {
    setSeats((current) =>
      current.map((seat) => (seat.id === id ? { ...seat, ...change } : seat)),
    );
  }

  function addSeat() {
    setChecked(false);
    setSeats((current) => [
      ...current,
      emptySeat(Math.max(0, ...current.map((seat) => seat.id)) + 1),
    ]);
  }

  function removeSeat(id: number) {
    setChecked(false);
    setSeats((current) => current.filter((seat) => seat.id !== id));
  }

  function clearCards() {
    setChecked(false);
    setBoard(Array(BOARD_SIZE).fill(null));
    setSeats((current) =>
      current.map((seat) => ({ ...seat, cards: Array(HOLE_SIZE).fill(null) })),
    );
  }

  // The picker covers one part at a time: the community cards, or one
  // player's two. That part's slots show at the top so each tap is visible as
  // it lands; its cards are outlined in the grid and come out on a second tap.
  // Every card used elsewhere is faded and can't be picked.
  const pickingSeat =
    picking?.kind === "seat" ? seats.find((seat) => seat.id === picking.id) ?? null : null;
  const pickingSeatPosition = pickingSeat ? seats.indexOf(pickingSeat) : -1;
  const shownSlots: Slot[] = pickingSeat
    ? pickingSeat.cards.map((_, index) => ({ kind: "seat" as const, id: pickingSeat.id, index }))
    : board.map((_, index) => ({ kind: "board" as const, index }));
  const chosen = new Map<string, Slot>();
  for (const slot of shownSlots) {
    const card = cardAt(slot);
    if (card) chosen.set(card, slot);
  }
  const used = new Set(
    [...board, ...seats.flatMap((seat) => seat.cards)].filter(
      (card): card is string => card !== null && !chosen.has(card),
    ),
  );

  /** A second tap on a chosen card takes it out and makes its slot the next to fill. */
  function unpick(slot: Slot) {
    setCard(slot, null);
    setPicking(slot);
  }
  const anyCard = board.some(Boolean) || seats.some((seat) => seat.cards.some(Boolean));

  // Every row counts: a player without both cards blocks the check, so the
  // winner is never named while someone at the table is missing.
  const rows = seats.map((seat, position) => ({ seat, position }));
  const missing = rows
    .filter(({ seat }) => !seat.cards.every(Boolean))
    .map(({ seat, position }) => seatName(seat, position));
  const boardDone = board.every(Boolean);
  const ready = boardDone && !missing.length;
  const result =
    checked && ready
      ? judgeShowdown(
          board as string[],
          rows.map(({ seat, position }) => ({
            name: seatName(seat, position),
            cards: seat.cards as string[],
          })),
        )
      : null;
  const holeCards = (entry: PlayerResult) =>
    rows[entry.index].seat.cards as string[];

  return (
    <div className="stack-list who-wins">
      <section className="glass card">
        <div className="who-head">
          <span className="label">Community</span>
          <small className="muted">Flop, turn and river</small>
        </div>
        <div className="mini-cards">
          {board.map((card, index) => (
            <SlotButton
              key={index}
              card={card}
              placeholder={BOARD_LABELS[index]}
              label={`${BOARD_LABELS[index]} card`}
              active={sameSlot(picking, { kind: "board", index })}
              onClick={() => openSlot({ kind: "board", index })}
            />
          ))}
        </div>
      </section>

      <section className="glass card">
        <div className="who-head">
          <span className="label">Players</span>
          <small className="muted">Two cards each</small>
        </div>
        <ul className="who-seats">
          {seats.map((seat, position) => (
            <li key={seat.id} className="who-seat">
              <div className="who-seat-head">
                {knownPlayers.length && !seat.typed ? (
                  <select
                    className="select-control literal-text"
                    value={seat.name}
                    aria-label={`Player ${position + 1}`}
                    onChange={(event) =>
                      event.target.value === TYPE_A_NAME
                        ? updateSeat(seat.id, { typed: true, name: "" })
                        : updateSeat(seat.id, { name: event.target.value })
                    }
                  >
                    <option value="">{`Player ${position + 1}`}</option>
                    {knownPlayers
                      .filter(
                        (name) =>
                          name === seat.name ||
                          !seats.some((other) => other.id !== seat.id && other.name === name),
                      )
                      .map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    <option value={TYPE_A_NAME}>Type a name…</option>
                  </select>
                ) : (
                  <input
                    className="field"
                    value={seat.name}
                    placeholder={seat.typed ? "Type a name" : `Player ${position + 1}`}
                    maxLength={24}
                    aria-label={`Player ${position + 1} name`}
                    autoFocus={seat.typed}
                    onChange={(event) => updateSeat(seat.id, { name: event.target.value })}
                    // Left empty, it goes back to the list of players.
                    onBlur={() => {
                      if (!seat.name.trim()) updateSeat(seat.id, { typed: false, name: "" });
                    }}
                  />
                )}
                {seats.length > MIN_PLAYERS ? (
                  <button
                    className="who-remove"
                    type="button"
                    aria-label={`Remove ${seatName(seat, position)}`}
                    onClick={() => removeSeat(seat.id)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <div className="who-hole">
                {seat.cards.map((card, index) => (
                  <SlotButton
                    key={index}
                    card={card}
                    placeholder="+"
                    label={`${seatName(seat, position)} card ${index + 1}`}
                    active={sameSlot(picking, { kind: "seat", id: seat.id, index })}
                    onClick={() => openSlot({ kind: "seat", id: seat.id, index })}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="who-actions">
          {seats.length < MAX_PLAYERS ? (
            <button className="text-button" type="button" onClick={addSeat}>
              + Add player
            </button>
          ) : null}
        </div>
      </section>

      {result ? (
        <section ref={resultRef} className="glass card who-result" aria-live="polite">
          <div className="who-winner">
            <span className="label">{result.winners.length > 1 ? "Split pot" : "Winner"}</span>
            <h2 className="who-winner-name literal-text">
              {joinNames(result.winners.map((winner) => winner.name))}
            </h2>
            <span className="who-winner-hand">{handLine(result.winners[0])}</span>
          </div>
          <div>
            <span className="label">Why</span>
            <ul className="who-reasons">
              {result.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
          {result.notes.length ? (
            <div>
              <span className="label">Good to know</span>
              <ul className="who-reasons tips">
                {result.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <div className="who-head">
              <span className="label">Every hand</span>
              <small className="muted">Best first</small>
            </div>
            <ol className="who-ranking">
              {result.results.map((entry) => (
                <li key={entry.index}>
                  <span className="who-ranking-copy">
                    <b className="literal-text">{entry.name}</b>
                    <small>{handLine(entry)}</small>
                  </span>
                  <HandCards entry={entry} hole={holeCards(entry)} />
                </li>
              ))}
            </ol>
          </div>
          {/* The two marks beginners need to read the cards above. */}
          <ul className="who-key" aria-label="How to read the cards">
            <li>
              <span className="mini-card hole" aria-hidden="true" />
              Outlined: the player&apos;s own two cards.
            </li>
            <li>
              <span className="mini-card unused" aria-hidden="true" />
              Faded: not part of their best five.
            </li>
          </ul>
        </section>
      ) : (
        <>
          <button
            className="primary"
            type="button"
            disabled={!ready}
            onClick={() => {
              revealing.current = true;
              setChecked(true);
            }}
          >
            Check Winner
          </button>
          {!boardDone ? (
            <p className="muted who-hint">Enter the five community cards to check the winner.</p>
          ) : null}
          {/* One step at a time: the board first, then who is missing cards. */}
          {boardDone && missing.length ? (
            <p className="field-error who-warning" role="alert">
              {missingCardsWarning(missing, seats.length > MIN_PLAYERS)}
            </p>
          ) : null}
        </>
      )}

      <button className="ghost" type="button" disabled={!anyCard} onClick={clearCards}>
        Clear cards
      </button>

      {picking ? (
        <div
          className="modal show"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPicking(null);
          }}
        >
          <div
            className="sheet who-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="who-picker-title"
          >
            <span className="sheet-grabber" aria-hidden="true" />
            <span className="label">{slotLabel(picking)}</span>
            <h2 id="who-picker-title">Pick a card</h2>
            {!pickingSeat ? (
              <div className="who-picker-group">
                <span className="label">Community</span>
                <div className="who-picker-cards">
                  {board.map((card, index) => (
                    <SlotButton
                      key={index}
                      card={card}
                      placeholder={BOARD_LABELS[index]}
                      label={`${BOARD_LABELS[index]} card`}
                      active={sameSlot(picking, { kind: "board", index })}
                      onClick={() => openSlot({ kind: "board", index })}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="who-picker-group who-picker-seat">
                <span className="label literal-text">
                  {seatName(pickingSeat, pickingSeatPosition)}
                </span>
                <div className="who-picker-cards">
                  {pickingSeat.cards.map((card, index) => (
                    <SlotButton
                      key={index}
                      card={card}
                      placeholder="+"
                      label={`${seatName(pickingSeat, pickingSeatPosition)} card ${index + 1}`}
                      active={sameSlot(picking, { kind: "seat", id: pickingSeat.id, index })}
                      onClick={() =>
                        openSlot({ kind: "seat", id: pickingSeat.id, index })
                      }
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="segmented who-suits" role="radiogroup" aria-label="Suit">
              {SUITS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={suit === option}
                  aria-label={SUIT_NAMES[option]}
                  className={`${suit === option ? "selected" : ""} ${
                    option === "h" || option === "d" ? "red" : ""
                  }`}
                  onClick={() => setSuit(option)}
                >
                  {suitSymbol(`A${option}`)}
                </button>
              ))}
            </div>
            <div className="who-ranks">
              {RANK_CODES.map((rank) => {
                const card = `${rank}${suit}`;
                const taken = used.has(card);
                const chosenSlot = chosen.get(card);
                return (
                  <button
                    key={card}
                    type="button"
                    className={`who-rank ${isRed(card) ? "red" : ""} ${
                      chosenSlot ? "selected" : ""
                    }`}
                    disabled={taken}
                    aria-label={`${cardName(card)}${taken ? ", already used" : ""}`}
                    aria-pressed={Boolean(chosenSlot)}
                    onClick={() => (chosenSlot ? unpick(chosenSlot) : pick(card))}
                  >
                    <span>{rankLabel(card)}</span>
                    <span className="mini-card-suit">{suitSymbol(card)}</span>
                  </button>
                );
              })}
            </div>
            <button className="primary" type="button" onClick={() => setPicking(null)}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CardFace({
  card,
  unused = false,
  hole = false,
}: {
  card: string;
  unused?: boolean;
  hole?: boolean;
}) {
  return (
    <span
      className={`mini-card ${isRed(card) ? "red" : ""} ${unused ? "unused" : ""} ${
        hole ? "hole" : ""
      }`}
      aria-hidden="true"
    >
      <span>{rankLabel(card)}</span>
      <span className="mini-card-suit">{suitSymbol(card)}</span>
    </span>
  );
}

function SlotButton({
  card,
  placeholder,
  label,
  active,
  onClick,
}: {
  card: string | null;
  placeholder: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`who-slot ${card ? "filled" : ""} ${active ? "active" : ""}`}
      aria-label={card ? `${label}: ${cardName(card)}` : `${label}: empty`}
      onClick={onClick}
    >
      {card ? <CardFace card={card} /> : <span className="who-slot-empty">{placeholder}</span>}
    </button>
  );
}

/** The best five, then the cards left out, faded; the player's own two outlined. */
function HandCards({ entry, hole }: { entry: PlayerResult; hole: string[] }) {
  const best = shownOrder(entry.hand);
  const described = `Best five: ${best.map(cardName).join(", ")}. Left out: ${entry.unused
    .map(cardName)
    .join(", ")}.`;
  return (
    <div className="who-cards" role="img" aria-label={described}>
      {best.map((card) => (
        <CardFace key={card} card={card} hole={hole.includes(card)} />
      ))}
      {entry.unused.map((card) => (
        <CardFace key={card} card={card} unused hole={hole.includes(card)} />
      ))}
    </div>
  );
}
