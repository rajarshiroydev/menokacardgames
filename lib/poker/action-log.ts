/**
 * Reads the game's log lines back into parts for display: which hand and
 * street each belongs to, who acted, what they did and for how much.
 *
 * The log stays plain text (saved games, backups and undo match lines
 * exactly), so this only parses; a line it doesn't recognise is kept whole
 * as a note.
 */

/**
 * The most lines a game's log keeps: a whole session (a long night is about
 * 2,000), with a ceiling so storage and backups stay bounded.
 */
export const LOG_LIMIT = 5000;

export type LogKind =
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "all-in"
  | "win"
  | "split"
  | "buy-in"
  | "cash-out"
  | "take-back"
  | "blinds"
  | "rake"
  | "note";

export type LogEntry = {
  /** The stored line, unchanged. */
  line: string;
  kind: LogKind;
  /** Index into the game's players of who the line is about, if anyone. */
  player: number | null;
  /** The action in a few words: "Raise to", "Wins main pot", "Buys in". */
  verb: string;
  /** The money figure, as formatted in the line ("₹1,300"). */
  amount: string | null;
  /** What's left over: "others folded", "Asha, Dev", "level 3". */
  note: string | null;
  /**
   * A betting action's place in its hand, from 1 for the hand's first; null
   * for everything else, and for a hand whose start fell off the log.
   */
  number: number | null;
};

export type LogStreet = {
  /** "Preflop", "Flop", "Turn", "River", or null for lines with no street. */
  street: string | null;
  entries: LogEntry[];
};

export type LogGroup = {
  /** The hand the lines belong to, or null for lines between hands. */
  hand: number | null;
  /** "Hand 29", "Before hand 30", or null for lines with no hand at all. */
  title: string | null;
  streets: LogStreet[];
};

const STREET_NAMES: Record<string, string> = {
  PREFLOP: "Preflop",
  FLOP: "Flop",
  TURN: "Turn",
  RIVER: "River",
};

const PREFIX =
  /^(?:(Hand|During hand|Before hand) (\d+)(?: (PREFLOP|FLOP|TURN|RIVER))?: )?([\s\S]*)$/;

/** Which player a line starts with, preferring the longest name. */
function findPlayer(text: string, names: readonly string[]) {
  let best: { index: number; length: number } | null = null;
  names.forEach((name, index) => {
    if (
      name &&
      text.startsWith(`${name} `) &&
      (!best || name.length > best.length)
    ) {
      best = { index, length: name.length };
    }
  });
  return best as { index: number; length: number } | null;
}

function capitalise(text: string) {
  return text.replace(/^./, (first) => first.toUpperCase());
}

type Parts = Omit<LogEntry, "line" | "player" | "number">;

const BETTING: ReadonlySet<LogKind> = new Set([
  "fold",
  "check",
  "call",
  "bet",
  "raise",
  "all-in",
]);

/** What a player did, from the words after their name. */
function playerAction(rest: string): Parts | null {
  const rules: Array<[RegExp, (match: RegExpMatchArray) => Parts]> = [
    [/^folds$/, () => ({ kind: "fold", verb: "Folds", amount: null, note: null })],
    [/^checks$/, () => ({ kind: "check", verb: "Checks", amount: null, note: null })],
    [/^calls (\S+)$/, (m) => ({ kind: "call", verb: "Calls", amount: m[1], note: null })],
    [/^bets (\S+)$/, (m) => ({ kind: "bet", verb: "Bets", amount: m[1], note: null })],
    [
      /^raises to (\S+)$/,
      (m) => ({ kind: "raise", verb: "Raises to", amount: m[1], note: null }),
    ],
    [
      /^goes all-in for (\S+?)(?: \(to (\S+)\))?(, short of a full raise)?$/,
      (m) => ({
        kind: "all-in",
        verb: "All in",
        amount: m[1],
        note:
          [m[2] ? `to ${m[2]}` : null, m[3] ? "short of a full raise" : null]
            .filter(Boolean)
            .join(", ") || null,
      }),
    ],
    [
      /^wins (?:(main pot|side pot(?: \d+)?|pot) )?(\S+?)(?: \((others folded)\))?$/,
      (m) => ({
        kind: "win",
        verb: m[1] && m[1] !== "pot" ? `Wins ${m[1]}` : "Wins",
        amount: m[2],
        note: m[3] ?? null,
      }),
    ],
    [
      /^(?:joins and )?buys in(?: again)? for (\S+)$/,
      (m) => ({
        kind: "buy-in",
        verb: rest.startsWith("joins")
          ? "Joins"
          : rest.includes("again")
            ? "Buys in again"
            : "Buys in",
        amount: m[1],
        note: null,
      }),
    ],
    [/^joins for (\S+)$/, (m) => ({ kind: "buy-in", verb: "Joins", amount: m[1], note: null })],
    [
      /^cashes out with (\S+)$/,
      (m) => ({ kind: "cash-out", verb: "Cashes out", amount: m[1], note: null }),
    ],
    [
      /^takes back (a buy-in|\d+ buy-ins) of (\S+) when saving \((.+)\)$/,
      (m) => ({
        kind: "take-back",
        verb: m[1] === "a buy-in" ? "Buy-in taken back" : `${capitalise(m[1])} taken back`,
        amount: m[2],
        note: capitalise(m[3]),
      }),
    ],
    [
      /^returns to the table with (\S+)$/,
      (m) => ({ kind: "buy-in", verb: "Returns", amount: m[1], note: null }),
    ],
  ];
  for (const [pattern, read] of rules) {
    const match = rest.match(pattern);
    if (match) return read(match);
  }
  return null;
}

