import type { CSSProperties, ReactNode } from "react";

import { formatClock, STAGES } from "@/lib/poker/game";

/**
 * Pieces of the game screen drawn from plain values, shared by the host's
 * app and the players' live standings page so both look exactly alike.
 */

/**
 * An avatar with its position badges. Heads-up, the dealer also posts the
 * small blind: the white D badge moves to the left so the blind badge keeps
 * the right.
 */
export function SeatAvatar({
  art,
  role,
  size = "large",
}: {
  art: ReactNode;
  /** "D", "SB", "BB", or "D SB" heads-up. */
  role?: string;
  size?: "large" | "small";
}) {
  const roles = role ? role.split(" ") : [];
  const dealer = roles.includes("D");
  const blind = roles.find((part) => part !== "D");
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {art}
      {dealer ? (
        <span className={`role-badge dealer${blind ? " paired" : ""}`}>D</span>
      ) : null}
      {blind ? <span className="role-badge">{blind}</span> : null}
    </span>
  );
}

/**
 * The four streets as small bars: those dealt are lit, the current one
 * green, and all of them once the showdown comes.
 */
export function StreetPips({
  stage,
  showdown,
}: {
  stage: number;
  showdown: boolean;
}) {
  return (
    <div className="table-pips" aria-label={`Street: ${STAGES[stage]}`}>
      {STAGES.map((street, index) => (
        <span
          key={street}
          className={
            showdown || index < stage
              ? "past"
              : index === stage
                ? "current"
                : ""
          }
        />
      ))}
    </div>
  );
}

/** "Small blind" and "Big blind" as the seats write them: "SB", "BB". */
export function shortBlinds(text: string) {
  return text.replace("Small blind", "SB").replace("Big blind", "BB");
}

/** The blinds on one line: "₹50 / ₹100 · Ante ₹100 · L2". */
export function blindsLine(
  blinds: {
    smallBlind: number;
    bigBlind: number;
    ante?: boolean;
    /** The level, from 0; absent without rising blinds. */
    level?: number;
  },
  money: (value: number) => string,
) {
  return `${money(blinds.smallBlind)} / ${money(blinds.bigBlind)}${
    blinds.ante ? ` · Ante ${money(blinds.bigBlind)}` : ""
  }${blinds.level === undefined ? "" : ` · L${blinds.level + 1}`}`;
}

/**
 * When the blinds go up: "₹100/₹200 in 4 hands", "₹100/₹200 in 12:30", or
 * "Blinds go up to ₹100/₹200 on the next hand".
 */
export function nextBlindsText(
  next: {
    smallBlind: number;
    bigBlind: number;
    dueNow?: boolean;
    handsLeft?: number;
    msLeft?: number;
  },
  money: (value: number) => string,
) {
  const blinds = `${money(next.smallBlind)}/${money(next.bigBlind)}`;
  if (next.dueNow) return `Blinds go up to ${blinds} on the next hand`;
  if (next.handsLeft !== undefined) {
    return `${blinds} in ${next.handsLeft} hand${next.handsLeft === 1 ? "" : "s"}`;
  }
  return `${blinds} in ${formatClock(next.msLeft ?? 0)}`;
}

