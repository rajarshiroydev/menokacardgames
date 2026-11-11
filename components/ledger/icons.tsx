/** Drawn rather than typed: the display font's ∞ glyph is too small to read. */
export function InfinityIcon() {
  return (
    <svg
      viewBox="0 0 24 12"
      width="22"
      height="11"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      style={{ display: "block", margin: "0 auto" }}
    >
      <path d="M12 6c-2-3-3.5-4.5-5.5-4.5a4.5 4.5 0 0 0 0 9c2 0 3.5-1.5 5.5-4.5s3.5-4.5 5.5-4.5a4.5 4.5 0 0 1 0 9c-2 0-3.5-1.5-5.5-4.5z" />
    </svg>
  );
}

/** A clockwise arrow round a dot: turns the table view's seats one place. */
export function TurnSeatsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4.5h-4.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** A small chevron, pointing down when closed and up when open. */
export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`chevron-icon ${open ? "open" : ""}`}
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 4.5 6 8l3.5-3.5" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg
      className="pencil-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

/** One line forking into two: split a pot. */
export function SplitIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21v-8M12 13 6 7M12 13l6-6M6 11V7h4M18 11V7h-4" />
    </svg>
  );
}

/** A cross: clear what was typed. */
export function ClearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** A tick: a payment marked as paid. */
export function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/** An arrow leaving a tray: share. */
export function ShareIcon() {
  return (
    <svg
      className="share-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

export function UndoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
      {/* Bottom-heavy, so the bars rest on the label's baseline. */}
      <rect x="6" y="7" width="4" height="12" rx="1" />
      <rect x="14" y="7" width="4" height="12" rx="1" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
      <path d="M8 7.8v10.4a1 1 0 0 0 1.5.86l8.5-5.2a1 1 0 0 0 0-1.72l-8.5-5.2A1 1 0 0 0 8 7.8Z" />
    </svg>
  );
}

/**
 * The action log's marks for rows that aren't about one player, drawn
 * centred on a 24 px grid so they sit square in the log's round badge (typed
 * glyphs sat off centre in the display font).
 */
function LogMark({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
    >
      {children}
    </svg>
  );
}

/** Blinds up: a line rising to the top right. */
export function BlindsUpIcon() {
  return (
    <LogMark>
      <path d="M3 17.5 9 11.5l4 4 8-8" />
      <path d="M15 7.5h6v6" />
    </LogMark>
  );
}

/** Blinds set (changed, not raised): two level sliders. */
export function BlindsSetIcon() {
  return (
    <LogMark>
      <path d="M4 8h2.5M11.5 8H20M4 16h8.5M17.5 16H20" />
      <circle cx="9" cy="8" r="2.5" />
      <circle cx="15" cy="16" r="2.5" />
    </LogMark>
  );
}

/** House rake: a drawn percent sign. */
export function RakeIcon() {
  return (
    <LogMark>
      <path d="M18.5 5.5l-13 13" />
      <circle cx="7" cy="7" r="2.5" />
      <circle cx="17" cy="17" r="2.5" />
    </LogMark>
  );
}

/** Any other note: lines of text. */
export function NoteIcon() {
  return (
    <LogMark>
      <path d="M5 7h14M5 12h14M5 17h9" />
    </LogMark>
  );
}

/** Three rows: the standings as a list. */
export function ListIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

/** A rising line on axes: the standings as a graph. */
export function GraphIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4v16h16" />
      <path d="m7 15 4-4 3 3 5-6" />
    </svg>
  );
}

/** A stack of three chips, for counting a stack by colour. */
export function ChipStackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v4c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
      <path d="M4 10v4c0 1.66 3.58 3 8 3s8-1.34 8-3v-4" />
      <path d="M4 14v4c0 1.66 3.58 3 8 3s8-1.34 8-3v-4" />
    </svg>
  );
}