/** A line about the table rather than one player. */
function tableAction(text: string): Parts {
  const split = text.match(
    /^split (?:(main pot|side pot(?: \d+)?|pot) )?(\S+) between (.+)$/,
  );
  if (split) {
    return {
      kind: "split",
      verb: split[1] && split[1] !== "pot" ? `Split ${split[1]}` : "Split pot",
      amount: split[2],
      note: split[3],
    };
  }
  const blinds = text.match(/^blinds (up|set) to (\S+)(?: \((level \d+)\))?$/);
  if (blinds) {
    return {
      kind: "blinds",
      verb: blinds[1] === "up" ? "Blinds up" : "Blinds set",
      amount: blinds[2],
      note: blinds[3] ? capitalise(blinds[3]) : null,
    };
  }
  const rake = text.match(/^house rake (\S+)$/);
  if (rake) {
    return { kind: "rake", verb: "House rake", amount: rake[1], note: null };
  }
  return { kind: "note", verb: capitalise(text), amount: null, note: null };
}

/**
 * The lines to save with a game. Saved mid-hand, the game keeps only the
 * hands finished before it, so that hand's own lines ("Hand N …", its
 * actions and any blind change at its deal) are left out; buy-ins during it
 * ("During hand N: …") count and stay.
 */
export function linesToSave(lines: readonly string[], unfinishedHand: number | null) {
  const kept =
    unfinishedHand === null
      ? lines
      : lines.filter(
          (line) =>
            !line.startsWith(`Hand ${unfinishedHand} `) &&
            !line.startsWith(`Hand ${unfinishedHand}:`),
        );
  return kept.slice(0, LOG_LIMIT);
}

/** One stored line read into its parts, with the hand and street it names. */
export function parseLogLine(line: string, names: readonly string[]) {
  const [, prefix, number, stage, text] = line.match(PREFIX) ?? [];
  const body = text ?? line;
  const who = findPlayer(body, names);
  const action = who ? playerAction(body.slice(who.length + 1)) : null;
  const entry: LogEntry = action
    ? { line, player: who!.index, number: null, ...action }
    : { line, player: null, number: null, ...tableAction(body) };
  const hand = number && prefix !== "Before hand" ? Number(number) : null;
  return {
    entry,
    hand,
    title: number ? `${prefix === "Before hand" ? "Before hand" : "Hand"} ${number}` : null,
    street: stage ? STREET_NAMES[stage] : null,
  };
}

/**
 * The log (newest first) as groups of consecutive lines from the same hand,
 * each split by street, keeping the newest-first order. Betting actions are
 * numbered within their hand. When the log may have dropped old lines
 * (`complete` false), the oldest hand in it goes unnumbered, since its first
 * actions may be gone.
 */
export function groupLog(
  lines: readonly string[],
  names: readonly string[],
  { complete = true }: { complete?: boolean } = {},
) {
  const parsed = lines.map((line) => parseLogLine(line, names));
  const counts = new Map<number, number>();
  let oldest: number | null = null;
  for (let index = parsed.length - 1; index >= 0; index -= 1) {
    const { entry, hand } = parsed[index];
    if (hand === null || !BETTING.has(entry.kind)) continue;
    oldest ??= hand;
    if (!complete && hand === oldest) continue;
    const number = (counts.get(hand) ?? 0) + 1;
    counts.set(hand, number);
    entry.number = number;
  }
  const groups: LogGroup[] = [];
  parsed.forEach(({ entry, hand, title, street }) => {
    let group = groups.at(-1);
    if (!group || group.title !== title) {
      group = { hand, title, streets: [] };
      groups.push(group);
    }
    let section = group.streets.at(-1);
    if (!section || section.street !== street) {
      section = { street, entries: [] };
      group.streets.push(section);
    }
    section.entries.push(entry);
  });
  return groups;
}
