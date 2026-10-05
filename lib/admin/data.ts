/**
 * Shapes the admin dashboard reads from the `admin_*` database functions
 * (migration 0018), and pure helpers to read and summarise them. Dates are
 * milliseconds since the epoch, amounts are chips in the host's currency.
 */

import { type ChipUnit, chipsToAmount } from "../poker/money.ts";

export type AdminAccount = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  authName: string | null;
  displayName: string | null;
  userCode: string | null;
  avatar: string;
  currency: string;
  state: "active" | "deletion_requested" | "purging";
  deletionRequestedAt: number | null;
  joinedAt: number;
  lastSignInAt: number | null;
  isAdmin: boolean;
  gamesHosted: number;
  lastGameAt: number | null;
  handsPlayed: number;
  guests: number;
  friends: number;
  gamesPlayedAsFriend: number;
};

export type PlayerKind = "own" | "friend" | "guest";

export type AdminResult = {
  playerId: string;
  name: string;
  avatar: string;
  kind: PlayerKind;
  invested: number;
  endingStack: number;
  net: number;
  rebuys: number;
};

export type AdminGame = {
  recordId: string;
  number: number | null;
  name: string | null;
  hostId: string;
  hostName: string | null;
  hostAvatar: string;
  currency: string;
  playedAt: number;
  endedAt: number;
  hands: number;
  /**
   * The game's chip unit (migration 0020). The dashboard shows amounts in
   * currency units: `inCurrencyUnits` converts a cents game's amounts once,
   * when the data is read.
   */
  chipUnit?: ChipUnit;
  bigBlind: number;
  startingStack: number;
  results: AdminResult[];
};

export type AdminGuest = {
  id: string;
  name: string;
  avatar: string;
  code: string | null;
  hostId: string;
  hostName: string | null;
  hostEmail: string | null;
  currency: string;
  addedAt: number;
  removed: boolean;
  games: number;
  net: number;
  lastPlayedAt: number | null;
};

export type AdminWeek = { start: number; signups: number; games: number };

export type AdminOverview = {
  generatedAt: number;
  accounts: {
    total: number;
    named: number;
    new7d: number;
    new30d: number;
    deletionRequested: number;
  };
  signedIn7d: number;
  activeHosts30d: number;
  players: { guests: number; friends: number; own: number };
  games: {
    total: number;
    last7d: number;
    last30d: number;
    hands: number;
    minutes: number;
  };
  friendships: number;
  pendingRequests: number;
  liveNow: number;
  weeks: AdminWeek[];
};

export type AdminSystem = {
  migrations: Array<{ version: string; appliedAt: number }>;
  purges: Array<{
    accountId: string;
    claimedAt: number;
    attempts: number;
    lastError: string | null;
    lastAttemptAt: number | null;
    completedAt: number | null;
  }>;
  pendingDeletions: Array<{
    accountId: string;
    name: string | null;
    email: string | null;
    state: string;
    requestedAt: number;
    deadline: number;
  }>;
  audit: Array<{
    at: number;
    action: string;
    targetKind: string;
    ownerId: string;
    ownerName: string | null;
  }>;
};

export type AdminAccountDetail = {
  account: AdminAccount;
  players: Array<{
    id: string;
    name: string;
    avatar: string;
    code: string | null;
    kind: PlayerKind;
    linkedAccountId: string | null;
    removed: boolean;
    games: number;
    net: number;
    lastPlayedAt: number | null;
  }>;
  games: AdminGame[];
  friends: Array<{
    accountId: string;
    name: string | null;
    avatar: string;
    since: number;
  }>;
  requests: Array<{
    direction: "sent" | "received";
    otherName: string | null;
    createdAt: number;
  }>;
};

export type AdminData = {
  overview: AdminOverview;
  accounts: AdminAccount[];
  guests: AdminGuest[];
  games: AdminGame[];
  system: AdminSystem;
  detail: AdminAccountDetail | null;
};

export const ADMIN_VIEWS = ["overview", "users", "guests", "games", "system"] as const;
export type AdminView = (typeof ADMIN_VIEWS)[number];

export function parseAdminView(value: unknown): AdminView {
  return ADMIN_VIEWS.includes(value as AdminView) ? (value as AdminView) : "overview";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A user id from the URL, or null when it isn't a well-formed UUID. */
export function parseAccountId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
}

/** The name to show for an account: its chosen name, else the sign-in name or email. */
export function accountLabel(account: Pick<AdminAccount, "displayName" | "authName" | "email">) {
  return account.displayName ?? account.authName ?? account.email ?? "Unnamed";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Just now", "5m ago", "3h ago", "2d ago", "6w ago", or a date for older times. */
export function relativeTime(time: number | null, now: number) {
  if (time === null) return "Never";
  const elapsed = Math.max(0, now - time);
  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 14 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  if (elapsed < 120 * DAY) return `${Math.floor(elapsed / (7 * DAY))}w ago`;
  return formatDate(time);
}

/** "2 Oct 2026". */
export function formatDate(time: number | null) {
  if (time === null) return "—";
  return new Date(time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/** "2 Oct, 21:15" in India time, where the app's games are played. */
export function formatDateTime(time: number | null) {
  if (time === null) return "—";
  return new Date(time).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

/** "2h 05m" or "45m". */
export function formatDuration(milliseconds: number) {
  const minutes = Math.max(0, Math.round(milliseconds / MINUTE));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${String(rest).padStart(2, "0")}m` : `${rest}m`;
}

/** The chips that changed hands in a game: the sum of the winners' gains. */
/** A game with its amounts in currency units, so a cents game's 25 is 0.25. */
export function inCurrencyUnits(game: AdminGame): AdminGame {
  const amount = (chips: number) => chipsToAmount(Number(chips), game.chipUnit);
  return {
    ...game,
    bigBlind: amount(game.bigBlind),
    startingStack: amount(game.startingStack),
    results: game.results.map((result) => ({
      ...result,
      invested: amount(result.invested),
      endingStack: amount(result.endingStack),
      net: amount(result.net),
    })),
  };
}

export function gamePot(game: Pick<AdminGame, "results">) {
  return game.results.reduce((sum, result) => sum + Math.max(0, result.net), 0);
}

/** Percentage change from the previous to the latest of two counts, or null. */
export function trend(previous: number, latest: number) {
  if (previous === 0) return null;
  return Math.round(((latest - previous) / previous) * 100);
}

export type SortDirection = "asc" | "desc";

/**
 * Sorts rows by a key, keeping nulls last whatever the direction, and
 * comparing strings without regard to case.
 */
export function sortRows<T>(
  rows: readonly T[],
  value: (row: T) => string | number | boolean | null,
  direction: SortDirection,
) {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = value(left);
    const b = value(right);
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    if (typeof a === "string" && typeof b === "string") {
      return a.localeCompare(b, undefined, { sensitivity: "base" }) * factor;
    }
    return (Number(a) - Number(b)) * factor;
  });
}

/** True when every word of the query appears in one of the fields. */
export function matchesQuery(query: string, fields: ReadonlyArray<string | null | undefined>) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
}