/** The countdown under the blinds, with the host's pause button if any. */
export function BlindTimer({
  text,
  due = false,
  paused = false,
  children,
}: {
  text: ReactNode;
  due?: boolean;
  paused?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="blind-clock">
      {text ? (
        <div
          className={`blind-timer ${due ? "due" : ""} ${paused ? "paused" : ""}`}
          aria-live="polite"
        >
          {paused ? "Clock paused · " : ""}
          {text}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/**
 * The pot as the middle of the table draws it: the streets as bars,
 * "Pot · Turn", the pot, any main/side split, the blinds and their
 * countdown.
 */
export function PotCard({
  stage,
  showdown,
  label,
  pot,
  breakdown,
  blinds,
  timer,
}: {
  stage: number;
  showdown: boolean;
  label: string;
  pot: string;
  breakdown?: ReactNode;
  blinds: string;
  timer?: ReactNode;
}) {
  return (
    <section className="glass card pot-card">
      <StreetPips stage={stage} showdown={showdown} />
      <span className="table-label">{label}</span>
      <span
        className="table-pot"
        style={{ "--chars": pot.length } as CSSProperties}
      >
        {pot}
      </span>
      {breakdown}
      <span className="table-blinds">{blinds}</span>
      {timer}
    </section>
  );
}

/** The blinds in large type, as between hands. */
export function BlindsPill({
  smallBlind,
  bigBlind,
  level,
  children,
}: {
  smallBlind: string;
  bigBlind: string;
  /** The level, from 0; absent without rising blinds. */
  level?: number;
  children?: ReactNode;
}) {
  return (
    <div className="blinds-display" aria-label="Current blinds">
      <div className="blinds-pill">
        <span className="blinds-label">Blinds</span>
        <span className="blinds-value">
          {smallBlind}
          <span className="blinds-separator"> / </span>
          {bigBlind}
        </span>
        {level === undefined ? null : (
          <span className="blinds-level">L{level + 1}</span>
        )}
      </div>
      {children}
    </div>
  );
}

/** One box of a seat strip: a small label over its value. */
export type StripBox = { label: string; value: string };

/**
 * A player who isn't acting: the avatar, and beside it the name over three
 * small boxes (stack, what's in this hand and the status). The status box
 * flashes when they have just acted.
 */
export function SeatStrip({
  avatar,
  name,
  folded = false,
  stack,
  inHand,
  status,
  flash,
}: {
  avatar: ReactNode;
  name: string;
  folded?: boolean;
  stack: StripBox;
  inHand: StripBox;
  status: StripBox;
  /** Set while their action is the latest; restarts the flash. */
  flash?: number;
}) {
  return (
    <div className={`seat-strip ${folded ? "folded" : ""}`}>
      {avatar}
      <b className="seat-strip-name">{name}</b>
      <div className="seat-strip-stats">
        {[stack, inHand].map((box) => (
          <div className="bet-stat" key={box.label}>
            <span>{box.label}</span>
            <b>{box.value}</b>
          </div>
        ))}
        <div
          className={`bet-stat seat-strip-status ${flash ? "just-acted" : ""}`}
          key={flash ?? "status"}
        >
          <span>{status.label}</span>
          <b>{status.value}</b>
        </div>
      </div>
    </div>
  );
}

/** A row of the standings: rank, name with what they put in, stack and net. */
export function StandingRow({
  rank,
  name,
  note,
  stack,
  net,
  netTone,
}: {
  rank: number;
  name: string;
  note: ReactNode;
  stack: string;
  net: string;
  /** The net's colour class: "pos", "neg" or none. */
  netTone?: string;
}) {
  return (
    <div className="standing-row">
      <span className="standing-rank">{rank}</span>
      <div className="standing-name">
        <b>{name}</b>
        <small>{note}</small>
      </div>
      <div className="standing-values">
        <b>{stack}</b>
        <small className={netTone}>{net}</small>
      </div>
    </div>
  );
}

/** Who won a hand, as the winner card says it. */
export function WinnerSummary({
  handNo,
  names,
  split,
  pot,
  pots,
}: {
  handNo: number;
  names: string[];
  split: boolean;
  pot: string;
  /** Each pot, when the hand had side pots. */
  pots?: { label: string; names: string[]; amount: string }[];
}) {
  const several = pots && pots.length > 1 ? pots : null;
  return (
    <>
      <span className="eyebrow">
        {several ? "Pots won" : "Pot won"} · Hand {handNo}
      </span>
      <h2 id="winner-title">
        {split ? `${names.join(" And ")} Win` : `${names[0]} Wins`}
      </h2>
      {several ? (
        <ul className="winner-pots">
          {several.map((item) => (
            <li key={item.label}>
              <span className="winner-pot-label">{item.label}</span>
              <b>{item.names.join(", ")}</b>
              <span className="winner-pot-amount">{item.amount}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="gradient-text winner-pot">{pot}</p>
      )}
    </>
  );
}
