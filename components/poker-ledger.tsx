"use client";

import {
  ChangeEvent,
  FormEvent,
  InputHTMLAttributes,
  ReactNode,
  PointerEvent as ReactPointerEvent,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  activeIndexes,
  awardPots,
  cancelCurrentHand,
  bigBlindAtLevel,
  betStops,
  blindStatus,
  formatClock,
  hasBlindClock,
  pauseBlindClock,
  resumeBlindClock,
  sessionBlindHistory,
  buyInPlayer,
  completedHandRecord,
  dealNewHand,
  DEFAULT_BLIND_SCHEDULE,
  editBlindSchedule,
  formatDate,
  formatTime,
  formatPercent,
  describeRakeRules,
  handRake,
  hasSidePots,
  payablePots,
  normalizeRakeRules,
  potLabel,
  resolvePotWinners,
  potsFor,
  isValidRakePercent,
  RAKE_PERCENTS,
  splitShares,
  takeRake,
  applyRaiseRules,
  mayRaise,
  minimumRaise,
  raiseSize,
  undoRaiseRules,
  nextBuyIn,
  nextPlayerToAct,
  pendingIndexes,
  pendingBlindPlan,
  resetRaiseRules,
  isValidSmallBlind,
  smallBlindFor,
  STAGES,
  startingBigBlind,
  playerBuyIns,
  totalBuyIns,
  undoLastHand,
  editRebuyRules,
  cashOutPlayer,
  canJoinGame,
  dealablePlayerCount,
  joinGame,
  MAX_GAME_PLAYERS,
  returnToTable,
  mostRebuysUsed,
  rebuyBlockReason,
  savedPlayerRecord,
  upcomingBigBlinds,
} from "@/lib/poker/game";
import {
  describeMaxRebuys,
  describeRebuyRules,
  isUnusualBuyIn,
  isValidBuyIn,
  MAX_REBUYS,
  normalizeRebuyRules,
} from "@/lib/poker/buy-ins";
import { gameFromSession } from "@/lib/poker/continue-session";
import {
  createLedgerGame,
  isLedgerGame,
  ledgerBuyIn,
  ledgerCashOut,
  ledgerCountGap,
  ledgerJoin,
  ledgerReturn,
  ledgerSeated,
  ledgerSession,
  ledgerTotals,
  ledgerUndoLine,
  undoLedgerStep,
} from "@/lib/poker/ledger";
import {
  GAME_BACKUP_MIN_INTERVAL_MS,
  GAME_BACKUP_QUIET_MS,
  gameBackupId,
  type GameBackupSummary,
} from "@/lib/poker/game-backup";
import {
  bigBlindChoices,
  chipUnitFor,
  DEFAULT_STACK,
  defaultBigBlind,
  fromUnit,
  inUnit,
  smallBlindShare as smallBlindShareOf,
  STACK_PRESETS,
} from "@/lib/poker/stakes";
import {
  type ChipUnit,
  chipsToInput,
  chipCurrency,
  chipScale,
  CURRENCIES,
  currencySymbol,
  DEFAULT_CURRENCY,
  formatChips,
  formatMoney,
  formatSignedChips,
  formatSignedMoney,
  parseChips,
  plainChipsCode,
} from "@/lib/poker/money";
import {
  accountGameStorageKey,
  readDeviceId,
  accountLiveTokenStorageKey,
  LEGACY_GAME_STORAGE_KEY,
  LEGACY_HISTORY_STORAGE_KEY,
  prepareLegacySessionsForAdoption,
  readHandLayout,
  readTableTurn,
  readTurnSound,
  storeHandLayout,
  storeTableTurn,
  type HandLayout,
} from "@/lib/poker/storage";
import { playTurnSound } from "@/lib/turn-sound";
import { useRouter } from "next/navigation";
import qrcode from "qrcode-generator";

import { signOut } from "@/app/auth/sign-in/actions";
import { AvatarArt } from "@/components/avatar-art";
import { AvatarPicker, randomAvatarId } from "@/components/avatar-picker";
import { BrandMark } from "@/components/brand-mark";
import { emptyWhoWinsDraft, HandChecker } from "@/components/hand-checker";
import { NotificationBell } from "@/components/notification-bell";
import { SettingsView } from "@/components/settings-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { AVATARS } from "@/lib/avatars";
import { APP_NAME } from "@/lib/brand";
import {
  type AccountProfile,
  cleanDisplayName,
  formatUserCode,
  MAX_DISPLAY_NAME_LENGTH,
} from "@/lib/accounts/identity-code";
import { DELETION_GRACE_PERIOD_DAYS } from "@/lib/accounts/lifecycle";
import {
  hostedGameName,
  type GroupGame,
  type GroupStandingRow,
  type GroupStandings,
} from "@/lib/friends/group-standings";
import { INVITE_EXPIRY_DAYS, inviteMessage, invitePath } from "@/lib/friends/invites";
import { linkableFriends } from "@/lib/friends/link-guest";
import {
  parseCodeInput,
  type FoundAccount,
  type FriendOverview,
} from "@/lib/friends/requests";
import { authClient } from "@/lib/auth/client";
import { apiErrorMessage } from "@/lib/security/rate-limit-message";
import {
  RECENT_SIGN_IN_REQUIRED,
  RECENT_SIGN_IN_WINDOW_MS,
} from "@/lib/auth/recent-sign-in";
import {
  buildStandings,
  isNewPlayer,
  NEW_PLAYER_MAX_SESSIONS,
  sessionReturn,
  standingsKey,
  filterNewPlayers,
  type IneligibleReason,
  type Standings,
} from "@/lib/poker/standings";
import { chartAxis, settledValues } from "@/lib/poker/chart-axis";
import type { ProfileSummary } from "@/lib/profile/stats";
import {
  buildLiveSnapshot,
  LIVE_VIEW_HEARTBEAT_MS,
} from "@/lib/poker/live-view";
import {
  planImport,
  sessionsInBackup,
  type ImportPlan,
  type ImportPlayerMapping,
} from "@/lib/poker/import-plan";
import { deriveSessionAccounting } from "@/lib/poker/accounting";
import { playerNameKey } from "@/lib/poker/player-validation";
import {
  HOUSE_NAME,
  MAX_CHIP_VALUE_CENTS,
  normalizeChipValue,
  sessionMoney,
  settleSession,
  type Settlement,
} from "@/lib/poker/settle-up";
import type {
  BlindSchedule,
  ChipValue,
  GameState,
  Player,
  PlayerAction,
  PlayerProfile,
  PokerSession,
  RakeRules,
  RebuyRules,
  WinnerAnnouncement,
} from "@/lib/poker/types";

/** The signed-in host's currency, for every amount the ledger shows. */
const CurrencyContext = createContext<string>(DEFAULT_CURRENCY);

/**
 * What the amounts below mean: a game's or saved game's own chip unit, so a
 * cents game's 25 shows as 0.25. Totals across games (standings, profile)
 * are already in currency units and use the default, "whole".
 */
const ChipUnitContext = createContext<ChipUnit>("whole");

/**
 * The avatar a player in the host's list shows as, by player id or, for games
 * saved without ids, by name. Undefined means the drawing falls back to a
 * stable pick from the name.
 */
type AvatarLookup = (playerId?: string, name?: string) => string | undefined;
const AvatarContext = createContext<AvatarLookup>(() => undefined);

function buildAvatarLookup(
  players: PlayerProfile[],
  selfPlayerId: string | null,
  selfAvatar: string,
): AvatarLookup {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const player of players) {
    if (!player.avatar) continue;
    byId.set(player.id, player.avatar);
    byName.set(player.name.trim().toLowerCase(), player.avatar);
  }
  // Your own choice shows at once, before the list reloads.
  if (selfPlayerId) byId.set(selfPlayerId, selfAvatar);
  return (playerId, name) =>
    (playerId && byId.get(playerId)) ||
    (name ? byName.get(name.trim().toLowerCase()) : undefined);
}

/**
 * A game's amounts: its chip unit, and plain chip counts instead of money
 * when its chips have a value (they aren't a unit of the currency then).
 */
function GameAmounts({
  game,
  children,
}: {
  game: Pick<GameState, "chipUnit" | "chipValue">;
  children: ReactNode;
}) {
  const currency = useContext(CurrencyContext);
  return (
    <CurrencyContext.Provider value={chipCurrency(currency, game.chipValue) ?? currency}>
      <ChipUnitContext.Provider value={game.chipUnit ?? "whole"}>
        {children}
      </ChipUnitContext.Provider>
    </CurrencyContext.Provider>
  );
}

function useMoney() {
  const currency = useContext(CurrencyContext);
  const unit = useContext(ChipUnitContext);
  return useMemo(
    () => ({
      currency,
      unit,
      symbol: currencySymbol(currency),
      money: (value: number) => formatChips(value, unit, currency),
      signedMoney: (value: number) => formatSignedChips(value, unit, currency),
    }),
    [currency, unit],
  );
}

/**
 * An amount box in the current chip unit: it shows 0.25 for 25 cents and
 * reports stored chips. Text that isn't an amount (empty, or too many
 * decimals) reports 0, which the forms already refuse.
 */
function ChipInput({
  value,
  onChange,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  value: number | null;
  onChange: (chips: number) => void;
}) {
  const unit = useContext(ChipUnitContext);
  const shown = value === null ? "" : chipsToInput(value, unit);
  const [text, setText] = useState(shown);
  // Follow changes made elsewhere (a preset, a unit switch) without
  // rewriting what is being typed, such as "0." on the way to "0.5".
  if (value !== null && (parseChips(text, unit) ?? 0) !== value) {
    setText(shown);
  }
  return (
    <input
      {...props}
      type="text"
      inputMode={unit === "cents" ? "decimal" : "numeric"}
      autoComplete="off"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(parseChips(event.target.value, unit) ?? 0);
      }}
    />
  );
}

/**
 * A money amount in the host's currency, such as what a buy-in costs. It
 * reports hundredths, whatever the game's chip unit is.
 */
function PriceInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (cents: number) => void;
}) {
  const currency = useContext(CurrencyContext);
  return (
    <div className="money-field">
      <span aria-hidden="true">{currencySymbol(currency).trim()}</span>
      <ChipUnitContext.Provider value="cents">
        <ChipInput
          className="field"
          id={id}
          aria-label={label}
          placeholder="0"
          value={value}
          onChange={onChange}
        />
      </ChipUnitContext.Provider>
    </div>
  );
}

/** "₹500", from hundredths of the currency. */
function formatCents(cents: number, currency: string) {
  return formatMoney(cents / 100, currency);
}

/** What one chip costs: "1 chip = ₹0.05", to four decimals at most. */
function describePerChip(
  value: ChipValue,
  unit: ChipUnit | undefined,
  currency: string,
) {
  const perChip = (value.cents * chipScale(unit)) / value.chips / 100;
  return `1 chip = ${formatMoney(perChip, currency, 4)}`;
}

/** A chip value as the host set it: "10,000 chips = ₹500". */
function describeChipValue(
  value: ChipValue,
  unit: ChipUnit | undefined,
  currency: string,
) {
  const chipsShown = formatChips(value.chips, unit, plainChipsCode(currency));
  return `${chipsShown} chip${value.chips === chipScale(unit) ? "" : "s"} = ${formatCents(value.cents, currency)}`;
}

type View =
  | "home"
  | "newGame"
  | "setup"
  | "game"
  | "history"
  | "sessions"
  | "profile"
  | "settings"
  | "hands"
  | "whoWins";
const VIEWS: readonly View[] = [
  "home",
  "newGame",
  "setup",
  "game",
  "history",
  "sessions",
  "profile",
  "settings",
  "hands",
  "whoWins",
];

/**
 * Screens that show the player list or its count. It is reloaded when one
 * opens, because a friend accepting a request on their phone adds or links a
 * player here.
 */
function showsPlayerList(view: View) {
  return (
    view === "home" || view === "profile" || view === "setup" || view === "whoWins"
  );
}

type ModalState =
  | {
      kind: "confirm";
      message: string;
      /** Shown as a list under the message, for confirmations with several facts. */
      points?: string[];
      confirmLabel: string;
      /** Dismiss button text; defaults to "Cancel". */
      dismissLabel?: string;
      /** A notice with a single button, nothing to cancel. */
      hideDismiss?: boolean;
      danger?: boolean;
      onConfirm: () => void;
      /** A link under the message for another way to go on, such as a different amount. */
      alternative?: { label: string; onChoose: () => void };
    }
  | {
      kind: "recent-sign-in";
      purpose: string;
      email: string;
      confirmLabel: string;
      onConfirm: () => void;
    };

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

function needsRecentSignIn(error: unknown) {
  return error instanceof ApiError && error.code === RECENT_SIGN_IN_REQUIRED;
}

async function sessionsApi<T>(
  path = "",
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/sessions${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      apiErrorMessage(response.status, data.error, "Could not reach the ledger"),
      response.status,
      data.code,
    );
  }
  return data;
}

/** Reads the signed-in person's profile, or runs a profile action. */
async function accountApi<T>(body?: object): Promise<T> {
  const response = await fetch(
    "/api/account",
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = (await response.json().catch(() => ({}))) as T & {
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      apiErrorMessage(response.status, data.error, "Could not reach your account"),
      response.status,
      data.code,
    );
  }
  return data;
}

/** Reads the friends overview, or runs a friend action (`/api/friends`). */
async function friendsApi<T>(body?: object): Promise<T> {
  const response = await fetch(
    "/api/friends",
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = (await response.json().catch(() => ({}))) as T & {
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      apiErrorMessage(response.status, data.error, "Could not reach your friends"),
      response.status,
      data.code,
    );
  }
  return data;
}

/** Starts, updates or stops the live standings link (`/api/live`). */
/** Backups of the game in progress (app/api/game-backups). */
async function gameBackupApi<T>(
  method: "GET" | "PUT" | "POST" | "DELETE",
  options: { query?: Record<string, string>; body?: object } = {},
): Promise<T> {
  const query = options.query
    ? `?${new URLSearchParams(options.query).toString()}`
    : "";
  const response = await fetch(`/api/game-backups${query}`, {
    method,
    ...(options.body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.body),
        }
      : {}),
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      apiErrorMessage(response.status, data.error, "Could not reach the backup"),
      response.status,
      data.code,
    );
  }
  return data;
}

async function liveApi<T>(
  method: "POST" | "PUT" | "DELETE",
  body?: object,
): Promise<T> {
  const response = await fetch("/api/live", {
    method,
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      apiErrorMessage(
        response.status,
        data.error,
        "Could not reach live standings",
      ),
      response.status,
      data.code,
    );
  }
  return data;
}

function readStoredLiveToken(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

async function playersApi<T>(
  path = "",
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/players${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      apiErrorMessage(
        response.status,
        data.error,
        "Could not reach the player list",
      ),
      response.status,
      data.code,
    );
  }
  return data;
}

function readStoredGame(storageKey: string) {
  try {
    return normalizeGameState(
      JSON.parse(window.localStorage.getItem(storageKey) || "null"),
    );
  } catch {
    return null;
  }
}

/**
 * A game kept on a device or restored from a backup, brought up to date with
 * fields older versions didn't have. Null when it isn't a game.
 */
function normalizeGameState(input: unknown): GameState | null {
  try {
    const data = input as GameState | null;
    if (!data?.players) return null;
    // Games saved before escalating blinds kept one fixed big blind.
    data.baseAnte ??= data.ante;
    data.blinds ??= null;
    data.blindLevel ??= 0;
    data.blindPlans ??= [{
      effectiveHand: 1,
      effectiveAt: data.startedAt,
      baseBigBlind: data.baseAnte,
      schedule: data.blinds,
    }];
    data.blindLevels ??= [
      {
        handNo: 1,
        dealtAt: data.startedAt,
        bigBlind: data.baseAnte,
      },
      ...(data.handNo > 1 && data.ante !== data.baseAnte
        ? [{ handNo: data.handNo, dealtAt: Date.now(), bigBlind: data.ante }]
        : []),
    ];
    data.players.forEach((player) => {
      player.buyIns ??= [data.startStack];
    });
    if (data.chipValue !== undefined && !normalizeChipValue(data.chipValue)) {
      delete data.chipValue;
    }
    if (data.lastHand) {
      data.lastHand.buyInsBefore ??= data.players.map((player) => [
        ...(player.buyIns ?? [data.startStack]),
      ]);
    }
    // Older saved games did not have positional betting. Start their next hand
    // with the new model instead of leaving an unusable in-progress hand.
    if (!Number.isInteger(data.dealerIndex)) {
      data.players.forEach((player, index) => {
        player.stack = data.hand?.stacksBeforeHand[index] ?? player.stack;
      });
      data.dealerIndex = -1;
      data.hand = null;
      data.winnerAnnouncement = null;
      dealNewHand(data);
    }
    return data;
  } catch {
    return null;
  }
}

function readStoredHistory(storageKey: string) {
  try {
    const data = JSON.parse(
      window.localStorage.getItem(storageKey) || "[]",
    ) as PokerSession[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function describeBlindSchedule(
  schedule: BlindSchedule | null,
  currency: string,
  unit: ChipUnit | undefined,
) {
  if (!schedule) return "Fixed blinds";
  const interval = `${schedule.every} ${schedule.unit === "hands"
    ? schedule.every === 1 ? "hand" : "hands"
    : schedule.every === 1 ? "minute" : "minutes"}`;
  return schedule.raiseType === "add"
    ? `Add ${formatChips(schedule.raiseBy, unit, currency)} to the big blind every ${interval}`
    : `Multiply the big blind by ${schedule.raiseBy} every ${interval}`;
}

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

function recordAction(
  game: GameState,
  playerIndex: number,
  action: Omit<PlayerAction, "line">,
  text: string,
) {
  const hand = game.hand;
  if (!hand) return;
  const line = `Hand ${hand.no} ${STAGES[hand.stage]}: ${text}`;
  hand.last[playerIndex] = { ...action, line };
  game.log.unshift(line);
  game.log = game.log.slice(0, 80);
}

function recordWin(game: GameState, line: string) {
  game.log.unshift(line);
  game.log = game.log.slice(0, 80);
}

function awardPot(game: GameState, playerIndex: number, automatic = false) {
  const hand = game.hand;
  if (!hand) return;
  const record = completedHandRecord(game);
  const pot = hand.pot - takeRake(game);
  game.players[playerIndex].stack += pot;
  recordWin(
    game,
    `Hand ${hand.no}: ${game.players[playerIndex].name} wins ${formatChips(
      pot,
      game.chipUnit,
      chipCurrency(game.currency, game.chipValue),
    )}${automatic ? " (others folded)" : ""}`,
  );
  game.lastHand = record;
  game.winnerAnnouncement = {
    names: [game.players[playerIndex].name],
    pot,
    handNo: hand.no,
    split: false,
  };
  game.hand = null;
}

export function PokerLedger({
  accountId,
  accountEmail,
  initialProfile,
}: {
  accountId: string;
  accountEmail: string;
  initialProfile: AccountProfile;
}) {
  const router = useRouter();
  // The page read the profile while rendering, so the user code shows without
  // another request; profile actions keep it current from here.
  const [profile, setProfile] = useState(initialProfile);
  const currency = profile.currency;
  const gameStorageKey = accountGameStorageKey(accountId);
  const liveTokenStorageKey = accountLiveTokenStorageKey(accountId);
  const [game, setGame] = useState<GameState | null>(null);
  // Messages about the game in progress, in its own chip unit.
  const money = (value: number) =>
    formatChips(value, game?.chipUnit, chipCurrency(currency, game?.chipValue));
  const [history, setHistory] = useState<PokerSession[]>([]);
  const [discardedSessions, setDiscardedSessions] = useState<PokerSession[]>(
    [],
  );
  const [nextSessionNumber, setNextSessionNumber] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  /** The Ranks header while a friend's group is shown instead of your own games. */
  const [discardedPlayers, setDiscardedPlayers] = useState<PlayerProfile[]>(
    [],
  );
  const [playersLoading, setPlayersLoading] = useState(true);
  const [playersError, setPlayersError] = useState("");
  /** Friend requests waiting for an answer, for Home's notice and the tab dot. */
  const [friendRequests, setFriendRequests] = useState<
    FriendOverview["received"]
  >([]);
  // Profile and Ranks data is kept here, not in those screens, so returning
  // to a tab shows the last answer at once while a quiet refresh runs.
  const [friendOverview, setFriendOverview] = useState<FriendOverview | null>(
    null,
  );
  const [friendOverviewError, setFriendOverviewError] = useState("");
  const [profileStats, setProfileStats] = useState<ProfileSummary | null>(null);
  const [profileStatsError, setProfileStatsError] = useState("");
  const [groups, setGroups] = useState<GroupStandings[]>([]);
  const [groupsError, setGroupsError] = useState("");
  const playersRef = useRef(players);
  useEffect(() => {
    playersRef.current = players;
  });
  const [view, setView] = useState<View>("home");
  // Held here, not in Who Wins?, so the cards outlast a visit to another screen.
  const [whoWinsDraft, setWhoWinsDraft] = useState(emptyWhoWinsDraft);
  /** The standings card "View standings" opens; cleared when Ranks closes. */
  const [rankFocus, setRankFocus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);
  // The saved game whose Settle up sheet is open, by ID.
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [editingBlinds, setEditingBlinds] = useState(false);
  const [editingRebuys, setEditingRebuys] = useState(false);
  const [tableSheet, setTableSheet] = useState<"add" | "cash-out" | null>(null);
  // Which setup Table Setup shows: Home has a button for each kind of game.
  const [setupKind, setSetupKind] = useState<"hands" | "ledger">("hands");
  // The busted player whose own buy-in amount is being typed.
  const [buyingIn, setBuyingIn] = useState<number | null>(null);
  const [legacyGame, setLegacyGame] = useState<GameState | null>(null);
  const [legacySessions, setLegacySessions] = useState<PokerSession[]>([]);
  const [reviewingLegacySessions, setReviewingLegacySessions] =
    useState(false);
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [liveToken, setLiveToken] = useState<string | null>(null);
  const [sharingLive, setSharingLive] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveFailing, setLiveFailing] = useState(false);
  const [handLayout, setHandLayout] = useState<HandLayout>("list");
  // The last action taken, so its seat can flash what it did.
  const [lastTurn, setLastTurn] = useState<LastTurn | null>(null);
  const liveSync = useRef({ lastSent: 0, failures: 0 });
  // Backups of the game in progress, so it can be restored on another device.
  const [gameBackups, setGameBackups] = useState<GameBackupSummary[]>([]);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const backupSync = useRef<{ lastSent: number; pending: Promise<void> }>({
    lastSent: 0,
    pending: Promise.resolve(),
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  /**
   * Reloads the player list. A quiet refresh keeps the current list on screen
   * and ignores failures, for when a screen opens and a friend may have linked
   * a player from another device since the list was loaded.
   */
  const refreshPlayers = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      if (!quiet) {
        setPlayersLoading(true);
        setPlayersError("");
      }
      try {
        const data = await playersApi<{
          discardedPlayers?: PlayerProfile[];
          players?: PlayerProfile[];
        }>();
        setPlayers(Array.isArray(data.players) ? data.players : []);
        setDiscardedPlayers(
          Array.isArray(data.discardedPlayers) ? data.discardedPlayers : [],
        );
        setPlayersError("");
      } catch (error) {
        if (!quiet) {
          setPlayersError(
            error instanceof Error ? error.message : "Could not load players",
          );
        }
      } finally {
        if (!quiet) setPlayersLoading(false);
      }
    },
    [],
  );

  /**
   * Reloads friends, requests and links. A failure keeps the last answer and
   * is only shown when there is none yet.
   */
  const refreshFriends = useCallback(async () => {
    try {
      const data = await friendsApi<{ overview: FriendOverview }>();
      setFriendOverview(data.overview);
      setFriendOverviewError("");
      setFriendRequests(data.overview.received);
      // A friend who accepted on their phone linked a player the list
      // loaded here doesn't have yet.
      const known = new Set(playersRef.current.map((p) => p.id));
      if (
        data.overview.friends.some(
          (friend) => friend.myPlayer && !known.has(friend.myPlayer.id),
        )
      ) {
        void refreshPlayers({ quiet: true });
      }
    } catch (error) {
      setFriendOverviewError(
        error instanceof Error ? error.message : "Could not load your friends",
      );
    }
  }, [refreshPlayers]);

  /** Reloads the Profile card's stats; a failure keeps the last answer. */
  const refreshProfileStats = useCallback(async () => {
    try {
      setProfileStats(await profileStatsApi());
      setProfileStatsError("");
    } catch (error) {
      setProfileStatsError(
        error instanceof Error ? error.message : "Could not load your stats",
      );
    }
  }, []);

  /** Reloads friends' groups for Ranks; a failure keeps the last answer. */
  const refreshGroups = useCallback(async () => {
    try {
      const response = await fetch("/api/groups");
      const data = (await response.json().catch(() => ({}))) as {
        groups?: GroupStandings[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(response.status, data.error, "Could not load your groups"),
        );
      }
      setGroups(data.groups ?? []);
      setGroupsError("");
    } catch (error) {
      setGroupsError(
        error instanceof Error ? error.message : "Could not load your groups",
      );
    }
  }, []);

  /** Quietly refreshes what the screen being opened shows. */
  /** Unfinished games backed up from any device, for Home. */
  const refreshGameBackups = useCallback(async () => {
    try {
      const data = await gameBackupApi<{ backups?: GameBackupSummary[] }>(
        "GET",
        { query: { deviceId: readDeviceId() } },
      );
      setGameBackups(Array.isArray(data.backups) ? data.backups : []);
    } catch {
      // Home simply doesn't offer a restore until the next check.
    }
  }, []);

  const refreshForView = useCallback(
    (nextView: View) => {
      if (nextView === "home") void refreshGameBackups();
      if (showsPlayerList(nextView)) void refreshPlayers({ quiet: true });
      if (nextView === "home" || nextView === "profile") void refreshFriends();
      if (nextView === "profile") void refreshProfileStats();
      if (nextView === "history" || nextView === "sessions") void refreshGroups();
    },
    [
      refreshFriends,
      refreshGameBackups,
      refreshGroups,
      refreshPlayers,
      refreshProfileStats,
    ],
  );

  const navigate = useCallback(
    (
      nextView: View,
      options: { replace?: boolean; setupKind?: "hands" | "ledger" } = {},
    ) => {
      setView(nextView);
      if (nextView !== "history") setRankFocus(null);
      if (options.setupKind) setSetupKind(options.setupKind);
      refreshForView(nextView);
      // The setup kind rides in the history entry, so back and forward
      // reopen the setup that was chosen there.
      const state = {
        ...window.history.state,
        appView: nextView,
        setupKind: options.setupKind,
      };
      if (options.replace) {
        window.history.replaceState(state, "");
      } else {
        window.history.pushState(state, "");
      }
      window.scrollTo(0, 0);
    },
    [refreshForView],
  );

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const data = await sessionsApi<{
        discardedSessions?: PokerSession[];
        nextSessionNumber?: number;
        sessions?: PokerSession[];
      }>();
      setHistory(Array.isArray(data.sessions) ? data.sessions : []);
      setDiscardedSessions(
        Array.isArray(data.discardedSessions) ? data.discardedSessions : [],
      );
      setNextSessionNumber(
        Number.isSafeInteger(data.nextSessionNumber) &&
          Number(data.nextSessionNumber) > 0
          ? Number(data.nextSessionNumber)
          : 1,
      );
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Could not load the shared ledger",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);


  useEffect(() => {
    const hydrationTimer = setTimeout(() => {
      const storedGame = readStoredGame(gameStorageKey);
      setGame(storedGame);
      setLiveToken(readStoredLiveToken(liveTokenStorageKey));
      setLegacyGame(readStoredGame(LEGACY_GAME_STORAGE_KEY));
      setLegacySessions(readStoredHistory(LEGACY_HISTORY_STORAGE_KEY));
      setHandLayout(readHandLayout());
      // Back from an info page opened in Settings reloads the app on the
      // Settings entry, so it reopens there; every other start opens Home.
      if (window.history.state?.appView === "settings") {
        setView("settings");
      } else {
        window.history.replaceState(
          { ...window.history.state, appView: "home" },
          "",
        );
      }
      if (storedGame && window.history.state?.appView !== "settings") {
        window.history.pushState(
          { ...window.history.state, appView: "game" },
          "",
        );
        setView("game");
      }
      setReady(true);
      void refreshGameBackups();
      void refreshHistory();
      void refreshPlayers();
      void refreshFriends();
      void refreshGroups();
    }, 0);
    return () => {
      clearTimeout(hydrationTimer);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [
    gameStorageKey,
    liveTokenStorageKey,
    refreshFriends,
    refreshGameBackups,
    refreshGroups,
    refreshHistory,
    refreshPlayers,
  ]);

  // Stats follow the currency and your own player, and load at start.
  useEffect(() => {
    const timer = setTimeout(() => void refreshProfileStats(), 0);
    return () => clearTimeout(timer);
  }, [profile.currency, profile.selfPlayerId, refreshProfileStats]);

  useEffect(() => {
    function handleBrowserBack(event: PopStateEvent) {
      const nextView = event.state?.appView;
      setModal(null);
      const view = VIEWS.includes(nextView) ? nextView : "home";
      const kind = event.state?.setupKind;
      if (view === "setup" && (kind === "hands" || kind === "ledger")) {
        setSetupKind(kind);
      }
      setView(view);
      refreshForView(view);
      window.scrollTo(0, 0);
    }

    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
  }, [refreshForView]);

  useEffect(() => {
    if (!ready) return;
    if (game) {
      window.localStorage.setItem(gameStorageKey, JSON.stringify(game));
    } else {
      window.localStorage.removeItem(gameStorageKey);
    }
  }, [game, gameStorageKey, ready]);

  const rememberLiveToken = useCallback(
    (token: string | null) => {
      setLiveToken(token);
      setLiveFailing(false);
      liveSync.current.failures = 0;
      try {
        if (token) window.localStorage.setItem(liveTokenStorageKey, token);
        else window.localStorage.removeItem(liveTokenStorageKey);
      } catch {
        // Blocked storage: sharing still works until the page reloads.
      }
    },
    [liveTokenStorageKey],
  );

  const avatarLookup = useMemo(
    () =>
      buildAvatarLookup(
        [...players, ...discardedPlayers],
        profile.selfPlayerId,
        profile.avatar,
      ),
    [discardedPlayers, players, profile.avatar, profile.selfPlayerId],
  );
  // The live link shows the same avatars; read through a ref so a new list
  // doesn't restart the update timer.
  const avatarOfSeat = useRef<(player: GameState["players"][number]) => string | undefined>(
    () => undefined,
  );
  useEffect(() => {
    avatarOfSeat.current = (player) => avatarLookup(player.id, player.name);
  }, [avatarLookup]);

  const sendLiveSnapshot = useCallback(
    async (current: GameState) => {
      liveSync.current.lastSent = Date.now();
      try {
        await liveApi("PUT", {
          snapshot: buildLiveSnapshot(current, avatarOfSeat.current),
        });
        liveSync.current.failures = 0;
        setLiveFailing(false);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          // Sharing was stopped elsewhere, for example on another device.
          rememberLiveToken(null);
          return;
        }
        liveSync.current.failures += 1;
        if (liveSync.current.failures >= 2) setLiveFailing(true);
      }
    },
    [rememberLiveToken],
  );

  // Sends the standings to the live link after the game changes. Waits for a
  // second of quiet and at least three seconds between updates, so a burst of
  // actions is one request and stays well inside the API write limit. While
  // nothing changes, a heartbeat each minute tells players the host is online.
  useEffect(() => {
    if (!ready || !liveToken || !game) return;
    const wait = Math.max(
      1000,
      liveSync.current.lastSent + 3000 - Date.now(),
    );
    const timer = setTimeout(() => void sendLiveSnapshot(game), wait);
    const heartbeat = setInterval(() => {
      if (Date.now() - liveSync.current.lastSent >= LIVE_VIEW_HEARTBEAT_MS) {
        void sendLiveSnapshot(game);
      }
    }, 15_000);
    return () => {
      clearTimeout(timer);
      clearInterval(heartbeat);
    };
  }, [game, liveToken, ready, sendLiveSnapshot]);

  /**
   * Another device restored this game and took it over, so this one closes
   * its copy. The live link is left alone: it belongs to the account, and
   * the other device may be sharing it now.
   */
  const handOverGame = useCallback(
    (moved: GameState) => {
      const movedId = gameBackupId(moved);
      setGame((current) =>
        current && gameBackupId(current) === movedId ? null : current,
      );
      rememberLiveToken(null);
      setSharingLive(false);
      navigate("home", { replace: true });
      setModal({
        kind: "confirm",
        message: `${moved.sessionLabel || "This game"} moved to another device. It was restored there, so it's closed here.`,
        confirmLabel: "OK",
        hideDismiss: true,
        onConfirm: () => {},
      });
    },
    [navigate, rememberLiveToken],
  );

  const sendGameBackup = useCallback(
    (current: GameState) => {
      backupSync.current.lastSent = Date.now();
      const sending = gameBackupApi("PUT", {
        body: {
          gameId: gameBackupId(current),
          deviceId: readDeviceId(),
          state: current,
        },
      }).then(
        () => undefined,
        (error) => {
          if (error instanceof ApiError && error.code === "moved") {
            handOverGame(current);
          }
          // Anything else (offline, already saved) waits for the next change.
        },
      );
      backupSync.current.pending = sending;
      return sending;
    },
    [handOverGame],
  );

  // Backs the game up after it changes: two seconds after the last change and
  // at most every ten seconds, so with the live link's updates a host stays
  // well inside the API write limit. Opening the app or coming back to it
  // sends one too, which is also how a phone learns the game moved.
  useEffect(() => {
    if (!ready || !game) return;
    const wait = Math.max(
      GAME_BACKUP_QUIET_MS,
      backupSync.current.lastSent + GAME_BACKUP_MIN_INTERVAL_MS - Date.now(),
    );
    const timer = setTimeout(() => void sendGameBackup(game), wait);
    function backOnScreen() {
      if (
        document.visibilityState === "visible" &&
        game &&
        Date.now() - backupSync.current.lastSent >= GAME_BACKUP_MIN_INTERVAL_MS
      ) {
        void sendGameBackup(game);
      }
    }
    document.addEventListener("visibilitychange", backOnScreen);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", backOnScreen);
    };
  }, [game, ready, sendGameBackup]);

  /** A discarded or closed game's backup goes, after any update in flight. */
  function forgetGameBackup(current: GameState) {
    const gameId = gameBackupId(current);
    void backupSync.current.pending.then(() =>
      gameBackupApi("DELETE", {
        query: { gameId, deviceId: readDeviceId() },
      }).catch(() => {
        // It expires after 7 days; Home offers it until then.
      }),
    );
  }

  async function restoreGameBackup(backup: GameBackupSummary) {
    if (restoringBackup) return;
    if (game) {
      showToast("Finish or discard the game in progress first");
      return;
    }
    setRestoringBackup(true);
    try {
      const data = await gameBackupApi<{ state?: unknown }>("POST", {
        body: { gameId: backup.gameId, deviceId: readDeviceId() },
      });
      const restored = normalizeGameState(data.state);
      if (!restored) throw new Error("This unfinished game can't be opened");
      backupSync.current.lastSent = Date.now();
      setGameBackups((current) =>
        current.filter((item) => item.gameId !== backup.gameId),
      );
      setGame(restored);
      navigate("game");
      showToast(`${backup.name} restored`);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not restore the game",
      );
      void refreshGameBackups();
    } finally {
      setRestoringBackup(false);
    }
  }

  function deleteGameBackup(backup: GameBackupSummary) {
    ask(
      `Delete the unfinished ${backup.name}? It can't be restored after this.`,
      "Delete",
      () => {
        setGameBackups((current) =>
          current.filter((item) => item.gameId !== backup.gameId),
        );
        gameBackupApi("DELETE", { query: { gameId: backup.gameId } })
          .then(() => showToast(`${backup.name} deleted`))
          .catch((error) => {
            showToast(
              error instanceof Error ? error.message : "Could not delete it",
            );
            void refreshGameBackups();
          });
      },
    );
  }

  /** Saving or discarding the game ends its live link. */
  function endLiveSharing() {
    if (!liveToken) return;
    rememberLiveToken(null);
    setSharingLive(false);
    liveApi("DELETE").catch(() => {
      // The link still expires 12 hours after its last update.
    });
  }

  async function startLiveSharing() {
    if (!game || liveBusy) return;
    setLiveBusy(true);
    try {
      const data = await liveApi<{ token: string }>("POST", {
        snapshot: buildLiveSnapshot(game, avatarOfSeat.current),
      });
      liveSync.current.lastSent = Date.now();
      rememberLiveToken(data.token);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not start sharing",
      );
    } finally {
      setLiveBusy(false);
    }
  }

  async function stopLiveSharing() {
    if (liveBusy) return;
    setLiveBusy(true);
    try {
      await liveApi("DELETE");
      rememberLiveToken(null);
      setSharingLive(false);
      showToast("Stopped sharing live standings");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not stop sharing",
      );
    } finally {
      setLiveBusy(false);
    }
  }

  const ask = useCallback(
    (message: string, confirmLabel: string, onConfirm: () => void) => {
      setModal({ kind: "confirm", message, confirmLabel, onConfirm });
    },
    [],
  );

  function offerLegacyGameAdoption() {
    if (!legacyGame || game) return;
    const playerNames = legacyGame.players
      .map((player) => player.name)
      .join(", ");
    ask(
      `Adopt ${legacyGame.gameName || "this unfinished game"} with ${playerNames} into this account? It will then be available only to this signed-in account on this device.`,
      "Adopt Game",
      () => {
        window.localStorage.setItem(
          gameStorageKey,
          JSON.stringify(legacyGame),
        );
        window.localStorage.removeItem(LEGACY_GAME_STORAGE_KEY);
        setGame(legacyGame);
        setLegacyGame(null);
        navigate("game");
        showToast("Game adopted into this account");
      },
    );
  }

  async function adoptLegacySessions(selectedIds: Set<string>) {
    const selected = prepareLegacySessionsForAdoption(
      legacySessions,
      selectedIds,
    );
    if (!selected.length) return;

    try {
      const result = await sessionsApi<{ saved?: number }>("", {
        method: "POST",
        body: JSON.stringify({ sessions: selected }),
      });
      const remaining = legacySessions.filter(
        (session) => !selectedIds.has(session.id),
      );
      if (remaining.length) {
        window.localStorage.setItem(
          LEGACY_HISTORY_STORAGE_KEY,
          JSON.stringify(remaining),
        );
      } else {
        window.localStorage.removeItem(LEGACY_HISTORY_STORAGE_KEY);
      }
      setLegacySessions(remaining);
      setReviewingLegacySessions(false);
      await Promise.all([refreshHistory(), refreshPlayers()]);
      showToast(
        result.saved
          ? `Adopted ${result.saved} session${result.saved === 1 ? "" : "s"}`
          : "Selected sessions were already in this account",
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Sessions were not adopted",
      );
    }
  }

  const startGame = useCallback(
    (input: {
      kind: "hands" | "ledger";
      name: string;
      /** "cents" when every amount below is in hundredths. */
      chipUnit: ChipUnit;
      stack: number;
      ante: number;
      /** An odd small blind; null keeps the usual half. */
      smallBlind: number | null;
      blinds: BlindSchedule | null;
      /** Rebuy limits; null or both limits off means none. */
      rebuyRules: RebuyRules | null;
      bigBlindAnte: boolean;
      /** The house's cut; null is no rake. */
      rakeRules: RakeRules | null;
      /** What the chips cost; null is a chip per unit of the currency. */
      chipValue: ChipValue | null;
      players: PlayerProfile[];
      /**
       * Each player's own first buy-in, in seat order, when players choose
       * their amounts; null is the starting stack for everyone.
       */
      buyIns: number[] | null;
      /** Draw the first dealer now; otherwise seat 1 deals first. */
      randomDealer: boolean;
    }) => {
      if (input.kind === "ledger") {
        const ledgerGame = createLedgerGame({
          gameName: input.name,
          sessionLabel: `Game ${nextSessionNumber}`,
          currency,
          chipUnit: input.chipUnit,
          chipValue: normalizeChipValue(input.chipValue),
          startStack: input.stack,
          players: input.players.map((player) => ({
            id: player.id,
            name: player.name,
          })),
          buyIns: input.buyIns,
          startedAt: Date.now(),
        });
        if (!ledgerGame) {
          showToast("Every player's buy-in must be more than 0");
          return;
        }
        setGame(ledgerGame);
        navigate("game", { replace: true });
        return;
      }
      if (input.ante <= 0) {
        showToast("Big blind must be greater than 0");
        return;
      }
      if (
        input.smallBlind !== null &&
        !isValidSmallBlind(input.smallBlind, input.ante)
      ) {
        showToast(
          `Small blind must be from ${formatChips(1, input.chipUnit, currency)} up to the big blind`,
        );
        return;
      }
      if (input.blinds && input.blinds.every < 1) {
        showToast("Blinds must go up after at least 1 hand or minute");
        return;
      }
      if (
        input.blinds &&
        input.blinds.raiseBy <=
          (input.blinds.raiseType === "multiply" ? 1 : 0)
      ) {
        showToast("Blind increase must make the blinds bigger");
        return;
      }
      if (
        input.buyIns &&
        (input.buyIns.length !== input.players.length ||
          !input.buyIns.every(isValidBuyIn))
      ) {
        showToast("Every player's buy-in must be more than 0");
        return;
      }
      if (input.rakeRules && !normalizeRakeRules(input.rakeRules)) {
        showToast("Rake must be 1 to 10% with a cap above 0");
        return;
      }
      const rebuyRules = normalizeRebuyRules(input.rebuyRules);
      const rakeRules = input.rakeRules
        ? normalizeRakeRules(input.rakeRules)
        : null;
      const gameName = input.name.trim();
      const chipValue = normalizeChipValue(input.chipValue);
      const startedAt = Date.now();
      const firstDealer = input.randomDealer
        ? Math.floor(Math.random() * input.players.length)
        : 0;
      const nextGame: GameState = {
        ...(gameName ? { gameName } : {}),
        sessionLabel: gameName || `Game ${nextSessionNumber}`,
        currency,
        ...(input.chipUnit === "cents" ? { chipUnit: input.chipUnit } : {}),
        ...(chipValue ? { chipValue } : {}),
        ante: input.ante,
        baseAnte: input.ante,
        // Only an odd choice is stored, so half keeps its exact old rounding.
        ...(input.smallBlind !== null &&
        input.smallBlind !== smallBlindFor(input.ante)
          ? { smallBlindRatio: { small: input.smallBlind, big: input.ante } }
          : {}),
        blinds: input.blinds,
        blindLevel: 0,
        blindPlans: [{
          effectiveHand: 1,
          effectiveAt: startedAt,
          baseBigBlind: input.ante,
          schedule: input.blinds,
        }],
        blindLevels: [],
        startStack: input.stack,
        ...(input.buyIns ? { customBuyIns: true } : {}),
        ...(rebuyRules ? { rebuyRules } : {}),
        ...(input.bigBlindAnte ? { bigBlindAnte: true } : {}),
        ...(rakeRules ? { rakeRules } : {}),
        startedAt,
        players: input.players.map((player, index) => {
          const amount = input.buyIns?.[index] ?? input.stack;
          return {
            id: player.id,
            name: player.name,
            stack: amount,
            buyIns: [amount],
          };
        }),
        hand: null,
        handNo: 0,
        // The first hand deals from the seat after this one.
        dealerIndex: firstDealer - 1,
        log: [],
        tracksPlayers: true,
        _setupCount: input.players.length,
      };
      dealNewHand(nextGame);
      setGame(nextGame);
      navigate("game", { replace: true });
    },
    [currency, navigate, nextSessionNumber, showToast],
  );

  function continueSession(id: string) {
    const session = history.find((item) => item.id === id);
    if (!session?.sessionNumber) return;
    if (game) {
      showToast("Finish or discard the game in progress first");
      return;
    }
    const label = session.name || `Game ${session.sessionNumber}`;
    ask(
      `Continue ${label}? Everyone starts with the chips they finished with, and saving updates this game. Until then it stays as saved.`,
      "Continue Game",
      () => {
        setGame(
          gameFromSession(
            { ...session, sessionNumber: session.sessionNumber! },
            [...players, ...discardedPlayers],
            currency,
          ),
        );
        navigate("game");
      },
    );
  }

  const addPlayer = useCallback(
    async (name: string, avatar: string) => {
      try {
        const data = await playersApi<{ player: PlayerProfile }>("", {
          method: "POST",
          body: JSON.stringify({ name, avatar }),
        });
        setPlayers((current) => {
          const withoutPlayer = current.filter(
            (player) => player.id !== data.player.id,
          );
          return [...withoutPlayer, data.player].sort((a, b) =>
            a.name.localeCompare(b.name),
          );
        });
        setDiscardedPlayers((current) =>
          current.filter((player) => player.id !== data.player.id),
        );
        setPlayersError("");
        showToast("Player Added");
        return data.player;
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Player Was Not Added",
        );
        return null;
      }
    },
    [showToast],
  );

  async function setGuestAvatar(player: PlayerProfile, avatar: string) {
    try {
      const data = await playersApi<{ player: PlayerProfile }>("", {
        method: "PATCH",
        body: JSON.stringify({ action: "avatar", id: player.id, avatar }),
      });
      setPlayers((current) =>
        current.map((item) =>
          item.id === data.player.id ? { ...item, avatar: data.player.avatar } : item,
        ),
      );
      showToast("Avatar Saved");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Avatar Was Not Saved");
      return false;
    }
  }

  async function renamePlayer(player: PlayerProfile, name: string) {
    try {
      await playersApi<{ player: PlayerProfile }>("", {
        method: "PATCH",
        body: JSON.stringify({ action: "rename", id: player.id, name }),
      });
      await refreshPlayers({ quiet: true });
      showToast("Player Renamed");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Player Was Not Renamed");
      return false;
    }
  }

  function discardPlayer(player: PlayerProfile) {
    ask(
      `Remove ${player.name}? They're hidden from new games, while their past games and standings stay. You can restore them later.`,
      "Remove Player",
      () => void updatePlayerState(player, "discard"),
    );
  }

  async function updatePlayerState(
    player: PlayerProfile,
    action: "discard" | "restore",
  ) {
    try {
      await playersApi<{ player: PlayerProfile }>("", {
        method: "PATCH",
        body: JSON.stringify({ action, id: player.id }),
      });
      await refreshPlayers();
      showToast(action === "discard" ? "Player Removed" : "Player Restored");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Player Was Not Updated",
      );
    }
  }

  function deletePlayerPermanently(player: PlayerProfile) {
    setModal({
      kind: "confirm",
      danger: true,
      message: `Permanently delete ${player.name}? This cannot be undone. Players with saved session history cannot be permanently deleted.`,
      confirmLabel: "Delete Permanently",
      onConfirm: () => void deleteRemotePlayerPermanently(player),
    });
  }

  function askForRecentSignIn(purpose = "permanent deletion") {
    setModal({
      kind: "recent-sign-in",
      purpose,
      email: accountEmail,
      confirmLabel: "Email Me A Sign-In Link",
      onConfirm: () => void sendRecentSignInLink(),
    });
  }

  async function sendRecentSignInLink() {
    try {
      const { error } = await authClient.signIn.magicLink({
        email: accountEmail,
        callbackURL: "/auth/callback",
      });
      if (error) throw new Error(error.code);
      showToast("Sign-In Link Sent. Open It On This Device.");
    } catch (error) {
      console.error("recent sign-in link request failed", error);
      showToast("We Could Not Send The Sign-In Link");
    }
  }

  function deleteAccount() {
    setModal({
      kind: "confirm",
      danger: true,
      message: "Delete your account?",
      points: [
        "Your players, games and standings are locked and hidden straight away.",
        "You are signed out on every device.",
        `Sign in again within ${DELETION_GRACE_PERIOD_DAYS} days to recover everything.`,
        "After that, everything is permanently deleted and can't be recovered.",
      ],
      confirmLabel: "Delete My Account",
      onConfirm: () => void requestAccountDeletion(),
    });
  }

  async function requestAccountDeletion() {
    try {
      const response = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request-deletion" }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new ApiError(
          apiErrorMessage(
            response.status,
            data.error,
            "Account deletion was not requested",
          ),
          response.status,
          data.code,
        );
      }
      window.localStorage.removeItem(gameStorageKey);
      router.replace("/auth/sign-in?deletion=requested");
    } catch (error) {
      if (needsRecentSignIn(error)) {
        askForRecentSignIn("deleting your account");
        return;
      }
      showToast(
        error instanceof Error ? error.message : "Account deletion was not requested",
      );
    }
  }

  async function deleteRemotePlayerPermanently(player: PlayerProfile) {
    try {
      await playersApi(`?id=${encodeURIComponent(player.id)}`, {
        method: "DELETE",
      });
      setDiscardedPlayers((current) =>
        current.filter((item) => item.id !== player.id),
      );
      showToast("Player Permanently Deleted");
    } catch (error) {
      if (needsRecentSignIn(error)) {
        askForRecentSignIn();
        return;
      }
      showToast(
        error instanceof Error
          ? error.message
          : "Player Was Not Permanently Deleted",
      );
    }
  }

  function act(
    playerIndex: number,
    type: PlayerAction["type"],
    amount?: number,
  ) {
    if (!game?.hand) return;
    const next = structuredClone(game);
    const hand = next.hand;
    if (
      !hand ||
      !hand.in[playerIndex] ||
      hand.currentPlayer !== playerIndex
    )
      return;
    const player = next.players[playerIndex];

    if (type === "fold") {
      hand.in[playerIndex] = false;
      const raiseBefore = applyRaiseRules(next, playerIndex);
      recordAction(
        next,
        playerIndex,
        { type, chips: 0, raiseBefore },
        `${player.name} folds`,
      );
    } else if (type === "check") {
      if (hand.roundHigh > hand.committed[playerIndex]) {
        showToast(
          `Cannot check — must call ${money(
            hand.roundHigh - hand.committed[playerIndex],
          )}`,
        );
        return;
      }
      const raiseBefore = applyRaiseRules(next, playerIndex);
      recordAction(
        next,
        playerIndex,
        { type, chips: 0, raiseBefore },
        `${player.name} checks`,
      );
    } else if (type === "call") {
      const needed = Math.min(
        hand.roundHigh - hand.committed[playerIndex],
        player.stack,
      );
      if (needed <= 0) {
        act(playerIndex, "check");
        return;
      }
      player.stack -= needed;
      hand.committed[playerIndex] += needed;
      hand.pot += needed;
      const raiseBefore = applyRaiseRules(next, playerIndex);
      recordAction(
        next,
        playerIndex,
        { type, chips: needed, raiseBefore },
        `${player.name} calls ${money(needed)}`,
      );
    } else {
      const chips =
        type === "all-in"
          ? player.stack
          : (amount ?? minimumRaise(next, playerIndex));
      if (!Number.isSafeInteger(chips) || chips <= 0) {
        showToast("Enter an amount");
        return;
      }
      if (chips > player.stack) {
        showToast(`Only ${money(player.stack)} left`);
        return;
      }
      const minimum = minimumRaise(next, playerIndex);
      if (chips < minimum && chips < player.stack) {
        showToast(`Minimum is ${money(minimum)}`);
        return;
      }

      const total = hand.committed[playerIndex] + chips;
      const wasRaise = total > hand.roundHigh;
      if (wasRaise && !mayRaise(next, playerIndex)) {
        showToast("Only call or fold: the all-in was less than a full raise");
        return;
      }
      const opening = !hand.committed.some(
        (committed, index) => index !== playerIndex && committed > 0,
      );
      player.stack -= chips;
      hand.committed[playerIndex] += chips;
      hand.pot += chips;
      const raiseBefore = applyRaiseRules(next, playerIndex);
      const description =
        type === "all-in"
          ? `goes all-in for ${money(chips)}${
              wasRaise ? ` (to ${money(total)})` : ""
            }${wasRaise && !raiseBefore.full ? ", short of a full raise" : ""}`
          : wasRaise
            ? opening
              ? `bets ${money(chips)}`
              : `raises to ${money(total)}`
            : `calls ${money(chips)}`;
      recordAction(
        next,
        playerIndex,
        { type, chips, raiseBefore },
        `${player.name} ${description}`,
      );
    }

    // Feedback that the tap registered, as the next player's card takes over.
    if (readTurnSound()) {
      playTurnSound(type === "check" || type === "fold" ? "tap" : "chips");
    }
    setLastTurn((previous) => ({
      playerIndex,
      handNo: hand.no,
      stage: hand.stage,
      seq: (previous?.seq ?? 0) + 1,
    }));

    const active = activeIndexes(next);
    if (active.length === 1) {
      const winner = active[0];
      // The winner card announces it; no toast as well.
      awardPot(next, winner, true);
      setGame(next);
      return;
    }
    hand.currentPlayer = nextPlayerToAct(next, playerIndex);
    setGame(next);
  }

  function undoAction(playerIndex: number) {
    if (!game?.hand) return;
    const next = structuredClone(game);
    const hand = next.hand;
    const action = hand?.last[playerIndex];
    if (!hand || !hand.acted[playerIndex] || !action) return;
    setLastTurn(null);

    next.players[playerIndex].stack += action.chips;
    hand.committed[playerIndex] -= action.chips;
    hand.pot -= action.chips;
    if (action.type === "fold") hand.in[playerIndex] = true;
    hand.acted[playerIndex] = false;
    hand.last[playerIndex] = null;
    hand.roundHigh = Math.max(0, ...hand.committed);
    undoRaiseRules(next, playerIndex, action.raiseBefore);
    hand.currentPlayer = playerIndex;
    const logIndex = next.log.indexOf(action.line);
    if (logIndex >= 0) next.log.splice(logIndex, 1);
    setGame(next);
    showToast(`${next.players[playerIndex].name} can act again`);
  }

  function nextStage() {
    if (!game?.hand) return;
    if (pendingIndexes(game).length) {
      showToast("Everyone must act first");
      return;
    }
    if (game.hand.stage >= STAGES.length - 1) {
      showToast("Pick the winner");
      return;
    }
    const next = structuredClone(game);
    const hand = next.hand;
    if (!hand) return;
    hand.stage += 1;
    hand.committed = next.players.map(() => 0);
    hand.roundHigh = 0;
    hand.acted = next.players.map(() => false);
    hand.last = next.players.map(() => null);
    resetRaiseRules(next);
    hand.currentPlayer = nextPlayerToAct(next, hand.dealerIndex);
    setGame(next);
  }

  function pickWinner(playerIndex: number) {
    if (!game?.hand) return;
    const rake = handRake(game);
    ask(
      `Give the ${money(game.hand.pot - rake)} pot to ${
        game.players[playerIndex].name
      }?${rake ? ` The house takes ${money(rake)} rake.` : ""}`,
      `${game.players[playerIndex].name} wins`,
      () => {
        const next = structuredClone(game);
        awardPot(next, playerIndex);
        setGame(next);
      },
    );
  }

  function beginSplit() {
    if (!game?.hand) return;
    const next = structuredClone(game);
    if (next.hand) next.hand.splitSel = [];
    setGame(next);
  }

  function endSplit() {
    if (!game?.hand) return;
    const next = structuredClone(game);
    if (next.hand) next.hand.splitSel = null;
    setGame(next);
  }

  function toggleSplit(playerIndex: number) {
    if (!game?.hand?.splitSel) return;
    const next = structuredClone(game);
    const selected = next.hand?.splitSel;
    if (!selected) return;
    const index = selected.indexOf(playerIndex);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(playerIndex);
    setGame(next);
  }

  function splitPot() {
    if (!game?.hand?.splitSel || game.hand.splitSel.length < 2) {
      showToast("Select at least 2 players");
      return;
    }
    const next = structuredClone(game);
    const hand = next.hand;
    if (!hand?.splitSel) return;
    const winners = [...hand.splitSel].sort((a, b) => a - b);
    const record = completedHandRecord(next);
    const pot = hand.pot - takeRake(next);
    splitShares(
      pot,
      winners,
      hand.dealerIndex,
      next.players.length,
    ).forEach((share, playerIndex) => {
      next.players[playerIndex].stack += share;
    });
    recordWin(
      next,
      `Hand ${hand.no}: split ${money(pot)} between ${winners
        .map((index) => next.players[index].name)
        .join(", ")}`,
    );
    next.lastHand = record;
    next.winnerAnnouncement = {
      names: winners.map((index) => next.players[index].name),
      pot,
      handNo: hand.no,
      split: true,
    };
    next.hand = null;
    setGame(next);
  }

  function awardSidePots(winners: number[][]) {
    if (!game?.hand) return;
    const { pots, refund, rake } = payablePots(game);
    const name = (index: number) => game.players[index].name;
    const label = (index: number) =>
      pots.length > 1 ? potLabel(index, pots.length) : "Pot";
    // One line per pot, "Main pot · $39,600: Bikram", then any refund and rake.
    const resolved = resolvePotWinners(pots, winners);
    const points = resolved.map(({ winners: players }, index) => {
      const who =
        players.length > 1
          ? `split by ${players.map(name).join(" and ")}`
          : name(players[0]);
      return `${label(index)} · ${money(pots[index].amount)}: ${who}`;
    });
    if (refund) {
      points.push(
        `${money(refund.amount)} back to ${name(refund.playerIndex)} (not called)`,
      );
    }
    if (rake) points.push(`House rake · ${money(rake)}`);
    setModal({
      kind: "confirm",
      message: pots.length > 1 ? "Award these pots?" : "Award this pot?",
      points,
      confirmLabel: pots.length > 1 ? "Award pots" : "Award pot",
      onConfirm: () => {
        const next = structuredClone(game);
        if (!awardPots(next, winners)) {
          showToast("Pick a winner for every pot");
          return;
        }
        // The winner card is the announcement, as for a single pot.
        setGame(next);
      },
    });
  }

  function startNextHand() {
    if (!game || game.hand) return;
    const next = structuredClone(game);
    const anteBefore = next.ante;
    next.winnerAnnouncement = null;
    dealNewHand(next);
    setGame(next);
    if (next.ante !== anteBefore) {
      showToast(
        `Blinds up to ${money(
          smallBlindFor(next.ante, next.smallBlindRatio),
        )}/${money(next.ante)}`,
      );
    }
  }

  function dismissWinner() {
    if (!game?.winnerAnnouncement) return;
    const next = structuredClone(game);
    next.winnerAnnouncement = null;
    setGame(next);
  }

  function buyIn(playerIndex: number) {
    if (!game) return;
    const amount = nextBuyIn(game, playerIndex);
    if (amount === null) return;
    // Players who choose their own amount type it in the buy-in sheet.
    if (game.customBuyIns) {
      setBuyingIn(playerIndex);
      return;
    }
    const player = game.players[playerIndex];
    // During a hand they sit it out and play from the next deal.
    const handNo = game.hand?.no;
    setModal({
      kind: "confirm",
      message: handNo
        ? `Buy in ${player.name} for ${money(amount)}? They sit out this hand and play from the next one.`
        : `Buy in ${player.name} for ${money(amount)}?`,
      confirmLabel: `Buy In · ${money(amount)}`,
      onConfirm: () => confirmBuyIn(playerIndex, amount),
      alternative: {
        label: "Change amount",
        onChoose: () => setBuyingIn(playerIndex),
      },
    });
  }

  function confirmBuyIn(playerIndex: number, amount: number) {
    if (!game) return;
    const handNo = game.hand?.no;
    const next = structuredClone(game);
    const confirmedAmount = buyInPlayer(next, playerIndex, amount);
    if (confirmedAmount === null) return;
    const confirmedPlayer = next.players[playerIndex];
    // Not "Hand N:" during a hand, so cancelling it keeps the line, like
    // the buy-in.
    recordWin(
      next,
      `${handNo ? `During hand ${handNo}` : `Hand ${next.handNo}`}: ${confirmedPlayer.name} buys in for ${money(confirmedAmount)}`,
    );
    setGame(next);
    setBuyingIn(null);
    showToast(`${confirmedPlayer.name} buys in for ${money(confirmedAmount)}`);
  }

  function saveBlindSchedule(schedule: BlindSchedule | null) {
    if (!game) return;
    const next = structuredClone(game);
    editBlindSchedule(next, schedule);
    setGame(next);
    setEditingBlinds(false);
    showToast("Blind plan updated for the next hand");
  }

  function saveRebuyRules(rules: RebuyRules) {
    if (!game || game.hand) return;
    const next = structuredClone(game);
    if (!editRebuyRules(next, rules)) return;
    setGame(next);
    setEditingRebuys(false);
    showToast("Rebuys updated");
  }

  function toggleBlindClock() {
    if (!game) return;
    const next = structuredClone(game);
    const pausing = next.blindClockPausedAt === undefined;
    if (!(pausing ? pauseBlindClock(next) : resumeBlindClock(next))) return;
    setGame(next);
    showToast(pausing ? "Blind clock paused" : "Blind clock resumed");
  }

  function addLatePlayer(playerId: string, seat: number, amount: number) {
    if (!game || game.hand) return;
    const profile = players.find((player) => player.id === playerId);
    if (!profile) return;
    const next = structuredClone(game);
    if (!joinGame(next, { id: profile.id, name: profile.name }, seat, amount)) {
      return;
    }
    setGame(next);
    setTableSheet(null);
    showToast(`${profile.name} joins for ${money(amount)}`);
  }

  function cashOut(playerIndex: number) {
    if (!game || game.hand) return;
    const player = game.players[playerIndex];
    if (!player || player.left) return;
    // The confirmation replaces the sheet rather than opening under it.
    setTableSheet(null);
    ask(
      `Cash out ${player.name} with ${money(player.stack)}? They can return later.`,
      `Cash Out · ${money(player.stack)}`,
      () => {
        const next = structuredClone(game);
        if (!cashOutPlayer(next, playerIndex)) return;
        setGame(next);
        showToast(`${player.name} cashed out with ${money(player.stack)}`);
      },
    );
  }

  function returnPlayer(playerIndex: number) {
    if (!game || game.hand) return;
    const player = game.players[playerIndex];
    if (!player?.left) return;
    const next = structuredClone(game);
    if (!returnToTable(next, playerIndex)) return;
    setGame(next);
    setTableSheet(null);
    showToast(`${player.name} is back with ${money(player.stack)}`);
  }

  function addLedgerBuyIn(playerIndex: number, amount: number) {
    if (!game) return;
    const next = structuredClone(game);
    if (!ledgerBuyIn(next, playerIndex, amount)) return;
    setGame(next);
    setBuyingIn(null);
    showToast(`${next.players[playerIndex].name} buys in for ${money(amount)}`);
  }

  function addLedgerPlayer(playerId: string, amount: number) {
    if (!game) return;
    const profile = players.find((player) => player.id === playerId);
    if (!profile) return;
    const next = structuredClone(game);
    if (!ledgerJoin(next, { id: profile.id, name: profile.name }, amount)) {
      return;
    }
    setGame(next);
    setTableSheet(null);
    showToast(`${profile.name} joins for ${money(amount)}`);
  }

  function cashOutLedgerPlayer(playerIndex: number, chips: number) {
    if (!game) return;
    const player = game.players[playerIndex];
    if (!player || player.left) return;
    // The confirmation replaces the sheet rather than opening under it.
    setTableSheet(null);
    ask(
      `Cash out ${player.name} with ${money(chips)}? That's their result for the game.`,
      `Cash Out · ${money(chips)}`,
      () => {
        const next = structuredClone(game);
        if (!ledgerCashOut(next, playerIndex, chips)) return;
        setGame(next);
        showToast(`${player.name} cashed out with ${money(chips)}`);
      },
    );
  }

  function returnLedgerPlayer(playerIndex: number) {
    if (!game) return;
    const player = game.players[playerIndex];
    if (!player?.left) return;
    const next = structuredClone(game);
    if (!ledgerReturn(next, playerIndex)) return;
    setGame(next);
    setTableSheet(null);
    showToast(`${player.name} is back at the table`);
  }

  function undoLedger() {
    if (!game) return;
    const next = structuredClone(game);
    const line = undoLedgerStep(next);
    if (!line) return;
    setGame(next);
    showToast(`Undone: ${line}`);
  }

  function saveLedgerGame(counts: Array<number | null>) {
    if (!game) return;
    let session: PokerSession;
    try {
      session = ledgerSession(game, counts, Date.now());
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Check the count");
      return;
    }
    ask(
      "Save this game? It goes to your games and counts towards the standings.",
      "Save game",
      () => void saveLedgerSession(session),
    );
  }

  async function saveLedgerSession(session: PokerSession) {
    showToast("Saving to shared ledger…");
    try {
      await sessionsApi("", {
        method: "POST",
        body: JSON.stringify({ sessions: [session] }),
      });
      setGame(null);
      navigate("history", { replace: true });
      await refreshHistory();
      showToast("Session saved");
      // The end of the night is when people settle up.
      setSettlingId(session.id);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Session was not saved",
      );
    }
  }

  function cancelHand() {
    if (!game?.hand) return;
    setModal({
      kind: "confirm",
      message: `Cancel hand ${game.hand.no}? Everyone gets their money back, including the blinds.`,
      confirmLabel: "Cancel hand",
      // "Cancel" next to "Cancel hand" would be ambiguous.
      dismissLabel: "Keep playing",
      onConfirm: () => {
        const next = structuredClone(game);
        if (!cancelCurrentHand(next)) return;
        setGame(next);
        showToast("Hand cancelled");
      },
    });
  }

  function undoHand() {
    if (!game?.lastHand) {
      showToast("Nothing to undo");
      return;
    }
    ask("Undo the last completed hand?", "Undo hand", () => {
      const next = structuredClone(game);
      if (!undoLastHand(next)) return;
      setGame(next);
      showToast("Hand undone");
    });
  }

  function discardGame() {
    ask(
      game?.continues
        ? `Stop continuing ${game.sessionLabel || "this game"}? Hands played since are lost; the saved game stays as it was.`
        : isLedgerGame(game)
          ? "Discard this game? Its buy-ins and cash-outs are lost."
          : "Reset everything and start a new game? All current stacks are lost.",
      isLedgerGame(game) ? "Discard game" : "Reset game",
      () => {
        endLiveSharing();
        if (game) forgetGameBackup(game);
        setGame(null);
        navigate("home", { replace: true });
      },
    );
  }

  async function finishSession(completedHands: number) {
    if (!game) return;
    const endStacks = game.hand
      ? [...game.hand.stacksBeforeHand]
      : game.players.map((player) => player.stack);
    const session: PokerSession = {
      // Imported and older games don't always have an ID from their start.
      id: game.continues?.id ?? `s${game.startedAt}`,
      ...(game.gameName ? { name: game.gameName } : {}),
      date: game.startedAt,
      ended: Date.now(),
      ...(game.chipUnit === "cents" ? { chipUnit: game.chipUnit } : {}),
      // Saving a continued game leaves the saved chip value as it is.
      ...(game.chipValue ? { chipValue: game.chipValue } : {}),
      ante: startingBigBlind(game),
      ...(game.blindPlans && game.blindLevels
        ? {
            blindHistory: {
              plans: game.blindPlans.filter(
                (plan) => plan.effectiveHand <= completedHands,
              ),
              levels: game.blindLevels.filter(
                (level) => level.handNo <= completedHands,
              ),
              ...(game.smallBlindRatio
                ? { smallBlindRatio: game.smallBlindRatio }
                : {}),
            },
          }
        : {}),
      startStack: game.startStack,
      ...(game.rebuyRules ? { rebuyRules: game.rebuyRules } : {}),
      ...(game.bigBlindAnte ? { bigBlindAnte: true } : {}),
      ...(game.rakeRules ? { rakeRules: game.rakeRules } : {}),
      ...(game.rake ? { rake: game.rake } : {}),
      hands: completedHands,
      results: game.players.map((player, index) => ({
        ...(player.id ? { playerId: player.id } : {}),
        name: player.name,
        net: endStacks[index] - totalBuyIns(game, index),
        end: endStacks[index],
        // Only a single starting-stack buy-in can be left out.
        ...(player.buyIns &&
        (player.buyIns.length > 1 || player.buyIns[0] !== game.startStack)
          ? { buyIns: player.buyIns }
          : {}),
        ...savedPlayerRecord(game, index, completedHands),
      })),
    };

    showToast("Saving to shared ledger…");
    try {
      // A continued game updates the saved game it was reopened from.
      await sessionsApi(
        "",
        game.continues
          ? {
              method: "PUT",
              body: JSON.stringify({
                session,
                basedOn: {
                  ended: game.continues.ended,
                  hands: game.continues.hands,
                },
              }),
            }
          : {
              method: "POST",
              body: JSON.stringify({ sessions: [session] }),
            },
      );
      endLiveSharing();
      setGame(null);
      navigate("history", { replace: true });
      await refreshHistory();
      showToast("Session saved");
      setSettlingId(session.id);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Session was not saved",
      );
    }
  }

  function endSession() {
    if (!game) return;
    const completedHands = game.hand ? game.handNo - 1 : game.handNo;
    const newHands = completedHands - (game.continues?.hands ?? 0);
    if (newHands < 1 && game.continues) {
      // Nothing new to save: closing leaves the saved game as it was.
      const label = game.sessionLabel || "the saved game";
      ask(
        `No new hands were played. Close ${label}? It stays exactly as it was saved.`,
        "Close game",
        () => {
          endLiveSharing();
          forgetGameBackup(game);
          setGame(null);
          navigate("sessions", { replace: true });
          showToast(`${label} closed; nothing changed`);
        },
      );
      return;
    }
    if (newHands < 1) {
      showToast("No completed hands to save");
      return;
    }
    ask(
      game.continues
        ? `Save this game? ${newHands} more hand${
            newHands === 1 ? "" : "s"
          } played (${completedHands} in all) — it updates ${
            game.sessionLabel || "the saved game"
          } and the leaderboard.`
        : `Save this session? ${completedHands} hand${
            completedHands === 1 ? "" : "s"
          } played — it goes to History and counts towards the leaderboard.`,
      "Save session",
      () => void finishSession(completedHands),
    );
  }

  function discardSession(id: string) {
    const session = history.find((item) => item.id === id);
    if (!session) return;
    ask(
      `Discard ${session.name || "this game"} from ${formatDate(
        session.date,
      )}? It will stop counting towards the leaderboard until restored.`,
      "Discard Session",
      () => void updateSessionState(id, "discard"),
    );
  }

  async function updateSessionState(
    id: string,
    action: "discard" | "restore",
  ) {
    try {
      await sessionsApi("", {
        method: "PATCH",
        body: JSON.stringify({ action, id }),
      });
      await refreshHistory();
      showToast(action === "discard" ? "Session Discarded" : "Session Restored");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Session Was Not Updated",
      );
    }
  }

  /** Sets or clears a saved game's chip value; true when it was saved. */
  async function saveChipValue(id: string, chipValue: ChipValue | null) {
    try {
      await sessionsApi("", {
        method: "PATCH",
        body: JSON.stringify({ action: "chip-value", id, chipValue }),
      });
      await refreshHistory();
      showToast(chipValue ? "Chip value saved" : "Chip value cleared");
      return true;
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Chip value was not saved",
      );
      return false;
    }
  }

  function deleteSessionPermanently(id: string) {
    const session = discardedSessions.find((item) => item.id === id);
    if (!session) return;
    setModal({
      kind: "confirm",
      danger: true,
      message: `Permanently delete ${session.name || "this game"} from ${formatDate(
        session.date,
      )}? This cannot be undone.`,
      confirmLabel: "Delete Permanently",
      onConfirm: () => void deleteRemoteSessionPermanently(id),
    });
  }

  async function deleteRemoteSessionPermanently(id: string) {
    try {
      await sessionsApi(`?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setDiscardedSessions((current) =>
        current.filter((session) => session.id !== id),
      );
      showToast("Session Permanently Deleted");
    } catch (error) {
      if (needsRecentSignIn(error)) {
        askForRecentSignIn();
        return;
      }
      showToast(
        error instanceof Error
          ? error.message
          : "Session Was Not Permanently Deleted",
      );
    }
  }

  function exportData() {
    const blob = new Blob(
      [JSON.stringify({ exported: Date.now(), sessions: history }, null, 2)],
      { type: "application/json" },
    );
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `poker-ledger-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    let entries: unknown[] | null;
    try {
      entries = sessionsInBackup(JSON.parse(await file.text()));
    } catch {
      showToast("Not a valid file");
      return;
    }
    if (!entries) {
      showToast("No sessions in that file");
      return;
    }

    const plan = planImport(
      entries,
      [...history, ...discardedSessions].map((session) => session.id),
      [...players, ...discardedPlayers],
    );
    if (!plan.additions.length) {
      showToast(
        plan.alreadySaved ? "Already up to date" : "No readable sessions in that file",
      );
      return;
    }
    setImportPlan(plan);
  }

  async function confirmImport(plan: ImportPlan) {
    await sessionsApi("", {
      method: "POST",
      body: JSON.stringify({ sessions: plan.additions }),
    });
    setImportPlan(null);
    await Promise.all([refreshHistory(), refreshPlayers()]);
    showToast(
      `Added ${plan.additions.length} session${plan.additions.length === 1 ? "" : "s"}`,
    );
  }

  function openPlayers() {
    navigate("profile");
  }

  function openHands() {
    navigate("hands");
  }

  function openWhoWins() {
    navigate("whoWins");
  }

  function closeModal() {
    setModal(null);
  }

  const header: { title: string } | null =
    view === "home"
      ? null
      : view === "game" && game
        ? {
            title: isLedgerGame(game)
              ? "Quick Ledger"
              : game.hand
              ? game.hand.stage === STAGES.length - 1 &&
                !pendingIndexes(game).length
                ? "Showdown"
                : `Hand ${game.hand.no}`
              : "Between Hands",
          }
        : view === "newGame"
          ? { title: "New Game" }
        : view === "setup"
          ? { title: setupKind === "ledger" ? "New Quick Ledger" : "Table Setup" }
          : view === "history"
            ? { title: "Standings" }
            : view === "sessions"
              ? // With friends' games the picker names whose games these are.
                { title: groups.length ? "Games" : "My Hosted Games" }
              : view === "profile"
                ? { title: "Profile" }
                : view === "settings"
                  ? { title: "Settings" }
                  : view === "hands"
                    ? { title: "Hand Rankings" }
                  : view === "whoWins"
                    ? { title: "Who Wins?" }
                  : null;
  const homeView = (
    <HomeView
      game={game}
      displayName={profile.displayName}
      selfPlayerId={profile.selfPlayerId}
      history={history}
      friendRequests={friendRequests}
      legacyGame={legacyGame}
      legacySessionCount={legacySessions.length}
      gameBackups={gameBackups}
      restoringBackup={restoringBackup}
      onRestoreBackup={(backup) => void restoreGameBackup(backup)}
      onDeleteBackup={deleteGameBackup}
      onAdoptLegacyGame={offerLegacyGameAdoption}
      onGame={() => navigate(game ? "game" : "newGame")}
      onNewGame={() => navigate("newGame")}
      onSessions={() => navigate("sessions")}
      onReviewRequests={openPlayers}
      onOpenHands={openHands}
      onOpenWhoWins={openWhoWins}
      onReviewLegacySessions={() => setReviewingLegacySessions(true)}
    />
  );

  const settlingSession = settlingId
    ? history.find((session) => session.id === settlingId)
    : undefined;

  return (
    <CurrencyContext.Provider value={currency}>
    <AvatarContext.Provider value={avatarLookup}>
    <main className={`ledger-shell view-${view}`}>
      <div className={`toast ${toast ? "show" : ""}`} role="status">
        {toast}
      </div>

      {header ? (
        <header
          className={`screen-header ${
            view === "game" && game?.hand ? "with-toggle" : ""
          }`}
        >
          {/* No back button: the phone's back gesture walks the screen history. */}
          <div className="screen-heading">
            <h1
              style={
                { "--chars": header.title.length } as React.CSSProperties
              }
            >
              {header.title}
            </h1>
          </div>
          {/* The theme switch lives on Profile only (user decision 2026-10-01). */}
          {view === "profile" ? (
            <>
              <NotificationBell
                overview={friendOverview}
                onOpenRequest={(requestId) => {
                  document
                    .getElementById(`friend-request-${requestId}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
              <ThemeToggle />
            </>
          ) : null}
          {view === "game" && game?.hand ? (
            <div className="layout-toggle" role="radiogroup" aria-label="Show the hand as">
              {(["list", "table"] as const).map((layout) => (
                <button
                  key={layout}
                  type="button"
                  role="radio"
                  aria-checked={handLayout === layout}
                  className={handLayout === layout ? "selected" : ""}
                  onClick={() => {
                    setHandLayout(layout);
                    storeHandLayout(layout);
                  }}
                >
                  {layout === "list" ? "List" : "Table"}
                </button>
              ))}
            </div>
          ) : null}
        </header>
      ) : null}

      <div className="app">
        {view === "home" ? (
          homeView
        ) : view === "history" ? (
          <RanksView
            groups={groups}
            groupsError={groupsError}
            onToast={showToast}
            onRequestSent={() => {
              void refreshFriends();
              void refreshGroups();
            }}
            history={history}
            players={[...players, ...discardedPlayers]}
            selfPlayerId={profile.selfPlayerId}
            hostName={profile.displayName ?? "Your host"}
            focusKey={rankFocus}
            loading={historyLoading}
            error={historyError}
            onRetry={() => void refreshHistory()}
          />
        ) : view === "sessions" ? (
          <SessionsView
            groups={groups}
            groupsError={groupsError}
            onCopied={() => showToast("Copied")}
            discardedSessions={discardedSessions}
            history={history}
            loading={historyLoading}
            error={historyError}
            onRetry={() => void refreshHistory()}
            onDiscard={discardSession}
            onContinue={continueSession}
            onSettle={setSettlingId}
            onRestore={(id) => void updateSessionState(id, "restore")}
            onDeletePermanently={deleteSessionPermanently}
            onExport={exportData}
            onImport={importData}
          />
        ) : view === "profile" ? (
          <ProfileView
            profile={profile}
            accountEmail={accountEmail}
            onOpenSettings={() => navigate("settings")}
            onProfile={(next) => {
              setProfile(next);
              // Your own player goes by your name, so the list follows it.
              void refreshPlayers({ quiet: true });
            }}
            players={players}
            discardedPlayers={discardedPlayers}
            history={history}
            loading={playersLoading}
            error={playersError}
            onRetry={() => void refreshPlayers()}
            onAdd={addPlayer}
            onRename={renamePlayer}
            onGuestAvatar={setGuestAvatar}
            onDiscard={discardPlayer}
            onRestore={(player) => void updatePlayerState(player, "restore")}
            onDeletePermanently={deletePlayerPermanently}
            onPlayersChanged={() => void refreshPlayers({ quiet: true })}
            onViewStandings={(player) => {
              setRankFocus(standingsKey({ playerId: player.id, name: player.name }));
              navigate("history");
            }}
            onToast={showToast}
            onAsk={ask}
            seatedPlayerIds={game?.players.flatMap((player) => player.id ?? []) ?? []}
            onGamesMoved={() => void refreshHistory()}
            friendOverview={friendOverview}
            friendOverviewError={friendOverviewError}
            onReloadFriends={() => void refreshFriends()}
            stats={profileStats}
            statsError={profileStatsError}
          />
        ) : view === "settings" ? (
          <SettingsView email={accountEmail} onDeleteAccount={deleteAccount} />
        ) : view === "hands" ? (
          <PokerHandsChart />
        ) : view === "whoWins" ? (
          <HandChecker
            draft={whoWinsDraft}
            setDraft={setWhoWinsDraft}
            knownPlayers={[
              ...players.filter((player) => player.id === profile.selfPlayerId),
              ...players.filter((player) => player.id !== profile.selfPlayerId),
            ].map((player) => player.name)}
          />
        ) : view === "newGame" ? (
          <NewGameView
            onChoose={(kind) => navigate("setup", { setupKind: kind })}
          />
        ) : view === "setup" ? (
          <SetupView
            key={setupKind}
            kind={setupKind}
            players={players}
            selfPlayerId={profile.selfPlayerId}
            loading={playersLoading}
            error={playersError}
            onRetry={() => void refreshPlayers()}
            suggestedName={`Game ${nextSessionNumber}`}
            onStart={startGame}
          />
        ) : game && isLedgerGame(game) ? (
          <LedgerView
            game={game}
            onBuyIn={(playerIndex) => setBuyingIn(playerIndex)}
            onAddPlayer={() => setTableSheet("add")}
            onCashOut={() => setTableSheet("cash-out")}
            onReturn={returnLedgerPlayer}
            onUndo={undoLedger}
            onSave={saveLedgerGame}
            onDiscard={discardGame}
          />
        ) : game ? (
          <GameView
            game={game}
            layout={handLayout}
            lastTurn={lastTurn}
            onAct={act}
            onUndoAction={undoAction}
            onNextStage={nextStage}
            onPickWinner={pickWinner}
            onBeginSplit={beginSplit}
            onEndSplit={endSplit}
            onToggleSplit={toggleSplit}
            onSplitPot={splitPot}
            onAwardPots={awardSidePots}
            onCancelHand={cancelHand}
            onBuyIn={buyIn}
            onNextHand={startNextHand}
            onEndSession={endSession}
            onUndoHand={undoHand}
            onDiscard={discardGame}
            onEditBlinds={() => setEditingBlinds(true)}
            onToggleBlindClock={toggleBlindClock}
            onEditRebuys={() => setEditingRebuys(true)}
            onAddPlayer={() => setTableSheet("add")}
            onCashOut={() => setTableSheet("cash-out")}
            liveSharing={Boolean(liveToken)}
            liveFailing={liveFailing}
            onShareLive={() => setSharingLive(true)}
          />
        ) : (
          homeView
        )}
      </div>

      <TabBar
        view={view}
        dots={{
          play: Boolean(game),
          profile: friendRequests.length > 0,
        }}
        onSelect={(target) => {
          if (target === "play") {
            // The game in progress, or the New Game choice. On the choice or
            // a setup already, it stays put: back returns to the choice.
            if (game) {
              if (view !== "game") navigate("game");
            } else if (view !== "newGame" && view !== "setup") {
              navigate("newGame");
            }
          } else if (target !== view) {
            navigate(target);
          }
        }}
      />

      {modal ? (
        <Modal
          state={modal}
          onClose={closeModal}
          onConfirm={() => setModal(null)}
        />
      ) : null}
      {settlingSession ? (
        <SettleUpSheet
          key={settlingSession.id}
          session={settlingSession}
          onCopied={() => showToast("Copied")}
          onSaveChipValue={(value) =>
            saveChipValue(settlingSession.id, value)
          }
          onClose={() => setSettlingId(null)}
        />
      ) : null}
      <GameAmounts game={game ?? {}}>
        {game?.winnerAnnouncement ? (
          <WinnerCard
            announcement={game.winnerAnnouncement}
            onNext={dismissWinner}
          />
        ) : null}
        {editingBlinds && game ? (
          <BlindEditor
            game={game}
            onClose={() => setEditingBlinds(false)}
            onSave={saveBlindSchedule}
          />
        ) : null}
        {editingRebuys && game && !game.hand ? (
          <RebuyEditor
            game={game}
            onClose={() => setEditingRebuys(false)}
            onSave={saveRebuyRules}
          />
        ) : null}
        {tableSheet === "add" && game && !game.hand ? (
          <JoinGameSheet
            game={game}
            roster={players}
            selfPlayerId={profile.selfPlayerId}
            onClose={() => setTableSheet(null)}
            onAdd={(playerId, seat, amount) =>
              isLedgerGame(game)
                ? addLedgerPlayer(playerId, amount)
                : addLatePlayer(playerId, seat, amount)
            }
          />
        ) : null}
        {buyingIn !== null &&
        game &&
        (isLedgerGame(game)
          ? game.players[buyingIn] && !game.players[buyingIn].left
          : nextBuyIn(game, buyingIn) !== null) ? (
          <BuyInSheet
            game={game}
            playerIndex={buyingIn}
            onClose={() => setBuyingIn(null)}
            onBuyIn={(amount) =>
              isLedgerGame(game)
                ? addLedgerBuyIn(buyingIn, amount)
                : confirmBuyIn(buyingIn, amount)
            }
          />
        ) : null}
        {tableSheet === "cash-out" && game && isLedgerGame(game) ? (
          <LedgerCashOutSheet
            game={game}
            onClose={() => setTableSheet(null)}
            onCashOut={cashOutLedgerPlayer}
            onReturn={returnLedgerPlayer}
          />
        ) : tableSheet === "cash-out" && game && !game.hand ? (
          <CashOutSheet
            game={game}
            onClose={() => setTableSheet(null)}
            onCashOut={cashOut}
            onReturn={returnPlayer}
          />
        ) : null}
      </GameAmounts>
      {sharingLive && game ? (
        <LiveShareSheet
          token={liveToken}
          busy={liveBusy}
          failing={liveFailing}
          onStart={() => void startLiveSharing()}
          onStop={() => void stopLiveSharing()}
          onCopied={() => showToast("Link copied")}
          onClose={() => setSharingLive(false)}
        />
      ) : null}
      {importPlan ? (
        <ImportReview
          plan={importPlan}
          onConfirm={confirmImport}
          onClose={() => setImportPlan(null)}
        />
      ) : null}
      {reviewingLegacySessions ? (
        <LegacySessionReview
          sessions={legacySessions}
          onAdopt={adoptLegacySessions}
          onClose={() => setReviewingLegacySessions(false)}
        />
      ) : null}
    </main>
    </AvatarContext.Provider>
    </CurrencyContext.Provider>
  );
}

type TabTarget = "home" | "play" | "history" | "sessions" | "profile";

/** A head and shoulders, drawn at the size of the suit glyphs beside it. */
function ProfileIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <circle cx="8" cy="5" r="3.2" fill="currentColor" />
      <path d="M1.8 15a6.2 6.2 0 0 1 12.4 0Z" fill="currentColor" />
    </svg>
  );
}

const TABS: ReadonlyArray<{ target: TabTarget; icon: ReactNode; label: string }> = [
  { target: "home", icon: "♠", label: "Home" },
  { target: "play", icon: "♦", label: "Play" },
  { target: "history", icon: "♣", label: "Ranks" },
  { target: "sessions", icon: "♥", label: "Games" },
  { target: "profile", icon: <ProfileIcon />, label: "Profile" },
];

function tabForView(view: View): TabTarget {
  if (view === "newGame" || view === "setup" || view === "game") return "play";
  if (view === "hands" || view === "whoWins") return "home";
  if (view === "settings") return "profile";
  return view;
}

function TabBar({
  view,
  dots,
  onSelect,
}: {
  view: View;
  /** A game is on (Play), or friend requests are waiting (Profile). */
  dots: Partial<Record<TabTarget, boolean>>;
  onSelect: (target: TabTarget) => void;
}) {
  const active = tabForView(view);
  return (
    <nav className="tab-bar" aria-label="Main">
      {TABS.map((tab) => (
        <button
          key={tab.target}
          type="button"
          className={tab.target === active ? "active" : ""}
          aria-current={tab.target === active ? "page" : undefined}
          onClick={() => onSelect(tab.target)}
        >
          <span className="tab-icon" aria-hidden="true">
            {tab.icon}
          </span>
          <span className="tab-label">{tab.label}</span>
          <span className="tab-indicator" aria-hidden="true" />
          {dots[tab.target] ? (
            <span className={`tab-dot tab-dot-${tab.target}`} aria-hidden="true" />
          ) : null}
        </button>
      ))}
    </nav>
  );
}

// Named hues from the design; anyone else gets a stable hue from their name.
const PLAYER_HUES: Record<string, number> = {
  rajarshi: 150,
  debraj: 248,
  shubhankar: 195,
  abhirup: 300,
  pratik: 85,
  soham: 345,
  "rahul basak": 40,
  utsav: 170,
  ratan: 270,
};

function playerColor(name: string) {
  const key = name.trim().toLowerCase();
  let hue = PLAYER_HUES[key];
  if (hue === undefined) {
    hue = 0;
    for (const char of key) hue = (hue * 31 + char.charCodeAt(0)) % 360;
  }
  return `oklch(0.78 0.15 ${hue})`;
}

function toneClass(value: number | null) {
  return value === null || value === 0 ? "" : value > 0 ? "pos" : "neg";
}

function Avatar({
  name,
  playerId,
  avatar,
  role,
  size = "large",
}: {
  name: string;
  playerId?: string;
  /** Overrides the lookup, for people outside the host's list. */
  avatar?: string;
  role?: string;
  size?: "large" | "small";
}) {
  const lookup = useContext(AvatarContext);
  // Heads-up, the dealer also posts the small blind: the white D badge
  // moves to the left so the blind badge keeps the right.
  const roles = role ? role.split(" ") : [];
  const dealer = roles.includes("D");
  const blind = roles.find((part) => part !== "D");
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      <AvatarArt id={avatar ?? lookup(playerId, name)} seed={name} />
      {dealer ? (
        <span className={`role-badge dealer${blind ? " paired" : ""}`}>D</span>
      ) : null}
      {blind ? <span className="role-badge">{blind}</span> : null}
    </span>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  columns,
}: {
  label: string;
  /** With `icon`, the chip shows the icon and `label` becomes its accessible name. */
  options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  /** Wrap into rows of this many equal chips instead of one row. */
  columns?: number;
}) {
  return (
    <div
      className={columns ? "segmented grid" : "segmented"}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? "selected" : ""}
          aria-label={option.icon ? option.label : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.icon ?? option.label}
        </button>
      ))}
    </div>
  );
}

/** Drawn rather than typed: the display font's ∞ glyph is too small to read. */
function InfinityIcon() {
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
function TurnSeatsIcon() {
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

function PencilIcon() {
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

/** An arrow leaving a tray: share. */
function ShareIcon() {
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

function UndoIcon() {
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

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
      {/* Bottom-heavy, so the bars rest on the label's baseline. */}
      <rect x="6" y="7" width="4" height="12" rx="1" />
      <rect x="14" y="7" width="4" height="12" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
      <path d="M8 7.8v10.4a1 1 0 0 0 1.5.86l8.5-5.2a1 1 0 0 0 0-1.72l-8.5-5.2A1 1 0 0 0 8 7.8Z" />
    </svg>
  );
}

/** "Good evening": the greeting above your name on Home. */
function greeting(hour: number) {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "Sun 28 Sep": the date beside Last Session. */
function shortDay(timestamp: number) {
  const date = new Date(timestamp);
  const part = (options: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString("en-US", options);
  return `${part({ weekday: "short" })} ${date.getDate()} ${part({ month: "short" })}`;
}

/** The ways to record a game, offered as equals; tournaments come later. */
const GAME_KINDS: ReadonlyArray<{
  kind: "hands" | "ledger" | "tournament";
  kicker: string;
  title: string;
  text: string;
  suit: string;
}> = [
  {
    kind: "hands",
    kicker: "Blinds and bets",
    title: "Hand by hand",
    text: "Seat players, set stacks, deal",
    suit: "♦",
  },
  {
    kind: "ledger",
    kicker: "Just the money",
    title: "Quick ledger",
    text: "Buy-ins and cash-outs, then count the chips",
    suit: "♣",
  },
  {
    kind: "tournament",
    kicker: "Last one standing",
    title: "Tournament",
    text: "Rising blinds, play to a winner",
    suit: "♥",
  },
];

/** The choice of how to record a game, before its setup. */
function NewGameView({
  onChoose,
}: {
  onChoose: (kind: "hands" | "ledger") => void;
}) {
  return (
    <section className="new-game-view">
      {GAME_KINDS.map((option) => {
        const { kind } = option;
        const soon = kind === "tournament";
        return (
          <button
            key={kind}
            className={`glass game-kind-card game-kind-${kind}`}
            type="button"
            disabled={soon}
            onClick={soon ? undefined : () => onChoose(kind)}
          >
            <span className="game-kind-watermark" aria-hidden="true">
              {option.suit}
            </span>
            <span className="game-kind-copy">
              <span className="game-kind-kicker">{option.kicker}</span>
              <strong>{option.title}</strong>
              <small>{option.text}</small>
            </span>
            {soon ? (
              <span className="game-kind-soon">Coming soon</span>
            ) : (
              <span className="game-kind-go" aria-hidden="true">
                {option.suit}
              </span>
            )}
          </button>
        );
      })}
    </section>
  );
}

function HomeView({
  game,
  displayName,
  selfPlayerId,
  history,
  friendRequests,
  legacyGame,
  legacySessionCount,
  gameBackups,
  restoringBackup,
  onRestoreBackup,
  onDeleteBackup,
  onAdoptLegacyGame,
  onGame,
  onNewGame,
  onSessions,
  onReviewRequests,
  onOpenHands,
  onOpenWhoWins,
  onReviewLegacySessions,
}: {
  game: GameState | null;
  displayName: string | null;
  selfPlayerId: string | null;
  history: PokerSession[];
  friendRequests: FriendOverview["received"];
  legacyGame: GameState | null;
  legacySessionCount: number;
  gameBackups: GameBackupSummary[];
  restoringBackup: boolean;
  onRestoreBackup: (backup: GameBackupSummary) => void;
  onDeleteBackup: (backup: GameBackupSummary) => void;
  onAdoptLegacyGame: () => void;
  onGame: () => void;
  onNewGame: () => void;
  onSessions: () => void;
  onReviewRequests: () => void;
  onOpenHands: () => void;
  onOpenWhoWins: () => void;
  onReviewLegacySessions: () => void;
}) {
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    // The server doesn't know the phone's clock, so the greeting waits for it.
    const timer = setTimeout(() => setHour(new Date().getHours()), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="home-view">
      <HomeFan />
      <div className="home-top">
        <div className="brand">
          <BrandMark className="brand-chip" />
          <span className="brand-name">{APP_NAME}</span>
        </div>
      </div>

      <div className="home-greeting">
        <span className="home-greeting-kicker">
          {game ? "Game in progress" : hour === null ? "\u00a0" : greeting(hour)}
        </span>
        <h1 className="literal-text">{displayName || APP_NAME}</h1>
      </div>

      <div className="home-stack">
        {!game && gameBackups[0] ? (
          <UnfinishedGameCard
            backup={gameBackups[0]}
            busy={restoringBackup}
            onRestore={() => onRestoreBackup(gameBackups[0])}
            onDelete={() => onDeleteBackup(gameBackups[0])}
          />
        ) : null}
        {game ? (
          <GameAmounts game={game}>
            <HomeLiveCard game={game} selfPlayerId={selfPlayerId} onOpen={onGame} />
          </GameAmounts>
        ) : (
          <button className="home-start-card" type="button" onClick={onNewGame}>
            <span className="home-start-watermark" aria-hidden="true">
              ♠
            </span>
            <span className="home-start-kicker">No game running</span>
            <span className="home-start-row">
              <span>
                <strong>Start a game</strong>
                <small>Hand by hand, or a quick ledger</small>
              </span>
              <span className="home-start-go" aria-hidden="true">
                ♦
              </span>
            </span>
          </button>
        )}

        {legacyGame || legacySessionCount ? (
          <section className="glass legacy-data-card" aria-labelledby="legacy-data-title">
            <div>
              <span className="eyebrow">Unassigned device data</span>
              <h2 id="legacy-data-title">Review Before Adding It</h2>
              <p>
                Data saved before accounts stays separate until you choose which
                account owns it.
              </p>
            </div>
            <div className="legacy-data-actions">
              {legacyGame ? (
                <button
                  className="ghost"
                  type="button"
                  disabled={Boolean(game)}
                  onClick={onAdoptLegacyGame}
                >
                  {game ? "Finish current game first" : "Review legacy game"}
                </button>
              ) : null}
              {legacySessionCount ? (
                <button
                  className="ghost"
                  type="button"
                  onClick={onReviewLegacySessions}
                >
                  Review {legacySessionCount} saved session
                  {legacySessionCount === 1 ? "" : "s"}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {friendRequests.length ? (
          <button
            className="glass home-notice"
            type="button"
            onClick={onReviewRequests}
          >
            <span className="home-notice-avatar" aria-hidden="true">
              <AvatarArt
                id={friendRequests[0].avatar}
                seed={friendRequests[0].displayName ?? "Someone"}
              />
            </span>
            <span className="home-notice-copy">
              <b className="literal-text">
                {friendRequests[0].displayName ?? "Someone"}
              </b>
              {friendRequests.length > 1
                ? ` and ${friendRequests.length - 1} other${friendRequests.length === 2 ? "" : "s"} want to be friends`
                : " wants to be friends"}
            </span>
            <span className="home-notice-action">Review</span>
          </button>
        ) : null}

        <HomeLastSession
          history={history}
          selfPlayerId={selfPlayerId}
          onOpen={onSessions}
        />

        <div className="home-links-list">
          <button className="glass home-link-row" type="button" onClick={onOpenHands}>
            <span className="home-mini-cards" aria-hidden="true">
              <span>A♠</span>
              <span className="red">K♥</span>
              <span className="red">Q♦</span>
            </span>
            <span className="home-link-copy">
              <b>Hand rankings</b>
              <small>Royal flush to high card</small>
            </span>
          </button>
          <button className="glass home-link-row" type="button" onClick={onOpenWhoWins}>
            <span className="home-mini-cards" aria-hidden="true">
              <span>?</span>
              <span className="red">A♥</span>
              <span>K♣</span>
            </span>
            <span className="home-link-copy">
              <b>Who wins?</b>
              <small>Enter the cards, see the winning hand and why</small>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

/** Design 6e: Home's background, a fanned hand of glass cards. */
const HOME_FAN = [
  { rank: "A", suit: "♠", tone: "g", turn: -38 },
  { rank: "K", suit: "♥", tone: "b", turn: -24 },
  { rank: "Q", suit: "♣", tone: "g", turn: -10 },
  { rank: "J", suit: "♦", tone: "b", turn: 4 },
  { rank: "10", suit: "♠", tone: "g", turn: 18 },
] as const;

function HomeFan() {
  return (
    <div className="home-fan" aria-hidden="true">
      <div className="home-fan-column">
        <span className="home-fan-glow" />
        {HOME_FAN.map((card) => (
          <span
            key={card.rank}
            className={`home-fan-card tone-${card.tone}`}
            style={{ transform: `rotate(${card.turn}deg)` }}
          >
            <span className="home-fan-corner">
              <span>{card.rank}</span>
              <span>{card.suit}</span>
            </span>
            <span className="home-fan-pip">{card.suit}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** How long ago, in words: "just now", "5 min ago", "3 hours ago", "2 days ago". */
function timeAgo(timestamp: number, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Home's offer to carry on a game backed up from this or another device. */
function UnfinishedGameCard({
  backup,
  busy,
  onRestore,
  onDelete,
}: {
  backup: GameBackupSummary;
  busy: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  // The time is read once the page is on the phone, which knows the clock.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <section
      className="glass legacy-data-card"
      aria-labelledby="unfinished-game-title"
    >
      <div>
        <span className="eyebrow">Unfinished game</span>
        <h2 id="unfinished-game-title" className="literal-text">
          {backup.name}
        </h2>
        <p>
          {backup.ledger
            ? "Quick ledger"
            : backup.handInProgress
              ? `Hand ${backup.handNo} in progress`
              : `${backup.handNo} hand${backup.handNo === 1 ? "" : "s"} played`}{" "}
          · {backup.players} players
          {now === null ? "" : ` · saved ${timeAgo(backup.updatedAt, now)}`}
          {backup.thisDevice ? "" : " on another device"}
        </p>
      </div>
      <div className="legacy-data-actions">
        <button className="primary" type="button" disabled={busy} onClick={onRestore}>
          {busy ? "Restoring…" : "Restore game"}
        </button>
        <button className="ghost danger-text" type="button" disabled={busy} onClick={onDelete}>
          Delete
        </button>
      </div>
    </section>
  );
}

/** Home's card while a game is on: the pot, blinds and stacks at a glance. */
function HomeLiveCard({
  game,
  selfPlayerId,
  onOpen,
}: {
  game: GameState;
  selfPlayerId: string | null;
  onOpen: () => void;
}) {
  const { money } = useMoney();
  if (isLedgerGame(game)) {
    return <HomeLedgerCard game={game} selfPlayerId={selfPlayerId} onOpen={onOpen} />;
  }
  const hand = game.hand;
  const blinds = blindStatus(game);
  const name = game.sessionLabel || game.gameName;
  const meta = [
    name,
    hand ? `Hand ${hand.no}` : "Between hands",
    hand ? STAGES[hand.stage] : null,
  ].filter(Boolean);
  const me = selfPlayerId
    ? game.players.find((player) => player.id === selfPlayerId)
    : undefined;
  const seated = game.players.filter((player) => !player.left);
  const leader = seated.reduce<Player | null>(
    (best, player) => (!best || player.stack > best.stack ? player : best),
    null,
  );

  return (
    <button className="glass home-live-card" type="button" onClick={onOpen}>
      <span className="home-live-glow" aria-hidden="true" />
      <span className="home-live-top">
        <span className="live-pill">
          <span aria-hidden="true" />
          Live
        </span>
        <span className="home-live-meta">{meta.join(" · ")}</span>
      </span>
      <span className="home-live-pot-row">
        <span>
          <span className="home-kicker">{hand ? "Pot" : "Hands dealt"}</span>
          <span className="home-live-pot">
            {hand ? money(hand.pot) : game.handNo}
          </span>
        </span>
        <span className="home-live-blinds">
          {money(blinds.smallBlind)} / {money(blinds.bigBlind)}
          {blinds.schedule ? <em> L{blinds.level + 1}</em> : null}
        </span>
      </span>
      <span className="home-live-stats">
        {me ? (
          <span>
            <small>Your stack</small>
            <b>{money(me.stack)}</b>
          </span>
        ) : (
          <span>
            <small>At the table</small>
            <b>
              {seated.length} player{seated.length === 1 ? "" : "s"}
            </b>
          </span>
        )}
        {leader ? (
          <span>
            <small>
              Chip leader · <span className="literal-text">{leader.name}</span>
            </small>
            <b>{money(leader.stack)}</b>
          </span>
        ) : null}
      </span>
      <span className="home-live-cta">Back to the table</span>
    </button>
  );
}

/** Home's card while a quick ledger is on: the chips bought and who's in. */
function HomeLedgerCard({
  game,
  selfPlayerId,
  onOpen,
}: {
  game: GameState;
  selfPlayerId: string | null;
  onOpen: () => void;
}) {
  const { money } = useMoney();
  const totals = ledgerTotals(game);
  const seated = ledgerSeated(game);
  const name = game.sessionLabel || game.gameName;
  const myIndex = selfPlayerId
    ? game.players.findIndex((player) => player.id === selfPlayerId)
    : -1;

  return (
    <button className="glass home-live-card" type="button" onClick={onOpen}>
      <span className="home-live-glow" aria-hidden="true" />
      <span className="home-live-top">
        <span className="live-pill">
          <span aria-hidden="true" />
          Live
        </span>
        <span className="home-live-meta">
          {[name, "Quick ledger"].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="home-live-pot-row">
        <span>
          <span className="home-kicker">Bought in</span>
          <span className="home-live-pot">{money(totals.bought)}</span>
        </span>
        <span className="home-live-blinds">
          {seated.length} at the table
        </span>
      </span>
      <span className="home-live-stats">
        {myIndex >= 0 ? (
          <span>
            <small>Your buy-ins</small>
            <b>{money(totalBuyIns(game, myIndex))}</b>
          </span>
        ) : (
          <span>
            <small>Players</small>
            <b>{game.players.length}</b>
          </span>
        )}
        <span>
          <small>Cashed out</small>
          <b>{money(totals.cashedOut)}</b>
        </span>
      </span>
      <span className="home-live-cta">Back to the game</span>
    </button>
  );
}

/** Your most recent saved game: your result, the top winner, everyone's net. */
function HomeLastSession({
  history,
  selfPlayerId,
  onOpen,
}: {
  history: PokerSession[];
  selfPlayerId: string | null;
  onOpen: () => void;
}) {
  const { currency } = useMoney();
  const session = history
    .filter((item) => !item.discardedAt)
    .reduce<PokerSession | null>(
      (latest, item) =>
        !latest ||
        item.date > latest.date ||
        (item.date === latest.date &&
          (item.sessionNumber ?? 0) > (latest.sessionNumber ?? 0))
          ? item
          : latest,
      null,
    );
  if (!session || !session.results.length) return null;
  // Results in money at the game's chip value; chips if they don't balance.
  let moneyNets: Map<PokerSession["results"][number], number> | null = null;
  try {
    const inMoney = sessionMoney(session);
    moneyNets = new Map(
      session.results.map((result, index) => [
        result,
        inMoney.results[index].net,
      ]),
    );
  } catch {
    moneyNets = null;
  }
  const signedMoney = (result: PokerSession["results"][number]) =>
    moneyNets?.has(result)
      ? formatSignedMoney(moneyNets.get(result)! / 100, currency)
      : formatSignedChips(result.net, session.chipUnit, currency);

  let invested = new Map<string, number>();
  try {
    invested = new Map(
      deriveSessionAccounting(session).results.map((result) => [
        standingsKey(result),
        result.invested,
      ]),
    );
  } catch {
    // An unbalanced old session still shows its nets, just without a return.
  }
  const results = [...session.results].sort((a, b) => b.net - a.net);
  const mine = selfPlayerId
    ? results.find((result) => result.playerId === selfPlayerId)
    : undefined;
  const winner = results[0];
  const featured = mine ?? winner;
  const featuredInvested = invested.get(standingsKey(featured));
  const featuredReturn =
    featuredInvested === undefined
      ? null
      : sessionReturn(featured.net, featuredInvested);
  const largest = Math.max(1, ...results.map((result) => Math.abs(result.net)));
  const title =
    session.name ||
    (session.sessionNumber ? `Game ${session.sessionNumber}` : "Game");
  const details = [
    title,
    session.kind === "ledger"
      ? "Quick ledger"
      : `${session.hands} hand${session.hands === 1 ? "" : "s"}`,
    `${results.length} player${results.length === 1 ? "" : "s"}`,
  ];

  return (
    <>
      <div className="home-section-heading">
        <h2>Last session</h2>
        <span>{shortDay(session.date)}</span>
      </div>
      <button className="glass home-last-card" type="button" onClick={onOpen}>
        <span className="home-last-top">
          <span className="home-last-main">
            <small className="literal-text">{details.join(" · ")}</small>
            <strong className={toneClass(featured.net)}>
              {signedMoney(featured)}
            </strong>
            <small>
              {mine ? "Your result" : (
                <>
                  Top winner · <span className="literal-text">{winner.name}</span>
                </>
              )}
              {featuredReturn === null
                ? ""
                : ` · ${formatShortPercent(featuredReturn)} return`}
            </small>
          </span>
          {mine && winner !== mine ? (
            <span className="home-last-winner">
              <small>Top winner</small>
              <b className="literal-text">{winner.name}</b>
              <em className={toneClass(winner.net)}>{signedMoney(winner)}</em>
            </span>
          ) : null}
        </span>
        <span className="home-last-bars">
          {results.map((result) => {
            const share = Math.round((Math.abs(result.net) / largest) * 100);
            const isMe = result === mine;
            return (
              <span
                className={`home-last-bar${isMe ? " me" : ""}`}
                key={standingsKey(result)}
              >
                <span className={isMe ? "" : "literal-text"}>
                  {isMe ? "You" : result.name}
                </span>
                <span className="home-bar-track" aria-hidden="true">
                  <span>
                    {result.net < 0 ? (
                      <i className="neg" style={{ width: `${share}%` }} />
                    ) : null}
                  </span>
                  <span>
                    {result.net > 0 ? (
                      <i className="pos" style={{ width: `${share}%` }} />
                    ) : null}
                  </span>
                </span>
                <b className={toneClass(result.net)}>{signedMoney(result)}</b>
              </span>
            );
          })}
        </span>
      </button>
    </>
  );
}

function LegacySessionReview({
  sessions,
  onAdopt,
  onClose,
}: {
  sessions: PokerSession[];
  onAdopt: (selectedIds: Set<string>) => Promise<void>;
  onClose: () => void;
}) {
  const { currency } = useMoney();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  function toggleSession(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function adoptSelected() {
    if (!selectedIds.size || submitting) return;
    setSubmitting(true);
    try {
      await onAdopt(selectedIds);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal legacy-review-modal show" role="presentation">
      <div
        className="sheet legacy-review-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legacy-review-title"
      >
        <div className="legacy-review-heading">
          <span className="legacy-data-kicker">Unassigned Device Data</span>
          <h2 id="legacy-review-title">Choose Sessions For This Account</h2>
          <p>
            Review the date, players and stakes. Only checked sessions will be
            added; unchecked sessions remain unassigned on this device.
          </p>
        </div>

        <div className="legacy-session-list">
          {sessions.map((session) => (
            <label className="legacy-session-option" key={session.id}>
              <input
                type="checkbox"
                checked={selectedIds.has(session.id)}
                onChange={() => toggleSession(session.id)}
              />
              <span>
                <strong>{session.name || "Saved Game"}</strong>
                <small>
                  {formatDate(session.date)} · Big Blind{" "}
                  {formatChips(session.ante, session.chipUnit, currency)}
                  {" · "}
                  {session.results.map((result) => result.name).join(", ")}
                </small>
              </span>
            </label>
          ))}
        </div>

        <div className="legacy-review-actions">
          <button
            className="ghost"
            type="button"
            disabled={submitting}
            onClick={onClose}
          >
            Leave Unassigned
          </button>
          <button
            className="primary"
            type="button"
            disabled={!selectedIds.size || submitting}
            onClick={() => void adoptSelected()}
          >
            {submitting
              ? "Adding…"
              : `Add ${selectedIds.size || "Selected"} To This Account`}
          </button>
        </div>
      </div>
    </div>
  );
}

function importMappingNote(mapping: ImportPlayerMapping) {
  switch (mapping.kind) {
    case "existing":
      return mapping.player.name === mapping.fileName
        ? "Your player"
        : `Your player ${mapping.player.name}`;
    case "discarded":
      return `Your discarded player ${mapping.player.name}; stays discarded`;
    case "new":
      return "New player; will be added to your list";
    case "unknown-record":
      return "Player record from another ledger; can't be imported";
  }
}

function ImportReview({
  plan,
  onConfirm,
  onClose,
}: {
  plan: ImportPlan;
  onConfirm: (plan: ImportPlan) => Promise<void>;
  onClose: () => void;
}) {
  const { currency } = useMoney();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const count = plan.additions.length;
  const skipped = [
    plan.alreadySaved
      ? `${plan.alreadySaved} already in your ledger`
      : null,
    plan.duplicatesInFile
      ? `${plan.duplicatesInFile} repeated in the file`
      : null,
    plan.unreadable ? `${plan.unreadable} unreadable` : null,
  ].filter(Boolean);
  const newPlayers = plan.players.filter((mapping) => mapping.kind === "new");

  async function confirm() {
    if (submitting || plan.blocked) return;
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(plan);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="modal legacy-review-modal show" role="presentation">
      <div
        className="sheet legacy-review-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-review-title"
      >
        <div className="legacy-review-heading">
          <span className="legacy-data-kicker">Import Backup</span>
          <h2 id="import-review-title">
            {count} New Game{count === 1 ? "" : "s"} To Add
          </h2>
          <p>
            Check how each player in the file matches your list before
            anything is saved.
            {skipped.length ? ` Skipped: ${skipped.join(", ")}.` : ""}
          </p>
        </div>

        <div className="legacy-session-list import-review-list">
          <h3 className="import-review-subhead">
            Players ({plan.players.length}
            {newPlayers.length ? `, ${newPlayers.length} new` : ""})
          </h3>
          {plan.players.map((mapping) => (
            <div
              className={`legacy-session-option import-mapping import-mapping-${mapping.kind}`}
              key={`${mapping.kind}:${mapping.fileName}:${"player" in mapping ? mapping.player.id : ""}`}
            >
              <span>
                <strong>{mapping.fileName}</strong>
                <small>
                  {importMappingNote(mapping)} · {mapping.games} game
                  {mapping.games === 1 ? "" : "s"}
                </small>
              </span>
            </div>
          ))}

          <h3 className="import-review-subhead">Games</h3>
          {plan.additions.map((session) => (
            <div className="legacy-session-option import-mapping" key={session.id}>
              <span>
                <strong>{session.name || "Saved Game"}</strong>
                <small>
                  {formatDate(session.date)} ·{" "}
                  {session.kind === "ledger"
                    ? "Quick ledger"
                    : `Big Blind ${formatChips(session.ante, session.chipUnit, chipCurrency(currency, session.chipValue))}`}
                  {" · "}
                  {session.results.map((result) => result.name).join(", ")}
                </small>
              </span>
            </div>
          ))}
        </div>

        {plan.blocked ? (
          <p className="import-review-error" role="alert">
            This file has player records from another host&apos;s ledger, so
            it can&apos;t be imported here. Nothing will be added.
          </p>
        ) : null}
        {error ? (
          <p className="import-review-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="legacy-review-actions">
          <button
            className="ghost"
            type="button"
            disabled={submitting}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="primary"
            type="button"
            disabled={plan.blocked || submitting}
            onClick={() => void confirm()}
          >
            {submitting
              ? "Adding…"
              : `Add ${count} Game${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function SetupView({
  kind,
  players,
  selfPlayerId,
  loading,
  error,
  onRetry,
  suggestedName,
  onStart,
}: {
  /** The kind of game this sets up, chosen on Home. */
  kind: "hands" | "ledger";
  players: PlayerProfile[];
  /** Your own player, listed first and marked You. */
  selfPlayerId: string | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  suggestedName: string;
  onStart: (input: {
    /** How the game is recorded: hand by hand, or a quick ledger. */
    kind: "hands" | "ledger";
    name: string;
    chipUnit: ChipUnit;
    stack: number;
    ante: number;
    smallBlind: number | null;
    blinds: BlindSchedule | null;
    rebuyRules: RebuyRules | null;
    bigBlindAnte: boolean;
    rakeRules: RakeRules | null;
    chipValue: ChipValue | null;
    players: PlayerProfile[];
    buyIns: number[] | null;
    randomDealer: boolean;
  }) => void;
}) {
  const { currency } = useMoney();
  // Chip value: off, a chip is one unit of the currency, as always; on, a
  // buy-in of the starting stack costs `buyInPrice` hundredths, and chip
  // amounts in this form show as plain counts.
  const [chipValueOn, setChipValueOn] = useState(false);
  const [buyInPrice, setBuyInPrice] = useState<number | null>(null);
  const [showChipValueHelp, setShowChipValueHelp] = useState(false);
  const chipsCode = chipCurrency(currency, chipValueOn) ?? currency;
  const symbol = currencySymbol(chipsCode);
  // Every amount in this form is in hundredths, so 0.25 and 10,000 use the
  // same boxes. The game's chip unit follows from them when it starts
  // (lib/poker/stakes.ts); nobody picks it.
  const money = (value: number) => formatChips(value, "cents", chipsCode);
  const ledger = kind === "ledger";
  const [name, setName] = useState("");
  const [stack, setStack] = useState(DEFAULT_STACK);
  const [ante, setAnte] = useState(() => defaultBigBlind(DEFAULT_STACK));
  const [risingBlinds, setRisingBlinds] = useState(false);
  const [blindUnit, setBlindUnit] = useState<BlindSchedule["unit"]>(
    DEFAULT_BLIND_SCHEDULE.unit,
  );
  const [blindEvery, setBlindEvery] = useState(DEFAULT_BLIND_SCHEDULE.every);
  const [blindRaiseType, setBlindRaiseType] = useState<
    BlindSchedule["raiseType"]
  >(DEFAULT_BLIND_SCHEDULE.raiseType);
  const [blindRaiseBy, setBlindRaiseBy] = useState(
    DEFAULT_BLIND_SCHEDULE.raiseBy,
  );
  const [customStack, setCustomStack] = useState(false);
  // Own amounts: each player can buy in for a different amount, with the
  // starting stack as the default. Typed amounts are kept by player.
  const [ownAmounts, setOwnAmounts] = useState(false);
  const [seatAmounts, setSeatAmounts] = useState<Record<string, number>>({});
  const [showOwnAmountsHelp, setShowOwnAmountsHelp] = useState(false);
  const [customAnte, setCustomAnte] = useState(false);
  // Odd blinds: off keeps the usual half. A chip picks a share of the big
  // blind, so it follows big blind changes; Other is a fixed amount.
  const [oddBlinds, setOddBlinds] = useState(false);
  const [smallBlindShare, setSmallBlindShare] = useState(40);
  const [customSmallBlind, setCustomSmallBlind] = useState(false);
  const [smallBlindAmount, setSmallBlindAmount] = useState(4_000);
  const [rebuyRules, setRebuyRules] = useState<RebuyRules>({
    maxRebuys: null,
    closeAtBigBlind: null,
  });
  const [bigBlindAnte, setBigBlindAnte] = useState(false);
  const [rakeOn, setRakeOn] = useState(false);
  const [rakePercent, setRakePercent] = useState<number>(5);
  // Other: a typed percent, 0.1 to 10 in steps of 0.1.
  const [customRake, setCustomRake] = useState(false);
  // The cap follows the big blind (three of them) until it is typed in.
  const [typedRakeCap, setTypedRakeCap] = useState<number | null>(null);
  // Tapping players seats them in tap order; the list below reorders them.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const playerCount = selectedIds.length;
  // On, the first dealer is drawn only when the game starts, so nobody
  // sees it during setup; off, seat 1 deals first.
  const [randomDealer, setRandomDealer] = useState(true);
  const seatListRef = useRef<HTMLDivElement>(null);
  const seatDragRef = useRef<{
    pointerId: number;
    from: number;
    over: number | null;
    row: HTMLElement;
    rowCenters: number[];
    rowStep: number;
    startScrollY: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const seatDropAnimationRef = useRef<{
    row: HTMLElement;
    fromRect: DOMRect;
  } | null>(null);
  const seatScrollFrameRef = useRef<number | null>(null);
  const [draggingSeat, setDraggingSeat] = useState<number | null>(null);
  const [dropSeat, setDropSeat] = useState<number | null>(null);
  const [seatDragStep, setSeatDragStep] = useState(0);
  const [showDealerHelp, setShowDealerHelp] = useState(false);
  const [showAnteHelp, setShowAnteHelp] = useState(false);
  const [showRakeHelp, setShowRakeHelp] = useState(false);
  const [showOddBlindsHelp, setShowOddBlindsHelp] = useState(false);

  useEffect(() => () => {
    if (seatScrollFrameRef.current !== null) {
      cancelAnimationFrame(seatScrollFrameRef.current);
    }
  }, []);

  useLayoutEffect(() => {
    const landing = seatDropAnimationRef.current;
    if (!landing) return;
    seatDropAnimationRef.current = null;
    // The rows that stepped aside during the drag lose that shift in the
    // same render that moves them to their new places, so the two cancel
    // out. Without this their slide transition would replay the removed
    // shift from the new place: a jump of one seat, then a slide back.
    const rows = [
      ...(seatListRef.current?.querySelectorAll<HTMLElement>(".seat-row") ?? []),
    ];
    for (const row of rows) row.style.transition = "none";
    landing.row.style.removeProperty("transform");
    const toRect = landing.row.getBoundingClientRect();
    requestAnimationFrame(() => {
      for (const row of rows) row.style.removeProperty("transition");
    });
    if (
      typeof landing.row.animate !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    // Compare centres: the lifted row was scaled up, so its corner is off.
    const dx =
      landing.fromRect.left + landing.fromRect.width / 2 -
      (toRect.left + toRect.width / 2);
    const dy =
      landing.fromRect.top + landing.fromRect.height / 2 -
      (toRect.top + toRect.height / 2);
    landing.row.animate(
      [
        { transform: `translate3d(${dx}px, ${dy}px, 0) scale(1.03)` },
        { transform: "translate3d(0, 0, 0) scale(1)" },
      ],
      { duration: 190, easing: "cubic-bezier(.2, .8, .2, 1)" },
    );
  }, [selectedIds]);

  const schedule: BlindSchedule | null = risingBlinds
    ? {
        unit: blindUnit,
        every: blindEvery,
        raiseType: blindRaiseType,
        raiseBy: blindRaiseBy,
      }
    : null;
  const scheduleValid =
    !schedule ||
    (schedule.every >= 1 &&
      schedule.raiseBy > (schedule.raiseType === "multiply" ? 1 : 0));
  // The game's unit, from every amount typed or picked (all in hundredths).
  const amountFor = (playerId: string) => seatAmounts[playerId] ?? stack;
  // A quick ledger has only buy-ins, so the blind amounts don't count.
  const chipUnit = chipUnitFor(stack, [
    ...(ownAmounts ? selectedIds.map(amountFor) : []),
    ...(ledger
      ? []
      : [
          ante,
          risingBlinds && blindRaiseType === "add" ? blindRaiseBy : null,
          rebuyRules.closeAtBigBlind,
          oddBlinds && customSmallBlind ? smallBlindAmount : null,
        ]),
  ]);
  /** The plan in the game's unit, which rounds its levels like the game will. */
  const scheduleInUnit = (plan: BlindSchedule | null) =>
    plan?.raiseType === "add"
      ? { ...plan, raiseBy: inUnit(plan.raiseBy, chipUnit) }
      : plan;
  const ladder = schedule && scheduleValid
    ? Array.from({ length: 4 }, (_, level) =>
        fromUnit(
          bigBlindAtLevel(
            inUnit(Math.max(1, ante), chipUnit),
            scheduleInUnit(schedule),
            level,
          ),
          chipUnit,
        ),
      )
    : [];

  function toggleSeat(playerId: string) {
    setSelectedIds((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : current.length >= MAX_SEATS
          ? current
          : [...current, playerId],
    );
  }

  /**
   * A new stack brings its usual big blind (100 big blinds deep) and drops
   * amounts picked for the old one, so 50 and 0.50 never sit beside 50K.
   */
  function chooseStack(next: number) {
    const bigBlind = defaultBigBlind(next);
    setStack(next);
    setAnte(bigBlind);
    setCustomAnte(false);
    setCustomSmallBlind(false);
    setSmallBlindAmount(smallBlindFor(bigBlind));
    if (blindRaiseType === "add") setBlindRaiseBy(bigBlind);
    setRebuyRules((rules) => ({ ...rules, closeAtBigBlind: null }));
  }

  function chooseBlindLevels(choice: "fixed" | BlindSchedule["unit"]) {
    if (choice === "fixed") {
      setRisingBlinds(false);
      return;
    }
    if (!risingBlinds || blindUnit !== choice) {
      setBlindEvery(choice === "hands" ? 10 : 20);
    }
    setRisingBlinds(true);
    setBlindUnit(choice);
  }

  function moveSeat(from: number, to: number) {
    if (from === to) return;
    setSelectedIds((current) => {
      if (
        from < 0 ||
        to < 0 ||
        from >= current.length ||
        to >= current.length
      ) {
        return current;
      }
      const next = [...current];
      const [playerId] = next.splice(from, 1);
      next.splice(to, 0, playerId);
      return next;
    });
  }

  function updateSeatDropTarget(drag: NonNullable<typeof seatDragRef.current>) {
    const list = seatListRef.current;
    const bounds = list?.getBoundingClientRect();
    let over: number | null = null;
    if (
      list &&
      bounds &&
      drag.x >= bounds.left - 32 &&
      drag.x <= bounds.right + 32 &&
      drag.y >= bounds.top - 16 &&
      drag.y <= bounds.bottom + 16
    ) {
      let nearestDistance = Infinity;
      const scrollDelta = window.scrollY - drag.startScrollY;
      drag.rowCenters.forEach((center, index) => {
        const distance = Math.abs(drag.y - (center - scrollDelta));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          over = index;
        }
      });
    }
    if (drag.over !== over) {
      drag.over = over;
      setDropSeat(over);
    }
  }

  function positionDraggedSeat(drag: NonNullable<typeof seatDragRef.current>) {
    // Vertical only: a row pushed past the screen's side edge widens the
    // page, and phones zoom out to fit it, which moves the fixed tab bar
    // and leaves it there after the drop.
    const y = drag.y - drag.startY + window.scrollY - drag.startScrollY;
    drag.row.style.transform = `translate3d(0, ${y}px, 0) scale(1.03)`;
  }

  function scrollWhileDragging() {
    seatScrollFrameRef.current = null;
    const drag = seatDragRef.current;
    if (!drag?.moved) return;
    const edge = 72;
    const distanceFromBottom = window.innerHeight - drag.y;
    const step =
      drag.y < edge
        ? -Math.max(4, Math.ceil((edge - drag.y) / 5))
        : distanceFromBottom < edge
          ? Math.max(4, Math.ceil((edge - distanceFromBottom) / 5))
          : 0;
    if (step === 0) return;
    const bounds = seatListRef.current?.getBoundingClientRect();
    if (
      !bounds ||
      (step < 0 && bounds.top >= drag.y) ||
      (step > 0 && bounds.bottom <= drag.y)
    ) {
      return;
    }
    const previousScroll = window.scrollY;
    window.scrollBy(0, step);
    if (window.scrollY === previousScroll) return;
    positionDraggedSeat(drag);
    updateSeatDropTarget(drag);
    seatScrollFrameRef.current = requestAnimationFrame(scrollWhileDragging);
  }

  function stopSeatScroll() {
    if (seatScrollFrameRef.current !== null) {
      cancelAnimationFrame(seatScrollFrameRef.current);
      seatScrollFrameRef.current = null;
    }
  }

  function startSeatDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (
      !selectedIds[index] ||
      loading ||
      error ||
      !event.isPrimary ||
      event.button !== 0
    ) {
      return;
    }
    const list = seatListRef.current;
    const row = event.currentTarget.closest<HTMLElement>(".seat-row");
    if (!list || !row) return;
    const rows = [...list.querySelectorAll<HTMLElement>("[data-seat-index]")];
    const rowGap = Number.parseFloat(window.getComputedStyle(list).rowGap) || 0;
    seatDragRef.current = {
      pointerId: event.pointerId,
      from: index,
      over: index,
      row,
      rowCenters: rows.map((item) => {
        const rect = item.getBoundingClientRect();
        return (rect.top + rect.bottom) / 2;
      }),
      rowStep: row.getBoundingClientRect().height + rowGap,
      startScrollY: window.scrollY,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSeatDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = seatDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5
    ) {
      return;
    }
    if (!drag.moved) {
      // Follow the finger from the first move: the "is-dragging" class that
      // also turns the slide off only arrives with the next render.
      drag.row.style.transition = "none";
      setDraggingSeat(drag.from);
      setDropSeat(drag.from);
      setSeatDragStep(drag.rowStep);
    }
    drag.moved = true;
    positionDraggedSeat(drag);
    updateSeatDropTarget(drag);
    if (seatScrollFrameRef.current === null) {
      seatScrollFrameRef.current = requestAnimationFrame(scrollWhileDragging);
    }
  }

  function endSeatDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = seatDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    stopSeatScroll();
    if (drag.moved && drag.over !== null && drag.over !== drag.from) {
      seatDropAnimationRef.current = {
        row: drag.row,
        fromRect: drag.row.getBoundingClientRect(),
      };
      moveSeat(drag.from, drag.over);
    } else {
      drag.row.style.removeProperty("transform");
      drag.row.style.removeProperty("transition");
    }
    seatDragRef.current = null;
    setDraggingSeat(null);
    setDropSeat(null);
    setSeatDragStep(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function cancelSeatDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (seatDragRef.current?.pointerId !== event.pointerId) return;
    stopSeatScroll();
    seatDragRef.current.row.style.removeProperty("transform");
    seatDragRef.current.row.style.removeProperty("transition");
    seatDragRef.current = null;
    setDraggingSeat(null);
    setDropSeat(null);
    setSeatDragStep(0);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedPlayers = selectedIds
      .map((id) => players.find((player) => player.id === id))
      .filter((player): player is PlayerProfile => Boolean(player));
    if (
      playerCount < 2 ||
      selectedPlayers.length !== playerCount ||
      new Set(selectedPlayers.map((player) => player.id)).size !== playerCount
    ) {
      return;
    }
    const closeAt = setupRebuyRules.closeAtBigBlind;
    onStart({
      kind,
      chipValue: setupChipValue,
      bigBlindAnte,
      rakeRules: rakeOn
        ? {
            percent: Math.round(rakePercent * 10) / 10,
            cap: inUnit(rakeCap, chipUnit),
          }
        : null,
      name,
      chipUnit,
      stack: inUnit(stack, chipUnit),
      ante: inUnit(ante, chipUnit),
      smallBlind: smallBlind === null ? null : inUnit(smallBlind, chipUnit),
      blinds: scheduleInUnit(schedule),
      rebuyRules: {
        ...setupRebuyRules,
        closeAtBigBlind: closeAt === null ? null : inUnit(closeAt, chipUnit),
      },
      players: selectedPlayers,
      buyIns: ownAmounts
        ? selectedIds.map((id) => inUnit(amountFor(id), chipUnit))
        : null,
      randomDealer,
    });
  }

  const amountsValid =
    !ownAmounts || selectedIds.every((id) => amountFor(id) >= 1);
  const setupChipValue: ChipValue | null =
    chipValueOn && buyInPrice
      ? { chips: inUnit(stack, chipUnit), cents: buyInPrice }
      : null;
  const chipValueValid =
    !chipValueOn ||
    (buyInPrice !== null &&
      buyInPrice >= 1 &&
      buyInPrice <= MAX_CHIP_VALUE_CENTS);
  const selectionComplete =
    playerCount >= 2 &&
    playerCount <= MAX_SEATS &&
    new Set(selectedIds).size === playerCount;
  const nameFor = (playerId: string) =>
    players.find((player) => player.id === playerId)?.name ?? "";
  const stackPreset = STACK_PRESETS.includes(stack);
  const anteChoices = bigBlindChoices(stack);
  const antePreset = anteChoices.includes(ante);
  const smallBlindOptions = SMALL_BLIND_SHARES.map((percent) => ({
    percent,
    amount: smallBlindShareOf(Math.max(1, ante), percent, chipUnit),
  })).filter(
    (option, index, all) =>
      all.findIndex((other) => other.amount === option.amount) === index,
  );
  const sharedSmallBlind =
    smallBlindOptions.find((option) => option.percent === smallBlindShare) ??
    smallBlindOptions[0];
  const smallBlind = oddBlinds
    ? customSmallBlind
      ? smallBlindAmount
      : sharedSmallBlind.amount
    : null;
  const smallBlindValid =
    smallBlind === null || isValidSmallBlind(smallBlind, ante);
  // A closing big blind only means something while the blinds rise.
  const setupRebuyRules: RebuyRules = {
    maxRebuys: rebuyRules.maxRebuys,
    closeAtBigBlind:
      schedule && rebuyRules.maxRebuys !== 0
        ? rebuyRules.closeAtBigBlind
        : null,
  };
  const rebuyError = rebuyRulesError(
    setupRebuyRules,
    0,
    Math.max(1, ante),
    money,
  );
  const rebuyCloseOptions = ladder.slice(1);
  const rakeCap = typedRakeCap ?? Math.max(1, ante) * 3;
  const rakeCapValid = !rakeOn || rakeCap >= 1;
  const rakePercentValid = !rakeOn || isValidRakePercent(rakePercent);
  const blindLevelNote = !risingBlinds
    ? "Blinds stay fixed"
    : !scheduleValid
      ? "Check the blind plan"
      : blindRaiseType === "multiply" && blindRaiseBy === 2
        ? "Big blind doubles each level"
        : blindRaiseType === "multiply"
          ? `Big blind ×${blindRaiseBy} each level`
          : `Big blind +${money(blindRaiseBy)} each level`;

  return (
    <ChipUnitContext.Provider value="cents">
      <form className="stack-list setup-view" onSubmit={submit}>
        <section className="glass card">
          <label className="label" htmlFor="game-name">
            Game name <span className="label-note">(Optional)</span>
          </label>
          <input
            className="field"
            id="game-name"
            maxLength={80}
            placeholder={suggestedName}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </section>

        <section className="glass card">
          <div className="card-row">
            <span className="label">Select players</span>
          </div>
          {error ? (
            <div className="inline-state">
              <span>{error}</span>
              <button type="button" className="text-button" onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : loading ? (
            <p className="muted">Loading players…</p>
          ) : players.length ? (
            <div className="seat-chips">
              {[
                ...players.filter((player) => player.id === selfPlayerId),
                ...players.filter((player) => player.id !== selfPlayerId),
              ].map((player) => {
                const seat = selectedIds.indexOf(player.id);
                const full = seat < 0 && playerCount >= MAX_SEATS;
                return (
                  <button
                    key={player.id}
                    type="button"
                    className={`seat-chip ${seat >= 0 ? "seated" : ""}`}
                    aria-pressed={seat >= 0}
                    disabled={full}
                    onClick={() => toggleSeat(player.id)}
                  >
                    <span className="seat-chip-dot" aria-hidden="true">
                      {seat >= 0 ? seat + 1 : "+"}
                    </span>
                    {player.name}
                    {player.id === selfPlayerId ? (
                      <span className="you-tag">You</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {!loading && !error && players.length < 2 ? (
            <p className="muted">Add at least two players before starting a game.</p>
          ) : null}
          {playerCount > 1 ? (
            <>
              <div className="card-row seat-order-heading">
                <span className="label">{ledger ? "Players" : "Seating Order"}</span>
                {ledger ? null : (
                  <div className="heading-with-info">
                    <label className="switch-row">
                      <span>Randomize dealer</span>
                      <button
                        className="switch"
                        type="button"
                        role="switch"
                        aria-checked={randomDealer}
                        aria-label="Randomize dealer"
                        onClick={() => setRandomDealer((on) => !on)}
                      />
                    </label>
                    <button
                      className="info-button"
                      type="button"
                      aria-label="About randomize dealer"
                      onClick={() => setShowDealerHelp(true)}
                    >
                      i
                    </button>
                  </div>
                )}
              </div>
              {showDealerHelp ? (
                <InfoSheet
                  label="About randomize dealer"
                  onClose={() => setShowDealerHelp(false)}
                >
                  <p>
                    <b>Randomize Dealer On:</b> the first dealer is chosen at
                    random when the game starts.
                  </p>
                  <p>
                    <b>Randomize Dealer Off:</b> seat 1 deals first.
                  </p>
                </InfoSheet>
              ) : null}
              <div className="seat-order-list" ref={seatListRef}>
                {selectedIds.map((selectedId, index) => {
                  let shift = 0;
                  if (draggingSeat !== null && dropSeat !== null) {
                    if (
                      draggingSeat < dropSeat &&
                      index > draggingSeat &&
                      index <= dropSeat
                    ) {
                      shift = -seatDragStep;
                    } else if (
                      draggingSeat > dropSeat &&
                      index >= dropSeat &&
                      index < draggingSeat
                    ) {
                      shift = seatDragStep;
                    }
                  }
                  const seatName = nameFor(selectedId);
                  return (
                    <div
                      className={`seat-row${draggingSeat === index ? " is-dragging" : ""}${
                        draggingSeat !== null &&
                        dropSeat === index &&
                        draggingSeat !== index
                          ? " is-drop-target"
                          : ""
                      }`}
                      data-seat-index={index}
                      key={selectedId}
                      style={
                        shift
                          ? { transform: `translate3d(0, ${shift}px, 0)` }
                          : undefined
                      }
                    >
                      {ledger ? null : (
                        <span className="seat-number" aria-hidden="true">
                          {index + 1}
                        </span>
                      )}
                      <Avatar name={seatName} playerId={selectedId} size="small" />
                      <span className="seat-name">{seatName}</span>
                      {ownAmounts ? (
                        <ChipInput
                          className={`field seat-amount${
                            amountFor(selectedId) >= 1 ? "" : " invalid"
                          }`}
                          aria-label={`${seatName}'s buy-in`}
                          value={amountFor(selectedId)}
                          onChange={(chips) =>
                            setSeatAmounts((amounts) => ({
                              ...amounts,
                              [selectedId]: chips,
                            }))
                          }
                        />
                      ) : null}
                      {ledger ? null : (
                        <button
                          className="seat-drag-handle"
                          type="button"
                          disabled={loading || Boolean(error)}
                          aria-label={`Move seat ${index + 1}, ${seatName}. Drag or use arrow keys.`}
                          onPointerDown={(event) => startSeatDrag(event, index)}
                          onPointerMove={moveSeatDrag}
                          onPointerUp={endSeatDrag}
                          onPointerCancel={cancelSeatDrag}
                          onLostPointerCapture={cancelSeatDrag}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowUp" && index > 0) {
                              event.preventDefault();
                              moveSeat(index, index - 1);
                            } else if (
                              event.key === "ArrowDown" &&
                              index < playerCount - 1
                            ) {
                              event.preventDefault();
                              moveSeat(index, index + 1);
                            }
                          }}
                        >
                          <span aria-hidden="true">⠿</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </section>

        <section className="glass card">
          <div className="card-row">
            <span className="label">{ledger ? "Buy-in" : "Starting stack"}</span>
            <div className="heading-with-info">
              <label className="switch-row">
                <span>Own amounts</span>
                <button
                  className="switch"
                  type="button"
                  role="switch"
                  aria-checked={ownAmounts}
                  aria-label="Own amounts"
                  onClick={() => setOwnAmounts((on) => !on)}
                />
              </label>
              <button
                className="info-button"
                type="button"
                aria-label="About own amounts"
                onClick={() => setShowOwnAmountsHelp(true)}
              >
                i
              </button>
            </div>
          </div>
          {showOwnAmountsHelp ? (
            <InfoSheet
              label="About own amounts"
              onClose={() => setShowOwnAmountsHelp(false)}
            >
              <p>
                <b>Own Amounts Off:</b> everyone buys in for the same amount.
              </p>
              <p>
                <b>Own Amounts On:</b> each player can buy in for a different
                amount.
              </p>
            </InfoSheet>
          ) : null}
          <Segmented
            label="Starting stack"
            columns={6}
            options={[
              ...STACK_PRESETS.map((value) => ({
                value,
                label: compactAmount(value),
              })),
              { value: "other" as const, label: "Other" },
            ]}
            value={customStack || !stackPreset ? "other" : stack}
            onChange={(value) => {
              if (value === "other") {
                setCustomStack(true);
              } else {
                setCustomStack(false);
                chooseStack(value);
              }
            }}
          />
          {customStack || !stackPreset ? (
            <ChipInput
              className="field"
              id="stack"
              aria-label="Starting stack amount"
              value={stack}
              onChange={chooseStack}
            />
          ) : null}
          <p className="muted small-note">
            {ownAmounts
              ? `Each player buys in for ${money(stack)} unless you change their amount in the ${
                  ledger ? "player list" : "seating order"
                }.`
              : `Everyone buys in for ${money(stack)}.`}
          </p>
          {ownAmounts && !amountsValid ? (
            <p className="field-error" role="alert">
              Every player&apos;s buy-in must be more than 0.
            </p>
          ) : null}
        </section>


        {ledger ? null : (
          <>
            <section className="glass card">
              <div className="card-row">
                <span className="label">Big blind</span>
                <div className="heading-with-info">
                  <label className="switch-row">
                    <span>Odd blinds</span>
                    <button
                      className="switch"
                      type="button"
                      role="switch"
                      aria-checked={oddBlinds}
                      aria-label="Odd blinds"
                      onClick={() => setOddBlinds((on) => !on)}
                    />
                  </label>
                  <button
                    className="info-button"
                    type="button"
                    aria-label="About odd blinds"
                    onClick={() => setShowOddBlindsHelp(true)}
                  >
                    i
                  </button>
                </div>
              </div>
              {showOddBlindsHelp ? (
                <InfoSheet
                  label="About odd blinds"
                  onClose={() => setShowOddBlindsHelp(false)}
                >
                  <p>
                    <b>Odd Blinds Off:</b> the small blind is half the big blind.
                  </p>
                  <p>
                    <b>Odd Blinds On:</b> you choose the small blind.
                  </p>
                </InfoSheet>
              ) : null}
              <Segmented
                label="Big blind"
                options={[
                  ...anteChoices.map((value) => ({ value, label: money(value) })),
                  { value: "other" as const, label: "Other" },
                ]}
                value={customAnte || !antePreset ? "other" : ante}
                onChange={(value) => {
                  if (value === "other") {
                    setCustomAnte(true);
                  } else {
                    setCustomAnte(false);
                    setAnte(value);
                  }
                }}
              />
              {customAnte || !antePreset ? (
                <ChipInput
                  className="field"
                  id="ante"
                  aria-label="Big blind amount"
                  value={ante}
                  onChange={setAnte}
                />
              ) : null}
              {oddBlinds ? (
                <>
                  <span className="label">Small blind</span>
                  <Segmented
                    label="Small blind"
                    options={[
                      ...smallBlindOptions.map((option) => ({
                        value: option.amount,
                        label: money(option.amount),
                      })),
                      { value: "other" as const, label: "Other" },
                    ]}
                    value={customSmallBlind ? "other" : sharedSmallBlind.amount}
                    onChange={(value) => {
                      if (value === "other") {
                        setCustomSmallBlind(true);
                        setSmallBlindAmount(sharedSmallBlind.amount);
                        return;
                      }
                      setCustomSmallBlind(false);
                      const picked = smallBlindOptions.find(
                        (option) => option.amount === value,
                      );
                      if (picked) setSmallBlindShare(picked.percent);
                    }}
                  />
                  {customSmallBlind ? (
                    <ChipInput
                      className="field"
                      aria-label="Small blind amount"
                      value={smallBlindAmount}
                      onChange={setSmallBlindAmount}
                    />
                  ) : null}
                  {smallBlindValid ? null : (
                    <p className="field-error" role="alert">
                      The small blind must be from {money(1)} up to the big blind.
                    </p>
                  )}
                </>
              ) : null}
            </section>

            <section className="glass card">
              <div className="card-row">
                <span className="label">Blind levels</span>
                <span className="card-note">{blindLevelNote}</span>
              </div>
              <Segmented
                label="Blind levels"
                options={[
                  { value: "fixed", label: "Fixed" },
                  { value: "hands", label: "By Hands" },
                  { value: "minutes", label: "By Minutes" },
                ]}
                value={risingBlinds ? blindUnit : "fixed"}
                onChange={chooseBlindLevels}
              />
              {risingBlinds ? (
                <>
                  <Segmented
                    label="How the big blind rises"
                    options={[
                      { value: "multiply", label: "Multiply" },
                      { value: "add", label: "Add fixed amount" },
                    ]}
                    value={blindRaiseType}
                    onChange={(nextType) => {
                      setBlindRaiseType(nextType);
                      setBlindRaiseBy(
                        nextType === "multiply" ? 2 : Math.max(1, ante),
                      );
                    }}
                  />
                  <div className="field-grid">
                    <div>
                      <label className="label" htmlFor="blind-every">
                        Every ({blindUnit})
                      </label>
                      <input
                        className="field"
                        id="blind-every"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={blindEvery}
                        onChange={(event) =>
                          setBlindEvery(Number(event.target.value))
                        }
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="blind-raise-by">
                        {blindRaiseType === "multiply" ? "Multiply by" : `Add ${symbol.trim()}`}
                      </label>
                      {blindRaiseType === "multiply" ? (
                        <input
                          className="field"
                          id="blind-raise-by"
                          type="number"
                          inputMode="decimal"
                          min="1.1"
                          step="0.1"
                          value={blindRaiseBy}
                          onChange={(event) =>
                            setBlindRaiseBy(Number(event.target.value))
                          }
                        />
                      ) : (
                        <ChipInput
                          className="field"
                          id="blind-raise-by"
                          value={blindRaiseBy}
                          onChange={setBlindRaiseBy}
                        />
                      )}
                    </div>
                  </div>
                  <p className="muted small-note">
                    {scheduleValid ? (
                      <>
                        Big blind: {ladder
                          .map((bigBlind) => money(bigBlind))
                          .join(", ")}
                        , …
                        {blindUnit === "minutes"
                          ? " Timed levels apply when the next hand is dealt."
                          : ""}
                      </>
                    ) : (
                      <>
                        Set an interval of at least 1 and an increase that makes the
                        blinds bigger.
                      </>
                    )}
                  </p>
                </>
              ) : null}
            </section>

            <section className="glass card">
              <div className="card-row">
                <span className="label">Rebuys</span>
                <span className="card-note">
                  {describeMaxRebuys(setupRebuyRules.maxRebuys)}
                </span>
              </div>
              <RebuyRulesFields
                rules={rebuyRules}
                onChange={setRebuyRules}
                closeOptions={rebuyCloseOptions}
                showClose={Boolean(schedule) && scheduleValid}
                idPrefix="setup"
              />
              {rebuyError ? (
                <p className="field-error" role="alert">
                  {rebuyError}
                </p>
              ) : (
                <p className="muted small-note">
                  A busted player can buy back in for{" "}
                  {ownAmounts ? "any amount, usually " : "the starting stack, "}
                  {money(stack)}
                  {setupRebuyRules.maxRebuys === 0
                    ? ", but not in this game."
                    : setupRebuyRules.closeAtBigBlind !== null
                      ? `, until the big blind reaches ${money(
                          setupRebuyRules.closeAtBigBlind,
                        )}.`
                      : "."}
                </p>
              )}
            </section>
          </>
        )}

        <section className="glass card">
          <div className="card-row">
            <span className="label">Chip value</span>
            <div className="heading-with-info">
              <label className="switch-row">
                <span>Chips cost money</span>
                <button
                  className="switch"
                  type="button"
                  role="switch"
                  aria-checked={chipValueOn}
                  aria-label="Chips cost money"
                  onClick={() => setChipValueOn((on) => !on)}
                />
              </label>
              <button
                className="info-button"
                type="button"
                aria-label="About chip value"
                onClick={() => setShowChipValueHelp(true)}
              >
                i
              </button>
            </div>
          </div>
          {showChipValueHelp ? (
            <InfoSheet
              label="About chip value"
              onClose={() => setShowChipValueHelp(false)}
            >
              <p>
                <b>Chips Cost Money On:</b> say what a buy-in costs, for
                example {formatCents(50_000, currency)} for 10,000 chips. The
                table counts chips; results and Settle up show money at that
                price.
              </p>
              <p>
                <b>Chips Cost Money Off:</b> one chip is{" "}
                {formatCents(100, currency)}. You can set a price later from
                Settle up on the saved game.
              </p>
            </InfoSheet>
          ) : null}
          {chipValueOn ? (
            <>
              <label className="label" htmlFor="buy-in-price">
                A {money(stack)}-chip buy-in costs
              </label>
              <PriceInput
                id="buy-in-price"
                label="What a buy-in costs"
                value={buyInPrice}
                onChange={setBuyInPrice}
              />
              {chipValueValid && setupChipValue ? (
                <p className="muted small-note">
                  {describePerChip(setupChipValue, chipUnit, currency)}. Results
                  and Settle up show money at this price.
                </p>
              ) : (
                <p className="muted small-note">
                  Enter what a buy-in costs.
                </p>
              )}
            </>
          ) : null}
        </section>

        {/* Usually off, so they come last (user request 2026-10-13). */}
        {ledger ? null : (
          <>
            <section className="glass card">
              <div className="card-row">
                <span className="label">Ante</span>
                <div className="heading-with-info">
                  <label className="switch-row">
                    <span>Big blind ante</span>
                    <button
                      className="switch"
                      type="button"
                      role="switch"
                      aria-checked={bigBlindAnte}
                      aria-label="Big blind ante"
                      onClick={() => setBigBlindAnte((on) => !on)}
                    />
                  </label>
                  <button
                    className="info-button"
                    type="button"
                    aria-label="About the big blind ante"
                    onClick={() => setShowAnteHelp(true)}
                  >
                    i
                  </button>
                </div>
              </div>
              {showAnteHelp ? (
                <InfoSheet
                  label="About the big blind ante"
                  onClose={() => setShowAnteHelp(false)}
                >
                  <p>
                    <b>Big Blind Ante On:</b> each hand the big blind also puts in
                    an ante of one big blind for the whole table. It goes to the
                    main pot and doesn&apos;t count toward their bet.
                  </p>
                  <p>
                    <b>Big Blind Ante Off:</b> no ante, only the blinds.
                  </p>
                </InfoSheet>
              ) : null}
              {bigBlindAnte ? (
                <p className="muted small-note">
                  Each hand the big blind also puts in an ante of one big blind (
                  {money(Math.max(1, ante))} to start) for the whole table. It goes
                  to the main pot and doesn&apos;t count toward their bet.
                </p>
              ) : null}
            </section>

            <section className="glass card">
              <div className="card-row">
                <span className="label">Rake</span>
                <div className="heading-with-info">
                  <label className="switch-row">
                    <span>House rake</span>
                    <button
                      className="switch"
                      type="button"
                      role="switch"
                      aria-checked={rakeOn}
                      aria-label="House rake"
                      onClick={() => setRakeOn((on) => !on)}
                    />
                  </label>
                  <button
                    className="info-button"
                    type="button"
                    aria-label="About the house rake"
                    onClick={() => setShowRakeHelp(true)}
                  >
                    i
                  </button>
                </div>
              </div>
              {showRakeHelp ? (
                <InfoSheet
                  label="About the house rake"
                  onClose={() => setShowRakeHelp(false)}
                >
                  <p>
                    <b>House Rake On:</b> the house takes a share of each pot that
                    sees a flop, up to the most per hand. No flop, no rake. The
                    rake leaves the game, so results add up to minus it.
                  </p>
                  <p>
                    <b>House Rake Off:</b> no rake, every chip stays with the
                    players.
                  </p>
                </InfoSheet>
              ) : null}
              {rakeOn ? (
                <>
                  <Segmented
                    label="Share of each pot"
                    columns={5}
                    options={[
                      ...RAKE_PERCENTS.map((percent) => ({
                        value: percent,
                        label: `${percent}%`,
                      })),
                      { value: "other" as const, label: "Other" },
                    ]}
                    value={customRake ? "other" : rakePercent}
                    onChange={(value) => {
                      if (value === "other") {
                        setCustomRake(true);
                      } else {
                        setCustomRake(false);
                        setRakePercent(value);
                      }
                    }}
                  />
                  {customRake ? (
                    <div className="percent-field">
                      <input
                        className="field"
                        id="rake-percent"
                        type="number"
                        inputMode="decimal"
                        min="0.1"
                        max="10"
                        step="0.1"
                        aria-label="Rake percent"
                        value={Number.isFinite(rakePercent) ? rakePercent : ""}
                        onChange={(event) =>
                          setRakePercent(Number(event.target.value))
                        }
                      />
                      <span aria-hidden="true">%</span>
                    </div>
                  ) : null}
                  <label className="label" htmlFor="rake-cap">
                    Most per hand
                  </label>
                  <div className="money-field">
                    <span aria-hidden="true">{symbol.trim()}</span>
                    <ChipInput
                      className="field"
                      id="rake-cap"
                      value={rakeCap}
                      onChange={setTypedRakeCap}
                    />
                  </div>
                </>
              ) : null}
              {rakeOn && !rakePercentValid ? (
                <p className="field-error" role="alert">
                  Rake must be 0.1% to 10%, in steps of 0.1.
                </p>
              ) : rakeOn && !rakeCapValid ? (
                <p className="field-error" role="alert">
                  Set the most the house takes in a hand.
                </p>
              ) : rakeOn ? (
                <p className="muted small-note">
                  The house takes {rakePercent}% of each pot that sees a flop, up to{" "}
                  {money(rakeCap)} a hand. No flop, no rake. The rake leaves the
                  game, so results add up to minus it.
                </p>
              ) : null}
            </section>
          </>
        )}

        <button
          className="cta"
          type="submit"
          disabled={
            !selectionComplete ||
            !amountsValid ||
            !chipValueValid ||
            stack < 1 ||
            (!ledger &&
              (ante < 1 ||
                !scheduleValid ||
                !smallBlindValid ||
                !rakeCapValid ||
                !rakePercentValid ||
                Boolean(rebuyError)))
          }
        >
          {ledger ? "Start Quick Ledger" : "Deal First Hand"}
        </button>
      </form>
    </ChipUnitContext.Provider>
  );
}

const MAX_SEATS = 10;

/** A stack chip's label from hundredths: "20", "500", "1K", "50K". */
function compactAmount(hundredths: number) {
  const amount = hundredths / 100;
  return amount >= 1_000 ? `${amount / 1_000}K` : String(amount);
}
/** Odd small blind chips, as percentages of the big blind (100: 25–100). */
const SMALL_BLIND_SHARES = [25, 40, 60, 75, 100] as const;

/** How long a press on a player opens their options. */
const LONG_PRESS_MS = 450;

type PlayerFilter = "all" | "app" | "guest";

type ProfileRow = {
  key: string;
  kind: "self" | "friend" | "guest" | "pending" | "removed";
  name: string;
  avatar?: string;
  player?: PlayerProfile;
  friend?: FriendOverview["friends"][number];
  requestId?: string;
  /** Games in your own ledger (for the merge warning when linking). */
  games: number;
  /** Games you both played in, whoever hosted; unknown until stats load. */
  together?: number;
};

type RowAction = { label: string; danger?: boolean; run: () => void };

async function profileStatsApi() {
  const response = await fetch("/api/profile");
  const data = (await response.json().catch(() => ({}))) as {
    stats?: ProfileSummary;
    error?: string;
  };
  if (!response.ok || !data.stats) {
    throw new Error(
      apiErrorMessage(response.status, data.error, "Could not load your stats"),
    );
  }
  return data.stats;
}

const shortPercent = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

/** "+12.4%": one decimal, to fit the profile's small tiles. */
function formatShortPercent(value: number) {
  return `${shortPercent.format(value)}%`;
}

function monthYear(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

/**
 * The Profile tab: who you are to your friends, your own record across every
 * ledger you played in, your currency, friend requests, and your players.
 */
function ProfileView({
  profile,
  accountEmail,
  onOpenSettings,
  onProfile,
  players,
  discardedPlayers,
  history,
  loading,
  error,
  onRetry,
  onAdd,
  onRename,
  onGuestAvatar,
  onDiscard,
  onRestore,
  onDeletePermanently,
  onPlayersChanged,
  onViewStandings,
  onToast,
  onAsk,
  seatedPlayerIds,
  onGamesMoved,
  friendOverview: overview,
  friendOverviewError: overviewError,
  onReloadFriends: reloadOverview,
  stats,
  statsError,
}: {
  profile: AccountProfile;
  accountEmail: string;
  onOpenSettings: () => void;
  onProfile: (profile: AccountProfile) => void;
  players: PlayerProfile[];
  discardedPlayers: PlayerProfile[];
  history: PokerSession[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onAdd: (name: string, avatar: string) => Promise<PlayerProfile | null>;
  onRename: (player: PlayerProfile, name: string) => Promise<boolean>;
  onGuestAvatar: (player: PlayerProfile, avatar: string) => Promise<boolean>;
  onDiscard: (player: PlayerProfile) => void;
  onRestore: (player: PlayerProfile) => void;
  onDeletePermanently: (player: PlayerProfile) => void;
  onPlayersChanged: () => void;
  onViewStandings: (player: PlayerProfile) => void;
  onToast: (message: string) => void;
  onAsk: (message: string, confirmLabel: string, onConfirm: () => void) => void;
  /** Players in the game in progress on this device. */
  seatedPlayerIds: string[];
  /** Saved games now belong to another player, so reload them. */
  onGamesMoved: () => void;
  /** Friends, requests and links, kept by the app between visits. */
  friendOverview: FriendOverview | null;
  friendOverviewError: string;
  onReloadFriends: () => void;
  /** The Profile card's stats, kept by the app between visits. */
  stats: ProfileSummary | null;
  statsError: string;
}) {
  const [filter, setFilter] = useState<PlayerFilter>("all");
  const [menu, setMenu] = useState<string | null>(null);
  /** Near the bottom of the screen, a row's options open upwards, clear of the tab bar. */
  const [menuAbove, setMenuAbove] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [adding, setAdding] = useState(false);
  // A code read with Scan Code on the profile card, looked up on opening.
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<PlayerProfile | null>(null);
  const [choosingAvatar, setChoosingAvatar] = useState<PlayerProfile | null>(null);
  const [linking, setLinking] = useState<PlayerProfile | null>(null);
  const [inviting, setInviting] = useState<PlayerProfile | null>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (menu === null) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menu]);

  const openMenu = (key: string, element: Element) => {
    setMenuAbove(element.getBoundingClientRect().bottom > window.innerHeight - 340);
    setMenu(key);
  };
  const standings = useMemo(() => buildStandings(history), [history]);

  async function run(key: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try {
      await action();
    } finally {
      setBusy("");
    }
  }

  function unfriend(friend: FriendOverview["friends"][number]) {
    const name = friend.displayName ?? "this friend";
    onAsk(
      `Unfriend ${name}? Your players and games stay in both lists, but they're no longer linked, and ${name} stops being your friend. Linking again needs a new friend request.`,
      "Unfriend",
      () =>
        void run(friend.accountId, async () => {
          try {
            await friendsApi({ action: "remove", accountId: friend.accountId });
            onToast("Friend Removed");
            reloadOverview();
            onPlayersChanged();
          } catch (error) {
            onToast(
              error instanceof Error ? error.message : "Could not remove the friend",
            );
          }
        }),
    );
  }

  function cancelRequest(requestId: string) {
    void run(requestId, async () => {
      try {
        await friendsApi({ action: "cancel", requestId });
        onToast("Request Cancelled");
        reloadOverview();
      } catch (error) {
        onToast(
          error instanceof Error ? error.message : "Could not cancel the request",
        );
      }
    });
  }

  const friendByPlayer = new Map(
    (overview?.friends ?? []).flatMap((friend) =>
      friend.myPlayer ? [[friend.myPlayer.id, friend] as const] : [],
    ),
  );
  const record = (player: PlayerProfile) => {
    const entry = standings.entries.find(
      (item) => item.key === standingsKey({ playerId: player.id, name: player.name }),
    );
    return {
      games: entry?.totalSessions ?? 0,
      together: stats ? (stats.gamesTogether[player.id] ?? 0) : undefined,
    };
  };
  const liveRows: ProfileRow[] = [
    ...players.map((player): ProfileRow => ({
      key: player.id,
      kind:
        player.id === profile.selfPlayerId
          ? "self"
          : player.linked
            ? "friend"
            : "guest",
      name: player.name,
      avatar: player.id === profile.selfPlayerId ? profile.avatar : player.avatar,
      player,
      friend: friendByPlayer.get(player.id),
      ...record(player),
    })),
    ...(overview?.sent ?? []).map((request): ProfileRow => ({
      key: `request:${request.requestId}`,
      kind: "pending",
      name: request.displayName ?? "Someone",
      avatar: request.avatar,
      requestId: request.requestId,
      games: 0,
    })),
  ];
  const order: Record<ProfileRow["kind"], number> = {
    self: 0,
    friend: 1,
    pending: 2,
    guest: 3,
    removed: 4,
  };
  liveRows.sort(
    (a, b) =>
      order[a.kind] - order[b.kind] ||
      (b.together ?? b.games) - (a.together ?? a.games) ||
      a.name.localeCompare(b.name),
  );
  const hasAccount = (row: ProfileRow) => row.kind !== "guest";
  const counts: Record<PlayerFilter, number> = {
    all: liveRows.length,
    app: liveRows.filter(hasAccount).length,
    guest: liveRows.filter((row) => !hasAccount(row)).length,
  };
  const removedRows: ProfileRow[] = discardedPlayers.map((player) => ({
    key: player.id,
    kind: "removed",
    name: player.name,
    avatar: player.avatar,
    player,
    ...record(player),
  }));
  const rows = [
    ...liveRows.filter(
      (row) =>
        filter === "all" || (filter === "app" ? hasAccount(row) : !hasAccount(row)),
    ),
    ...(showRemoved ? removedRows : []),
  ];

  function actionsFor(row: ProfileRow): RowAction[] {
    const player = row.player;
    const standingsAction: RowAction[] =
      player && row.games
        ? [{ label: "View standings", run: () => onViewStandings(player) }]
        : [];
    if (row.kind === "pending" && row.requestId) {
      const requestId = row.requestId;
      return [
        { label: "Cancel request", danger: true, run: () => cancelRequest(requestId) },
      ];
    }
    if (!player) return [];
    if (row.kind === "removed") {
      return [
        { label: "Restore", run: () => onRestore(player) },
        ...(player.hasHistory || player.linked
          ? []
          : [
              {
                label: "Delete permanently",
                danger: true,
                run: () => onDeletePermanently(player),
              },
            ]),
      ];
    }
    // You are always in your own list, under the name on your card.
    if (row.kind === "self") return standingsAction;
    if (row.kind === "friend") {
      const friend = row.friend;
      return [
        ...standingsAction,
        ...(friend
          ? [{ label: "Unfriend", danger: true, run: () => unfriend(friend) }]
          : []),
      ];
    }
    return [
      ...standingsAction,
      ...(friendsFor(player).length
        ? [{ label: "Link to friend…", run: () => setLinking(player) }]
        : []),
      { label: "Invite to Pokerize", run: () => setInviting(player) },
      { label: "Rename", run: () => setRenaming(player) },
      { label: "Change avatar", run: () => setChoosingAvatar(player) },
      { label: "Remove player", danger: true, run: () => onDiscard(player) },
    ];
  }

  function subtitle(row: ProfileRow) {
    // Any host's games you both played in (user request, 2026-10-02).
    const count = row.together;
    const games =
      count === undefined
        ? ""
        : ` · Played ${count} game${count === 1 ? "" : "s"} together`;
    switch (row.kind) {
      case "self":
        return "You";
      case "friend":
        return `Friend${games}`;
      case "pending":
        return "Request sent · waiting";
      case "removed":
        return row.games ? "Removed · history kept" : "Removed";
      default:
        return `Guest${games}`;
    }
  }

  const freePlayers = players.filter(
    (player) => !player.linked && player.id !== profile.selfPlayerId,
  );
  const playersById = new Map(players.map((player) => [player.id, player]));
  const friendsFor = (guest: PlayerProfile) =>
    linkableFriends(guest, overview?.friends ?? [], playersById);
  const gamesOf = (playerId: string | undefined) => {
    const player = playerId ? playersById.get(playerId) : undefined;
    return player ? record(player).games : 0;
  };
  const filters: Array<[PlayerFilter, string]> = [
    ["all", "All"],
    ["app", "Friends"],
    ["guest", "Guests"],
  ];

  return (
    <div className="stack-list profile-screen">
      <ProfileCard
        profile={profile}
        accountEmail={accountEmail}
        onOpenSettings={onOpenSettings}
        onProfile={onProfile}
        onScannedCode={(code) => {
          setScannedCode(code);
          setAdding(true);
        }}
        onToast={onToast}
        stats={stats}
        statsError={statsError}
      />

      {overview?.received.map((request) => (
        <FriendRequestCard
          key={request.requestId}
          request={request}
          guests={freePlayers}
          busy={busy}
          onAnswered={(accepted) => {
            reloadOverview();
            if (accepted) onPlayersChanged();
          }}
          run={run}
          onToast={onToast}
        />
      ))}

      <div className="profile-players-heading">
        <h2>
          <span>{players.length}</span>{" "}
          {players.length === 1 ? "Player" : "Players"}
        </h2>
        <button
          className="profile-add-button"
          type="button"
          onClick={() => setAdding(true)}
        >
          <span aria-hidden="true">+</span>Add
        </button>
      </div>

      <div className="profile-filters" role="group" aria-label="Show players">
        {filters.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={filter === key ? "selected" : ""}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setMenu(null);
            }}
          >
            {label}
            <span>{counts[key]}</span>
          </button>
        ))}
      </div>

      <section className="glass profile-list">
        {error ? (
          <div className="directory-state">
            <p className="muted">{error}</p>
            <button className="ghost full" type="button" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : loading ? (
          <p className="muted profile-list-note">Loading players…</p>
        ) : rows.length ? (
          rows.map((row) => {
            const actions = actionsFor(row);
            const open = menu === row.key;
            return (
              <div className="profile-row-wrap" key={row.key}>
                <PressableRow
                  className={`profile-row${row.kind === "removed" ? " removed" : ""}`}
                  onLongPress={
                    actions.length ? (element) => openMenu(row.key, element) : null
                  }
                >
                  <span className="profile-avatar" aria-hidden="true">
                    <AvatarArt id={row.avatar} seed={row.name} />
                  </span>
                  <span className="profile-row-copy">
                    <b>{row.name}</b>
                    <small className={`row-kind-${row.kind}`}>{subtitle(row)}</small>
                  </span>
                  {actions.length ? (
                    <button
                      className="profile-more"
                      type="button"
                      aria-label={`Options for ${row.name}`}
                      aria-expanded={open}
                      disabled={busy !== ""}
                      onClick={(event) => {
                        if (open) setMenu(null);
                        else openMenu(row.key, event.currentTarget);
                      }}
                    >
                      ⋯
                    </button>
                  ) : null}
                </PressableRow>
                {open ? (
                  <>
                    <button
                      className="profile-menu-scrim"
                      type="button"
                      aria-label="Close options"
                      onClick={() => setMenu(null)}
                    />
                    <div
                      className={`profile-menu${menuAbove ? " above" : ""}`}
                      role="menu"
                    >
                      {actions.map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          role="menuitem"
                          className={action.danger ? "danger-text" : ""}
                          onClick={() => {
                            setMenu(null);
                            action.run();
                          }}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="muted profile-list-note">No players here yet</p>
        )}
      </section>

      {overviewError ? (
        <div className="inline-state">
          <span>{overviewError}</span>
          <button className="pill-button" type="button" onClick={reloadOverview}>
            Try again
          </button>
        </div>
      ) : null}
      {removedRows.length ? (
        <button
          className="profile-removed-toggle"
          type="button"
          onClick={() => setShowRemoved((shown) => !shown)}
        >
          {showRemoved
            ? "Hide removed players"
            : `Show ${removedRows.length} removed player${removedRows.length === 1 ? "" : "s"}`}
        </button>
      ) : null}

      {adding ? (
        <AddPlayerSheet
          players={players}
          initialCode={scannedCode}
          onAdd={onAdd}
          onRequestSent={() => {
            reloadOverview();
            setFilter("all");
          }}
          onToast={onToast}
          onClose={() => {
            setAdding(false);
            setScannedCode(null);
          }}
        />
      ) : null}
      {renaming ? (
        <RenameSheet
          player={renaming}
          players={[...players, ...discardedPlayers]}
          onRename={onRename}
          onClose={() => setRenaming(null)}
        />
      ) : null}
      {choosingAvatar ? (
        <AvatarSheet
          title={`Avatar for ${choosingAvatar.name}`}
          note={`People on ${APP_NAME} choose their own. You choose for your guests.`}
          current={choosingAvatar.avatar}
          seed={choosingAvatar.name}
          onPick={(avatar) => onGuestAvatar(choosingAvatar, avatar)}
          onClose={() => setChoosingAvatar(null)}
        />
      ) : null}
      {inviting ? (
        <InviteSheet
          guest={inviting}
          hostName={profile.displayName ?? "Your host"}
          onToast={onToast}
          onClose={() => setInviting(null)}
        />
      ) : null}
      {linking ? (
        <LinkFriendSheet
          guest={linking}
          friends={friendsFor(linking).map((friend) => ({
            friend,
            games: gamesOf(friend.myPlayer?.id),
            seated: !!friend.myPlayer && seatedPlayerIds.includes(friend.myPlayer.id),
          }))}
          onLinked={(merged) => {
            onToast(merged ? "Games Merged" : "Guest Linked");
            onPlayersChanged();
            if (merged) onGamesMoved();
            reloadOverview();
          }}
          onClose={() => setLinking(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Profile's ⋯ button: who is signed in, Edit name and Sign out. Delete My
 * Account lives in Settings only (user decision 2026-10-05).
 */
function AccountMenu({
  email,
  onEditName,
}: {
  email: string;
  onEditName: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    // The card's blur makes a fixed scrim cover only the card, so a press
    // anywhere outside the menu closes it instead.
    function closeOutside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={container}>
      <button
        className="profile-edit"
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
      >
        ⋯
      </button>
      {open ? (
        <div className="profile-menu account-menu-list" role="menu">
          <div className="account-menu-who">
            <small>Signed in as</small>
            <b className="literal-text">{email}</b>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEditName();
            }}
          >
            Edit name
          </button>
          <form action={signOut}>
            <button type="submit" role="menuitem">
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/** A row that opens its options on a long press or a right click. */
function PressableRow({
  className,
  onLongPress,
  children,
}: {
  className: string;
  onLongPress: ((element: Element) => void) | null;
  children: ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  return (
    <div
      className={className}
      onPointerDown={(event) => {
        cancel();
        const element = event.currentTarget;
        if (onLongPress) {
          timer.current = setTimeout(() => onLongPress(element), LONG_PRESS_MS);
        }
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(event) => {
        if (!onLongPress) return;
        event.preventDefault();
        onLongPress(event.currentTarget);
      }}
    >
      {children}
    </div>
  );
}

/** The card at the top: name, record, user code, currency and Settings. */
function ProfileCard({
  profile,
  accountEmail,
  onOpenSettings,
  onProfile,
  onScannedCode,
  onToast,
  stats,
  statsError,
}: {
  profile: AccountProfile;
  accountEmail: string;
  onOpenSettings: () => void;
  onProfile: (profile: AccountProfile) => void;
  /** A friend's user code read with Scan Code. */
  onScannedCode: (code: string) => void;
  onToast: (message: string) => void;
  stats: ProfileSummary | null;
  statsError: string;
}) {
  const { signedMoney } = useMoney();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [codeMenu, setCodeMenu] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [choosingAvatar, setChoosingAvatar] = useState(false);
  const [showingCode, setShowingCode] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const name = profile.displayName ?? "";

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    let displayName: string;
    try {
      displayName = cleanDisplayName(draft);
    } catch (error) {
      setNameError(error instanceof Error ? error.message : "Enter your name");
      return;
    }
    if (displayName === name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const data = await accountApi<{ profile: AccountProfile }>({
        action: "update-profile",
        displayName,
      });
      onProfile(data.profile);
      setEditing(false);
      setNameError("");
      onToast("Name Saved");
    } catch (error) {
      setNameError(
        error instanceof Error ? error.message : "Could not save your name",
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(formatUserCode(profile.userCode));
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard blocked: the code is on screen to copy by hand.
    }
  }

  async function replaceCode() {
    setCodeMenu(false);
    setReplacing(true);
    try {
      const data = await accountApi<{ profile: AccountProfile }>({
        action: "replace-code",
      });
      onProfile(data.profile);
      onToast("New Code Ready");
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Could not replace your code",
      );
    } finally {
      setReplacing(false);
    }
  }

  async function changeAvatar(avatar: string) {
    try {
      const data = await accountApi<{ profile: AccountProfile }>({
        action: "set-avatar",
        avatar,
      });
      onProfile(data.profile);
      onToast("Avatar Saved");
      return true;
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Could not save your avatar",
      );
      return false;
    }
  }

  async function changeCurrency(currency: string) {
    try {
      const data = await accountApi<{ profile: AccountProfile }>({
        action: "set-currency",
        currency,
      });
      onProfile(data.profile);
      onToast("Currency Saved");
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Could not save your currency",
      );
    }
  }

  // The headline has room for whole amounts only; from 1,000 up the cents
  // from small-stakes games are dropped here (the bars' titles keep them).
  const netText = stats
    ? signedMoney(Math.abs(stats.net) >= 1_000 ? Math.round(stats.net) : stats.net)
    : "–";
  const recent = stats?.recent ?? [];
  const largest = Math.max(1, ...recent.map((game) => Math.abs(game.net)));
  const bar = (value: number) =>
    value ? Math.max(3, Math.round((Math.abs(value) / largest) * 20)) : 0;
  const tiles: Array<[string, string, string]> = [
    ["Games played", stats ? String(stats.games) : "–", ""],
    [
      "Avg return",
      stats?.averageReturn == null ? "–" : formatShortPercent(stats.averageReturn),
      toneClass(stats?.averageReturn ?? null),
    ],
    [
      "Profitable",
      stats ? `${stats.profitableGames}/${stats.games}` : "–",
      "blue",
    ],
  ];

  return (
    <>
    <section className="glass profile-card">
      <span className="profile-card-glow" aria-hidden="true" />
      <div className="profile-identity">
        <button
          className="profile-ring"
          type="button"
          aria-label="Change your avatar"
          onClick={() => setChoosingAvatar(true)}
        >
          <span>
            <AvatarArt id={profile.avatar} seed={name} />
          </span>
          <span className="profile-ring-edit" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path
                d="M10.6 2.6l2.8 2.8-7.6 7.6H3v-2.8z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
        <div className="profile-name">
          {editing ? (
            <form className="profile-name-form" onSubmit={saveName}>
              <input
                className="field"
                aria-label="Your name"
                autoFocus
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (nameError) setNameError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setEditing(false);
                }}
              />
              <button className="accent-button" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </form>
          ) : (
            <>
              <h2 className={name.length > 9 ? "long" : ""}>{name}</h2>
              <p>
                {stats?.firstPlayed
                  ? `Playing since ${monthYear(stats.firstPlayed)}`
                  : stats
                    ? "No games yet"
                    : " "}
              </p>
            </>
          )}
          {nameError ? (
            <p className="field-error" role="alert">
              {nameError}
            </p>
          ) : null}
        </div>
        {editing ? null : (
          <AccountMenu
            email={accountEmail}
            onEditName={() => {
              setDraft(name);
              setEditing(true);
            }}
          />
        )}
      </div>

      <div className="profile-record">
        <div>
          <span className="profile-kicker">All-time net</span>
          <strong
            className={`profile-net ${
              stats && stats.net < 0 ? "neg" : "gradient-text-vertical"
            }${netText.length > 9 ? " long" : netText.length > 7 ? " wide" : ""}`}
          >
            {netText}
          </strong>
        </div>
        {recent.length ? (
          <div className="profile-form">
            <span className="profile-kicker">Last {recent.length}</span>
            <div className="profile-bars" aria-label="Net of your latest games">
              {recent.map((game, index) => (
                <span
                  className="profile-bar"
                  key={index}
                  title={`${formatDate(game.date)}: ${signedMoney(game.net)}`}
                >
                  <span>
                    <i className="up" style={{ height: game.net > 0 ? bar(game.net) : 0 }} />
                  </span>
                  <span>
                    <i className="down" style={{ height: game.net < 0 ? bar(game.net) : 0 }} />
                  </span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {stats?.otherCurrencyGames ? (
        <p className="profile-note">
          Net leaves out {stats.otherCurrencyGames} game
          {stats.otherCurrencyGames === 1 ? "" : "s"} played in another currency.
        </p>
      ) : null}
      {statsError ? <p className="profile-note">{statsError}</p> : null}

      <div className="profile-tiles">
        {tiles.map(([label, value, tone]) => (
          <div key={label}>
            <strong className={tone}>{value}</strong>
            <small>{label}</small>
          </div>
        ))}
      </div>

      <div className="profile-code-row">
        <div>
          <small>Your user code · friends add you with it</small>
          <strong>{formatUserCode(profile.userCode)}</strong>
        </div>
        <button
          className={`profile-more bordered profile-copy${copied ? " accent-text" : ""}`}
          type="button"
          aria-label={copied ? "Copied" : "Copy your user code"}
          title={copied ? "Copied" : "Copy"}
          onClick={() => void copyCode()}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {copied ? (
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            ) : (
              <>
                <rect x="9" y="9" width="11" height="11" rx="2.5" />
                <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" />
              </>
            )}
          </svg>
        </button>
        <button
          className="profile-more bordered profile-copy"
          type="button"
          aria-label="Show your QR code or scan a friend's"
          title="QR code"
          onClick={() => setShowingCode(true)}
        >
          {QR_ICON}
        </button>
        <div className="profile-code-more">
          <button
            className="profile-more bordered"
            type="button"
            aria-label="More about your code"
            aria-expanded={codeMenu}
            disabled={replacing}
            onClick={() => setCodeMenu((shown) => !shown)}
          >
            ⋯
          </button>
          {codeMenu ? (
            <>
              <button
                className="profile-menu-scrim"
                type="button"
                aria-label="Close options"
                onClick={() => setCodeMenu(false)}
              />
              <div className="profile-menu above" role="menu">
                <button type="button" role="menuitem" onClick={() => void replaceCode()}>
                  Replace code
                </button>
                <p>Old code stops working. Existing friends stay.</p>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <label className="profile-currency">
        <span>
          <small>Currency · for the games you host</small>
          <b>{CURRENCIES.find((item) => item.code === profile.currency)?.name}</b>
        </span>
        <select
          className="select-control"
          value={profile.currency}
          onChange={(event) => void changeCurrency(event.target.value)}
        >
          {CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {`${currency.symbol.trim()} ${currency.code}`}
            </option>
          ))}
        </select>
      </label>
      <button className="profile-settings-link" type="button" onClick={onOpenSettings}>
        <span>
          <small>Sounds, privacy and more</small>
          <b>Settings</b>
        </span>
        <span className="settings-chevron" aria-hidden="true">
          ›
        </span>
      </button>
    </section>
    {/* Outside the card: its blur would trap a fixed-position sheet. */}
    {choosingAvatar ? (
      <AvatarSheet
        title="Your avatar"
        note="Everyone sees you with this avatar, in every host's list and on live links."
        current={profile.avatar}
        seed={name}
        onPick={changeAvatar}
        onClose={() => setChoosingAvatar(false)}
      />
    ) : null}
    {showingCode ? (
      <UserCodeSheet
        userCode={profile.userCode}
        onScanned={(code) => {
          setShowingCode(false);
          onScannedCode(code);
        }}
        onClose={() => setShowingCode(false)}
      />
    ) : null}
    </>
  );
}

/** A friend request sent to you, answered right on the Profile tab. */
function FriendRequestCard({
  request,
  guests,
  busy,
  run,
  onAnswered,
  onToast,
}: {
  request: FriendOverview["received"][number];
  /** Your guests that could be linked to them instead. */
  guests: PlayerProfile[];
  busy: string;
  run: (key: string, action: () => Promise<void>) => Promise<void>;
  onAnswered: (accepted: boolean) => void;
  onToast: (message: string) => void;
}) {
  // Accepting adds them as a new player. If that name is taken by one of
  // your guests, the card offers to link that guest instead (2026-10-02,
  // user decision); otherwise "Link to guest…" does it afterwards.
  const [newName, setNewName] = useState(request.displayName ?? "");
  const [error, setError] = useState("");
  const [nameTaken, setNameTaken] = useState(false);
  const [clashingGuest, setClashingGuest] = useState<PlayerProfile | null>(null);
  const name = request.displayName ?? "Someone";

  function answer(action: "accept" | "decline", linkGuest?: PlayerProfile) {
    void run(request.requestId, async () => {
      setError("");
      try {
        await friendsApi(
          action === "accept"
            ? {
                action,
                requestId: request.requestId,
                myPlayerId: linkGuest?.id ?? null,
                newPlayerName: linkGuest ? null : newName,
              }
            : { action, requestId: request.requestId },
        );
        onToast(
          action === "decline"
            ? "Request Declined"
            : linkGuest
              ? "Friend Added · Guest Linked"
              : "Friend Added",
        );
        onAnswered(action === "accept");
      } catch (error) {
        if (error instanceof ApiError && error.code === "friend-name-taken") {
          setNameTaken(true);
          // An empty box means their own name, as on the server.
          const key = playerNameKey(newName.trim() || name);
          const guest =
            guests.find((player) => playerNameKey(player.name) === key) ?? null;
          setClashingGuest(guest);
          if (guest) {
            setError(
              `${guest.name} is already one of your guests. Link them to keep their games, or choose another name`,
            );
            return;
          }
        }
        setError(
          error instanceof Error ? error.message : "Could not answer the request",
        );
      }
    });
  }

  return (
    <section
      className="glass profile-request"
      id={`friend-request-${request.requestId}`}
    >
      <div className="profile-request-head">
        <span className="profile-avatar" aria-hidden="true">
          <AvatarArt id={request.avatar} seed={name} />
        </span>
        <div>
          <span className="eyebrow">Friend request</span>
          <p>
            <b>{name}</b> wants to be friends
          </p>
        </div>
      </div>
      {nameTaken ? (
        <input
          className="field"
          aria-label="New player's name"
          maxLength={80}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {clashingGuest ? (
        <button
          className="accent-button friend-link-guest"
          type="button"
          disabled={busy !== ""}
          onClick={() => answer("accept", clashingGuest)}
        >
          Link to Guest {clashingGuest.name}
        </button>
      ) : null}
      <div className="friend-actions">
        <button
          className={clashingGuest ? "ghost" : "accent-button"}
          type="button"
          disabled={busy !== ""}
          onClick={() => answer("accept")}
        >
          {busy === request.requestId ? "Saving…" : "Accept"}
        </button>
        <button
          className="ghost"
          type="button"
          disabled={busy !== ""}
          onClick={() => answer("decline")}
        >
          Decline
        </button>
      </div>
    </section>
  );
}

/** The Add sheet: a friend on Pokerize by user code, or a guest by name. */
function AddPlayerSheet({
  players,
  initialCode,
  onAdd,
  onRequestSent,
  onToast,
  onClose,
}: {
  players: PlayerProfile[];
  /** A user code already scanned, looked up as the sheet opens. */
  initialCode: string | null;
  onAdd: (name: string, avatar: string) => Promise<PlayerProfile | null>;
  onRequestSent: () => void;
  onToast: (message: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"code" | "name">("code");
  const [input, setInput] = useState(
    initialCode ? formatUserCode(initialCode) : "",
  );
  const [scanning, setScanning] = useState(false);
  const [guestAvatar, setGuestAvatar] = useState(randomAvatarId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<(FoundAccount & { code: string }) | null>(
    null,
  );

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const byCode = mode === "code";
  const relationNote: Record<FoundAccount["relation"], string> = {
    self: "That's your own code.",
    friends: "You're already friends.",
    "request-sent": "You've already sent them a request.",
    "request-received": "They've sent you a request. Answer it on your profile.",
    none: "",
  };

  async function findCode(value: string) {
    setError("");
    setFound(null);
    setBusy(true);
    try {
      const data = await friendsApi<{ found: FoundAccount }>({
        action: "find",
        code: value,
      });
      setFound({ ...data.found, code: value });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not look up that code",
      );
    } finally {
      setBusy(false);
    }
  }

  // Look up a code scanned on the profile card once, as the sheet opens.
  const lookedUpInitial = useRef(false);
  useEffect(() => {
    if (!initialCode || lookedUpInitial.current) return;
    lookedUpInitial.current = true;
    void findCode(initialCode);
  }, [initialCode]);

  function scanned(code: string) {
    setScanning(false);
    setInput(formatUserCode(code));
    void findCode(code);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const value = input.trim();
    setError("");
    setFound(null);
    if (byCode) {
      if (!value) {
        setError("Enter their user code");
        return;
      }
      await findCode(value);
      return;
    }
    if (!value) {
      setError("Enter a name");
      return;
    }
    const existing = players.find(
      (player) => player.name.trim().toLowerCase() === value.toLowerCase(),
    );
    if (existing) {
      setError(`You already have a player called ${existing.name}`);
      return;
    }
    setBusy(true);
    const player = await onAdd(value, guestAvatar);
    setBusy(false);
    if (player) onClose();
  }

  async function send() {
    if (!found || busy) return;
    setBusy(true);
    setError("");
    try {
      await friendsApi({
        action: "send",
        code: found.code,
      });
      onToast("Request Sent");
      onRequestSent();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The request was not sent");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-player-title"
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="add-player-title">Add player</h2>
        <div className="profile-modes" role="group" aria-label="Who are you adding">
          {(
            [
              ["code", "Find Friend"],
              ["name", "Add Guest"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={mode === key ? "selected" : ""}
              aria-pressed={mode === key}
              onClick={() => {
                setMode(key);
                setInput("");
                setError("");
                setFound(null);
                setScanning(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted small-note">
          {byCode
            ? "Enter or scan their user code to add them as a friend."
            : "Add someone who doesn't use the app."}
        </p>
        {scanning ? (
          <>
            <QrScanner onCode={scanned} />
            <button
              className="ghost full"
              type="button"
              onClick={() => setScanning(false)}
            >
              Type code instead
            </button>
          </>
        ) : (
        <form className="add-player-row" onSubmit={submit}>
          <input
            className={`field${byCode ? " code-field" : ""}`}
            aria-label={byCode ? "Their user code" : "Their name"}
            autoCapitalize={byCode ? "characters" : "words"}
            autoComplete="off"
            autoFocus={!initialCode}
            maxLength={byCode ? 12 : 80}
            placeholder={byCode ? "XXXX-XXXX" : "Their name"}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setError("");
              setFound(null);
            }}
          />
          {byCode ? (
            <button
              className="profile-more bordered add-player-scan"
              type="button"
              aria-label="Scan their QR code"
              title="Scan QR code"
              disabled={busy}
              onClick={() => {
                setError("");
                setFound(null);
                setScanning(true);
              }}
            >
              {SCAN_ICON}
            </button>
          ) : null}
          <button className="accent-button" type="submit" disabled={busy}>
            {busy && !found ? (byCode ? "Finding…" : "Adding…") : byCode ? "Find" : "Add"}
          </button>
        </form>
        )}
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        {byCode ? null : (
          <AvatarPicker
            value={guestAvatar}
            seed={input}
            disabled={busy}
            onChange={setGuestAvatar}
          />
        )}
        {found ? (
          <div className="profile-found">
            <div className="profile-found-head">
              <span className="profile-avatar" aria-hidden="true">
                <AvatarArt id={found.avatar} seed={found.displayName ?? ""} />
              </span>
              <span className="profile-row-copy">
                <b>{found.displayName ?? "Someone without a name yet"}</b>
                <small>
                  {found.relation === "none" ? `On ${APP_NAME}` : relationNote[found.relation]}
                </small>
              </span>
              {found.relation === "none" ? (
                <button
                  className="accent-button small"
                  type="button"
                  disabled={busy}
                  onClick={() => void send()}
                >
                  {busy ? "Sending…" : "Send request"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Links a guest to one of your friends, so the guest's games count as theirs.
 * The player made for the friend when the request was accepted is deleted;
 * any games it has move to the guest first, which can't be undone.
 */
function LinkFriendSheet({
  guest,
  friends,
  onLinked,
  onClose,
}: {
  guest: PlayerProfile;
  /** Friends this guest may be (lib/friends/link-guest.ts), with their
   * player's saved games (which would be merged) and whether that player is
   * in the game in progress. */
  friends: Array<{
    friend: FriendOverview["friends"][number];
    games: number;
    seated: boolean;
  }>;
  onLinked: (merged: boolean) => void;
  onClose: () => void;
}) {
  const [accountId, setAccountId] = useState(friends[0]?.friend.accountId ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const chosen = friends.find((item) => item.friend.accountId === accountId);
  const games = chosen?.games ?? 0;
  const friendName = chosen?.friend.displayName ?? "This friend";

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !chosen || chosen.seated) return;
    setSaving(true);
    setError("");
    try {
      await friendsApi({ action: "link-guest", accountId, playerId: guest.id });
      onLinked(games > 0);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The guest was not linked");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-friend-title"
        onSubmit={link}
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="link-friend-title">Link to friend</h2>
        <p className="muted small-note">
          Pick the friend {guest.name} really is; their games will count as
          that friend&apos;s.
        </p>
        {friends.length ? (
          <div className="add-player-row">
            <select
              className="select-control"
              aria-label="Friend"
              value={accountId}
              onChange={(event) => {
                setAccountId(event.target.value);
                setError("");
              }}
            >
              {friends.map(({ friend }) => (
                <option key={friend.accountId} value={friend.accountId}>
                  {friend.displayName ?? "Unnamed friend"}
                </option>
              ))}
            </select>
            <button
              className="accent-button"
              type="submit"
              disabled={saving || !!chosen?.seated}
            >
              {saving ? "Linking…" : games > 0 ? "Merge" : "Link"}
            </button>
          </div>
        ) : (
          <p className="muted small-note">You have no friends to link.</p>
        )}
        {chosen?.seated ? (
          <p className="field-error" role="alert">
            {friendName} is in the game in progress. End or discard it first.
          </p>
        ) : games > 0 ? (
          <p className="field-error" role="note">
            {friendName} already has {games} game{games === 1 ? "" : "s"} in
            your list. They&apos;ll be merged into {guest.name}. This
            can&apos;t be undone.
          </p>
        ) : null}
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}

/** Renames a guest. People on Pokerize choose their own name. */
/** Picks an avatar; tapping one saves it. */
function AvatarSheet({
  title,
  note,
  current,
  seed,
  onPick,
  onClose,
}: {
  title: string;
  note: string;
  current: string | undefined;
  seed: string;
  onPick: (avatar: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState("");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function pick(avatar: string) {
    if (saving) return;
    if (avatar === current) {
      onClose();
      return;
    }
    setSaving(avatar);
    const saved = await onPick(avatar);
    setSaving("");
    if (saved) onClose();
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-sheet-title"
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="avatar-sheet-title">{title}</h2>
        <p className="muted small-note">{note}</p>
        <div className="avatar-grid" role="group" aria-label="Avatars">
          {AVATARS.map((avatar, index) => (
            <button
              key={avatar.id}
              type="button"
              className={`avatar-choice${
                avatar.id === (current ?? "") ? " selected" : ""
              }${saving === avatar.id ? " saving" : ""}`}
              aria-label={`Avatar ${index + 1}`}
              aria-pressed={avatar.id === current}
              disabled={saving !== ""}
              onClick={() => void pick(avatar.id)}
            >
              <AvatarArt id={avatar.id} seed={seed} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RenameSheet({
  player,
  players,
  onRename,
  onClose,
}: {
  player: PlayerProfile;
  players: PlayerProfile[];
  onRename: (player: PlayerProfile, name: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(player.name);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      setError("Enter a name");
      return;
    }
    if (trimmed === player.name) {
      onClose();
      return;
    }
    const taken = players.find(
      (other) =>
        other.id !== player.id &&
        other.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (taken) {
      setError(`You already have a player called ${taken.name}`);
      return;
    }
    setSaving(true);
    const saved = await onRename(player, trimmed);
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-player-title"
        onSubmit={save}
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="rename-player-title">Rename</h2>
        <p className="muted small-note">
          Their standings and future games use the new name. Saved games keep
          the name they were played under.
        </p>
        <div className="add-player-row">
          <input
            className="field"
            aria-label="New name"
            autoFocus
            maxLength={80}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
          />
          <button className="accent-button" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}

/** The last action taken; seq tells two actions by one seat apart. */
type LastTurn = {
  playerIndex: number;
  handNo: number;
  stage: number;
  seq: number;
};

/** The seq to flash a seat with, while its action is the latest on this street. */
function flashFor(game: GameState, lastTurn: LastTurn | null, playerIndex: number) {
  const hand = game.hand;
  return lastTurn &&
    hand &&
    lastTurn.playerIndex === playerIndex &&
    lastTurn.handNo === hand.no &&
    lastTurn.stage === hand.stage &&
    hand.last[playerIndex]
    ? lastTurn.seq
    : undefined;
}

type GameViewProps = {
  game: GameState;
  layout: HandLayout;
  lastTurn: LastTurn | null;
  onAct: (
    playerIndex: number,
    type: PlayerAction["type"],
    amount?: number,
  ) => void;
  onUndoAction: (playerIndex: number) => void;
  onNextStage: () => void;
  onPickWinner: (playerIndex: number) => void;
  onBeginSplit: () => void;
  onEndSplit: () => void;
  onToggleSplit: (playerIndex: number) => void;
  onSplitPot: () => void;
  onAwardPots: (winners: number[][]) => void;
  onCancelHand: () => void;
  onBuyIn: (playerIndex: number) => void;
  onNextHand: () => void;
  onEndSession: () => void;
  onUndoHand: () => void;
  onDiscard: () => void;
  onEditBlinds: () => void;
  onToggleBlindClock: () => void;
  onEditRebuys: () => void;
  onAddPlayer: () => void;
  onCashOut: () => void;
  liveSharing: boolean;
  liveFailing: boolean;
  onShareLive: () => void;
};

/** The game screen, with its amounts in the game's own chip unit. */
function GameView(props: GameViewProps) {
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
  const nextBlinds = `${money(blinds.nextSmallBlind)}/${money(
    blinds.nextBigBlind,
  )}`;
  const blindNote = !blinds.schedule
    ? ""
    : blinds.dueNow
      ? `Blinds go up to ${nextBlinds} on the next hand`
      : blinds.schedule.unit === "hands"
        ? `${nextBlinds} in ${blinds.handsLeft} hand${
            blinds.handsLeft === 1 ? "" : "s"
          }`
        : `${nextBlinds} in ${formatClock(blinds.msLeft)}`;
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
    <div className="blind-clock">
      {blinds.schedule && !pendingPlan ? (
        <div
          className={`blind-timer ${blinds.dueNow ? "due" : ""} ${
            blinds.paused ? "paused" : ""
          }`}
          aria-live="polite"
        >
          {pausedNote}
          {blindNote}
        </div>
      ) : null}
      {pendingPlan ? (
        <div className={`blind-timer due ${blinds.paused ? "paused" : ""}`}>
          {pausedNote}From hand {pendingPlan.effectiveHand}:{" "}
          {describeBlindSchedule(pendingPlan.schedule, currency, unit)}
        </div>
      ) : null}
      {clockButton}
    </div>
  );
  const blindsDisplay = (
    <div className="blinds-display" aria-label="Current blinds">
      <div className="blinds-pill">
        <span className="blinds-label">Blinds</span>
        <span className="blinds-value">
          {money(blinds.smallBlind)}
          <span className="blinds-separator"> / </span>
          {money(blinds.bigBlind)}
        </span>
        {blinds.schedule ? (
          <span className="blinds-level">L{blinds.level + 1}</span>
        ) : null}
      </div>
      {game.bigBlindAnte ? (
        <span className="muted small-note">
          Big blind ante {money(blinds.bigBlind)}
        </span>
      ) : null}
      {blindSchedule}
    </div>
  );

  const [showFullLog, setShowFullLog] = useState(false);
  const lastStage = STAGES.length - 1;
  const pending = hand ? pendingIndexes(game).length > 0 : false;
  const standings = game.players
    .map((player, index) => ({ player, index }))
    .sort((a, b) => b.player.stack - a.player.stack);
  const logLines = showFullLog ? game.log : game.log.slice(0, 6);
  // When a round has just closed, the player whose action closed it keeps an
  // open (locked) card until the next street is dealt, so nothing above the
  // Deal button changes height and the button stays under the same finger.
  const closer =
    hand && !hand.splitSel && hand.stage < lastStage && !pending
      ? hand.last.findIndex((action) => action?.line === game.log[0])
      : -1;

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
          blindsText={`${money(blinds.smallBlind)} / ${money(blinds.bigBlind)}${
            game.bigBlindAnte ? ` · Ante ${money(blinds.bigBlind)}` : ""
          }${blinds.schedule ? ` · L${blinds.level + 1}` : ""}`}
          blindSchedule={blinds.schedule || pendingPlan ? blindSchedule : null}
          {...props}
        />
      ) : (
        <>
          <section className="glass card scoreboard">
            <div className="street-bar">
              {STAGES.map((stage, index) => (
                <div
                  className={
                    index < hand.stage
                      ? "past"
                      : index === hand.stage
                        ? "current"
                        : ""
                  }
                  key={stage}
                >
                  <span className="street-line" />
                  <span className="street-label">{stage}</span>
                </div>
              ))}
            </div>
            <div className="pot-block">
              <span className="label">Pot</span>
              <span
                className="pot gradient-text"
                style={
                  {
                    "--chars": money(hand.pot).length,
                  } as React.CSSProperties
                }
              >
                {money(hand.pot)}
              </span>
              <PotBreakdown game={game} className="pot-split" />
            </div>
            {blindsDisplay}
          </section>

          {hand.splitSel ? (
            <SplitView
              game={game}
              onToggle={props.onToggleSplit}
              onSplit={props.onSplitPot}
              onBack={props.onEndSplit}
            />
          ) : (
            <>
              {[
                // A closing fold keeps its place until the next street.
                ...game.players
                  .map((_, index) => index)
                  .filter((index) => hand.in[index] || index === closer),
                ...game.players
                  .map((_, index) => index)
                  .filter(
                    (index) =>
                      !hand.in[index] &&
                      index !== closer &&
                      !game.players[index].left,
                  ),
              ].map((playerIndex) => (
                <PlayerRow
                  key={`${hand.no}-${hand.stage}-${playerIndex}-${hand.acted[playerIndex]}`}
                  game={game}
                  playerIndex={playerIndex}
                  roundClosed={playerIndex === closer}
                  flash={flashFor(game, props.lastTurn, playerIndex)}
                  onAct={props.onAct}
                  onBuyIn={props.onBuyIn}
                />
              ))}
              {hand.stage < lastStage ? (
                <button
                  className="blue-button full tall"
                  type="button"
                  disabled={pending}
                  onClick={props.onNextStage}
                >
                  Deal {STAGES[hand.stage + 1]}
                </button>
              ) : !pending && hasSidePots(game) ? (
                <SidePotPicker
                  key={hand.no}
                  game={game}
                  onAward={props.onAwardPots}
                />
              ) : (
                <WinnerPicker
                  game={game}
                  pending={pending}
                  onPickWinner={props.onPickWinner}
                  onBeginSplit={props.onBeginSplit}
                />
              )}
            </>
          )}
          <UndoTurnButton game={game} onUndo={props.onUndoAction} />
          <button
            className="glass-button full danger-text"
            type="button"
            onClick={props.onCancelHand}
          >
            Cancel hand
          </button>
        </>
      )}

      <section className="glass card">
        <div className="card-row">
          <h2 className="card-title">Session Standings</h2>
          <span className="card-note">Start {money(game.startStack)}</span>
        </div>
        {game.rakeRules ? (
          <p className="muted small-note">
            {describeRakeRules(game.rakeRules, money)} · house has taken{" "}
            {money(game.rake ?? 0)}
          </p>
        ) : null}
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
        <div className="rows">
          {standings.map(({ player, index }, rank) => (
            <div className="standing-row" key={index}>
              <span className="standing-rank">{rank + 1}</span>
              <div className="standing-name">
                <b>{player.name}</b>
                <small>
                  {player.left ? "Cashed out · " : ""}Invested{" "}
                  {money(totalBuyIns(game, index))}
                </small>
              </div>
              <div className="standing-values">
                <b>{money(player.stack)}</b>
                <small className={toneClass(net(index))}>
                  {signedMoney(net(index))}
                </small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <button className="cta" type="button" onClick={props.onEndSession}>
        Finish And Save Session
      </button>
      <div className="button-pair">
        <button className="glass-button" type="button" onClick={props.onUndoHand}>
          Undo last hand
        </button>
        <button
          className="glass-button danger-text"
          type="button"
          onClick={props.onDiscard}
        >
          Discard game
        </button>
      </div>

      {game.log.length ? (
        <section className="glass card">
          <span className="label">Action log</span>
          <div className="rows log">
            {logLines.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
          {game.log.length > 6 ? (
            <button
              className="text-button"
              type="button"
              onClick={() => setShowFullLog((shown) => !shown)}
            >
              {showFullLog ? "Show fewer" : `Show all ${game.log.length} lines`}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

const HAND_RANKINGS = [
  ["Royal Flush", "A, K, Q, J, 10, all one suit", "A♠ K♠ Q♠ J♠ 10♠", 5],
  ["Straight Flush", "Five in a row, same suit", "9♥ 8♥ 7♥ 6♥ 5♥", 5],
  ["Four of a Kind", "Four cards of one rank", "Q♣ Q♦ Q♥ Q♠ 7♦", 4],
  ["Full House", "Three of a kind plus a pair", "K♠ K♥ K♦ 4♣ 4♠", 5],
  ["Flush", "Any five cards of one suit", "A♦ J♦ 8♦ 6♦ 2♦", 5],
  ["Straight", "Five in a row, mixed suits", "10♣ 9♦ 8♠ 7♥ 6♣", 5],
  ["Three of a Kind", "Three cards of one rank", "7♠ 7♥ 7♦ K♣ 3♠", 3],
  ["Two Pair", "Two different pairs", "J♥ J♣ 5♠ 5♦ A♥", 4],
  ["One Pair", "Two cards of one rank", "10♦ 10♠ K♥ 6♣ 2♠", 2],
  ["High Card", "Nothing made; the highest card plays", "A♣ Q♦ 9♠ 5♥ 3♣", 1],
] as const;

function PokerHandsChart() {
  return (
    <div className="stack-list hand-rankings">
      {HAND_RANKINGS.map(([name, description, cards, used], index) => (
        <section className="glass card hand-rank" key={name}>
          <div className="hand-rank-head">
            <span className={`hand-rank-number ${index < 3 ? "top" : ""}`}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h2 className="card-title">{name}</h2>
              <p className="muted">{description}</p>
            </div>
          </div>
          <div className="mini-cards" aria-label={cards}>
            {cards.split(" ").map((card, cardIndex) => {
              const suit = card.slice(-1);
              return (
                <span
                  className={`mini-card ${suit === "♥" || suit === "♦" ? "red" : ""} ${
                    cardIndex < used ? "" : "unused"
                  }`}
                  key={card}
                  aria-hidden="true"
                >
                  <span>{card.slice(0, -1)}</span>
                  <span className="mini-card-suit">{suit}</span>
                </span>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

type RebuyMaxChoice = "unlimited" | 0 | 1 | 2 | 3 | "other";
type RebuyCloseChoice = "never" | number | "other";

/**
 * Why these rebuy limits can't be used, or null. `rebuysMade` is the most
 * rebuys any player has already made; `closeAbove`, when set, is a big blind the
 * closing amount must be above (setup, where closing at once means none).
 */
function rebuyRulesError(
  rules: RebuyRules,
  rebuysMade: number,
  closeAbove: number | null,
  money: (value: number) => string,
) {
  const { maxRebuys, closeAtBigBlind } = rules;
  if (
    maxRebuys !== null &&
    (!Number.isSafeInteger(maxRebuys) || maxRebuys < 0 || maxRebuys > MAX_REBUYS)
  ) {
    return `Allow from 0 to ${MAX_REBUYS} rebuys.`;
  }
  if (maxRebuys !== null && maxRebuys < rebuysMade) {
    return `A player has already rebought ${rebuysMade} time${
      rebuysMade === 1 ? "" : "s"
    }, so allow at least ${rebuysMade}.`;
  }
  if (
    closeAtBigBlind !== null &&
    (!Number.isSafeInteger(closeAtBigBlind) || closeAtBigBlind < 1)
  ) {
    return "Enter a big blind of at least 1.";
  }
  if (
    closeAtBigBlind !== null &&
    closeAbove !== null &&
    closeAtBigBlind <= closeAbove
  ) {
    return `Pick a big blind above ${money(closeAbove)}, or choose None rebuys.`;
  }
  return null;
}

/**
 * The two rebuy limits, used on setup and in Edit Rebuys. Closing amounts
 * are big blinds, so they stay right when the blind plan changes.
 */
function RebuyRulesFields({
  rules,
  onChange,
  closeOptions,
  showClose,
  idPrefix,
}: {
  rules: RebuyRules;
  onChange: (rules: RebuyRules) => void;
  /** Upcoming big blinds offered as closing points. */
  closeOptions: number[];
  showClose: boolean;
  idPrefix: string;
}) {
  const { money } = useMoney();
  const [customMax, setCustomMax] = useState(
    rules.maxRebuys !== null && rules.maxRebuys > 3,
  );
  const [customClose, setCustomClose] = useState(
    rules.closeAtBigBlind !== null &&
      !closeOptions.includes(rules.closeAtBigBlind),
  );
  const offered = closeOptions.slice(0, 3);
  const maxValue: RebuyMaxChoice = customMax
    ? "other"
    : rules.maxRebuys === null
      ? "unlimited"
      : rules.maxRebuys <= 3
        ? (rules.maxRebuys as 0 | 1 | 2 | 3)
        : "other";
  const closeIsOther =
    customClose ||
    (rules.closeAtBigBlind !== null && !offered.includes(rules.closeAtBigBlind));
  const closeValue: RebuyCloseChoice = closeIsOther
    ? "other"
    : (rules.closeAtBigBlind ?? "never");

  return (
    <>
      <Segmented<RebuyMaxChoice>
        label="Rebuys per player"
        options={[
          // "No limit" doesn't fit six chips at 375px; the card note says it.
          { value: "unlimited", label: "No limit", icon: <InfinityIcon /> },
          { value: 0, label: "None" },
          { value: 1, label: "1" },
          { value: 2, label: "2" },
          { value: 3, label: "3" },
          { value: "other", label: "Other" },
        ]}
        value={maxValue}
        onChange={(value) => {
          if (value === "other") {
            setCustomMax(true);
            onChange({ ...rules, maxRebuys: Math.max(4, rules.maxRebuys ?? 4) });
            return;
          }
          setCustomMax(false);
          onChange({
            ...rules,
            maxRebuys: value === "unlimited" ? null : value,
          });
        }}
      />
      {maxValue === "other" ? (
        <input
          className="field"
          id={`${idPrefix}-max-rebuys`}
          aria-label="Rebuys per player"
          type="number"
          inputMode="numeric"
          min="0"
          max={MAX_REBUYS}
          value={rules.maxRebuys ?? ""}
          onChange={(event) =>
            onChange({ ...rules, maxRebuys: Number(event.target.value) })
          }
        />
      ) : null}
      {showClose && rules.maxRebuys !== 0 ? (
        <>
          <span className="label">Rebuys close at big blind</span>
          <Segmented<RebuyCloseChoice>
            label="Rebuys close at big blind"
            options={[
              { value: "never", label: "Never" },
              ...offered.map((amount) => ({
                value: amount,
                label: money(amount),
              })),
              { value: "other", label: "Other" },
            ]}
            value={closeValue}
            onChange={(value) => {
              if (value === "other") {
                setCustomClose(true);
                onChange({
                  ...rules,
                  closeAtBigBlind:
                    rules.closeAtBigBlind ?? closeOptions.at(-1) ?? null,
                });
                return;
              }
              setCustomClose(false);
              onChange({
                ...rules,
                closeAtBigBlind: value === "never" ? null : value,
              });
            }}
          />
          {closeValue === "other" ? (
            <ChipInput
              className="field"
              id={`${idPrefix}-close-at`}
              aria-label="Big blind at which rebuys close"
              value={rules.closeAtBigBlind}
              onChange={(closeAtBigBlind) =>
                onChange({ ...rules, closeAtBigBlind })
              }
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function RebuyEditor({
  game,
  onClose,
  onSave,
}: {
  game: GameState;
  onClose: () => void;
  onSave: (rules: RebuyRules) => void;
}) {
  const { money } = useMoney();
  const [rules, setRules] = useState<RebuyRules>(
    game.rebuyRules ?? { maxRebuys: null, closeAtBigBlind: null },
  );
  const closeOptions = upcomingBigBlinds(game);
  // Offer a closing point while one is set, so it can be switched off.
  const showClose =
    closeOptions.length > 0 || game.rebuyRules?.closeAtBigBlind != null;
  const effective: RebuyRules = {
    maxRebuys: rules.maxRebuys,
    closeAtBigBlind:
      showClose && rules.maxRebuys !== 0 ? rules.closeAtBigBlind : null,
  };
  const used = mostRebuysUsed(game);
  const error = rebuyRulesError(effective, used, null, money);
  const closedNow =
    effective.closeAtBigBlind !== null && game.ante >= effective.closeAtBigBlind;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!error) onSave(effective);
  }

  return (
    <div
      className="modal blind-editor-modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet blind-editor-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rebuy-editor-title"
        onSubmit={submit}
      >
        <h2 id="rebuy-editor-title">Edit Rebuys</h2>
        <p className="muted rule-note">
          Each rebuy is the starting stack, {money(game.startStack)}. The big
          blind is {money(game.ante)} now. Changes apply to the next rebuy.
        </p>
        <span className="label">Rebuys per player</span>
        <RebuyRulesFields
          rules={rules}
          onChange={setRules}
          closeOptions={closeOptions}
          showClose={showClose}
          idPrefix="edit"
        />
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted rule-note">
            {describeRebuyRules(effective, chipCurrency(game.currency, game.chipValue), game.chipUnit) ?? "Unlimited rebuys"}
            .{closedNow ? " Rebuys are closed from now on." : ""}
          </p>
        )}
        <button className="primary full" type="submit" disabled={Boolean(error)}>
          Save Rebuys
        </button>
        <button className="ghost full" type="button" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}

/**
 * The amount box for a player choosing their own buy-in, in the game's chip
 * unit, with a warning for amounts far from the starting stack.
 */
function BuyInAmountField({
  game,
  id,
  value,
  onChange,
}: {
  game: GameState;
  id: string;
  value: number;
  onChange: (chips: number) => void;
}) {
  const { money } = useMoney();
  return (
    <>
      <label className="label" htmlFor={id}>
        Buy-in amount
      </label>
      <ChipInput className="field" id={id} value={value} onChange={onChange} />
      {!isValidBuyIn(value) ? (
        <p className="field-error" role="alert">
          The buy-in must be more than 0.
        </p>
      ) : isUnusualBuyIn(value, game.startStack) ? (
        <p className="field-error" role="note">
          That&apos;s far from the usual {money(game.startStack)}. Check the
          amount before you confirm.
        </p>
      ) : (
        <p className="muted small-note">
          The usual buy-in is {money(game.startStack)}.
        </p>
      )}
    </>
  );
}

function BuyInSheet({
  game,
  playerIndex,
  onClose,
  onBuyIn,
}: {
  game: GameState;
  playerIndex: number;
  onClose: () => void;
  onBuyIn: (amount: number) => void;
}) {
  const { money } = useMoney();
  const player = game.players[playerIndex];
  const [amount, setAmount] = useState(game.startStack);
  const valid = isValidBuyIn(amount);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid) onBuyIn(amount);
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="buy-in-title"
        onSubmit={submit}
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="buy-in-title">Buy In {player.name}</h2>
        {game.hand ? (
          <p className="muted small-note">
            They sit out this hand and play from the next one.
          </p>
        ) : null}
        <BuyInAmountField
          game={game}
          id="buy-in-amount"
          value={amount}
          onChange={setAmount}
        />
        <button className="primary full" type="submit" disabled={!valid}>
          {valid ? `Buy In · ${money(amount)}` : "Buy In"}
        </button>
        <button className="ghost full" type="button" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}

function JoinGameSheet({
  game,
  roster,
  selfPlayerId,
  onClose,
  onAdd,
}: {
  game: GameState;
  roster: PlayerProfile[];
  selfPlayerId: string | null;
  onClose: () => void;
  onAdd: (playerId: string, seat: number, amount: number) => void;
}) {
  const { money } = useMoney();
  // A quick ledger has no seats or deal: the player is just added.
  const ledger = isLedgerGame(game);
  const full = game.players.length >= MAX_GAME_PLAYERS;
  const candidates = [
    ...roster.filter((player) => player.id === selfPlayerId),
    ...roster.filter((player) => player.id !== selfPlayerId),
  ].filter((player) => canJoinGame(game, player));
  // A late player sits on the left of someone still at the table, which is
  // the next seat clockwise, the way the deal goes; the value is where they
  // go in the seat order.
  const seats = game.players.flatMap((player, index) =>
    player.left ? [] : [{ player, index }],
  );
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [seat, setSeat] = useState(() => (seats.at(-1)?.index ?? -1) + 1);
  const [amount, setAmount] = useState(game.startStack);
  const chosen = candidates.find((player) => player.id === chosenId);
  const amountValid = isValidBuyIn(amount);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chosen && amountValid) onAdd(chosen.id, seat, amount);
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-player-title"
        onSubmit={submit}
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="add-player-title">Add Player</h2>
        {ledger ? null : (
          <p className="muted small-note">
            They&apos;re dealt in from the next hand.
          </p>
        )}
        {full ? (
          <p className="field-error" role="alert">
            A game can have up to {MAX_GAME_PLAYERS} players, counting anyone
            who cashed out.
          </p>
        ) : !candidates.length ? (
          <p className="muted small-note">
            Everyone on your list is in this game. Add a guest on Profile, then
            come back to the table.
          </p>
        ) : (
          <>
            <span className="label">Who&apos;s joining</span>
            <div className="table-change-list">
              {candidates.map((player) => (
                <button
                  className={`contender${player.id === chosenId ? " selected" : ""}`}
                  key={player.id}
                  type="button"
                  aria-pressed={player.id === chosenId}
                  onClick={() => setChosenId(player.id)}
                >
                  <Avatar name={player.name} playerId={player.id} size="small" />
                  <span className="contender-name">{player.name}</span>
                  {player.id === selfPlayerId ? (
                    <span className="you-tag">You</span>
                  ) : null}
                </button>
              ))}
            </div>
            {ledger ? null : (
              <>
                <label className="label" htmlFor="late-seat">
                  Seat
                </label>
                <select
                  className="select-control"
                  id="late-seat"
                  value={seat}
                  onChange={(event) => setSeat(Number(event.target.value))}
                >
                  {seats.map(({ player, index }) => (
                    <option key={player.id || index} value={index + 1}>
                      Left of {player.name}
                      {index === game.dealerIndex ? " (dealer last hand)" : ""}
                    </option>
                  ))}
                </select>
              </>
            )}
            <BuyInAmountField
              game={game}
              id="late-amount"
              value={amount}
              onChange={setAmount}
            />
          </>
        )}
        <button
          className="primary full"
          type="submit"
          disabled={full || !chosen || !amountValid}
        >
          {chosen && amountValid
            ? `Add ${chosen.name} · ${money(amount)}`
            : "Add player"}
        </button>
        <button className="ghost full" type="button" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}

function CashOutSheet({
  game,
  onClose,
  onCashOut,
  onReturn,
}: {
  game: GameState;
  onClose: () => void;
  onCashOut: (playerIndex: number) => void;
  onReturn: (playerIndex: number) => void;
}) {
  const { money } = useMoney();
  const seated = game.players.flatMap((player, index) =>
    player.left ? [] : [{ player, index }],
  );
  const gone = game.players.flatMap((player, index) =>
    player.left ? [{ player, index }] : [],
  );

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cash-out-title"
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="cash-out-title">Cash Out</h2>
        <p className="muted small-note">
          Pick who&apos;s leaving. The chips in front of them become their
          result for the game.
        </p>
        <div className="table-change-list">
          {seated.map(({ player, index }) => (
            <button
              className="contender"
              key={player.id || index}
              type="button"
              onClick={() => onCashOut(index)}
            >
              <Avatar name={player.name} playerId={player.id} size="small" />
              <span className="contender-name">{player.name}</span>
              <span className="contender-amount">{money(player.stack)}</span>
            </button>
          ))}
        </div>
        {gone.length ? (
          <>
            <span className="label">Left the table</span>
            <div className="table-change-list">
              {gone.map(({ player, index }) => (
                <button
                  className="contender"
                  key={player.id || index}
                  type="button"
                  onClick={() => onReturn(index)}
                >
                  <Avatar name={player.name} playerId={player.id} size="small" />
                  <span className="contender-name">{player.name}</span>
                  <span className="contender-amount">
                    Return · {money(player.stack)}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        <button className="ghost full" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

type LedgerViewProps = {
  game: GameState;
  onBuyIn: (playerIndex: number) => void;
  onAddPlayer: () => void;
  onCashOut: () => void;
  onReturn: (playerIndex: number) => void;
  onUndo: () => void;
  /** Chips counted for each player still at the table, by player index. */
  onSave: (counts: Array<number | null>) => void;
  onDiscard: () => void;
};

/** A quick ledger's screen, with its amounts in the game's own chip unit. */
function LedgerView(props: LedgerViewProps) {
  return (
    <GameAmounts game={props.game}>
      <LedgerScreen {...props} />
    </GameAmounts>
  );
}

function LedgerScreen({
  game,
  onBuyIn,
  onAddPlayer,
  onCashOut,
  onReturn,
  onUndo,
  onSave,
  onDiscard,
}: LedgerViewProps) {
  const { money, signedMoney } = useMoney();
  const [counting, setCounting] = useState(false);
  // Chips counted for each player at the table, by player index; empty is 0.
  const [counts, setCounts] = useState<Array<number | null>>([]);
  const [showFullLog, setShowFullLog] = useState(false);
  const totals = ledgerTotals(game);
  const seated = ledgerSeated(game);
  const undoLine = ledgerUndoLine(game);
  const logLines = showFullLog ? game.log : game.log.slice(0, 6);
  const boughtNote = (index: number) => {
    const buyIns = playerBuyIns(game, index);
    return `${buyIns.length} buy-in${buyIns.length === 1 ? "" : "s"} · ${money(
      totalBuyIns(game, index),
    )}`;
  };

  if (counting) {
    const gap = ledgerCountGap(game, counts);
    return (
      <div className="stack-list game-view ledger-view">
        <section className="glass card">
          <span className="eyebrow">Final count</span>
          <h2 className="card-title">Count The Chips</h2>
          <p className="muted small-note">
            Enter the chips in front of everyone still at the table. Together
            they must come to the chips on the table.
          </p>
          <div className="rows">
            {seated.map((index) => {
              const player = game.players[index];
              const count = counts[index] ?? null;
              const net = (count ?? 0) - totalBuyIns(game, index);
              return (
                <div className="ledger-row" key={player.id || index}>
                  <Avatar name={player.name} playerId={player.id} size="small" />
                  <div className="standing-name">
                    <b>{player.name}</b>
                    <small>
                      Bought {money(totalBuyIns(game, index))}
                      {count !== null ? (
                        <>
                          {" · "}
                          <span className={toneClass(net)}>
                            {signedMoney(net)}
                          </span>
                        </>
                      ) : null}
                    </small>
                  </div>
                  <ChipInput
                    className="field ledger-count"
                    aria-label={`${player.name}'s chips`}
                    placeholder="0"
                    value={count}
                    onChange={(chips) =>
                      setCounts((current) => {
                        const next = [...current];
                        next[index] = chips;
                        return next;
                      })
                    }
                  />
                </div>
              );
            })}
            {game.players.map((player, index) =>
              player.left ? (
                <div className="ledger-row left" key={player.id || index}>
                  <Avatar name={player.name} playerId={player.id} size="small" />
                  <div className="standing-name">
                    <b>{player.name}</b>
                    <small>
                      Cashed out ·{" "}
                      <span className={toneClass(player.stack - totalBuyIns(game, index))}>
                        {signedMoney(player.stack - totalBuyIns(game, index))}
                      </span>
                    </small>
                  </div>
                  <span className="ledger-amount">{money(player.stack)}</span>
                </div>
              ) : null,
            )}
          </div>
          <div
            className={`ledger-balance${gap === 0 ? " balanced" : ""}`}
            role="status"
          >
            <span>
              Counted {money(totals.onTable - gap)} of {money(totals.onTable)}
            </span>
            <b>
              {gap === 0
                ? "Balanced"
                : gap > 0
                  ? `${money(gap)} short`
                  : `${money(-gap)} over`}
            </b>
          </div>
        </section>
        <button
          className="cta"
          type="button"
          disabled={gap !== 0}
          onClick={() => onSave(counts)}
        >
          Save Game
        </button>
        <button
          className="glass-button full"
          type="button"
          onClick={() => setCounting(false)}
        >
          Back to buy-ins
        </button>
      </div>
    );
  }

  return (
    <div className="stack-list game-view ledger-view">
      <section className="glass card between-card">
        <span className="eyebrow">
          {seated.length} at the table
        </span>
        <h2 className="card-title">Buy-Ins</h2>
        <div className="profile-tiles ledger-tiles">
          <div>
            <strong>{money(totals.bought)}</strong>
            <small>Bought in</small>
          </div>
          <div>
            <strong>{money(totals.cashedOut)}</strong>
            <small>Cashed out</small>
          </div>
          <div>
            <strong className="blue">{money(totals.onTable)}</strong>
            <small>On the table</small>
          </div>
        </div>
        <div className="button-pair">
          <button className="glass-button" type="button" onClick={onAddPlayer}>
            Add player
          </button>
          <button className="glass-button" type="button" onClick={onCashOut}>
            Cash out
          </button>
        </div>
      </section>

      <section className="glass card">
        <div className="card-row">
          <h2 className="card-title">Players</h2>
          <span className="card-note">Usual buy-in {money(game.startStack)}</span>
        </div>
        <div className="rows">
          {game.players.map((player, index) => (
            <div
              className={`ledger-row${player.left ? " left" : ""}`}
              key={player.id || index}
            >
              <Avatar name={player.name} playerId={player.id} size="small" />
              <div className="standing-name">
                <b>{player.name}</b>
                <small>
                  {player.left ? (
                    <>
                      Cashed out with {money(player.stack)} ·{" "}
                      <span
                        className={toneClass(player.stack - totalBuyIns(game, index))}
                      >
                        {signedMoney(player.stack - totalBuyIns(game, index))}
                      </span>
                    </>
                  ) : (
                    boughtNote(index)
                  )}
                </small>
              </div>
              {player.left ? (
                <button
                  className="pill-button"
                  type="button"
                  onClick={() => onReturn(index)}
                >
                  Return
                </button>
              ) : (
                <button
                  className="pill-button"
                  type="button"
                  aria-label={`Buy in ${player.name} again`}
                  onClick={() => onBuyIn(index)}
                >
                  + Buy in
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {undoLine ? (
        <button
          className="glass-button full undo-turn ledger-undo"
          type="button"
          onClick={onUndo}
        >
          <UndoIcon />
          <span>Undo: {undoLine}</span>
        </button>
      ) : null}
      <button
        className="cta"
        type="button"
        onClick={() => {
          setCounting(true);
          window.scrollTo({ top: 0 });
        }}
      >
        Count Chips And Finish
      </button>
      <button
        className="glass-button full danger-text"
        type="button"
        onClick={onDiscard}
      >
        Discard game
      </button>

      {game.log.length ? (
        <section className="glass card">
          <span className="label">Log</span>
          <div className="rows log">
            {logLines.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
          {game.log.length > 6 ? (
            <button
              className="text-button"
              type="button"
              onClick={() => setShowFullLog((shown) => !shown)}
            >
              {showFullLog ? "Show fewer" : `Show all ${game.log.length} lines`}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/**
 * Cash out in a quick ledger: pick who's leaving, then type the chips they
 * leave with. Players who left can come back from here too.
 */
function LedgerCashOutSheet({
  game,
  onClose,
  onCashOut,
  onReturn,
}: {
  game: GameState;
  onClose: () => void;
  onCashOut: (playerIndex: number, chips: number) => void;
  onReturn: (playerIndex: number) => void;
}) {
  const { money } = useMoney();
  const [chosen, setChosen] = useState<number | null>(null);
  const [chips, setChips] = useState<number | null>(null);
  const seated = ledgerSeated(game);
  const gone = game.players.flatMap((player, index) =>
    player.left ? [index] : [],
  );
  const player = chosen === null ? null : game.players[chosen];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chosen !== null && chips !== null) onCashOut(chosen, chips);
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ledger-cash-out-title"
        onSubmit={submit}
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="ledger-cash-out-title">Cash Out</h2>
        <p className="muted small-note">
          Pick who&apos;s leaving, then count the chips they leave with. That&apos;s
          their result for the game.
        </p>
        {seated.length ? (
          <div className="table-change-list">
            {seated.map((index) => (
              <button
                className={`contender${index === chosen ? " selected" : ""}`}
                key={game.players[index].id || index}
                type="button"
                aria-pressed={index === chosen}
                onClick={() => setChosen(index)}
              >
                <Avatar
                  name={game.players[index].name}
                  playerId={game.players[index].id}
                  size="small"
                />
                <span className="contender-name">{game.players[index].name}</span>
                <span className="contender-amount muted">
                  Bought {money(totalBuyIns(game, index))}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small-note">Everyone has cashed out.</p>
        )}
        {player ? (
          <>
            <label className="label" htmlFor="ledger-cash-out-chips">
              {player.name}&apos;s chips
            </label>
            <ChipInput
              className="field"
              id="ledger-cash-out-chips"
              placeholder="0"
              value={chips}
              onChange={setChips}
            />
          </>
        ) : null}
        <button
          className="primary full"
          type="submit"
          disabled={!player || chips === null}
        >
          {player && chips !== null
            ? `Cash Out · ${money(chips)}`
            : "Cash out"}
        </button>
        {gone.length ? (
          <>
            <span className="label">Left the game</span>
            <div className="table-change-list">
              {gone.map((index) => (
                <button
                  className="contender"
                  key={game.players[index].id || index}
                  type="button"
                  onClick={() => onReturn(index)}
                >
                  <Avatar
                    name={game.players[index].name}
                    playerId={game.players[index].id}
                    size="small"
                  />
                  <span className="contender-name">{game.players[index].name}</span>
                  <span className="contender-amount">Return</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        <button className="ghost full" type="button" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}

function BlindEditor({
  game,
  onClose,
  onSave,
}: {
  game: GameState;
  onClose: () => void;
  onSave: (schedule: BlindSchedule | null) => void;
}) {
  const { money } = useMoney();
  const pending = pendingBlindPlan(game);
  const initial = pending ? pending.schedule : (game.blinds ?? null);
  const defaults = initial ?? DEFAULT_BLIND_SCHEDULE;
  const [enabled, setEnabled] = useState(Boolean(initial));
  const [unit, setUnit] = useState<BlindSchedule["unit"]>(defaults.unit);
  const [every, setEvery] = useState(defaults.every);
  const [raiseType, setRaiseType] = useState<BlindSchedule["raiseType"]>(
    defaults.raiseType,
  );
  const [raiseBy, setRaiseBy] = useState(defaults.raiseBy);
  const valid =
    !enabled ||
    (Number.isSafeInteger(every) &&
      every >= 1 &&
      Number.isFinite(raiseBy) &&
      raiseBy > (raiseType === "multiply" ? 1 : 0) &&
      (raiseType === "multiply" || Number.isSafeInteger(raiseBy)));
  const schedule: BlindSchedule | null = enabled
    ? { unit, every, raiseType, raiseBy }
    : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid) onSave(schedule);
  }

  return (
    <div
      className="modal blind-editor-modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="sheet blind-editor-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="blind-editor-title"
        onSubmit={submit}
      >
        <h2 id="blind-editor-title">Edit Blind Plan</h2>
        <p className="muted rule-note">
          Current blinds:{" "}
          {money(smallBlindFor(game.ante, game.smallBlindRatio))}/
          {money(game.ante)}. {game.hand
            ? "This hand keeps its posted blinds. The new plan starts with the next dealt hand."
            : "The new plan starts with the next dealt hand."}
        </p>
        <div className="blind-toggle">
          <label htmlFor="edit-rising-blinds">Blinds Go Up</label>
          <input
            id="edit-rising-blinds"
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
        </div>
        {enabled ? (
          <>
            <div className="row setup-row">
              <div>
                <label htmlFor="edit-blind-every">Raise Every</label>
                <input
                  id="edit-blind-every"
                  type="number"
                  min="1"
                  step="1"
                  value={every}
                  onChange={(event) => setEvery(Number(event.target.value))}
                />
              </div>
              <div>
                <label htmlFor="edit-blind-unit">Counted In</label>
                <select
                  className="select-control"
                  id="edit-blind-unit"
                  value={unit}
                  onChange={(event) =>
                    setUnit(event.target.value as BlindSchedule["unit"])
                  }
                >
                  <option value="hands">Hands</option>
                  <option value="minutes">Minutes</option>
                </select>
              </div>
            </div>
            <div className="row setup-row">
              <div>
                <label htmlFor="edit-blind-raise-type">Increase By</label>
                <select
                  className="select-control"
                  id="edit-blind-raise-type"
                  value={raiseType}
                  onChange={(event) => {
                    const nextType = event.target
                      .value as BlindSchedule["raiseType"];
                    setRaiseType(nextType);
                    setRaiseBy(nextType === "multiply" ? 2 : game.ante);
                  }}
                >
                  <option value="multiply">Multiply Big Blind</option>
                  <option value="add">Add To Big Blind</option>
                </select>
              </div>
              <div>
                <label htmlFor="edit-blind-raise-by">
                  {raiseType === "multiply" ? "Multiplier" : "Amount"}
                </label>
                {raiseType === "multiply" ? (
                  <input
                    id="edit-blind-raise-by"
                    type="number"
                    min="1.1"
                    step="0.1"
                    value={raiseBy}
                    onChange={(event) => setRaiseBy(Number(event.target.value))}
                  />
                ) : (
                  <ChipInput
                    id="edit-blind-raise-by"
                    value={raiseBy}
                    onChange={setRaiseBy}
                  />
                )}
              </div>
            </div>
            <p className="muted rule-note">
              {valid
                ? `Next levels: ${Array.from({ length: 4 }, (_, level) =>
                    money(bigBlindAtLevel(game.ante, schedule, level)),
                  ).join(", ")}. ${unit === "minutes" ? "The timer starts when you save." : "The hand count starts with the next hand."}`
                : "Enter a whole hand or minute interval and an increase that raises the big blind."}
            </p>
          </>
        ) : (
          <p className="muted rule-note">
            Blinds will stay at{" "}
            {money(smallBlindFor(game.ante, game.smallBlindRatio))}/
            {money(game.ante)} from the next hand onward.
          </p>
        )}
        <button className="primary full" type="submit" disabled={!valid}>
          Save Blind Plan
        </button>
        <button className="ghost full" type="button" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}

/** QR code as SVG squares, so no generated markup is injected. */
function QrCode({ text, label }: { text: string; label: string }) {
  const path = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(text);
    code.make();
    const size = code.getModuleCount();
    let d = "";
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (code.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
      }
    }
    return { d, size: size + 8 };
  }, [text]);
  return (
    <svg
      className="live-qr"
      viewBox={`0 0 ${path.size} ${path.size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={path.size} height={path.size} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  );
}

const QR_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h3v3M20 14v.01M14 20h.01M17 20h3v-3" />
  </svg>
);

const SCAN_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16" />
  </svg>
);

type ScannerStatus = "starting" | "scanning" | "blocked" | "unavailable";

/**
 * Reads a user code from the camera. Frames are decoded with jsQR, loaded
 * only when scanning, so it works the same on iPhones, which have no
 * BarcodeDetector. Other QR codes (a live standings link, say) are skipped
 * with a note and scanning carries on.
 */
function QrScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const [status, setStatus] = useState<ScannerStatus>("starting");
  const [otherCode, setOtherCode] = useState(false);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return;
      }
      try {
        const [media, { default: jsQR }] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false,
          }),
          import("jsqr"),
        ]);
        stream = media;
        const video = videoRef.current;
        if (stopped || !video) {
          stop();
          return;
        }
        video.srcObject = media;
        await video.play();
        if (stopped) return;
        setStatus("scanning");

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        const scan = () => {
          if (stopped || !context) return;
          if (video.videoWidth) {
            // Phones film at 1080p or more; 640px is plenty for a code
            // held up close and keeps each decode quick.
            const scale = Math.min(
              1,
              640 / Math.max(video.videoWidth, video.videoHeight),
            );
            const width = Math.round(video.videoWidth * scale);
            const height = Math.round(video.videoHeight * scale);
            canvas.width = width;
            canvas.height = height;
            context.drawImage(video, 0, 0, width, height);
            const frame = context.getImageData(0, 0, width, height);
            const found = jsQR(frame.data, width, height, {
              inversionAttempts: "dontInvert",
            });
            if (found) {
              const parsed = parseCodeInput(found.data);
              if (parsed?.kind === "user") {
                stop();
                onCodeRef.current(parsed.code);
                return;
              }
              setOtherCode(true);
            }
          }
          timer = setTimeout(scan, 150);
        };
        scan();
      } catch (error) {
        if (stopped) return;
        stop();
        setStatus(
          error instanceof DOMException &&
            (error.name === "NotAllowedError" || error.name === "SecurityError")
            ? "blocked"
            : "unavailable",
        );
      }
    }

    void start();
    return stop;
  }, []);

  const note: Record<ScannerStatus, string> = {
    starting: "Starting the camera…",
    scanning: otherCode
      ? "That QR code isn't a user code. Point the camera at theirs."
      : "Point the camera at their code. It's on their Profile, under the QR button.",
    blocked:
      "Camera access is off. Allow it for this site in your browser settings, or type their code.",
    unavailable: "The camera isn't available here. Type their code instead.",
  };
  const failed = status === "blocked" || status === "unavailable";

  return (
    <div className="qr-scanner">
      {failed ? null : (
        <div className="qr-scanner-view">
          <video ref={videoRef} muted playsInline aria-label="Camera view" />
          <span className="qr-scanner-frame" aria-hidden="true" />
        </div>
      )}
      <p className={failed ? "field-error" : "muted small-note"} role="status">
        {note[status]}
      </p>
    </div>
  );
}

/** Your user code as a QR for a friend to scan, or the camera to scan theirs. */
function UserCodeSheet({
  userCode,
  onScanned,
  onClose,
}: {
  userCode: string;
  onScanned: (code: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"mine" | "scan">("mine");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-code-title"
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="user-code-title">User code</h2>
        <div className="profile-modes" role="group" aria-label="Show or scan">
          {(
            [
              ["mine", "My Code"],
              ["scan", "Scan Code"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={mode === key ? "selected" : ""}
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "mine" ? (
          <>
            <p className="muted small-note">
              A friend scans this with Scan Code in the app to send you a
              friend request.
            </p>
            <QrCode
              text={formatUserCode(userCode)}
              label="QR code for your user code"
            />
            <p className="user-code-text">{formatUserCode(userCode)}</p>
          </>
        ) : (
          <QrScanner onCode={onScanned} />
        )}
      </div>
    </div>
  );
}

/**
 * Invite to Pokerize, for one of your own guests (migration 0030; user
 * decisions 2026-10-26: only the host who added a guest can invite them,
 * never a friend's guest). Makes a one-person link, which works once for
 * 30 days, and shares it. Whoever opens it, signs in and confirms they're
 * the guest becomes your friend, with the guest's games.
 */
function InviteSheet({
  guest,
  hostName,
  onToast,
  onClose,
}: {
  guest: { id: string; name: string };
  hostName: string;
  onToast: (message: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const message = inviteMessage(hostName, guest.name);

  async function create() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", playerId: guest.id }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };
      if (!response.ok || !data.token) {
        throw new Error(
          apiErrorMessage(response.status, data.error, "Could not make the invite"),
        );
      }
      setUrl(`${window.location.origin}${invitePath(data.token)}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not make the invite");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Join me on Pokerize", text: message, url });
    } catch {
      // The host closed the share sheet.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${message} ${url}`);
      onToast("Invite Copied");
    } catch {
      // Clipboard blocked: the link is still shown for copying by hand.
    }
  }

  return (
    <div
      className="modal show"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet live-share-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id="invite-title">Invite to Pokerize</h2>
        <p className="muted rule-note">
          Send <span className="literal-text">{guest.name}</span> a link to
          join. Once they sign in and confirm it&apos;s them, you become
          friends and every game they played as{" "}
          <span className="literal-text">{guest.name}</span> moves to their
          account. The link works once, for {INVITE_EXPIRY_DAYS} days; a new
          link replaces the last one.
        </p>
        {url ? (
          <>
            <p className="live-link">{url}</p>
            {canShare ? (
              <button className="primary full" type="button" onClick={() => void share()}>
                Share invite
              </button>
            ) : null}
            <button
              className={`${canShare ? "ghost" : "primary"} full`}
              type="button"
              onClick={() => void copy()}
            >
              Copy invite
            </button>
          </>
        ) : (
          <button
            className="primary full"
            type="button"
            disabled={busy}
            onClick={() => void create()}
          >
            {busy ? "Making link…" : "Make invite link"}
          </button>
        )}
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="ghost full" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function LiveShareSheet({
  token,
  busy,
  failing,
  onStart,
  onStop,
  onCopied,
  onClose,
}: {
  token: string | null;
  busy: boolean;
  failing: boolean;
  onStart: () => void;
  onStop: () => void;
  onCopied: () => void;
  onClose: () => void;
}) {
  const url = token ? `${window.location.origin}/live/${token}` : "";
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function share() {
    try {
      await navigator.share({ title: "Live standings", url });
    } catch {
      // The host closed the share sheet.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      onCopied();
    } catch {
      // Clipboard blocked: the link is still shown for copying by hand.
    }
  }

  return (
    <div
      className="modal show"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet live-share-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-share-title"
      >
        <h2 id="live-share-title">Live Standings</h2>
        {token ? (
          <>
            <p className="muted rule-note">
              Players scan this or open the link to see every stack and this
              game&apos;s standings on their own phones. It updates a few
              seconds after each change and ends when you save or discard the
              game.
            </p>
            <QrCode text={url} label="QR code for the live standings link" />
            <p className="live-link">{url}</p>
            {failing ? (
              <p className="field-error">
                The live link isn&apos;t updating. It will retry after the next
                change.
              </p>
            ) : null}
            {canShare ? (
              <button className="primary full" type="button" onClick={() => void share()}>
                Share link
              </button>
            ) : null}
            <button
              className={`${canShare ? "ghost" : "primary"} full`}
              type="button"
              onClick={() => void copy()}
            >
              Copy link
            </button>
            <button
              className="ghost full danger-text"
              type="button"
              disabled={busy}
              onClick={onStop}
            >
              Stop sharing
            </button>
          </>
        ) : (
          <>
            <p className="muted rule-note">
              Create a link players can open without signing in. They see each
              player&apos;s stack, total bought in and net for this game only,
              read-only. Anyone with the link can see it until the game is
              saved or discarded, or you stop sharing.
            </p>
            <button
              className="primary full"
              type="button"
              disabled={busy}
              onClick={onStart}
            >
              {busy ? "Creating link…" : "Create live link"}
            </button>
          </>
        )}
        <button className="ghost full" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function BuyInOptions({
  game,
  onBuyIn,
}: {
  game: GameState;
  onBuyIn: (playerIndex: number) => void;
}) {
  const { money } = useMoney();
  const offers = game.players.flatMap((player, index) => {
    const amount = nextBuyIn(game, index);
    return amount === null ? [] : [{ player, index, amount }];
  });
  // Busted players the host's rebuy limits stop, with the reason.
  const blocked = game.players.flatMap((player, index) => {
    const reason = player.stack === 0 ? rebuyBlockReason(game, index) : null;
    return reason ? [{ player, index, reason }] : [];
  });
  if (!offers.length && !blocked.length) return null;
  const rules = describeRebuyRules(game.rebuyRules, chipCurrency(game.currency, game.chipValue), game.chipUnit);

  return (
    <div className="buy-in-options">
      <span className="label">Buy in</span>
      <p className="muted small-note">
        {game.customBuyIns
          ? `A busted player can buy back in for any amount, usually ${money(game.startStack)}.`
          : "A busted player can buy back in for the starting stack."}
        {rules ? ` ${rules}.` : ""}
      </p>
      {offers.map(({ player, index, amount }) => (
        <button
          className="contender"
          key={player.id || index}
          type="button"
          onClick={() => onBuyIn(index)}
        >
          <Avatar name={player.name} playerId={player.id} size="small" />
          <span className="contender-name">{player.name}</span>
          <span className="contender-amount">
            {game.customBuyIns ? "Buy in" : `Buy in · ${money(amount)}`}
          </span>
        </button>
      ))}
      {blocked.map(({ player, index, reason }) => (
        <div className="contender" key={player.id || index} aria-disabled="true">
          <Avatar name={player.name} playerId={player.id} size="small" />
          <span className="contender-name">{player.name}</span>
          <span className="contender-amount muted">
            {reason === "max" ? "No rebuys left" : "Rebuys closed"}
          </span>
        </div>
      ))}
    </div>
  );
}

function WinnerCard({
  announcement,
  onNext,
}: {
  announcement: WinnerAnnouncement;
  onNext: () => void;
}) {
  const { money } = useMoney();
  const winnerText = announcement.split
    ? `${announcement.names.join(" And ")} Win`
    : `${announcement.names[0]} Wins`;
  const pots =
    announcement.pots && announcement.pots.length > 1 ? announcement.pots : null;

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
        <span className="eyebrow">
          {pots ? "Pots won" : "Pot won"} · Hand {announcement.handNo}
        </span>
        <h2 id="winner-title">{winnerText}</h2>
        {pots ? (
          <ul className="winner-pots">
            {pots.map((pot) => (
              <li key={pot.label}>
                <span className="winner-pot-label">{pot.label}</span>
                <b>{pot.names.join(", ")}</b>
                <span className="winner-pot-amount">{money(pot.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gradient-text winner-pot">
            {money(announcement.pot)}
          </p>
        )}
        <button className="cta" type="button" onClick={onNext}>
          Next
        </button>
      </section>
    </div>
  );
}

function WinnerPicker({
  game,
  pending,
  hint,
  onPickWinner,
  onBeginSplit,
}: {
  game: GameState;
  pending: boolean;
  /** A line under the heading, like where else the winner can be picked. */
  hint?: string;
  onPickWinner: (playerIndex: number) => void;
  onBeginSplit: () => void;
}) {
  const { money } = useMoney();
  const hand = game.hand;
  if (!hand) return null;
  const rake = handRake(game);
  const payout = hand.pot - rake;

  return (
    <section className="glass card winner-picker">
      <div className="card-row">
        <span className="label">Pick the winner</span>
        <span className="accent-amount">{money(payout)}</span>
      </div>
      {rake ? (
        <p className="muted small-note">
          After the house&apos;s {money(rake)} rake.
        </p>
      ) : null}
      {pending ? (
        <p className="muted small-note">
          Finish the river betting before picking a winner.
        </p>
      ) : hint ? (
        <p className="muted small-note">{hint}</p>
      ) : null}
      {activeIndexes(game).map((playerIndex) => (
        <button
          className="contender"
          type="button"
          disabled={pending}
          key={playerIndex}
          onClick={() => onPickWinner(playerIndex)}
        >
          <Avatar
            name={game.players[playerIndex].name}
            playerId={game.players[playerIndex].id}
            size="small"
          />
          <span className="contender-name">
            {game.players[playerIndex].name} wins
          </span>
          <span className="contender-amount">{money(payout)}</span>
        </button>
      ))}
      {activeIndexes(game).length > 1 ? (
        <button
          className="dashed-button"
          type="button"
          disabled={pending}
          onClick={onBeginSplit}
        >
          Split between two or more
        </button>
      ) : null}
    </section>
  );
}

/**
 * Where a seat sits around the oval, in percent of the table area. Seat 0 is
 * at the top and the rest follow clockwise, the order the deal goes round.
 */
function seatPosition(index: number, count: number, reach = 1) {
  const angle = ((-90 + (index * 360) / count) * Math.PI) / 180;
  return {
    x: 50 + 38 * reach * Math.cos(angle),
    y: 50 + 38 * reach * Math.sin(angle),
  };
}

/** The live hand drawn as a table, with the action docked below it. */
function TableHand({
  game,
  blindsText,
  blindSchedule,
  onAct,
  onUndoAction,
  onBuyIn,
  onNextStage,
  onPickWinner,
  onBeginSplit,
  onEndSplit,
  onToggleSplit,
  onSplitPot,
  onAwardPots,
  onCancelHand,
  lastTurn,
}: GameViewProps & {
  blindsText: string;
  blindSchedule: ReactNode;
}) {
  const { money } = useMoney();
  // Places the seats are turned clockwise to match the real table; the deal
  // order is unchanged.
  const [turn, setTurn] = useState(() => readTableTurn(game.startedAt));
  const hand = game.hand;
  if (!hand) return null;
  // Players who cashed out have left the table, so they get no seat.
  const seats = game.players.flatMap((player, index) =>
    player.left ? [] : [index],
  );
  const count = seats.length;
  const place = (index: number) =>
    seatPosition((seats.indexOf(index) + turn) % count, count);

  function turnSeats() {
    const next = (turn + 1) % count;
    setTurn(next);
    storeTableTurn(game.startedAt, next);
  }
  const lastStage = STAGES.length - 1;
  const pending = pendingIndexes(game).length > 0;
  const showdown = hand.stage === lastStage && !pending;
  const splitting = Boolean(hand.splitSel);
  // With side pots the winners are picked per pot on the card below.
  const multiPot = showdown && hasSidePots(game);
  const potCount = multiPot ? potsFor(game).pots.length : 1;
  const crowded = count > 6;
  const current = hand.currentPlayer;
  // A player bust at the deal can buy in by tapping their seat.
  const canBuyIn = (index: number) =>
    !splitting && nextBuyIn(game, index) !== null;

  function tapSeat(index: number) {
    if (canBuyIn(index)) {
      onBuyIn(index);
      return;
    }
    if (!showdown || !hand?.in[index] || multiPot) return;
    if (splitting) onToggleSplit(index);
    else onPickWinner(index);
  }

  return (
    <>
      <section
        className={`poker-table ${crowded ? "crowded" : ""}`}
        aria-label={`Table, hand ${hand.no}`}
      >
        <button
          className="table-turn"
          type="button"
          aria-label="Move every seat one place clockwise"
          title="Move seats to match your table"
          onClick={turnSeats}
        >
          <TurnSeatsIcon />
        </button>
        <div className="table-rim" aria-hidden="true">
          <div className="table-felt">
            <span className="table-line" />
          </div>
        </div>
        <div className="table-center">
          <div className="table-pips" aria-label={`Street: ${STAGES[hand.stage]}`}>
            {STAGES.map((stage, index) => (
              <span
                key={stage}
                className={
                  showdown || index < hand.stage
                    ? "past"
                    : index === hand.stage
                      ? "current"
                      : ""
                }
              />
            ))}
          </div>
          <span className="table-label">
            {showdown
              ? potCount > 1
                ? "Pick the winners"
                : splitting
                  ? "Split the pot"
                  : "Pick the winner"
              : `Pot · ${STAGES[hand.stage]}`}
          </span>
          <span
            className="table-pot"
            style={
              { "--chars": money(hand.pot).length } as React.CSSProperties
            }
          >
            {money(hand.pot)}
          </span>
          <PotBreakdown game={game} className="table-sidepots" />
          <span className="table-blinds">{blindsText}</span>
        </div>
        {showdown
          ? null
          : game.players.map((_, index) => {
              const chips = hand.committed[index];
              if (!(chips > 0)) return null;
              // Chips sit in front of the seat, clear of the pot: under the
              // name for seats along the top, over the avatar for the rest.
              const spot = place(index);
              const upper = spot.y < 40;
              // On a full table, chips over a side seat would touch the seat
              // above it, so they go beside the avatar, towards the pot.
              const beside = crowded && !upper && Math.abs(spot.x - 50) > 23;
              const dx = beside
                ? Math.sign(50 - spot.x) * 52
                : Math.round((50 - spot.x) * 0.5);
              // A seat is centred on its avatar and name together.
              const dy = beside ? -18 : (upper ? 1 : -1) * (crowded ? 54 : 62);
              return (
                <span
                  className="table-chips"
                  key={index}
                  style={{
                    left: `calc(${spot.x}% + ${dx}px)`,
                    top: `calc(${spot.y}% + ${dy}px)`,
                  }}
                >
                  <span className="chip-icon" aria-hidden="true" />
                  {money(chips)}
                </span>
              );
            })}
        {seats.map((index) => {
          const player = game.players[index];
          const spot = place(index);
          const folded = !hand.in[index];
          const isTurn = !showdown && current === index;
          const flash = showdown ? undefined : flashFor(game, lastTurn, index);
          const contender = showdown && !folded;
          const inSplit = hand.splitSel?.includes(index) ?? false;
          const buyable = canBuyIn(index);
          const tappable = buyable || (showdown && contender && !multiPot);
          const status = buyable
            ? "Tap to buy in"
            : folded
            ? seatStatus(game, index, money)
            : isTurn
              ? "To act"
              : showdown
                ? multiPot
                  ? "In the hand"
                  : splitting
                    ? inSplit
                      ? "In split"
                      : "Tap to add"
                    : "Tap to award"
                : seatStatus(game, index, money)
                    .replace("Small blind", "SB")
                    .replace("Big blind", "BB");
          const state = [
            folded && !buyable ? "folded" : "",
            isTurn ? "turn" : "",
            contender ? (inSplit ? "in-split" : "contender") : "",
            flash ? "just-acted" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              className={`table-seat ${state}`}
              type="button"
              key={player.id || index}
              disabled={!tappable}
              aria-pressed={splitting && contender ? inSplit : undefined}
              aria-label={`${player.name}, ${money(player.stack)}, ${status}`}
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              onClick={() => tapSeat(index)}
            >
              <span className="table-seat-ring">
                <Avatar
                  name={player.name}
                  playerId={player.id}
                  role={seatRole(game, index)}
                  size={crowded ? "small" : "large"}
                />
              </span>
              <span className="table-seat-pill" key={flash ?? "pill"}>
                <b>{player.name.split(" ")[0]}</b>
                <span className="table-seat-stack">{money(player.stack)}</span>
                <small>{status}</small>
              </span>
            </button>
          );
        })}
      </section>

      {blindSchedule ? <div className="table-schedule">{blindSchedule}</div> : null}

      {splitting ? (
        <SplitView
          game={game}
          onToggle={onToggleSplit}
          onSplit={onSplitPot}
          onBack={onEndSplit}
        />
      ) : multiPot ? (
        <SidePotPicker key={hand.no} game={game} onAward={onAwardPots} />
      ) : showdown ? (
        <WinnerPicker
          game={game}
          pending={false}
          hint="Tap a seat on the table or a name below."
          onPickWinner={onPickWinner}
          onBeginSplit={onBeginSplit}
        />
      ) : current !== null && hand.in[current] ? (
        <PlayerRow
          key={`${hand.no}-${hand.stage}-${current}`}
          game={game}
          playerIndex={current}
          dock
          onAct={onAct}
        />
      ) : null}

      {!splitting && !pending && hand.stage < lastStage ? (
        <button
          className="blue-button full tall"
          type="button"
          onClick={onNextStage}
        >
          Deal {STAGES[hand.stage + 1]}
        </button>
      ) : null}
      <UndoTurnButton game={game} tall onUndo={onUndoAction} />
      <button
        className="glass-button full tall danger-text"
        type="button"
        onClick={onCancelHand}
      >
        Cancel hand
      </button>
    </>
  );
}

/**
 * One Undo for the live hand, in both views: it takes back the latest action
 * this street and names it, like "Undo Asha's call". Hidden before anyone
 * acts and while a pot is being split.
 */
function UndoTurnButton({
  game,
  tall = false,
  onUndo,
}: {
  game: GameState;
  tall?: boolean;
  onUndo: (playerIndex: number) => void;
}) {
  const seat = game.hand?.splitSel ? null : latestActor(game);
  const action = seat === null ? null : game.hand?.last[seat];
  if (seat === null || !action) return null;
  // First name only, unless another player shares it ("Arjun S.").
  const name = game.players[seat].name;
  const first = name.split(" ")[0];
  const shared = game.players.some(
    (player, index) => index !== seat && player.name.split(" ")[0] === first,
  );
  return (
    <button
      className={`glass-button full ${tall ? "tall " : ""}undo-turn`}
      type="button"
      onClick={() => onUndo(seat)}
    >
      <UndoIcon />
      {/* Cased here: the house capitalising would also lift the "s" in
          "Arjun S.'s". */}
      Undo {titleCase(shared ? name : first)}&apos;s{" "}
      {titleCase(actionNoun(action))}
    </button>
  );
}

/**
 * The seat whose action this street came last, or null before anyone acts.
 * The log is newest first, so the earliest line is the latest action.
 */
function latestActor(game: GameState) {
  const hand = game.hand;
  if (!hand) return null;
  let seat: number | null = null;
  let newest = Infinity;
  hand.last.forEach((action, index) => {
    if (!action) return;
    const at = game.log.indexOf(action.line);
    if (at >= 0 && at < newest) {
      newest = at;
      seat = index;
    }
  });
  return seat;
}

/** Every word starting with a capital, like the house style. */
function titleCase(text: string) {
  return text.replace(/(^|\s)(\S)/g, (_, gap, letter) => gap + letter.toUpperCase());
}

/** A short name for an action, as in "Undo Asha's raise". */
function actionNoun(action: PlayerAction) {
  if (action.type === "bet") {
    return action.line.includes(" raises to ")
      ? "raise"
      : action.line.includes(" bets ")
        ? "bet"
        : "call";
  }
  return action.type === "all-in" ? "all in" : action.type;
}

function seatStatus(
  game: GameState,
  playerIndex: number,
  money: (value: number) => string,
) {
  const hand = game.hand!;
  const player = game.players[playerIndex];
  const committed = hand.committed[playerIndex];
  if (!hand.in[playerIndex]) {
    if (player.left) return "Cashed out";
    if (hand.boughtIn?.includes(playerIndex)) return "Next hand";
    // Bust when the hand was dealt, so never in it.
    if (!(hand.stacksBeforeHand[playerIndex] > 0)) return "Busted";
    return "Folded";
  }
  if (player.stack === 0) return `All in ${money(committed)}`;
  const last = hand.last[playerIndex];
  if (last) {
    if (last.type === "check") return "Checked";
    if (last.type === "call") return `Called ${money(committed)}`;
    if (last.type === "bet") {
      // The log line already says whether the chips opened, raised or called.
      return last.line.includes(" raises to ")
        ? `Raised to ${money(committed)}`
        : last.line.includes(" bets ")
          ? `Bet ${money(committed)}`
          : `Called ${money(committed)}`;
    }
    if (last.type === "all-in") return `All in ${money(committed)}`;
  }
  if (hand.stage === 0 && committed > 0) {
    if (playerIndex === hand.bigBlindIndex) {
      return `Big blind ${money(committed)}`;
    }
    if (playerIndex === hand.smallBlindIndex) {
      return `Small blind ${money(committed)}`;
    }
  }
  return "Waiting";
}

function seatRole(game: GameState, playerIndex: number) {
  const hand = game.hand!;
  return [
    playerIndex === hand.dealerIndex ? "D" : "",
    playerIndex === hand.smallBlindIndex ? "SB" : "",
    playerIndex === hand.bigBlindIndex ? "BB" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function PlayerRow({
  game,
  playerIndex,
  onAct,
  onBuyIn,
  roundClosed = false,
  dock = false,
  flash,
}: {
  game: GameState;
  playerIndex: number;
  onAct: GameViewProps["onAct"];
  /** Offered on the card of a player who was bust when the hand was dealt. */
  onBuyIn?: (playerIndex: number) => void;
  /** This player's action closed the round; keep the card open but locked. */
  roundClosed?: boolean;
  /** Set while this player's action is the latest; its status flashes. */
  flash?: number;
  /** The table's action dock under the oval, which names who is to act. */
  dock?: boolean;
}) {
  const { money, symbol, unit } = useMoney();
  // What is typed, in the game's unit ("0.75" in a cents game).
  const [amount, setAmount] = useState("");
  // The quick size last tapped and the amount it set; it stays highlighted
  // only while the amount is unchanged, so typing or sliding clears it.
  const [picked, setPicked] = useState<{ label: string; amount: string } | null>(
    null,
  );
  const [showRaiseHelp, setShowRaiseHelp] = useState(false);
  const hand = game.hand;
  if (!hand) return null;
  const player = game.players[playerIndex];
  const folded = !hand.in[playerIndex];
  const done = hand.acted[playerIndex];
  const isTurn = hand.currentPlayer === playerIndex;
  const owed = hand.roundHigh - hand.committed[playerIndex];
  const minimum = minimumRaise(game, playerIndex);
  // After a short all-in, a player who already acted may only call or fold.
  const raiseClosed = !mayRaise(game, playerIndex) && player.stack > owed;
  const committed = hand.committed[playerIndex];
  // Once a bet stands (the big blind counts), putting in more is a raise.
  // Raises are shown as the total they reach, like "raise to 1,300",
  // while the box and slider stay as chips to put in now.
  const raising = hand.roundHigh > 0;
  const hasAmount = amount.trim() !== "";
  const stops = betStops(minimum, player.stack);
  // Text that isn't an amount (like "1.234" in cents) bets nothing, which
  // disables the bet button.
  const betAmount = hasAmount
    ? (parseChips(amount, unit) ?? 0)
    : (stops[0] ?? 0);
  const allIn = betAmount >= player.stack;
  // The slider sits on the highest stop not above the entered amount.
  const stopIndex = Math.max(
    0,
    stops.findLastIndex((stop) => stop <= betAmount),
  );
  const role = seatRole(game, playerIndex);
  const stackLine = `${money(player.stack)} · in ${money(committed)}`;

  if (roundClosed) {
    return (
      <div className="glass seat-card round-closed">
        <div className="seat-main">
          <Avatar name={player.name} playerId={player.id} role={role} />
          <div className="seat-copy">
            <b>{player.name}</b>
            <small>{stackLine}</small>
          </div>
          <span
            className={`status-pill ${flash ? "just-acted" : ""}`}
            key={flash ?? "status"}
          >
            {seatStatus(game, playerIndex, money)}
          </span>
        </div>
        <div className="bet-panel" aria-hidden="true" inert>
          <div className="bet-summary">
            <p>
              Betting round complete
              <br />
              Deal <b>{STAGES[hand.stage + 1]}</b> next
            </p>
            <label className="bet-input">
              <span className="bet-input-caption">Enter amount</span>
              <span className="bet-input-box">
                <span className="bet-input-symbol">{symbol.trim()}</span>
                <input type="number" disabled placeholder="—" />
                <PencilIcon />
              </span>
            </label>
          </div>
          <input className="bet-range" type="range" disabled defaultValue={0} />
          <div className="quick-sizes">
            {["⅓ Pot", "½ Pot", "Pot", "All in"].map((label) => (
              <button key={label} type="button" disabled>
                {label}
              </button>
            ))}
          </div>
          <div className="action-row">
            <button className="glass-button" type="button" disabled>
              Fold
            </button>
            <button className="blue-button" type="button" disabled>
              Check
            </button>
            <button className="accent-button" type="button" disabled>
              Bet
            </button>
          </div>
          <span className="clear-amount-slot" />
        </div>
      </div>
    );
  }

  if (folded || done || !isTurn) {
    const buyIn =
      onBuyIn && !hand.splitSel ? nextBuyIn(game, playerIndex) : null;
    // Not faded while they can buy in, so the button doesn't look disabled.
    return (
      <div
        className={`glass seat-card ${folded && buyIn === null ? "folded" : ""}`}
      >
        <div className="seat-main">
          <Avatar name={player.name} playerId={player.id} role={role} />
          <div className="seat-copy">
            <b>{player.name}</b>
            <small>{stackLine}</small>
          </div>
          <span
            className={`status-pill ${flash ? "just-acted" : ""}`}
            key={flash ?? "status"}
          >
            {seatStatus(game, playerIndex, money)}
          </span>
          {buyIn !== null ? (
            <button
              className="pill-button"
              type="button"
              onClick={() => onBuyIn?.(playerIndex)}
            >
              {game.customBuyIns ? "Buy in" : `Buy in · ${money(buyIn)}`}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // Quick sizes are chips to put in now, clamped to what the rules allow.
  const quickAmount = (target: number) =>
    Math.max(minimum, Math.min(player.stack, Math.round(target)));
  const quickSizes = [
    { label: "⅓ Pot", value: quickAmount(hand.pot / 3) },
    { label: "½ Pot", value: quickAmount(hand.pot / 2) },
    { label: "Pot", value: quickAmount(hand.pot) },
    { label: "All in", value: player.stack },
  ];
  const raiseLabel = !(betAmount > 0)
    ? raising
      ? "Raise"
      : "Bet"
    : allIn
      ? "All in"
      : raising
        ? `Raise ${money(committed + betAmount)}`
        : `Bet ${money(betAmount)}`;

  return (
    <div className={`glass seat-card active ${dock ? "dock" : ""}`}>
      <div className="seat-main">
        <Avatar name={player.name} playerId={player.id} role={role} />
        <div className="seat-copy">
          <b>{dock ? `${player.name} to act` : player.name}</b>
          <small>
            {dock ? `${money(player.stack)} behind · in ${money(committed)}` : stackLine}
          </small>
        </div>
        {dock ? null : <span className="turn-pill">Your turn</span>}
      </div>
      <div className="bet-panel">
        <div className="bet-summary">
          <p>
            To call <b>{money(Math.min(owed, player.stack))}</b>
            <br />
            {raiseClosed ? (
              "Call or fold only"
            ) : minimum >= player.stack ? (
              <>
                All in <b>{money(player.stack)}</b>
              </>
            ) : raising ? (
              <>
                Min raise <b>{money(committed + minimum)}</b>
              </>
            ) : (
              <>
                Min bet <b>{money(minimum)}</b>
              </>
            )}
            {raiseClosed ? null : (
              <button
                className="info-button inline"
                type="button"
                aria-label="About the raise amount"
                onClick={() => setShowRaiseHelp(true)}
              >
                i
              </button>
            )}
          </p>
          {showRaiseHelp ? (
            <RaiseHelp
              game={game}
              onClose={() => setShowRaiseHelp(false)}
            />
          ) : null}
          {raiseClosed ? null : (
            // A boxed field with a caption and pencil, so it reads as
            // something to type in rather than a figure on display.
            <label className="bet-input">
              <span className="bet-input-caption">Enter amount</span>
              <span className="bet-input-box">
                <span className="bet-input-symbol">{symbol.trim()}</span>
                <input
                  type="text"
                  inputMode={unit === "cents" ? "decimal" : "numeric"}
                  autoComplete="off"
                  placeholder={stops[0] === undefined ? "" : chipsToInput(stops[0], unit)}
                  aria-label={
                    raising ? "Chips to put in for the raise" : "Bet amount"
                  }
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <PencilIcon />
              </span>
            </label>
          )}
        </div>
        {raiseClosed ? (
          <p className="raise-closed">
            Short all-in: call or fold. It was less than a full raise, so
            betting isn&apos;t reopened for you.
          </p>
        ) : stops.length > 1 ? (
          <>
            <input
              className="bet-range"
              type="range"
              min={0}
              max={stops.length - 1}
              step={1}
              value={stopIndex}
              aria-label={raising ? "Raise size" : "Bet size"}
              aria-valuetext={
                allIn
                  ? `All in ${money(betAmount)}`
                  : raising
                    ? `Raise to ${money(committed + betAmount)}`
                    : money(betAmount)
              }
              onChange={(event) => {
                const index = Number(event.target.value);
                // The first stop is the default, so it leaves Call and Fold on.
                setAmount(index === 0 ? "" : chipsToInput(stops[index], unit));
              }}
            />
            <div className="quick-sizes">
              {quickSizes.map((size) => {
                const sizeAmount = chipsToInput(size.value, unit);
                const selected =
                  picked?.label === size.label && picked.amount === amount;
                return (
                  <button
                    key={size.label}
                    type="button"
                    className={selected ? "selected" : undefined}
                    aria-pressed={selected}
                    onClick={() => {
                      setAmount(sizeAmount);
                      setPicked({ label: size.label, amount: sizeAmount });
                    }}
                  >
                    {size.label}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
        <div className={`action-row ${raiseClosed ? "two" : ""}`}>
          <button
            className="glass-button"
            type="button"
            disabled={hasAmount}
            onClick={() => onAct(playerIndex, "fold")}
          >
            Fold
          </button>
          <button
            className="blue-button"
            type="button"
            disabled={hasAmount}
            onClick={() => onAct(playerIndex, owed > 0 ? "call" : "check")}
          >
            {owed > 0
              ? `Call ${money(Math.min(owed, player.stack))}`
              : "Check"}
          </button>
          {raiseClosed ? null : (
            <button
              className="accent-button"
              type="button"
              disabled={!(betAmount > 0)}
              onClick={() =>
                allIn
                  ? onAct(playerIndex, "all-in")
                  : onAct(playerIndex, "bet", betAmount)
              }
            >
              {raiseLabel}
            </button>
          )}
        </div>
        {/* Always takes its space, so the card keeps one height. */}
        <button
          className="text-button clear-amount"
          type="button"
          hidden={!hasAmount}
          onClick={() => setAmount("")}
        >
          Clear amount to call or fold
        </button>
        {hasAmount ? null : <span className="clear-amount-slot" />}
      </div>
    </div>
  );
}

/** "Main ₹3,000 · Side ₹8,000" once a short all-in has made side pots. */
function PotBreakdown({
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
function SidePotPicker({
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
  // A pot being split isn't decided until two or more players are in it.
  const picks = pots.map((_, index) =>
    splitting[index] && (choice[index]?.length ?? 0) < 2
      ? []
      : (choice[index] ?? []),
  );
  // Pots an earlier pot's winners are in follow from that pick.
  const resolved = resolvePotWinners(pots, picks);
  // "the main pot", "side pot 1": how a note names the pot it follows.
  const potPhrase = (index: number) =>
    index === 0 ? "the main pot" : potLabel(index, pots.length).toLowerCase();
  const ready = pots.every((pot, index) =>
    pot.eligible.length === 1 || resolved[index].from !== null
      ? true
      : splitting[index]
        ? resolved[index].winners.length >= 2
        : resolved[index].winners.length === 1,
  );

  // A changed pick changes which later pots follow it, so their picks and
  // splits start again.
  function clearAfter<T>(list: T[], potIndex: number) {
    return list.slice(0, potIndex + 1);
  }

  function pick(potIndex: number, playerIndex: number) {
    setSplitting((current) => clearAfter(current, potIndex));
    setChoice((current) => {
      const next = clearAfter([...current], potIndex);
      const chosen = next[potIndex] ?? [];
      next[potIndex] = splitting[potIndex]
        ? chosen.includes(playerIndex)
          ? chosen.filter((index) => index !== playerIndex)
          : [...chosen, playerIndex]
        : [playerIndex];
      return next;
    });
  }

  function toggleSplit(potIndex: number) {
    setSplitting((current) => {
      const next = clearAfter([...current], potIndex);
      next[potIndex] = !next[potIndex];
      return next;
    });
    setChoice((current) => {
      const next = clearAfter([...current], potIndex);
      next[potIndex] = [];
      return next;
    });
  }

  return (
    <section className="glass card winner-picker">
      <div className="card-row">
        <span className="label">{several ? "Pick the winners" : "Pick the winner"}</span>
        <span className="accent-amount">
          {money(pots.reduce((sum, pot) => sum + pot.amount, 0))}
        </span>
      </div>
      <p className="muted small-note">
        {several
          ? "Each pot goes to the best hand among the players listed under it."
          : "An all-in player can only win what each player matched."}
      </p>
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
              <div className="card-row">
                <span className="label">{potLabel(potIndex, pots.length)}</span>
                <span className="accent-amount">{money(pot.amount)}</span>
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
                    <button
                      className={`contender ${isChosen ? "selected" : ""}`}
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
                      <span className="contender-name">
                        {splitShown || (follows !== null && !isChosen)
                          ? name(playerIndex)
                          : `${name(playerIndex)} wins`}
                      </span>
                      <span
                        className={`contender-amount ${
                          isChosen || !splitShown ? "" : "muted"
                        }`}
                      >
                        {isChosen
                          ? money(share)
                          : follows !== null
                            ? ""
                            : split
                              ? "Tap to include"
                              : money(pot.amount)}
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
                    className="dashed-button"
                    type="button"
                    onClick={() => toggleSplit(potIndex)}
                  >
                    {split ? "Back to one winner" : "Split this pot"}
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
      <button
        className="blue-button full tall"
        type="button"
        disabled={!ready}
        onClick={() => onAward(picks)}
      >
        {several ? "Award pots" : "Award pot"}
      </button>
    </section>
  );
}

function SplitView({
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
      <div className="card-row">
        <span className="label">Split the pot</span>
        <span className="accent-amount">{money(payout)}</span>
      </div>
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
      <button className="dashed-button" type="button" onClick={onBack}>
        Back to one winner
      </button>
    </section>
  );
}

/** Items shown before the first press, and added by each press. */
const LIST_START = 5;
const LIST_STEP = 10;

/**
 * Shows the first items of a long list, with buttons under the last visible
 * item to add 10 more or show the rest at once; once everything is shown,
 * one button collapses the list back.
 */
function ExpandingList<T>({
  items,
  render,
  more,
  all,
  className,
}: {
  items: T[];
  render: (item: T) => ReactNode;
  more: (count: number) => string;
  all: string;
  className?: string;
}) {
  const [shown, setShown] = useState(LIST_START);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const visible = items.slice(0, shown).map(render);
  const remaining = items.length - shown;

  function collapse() {
    setShown(LIST_START);
    // Collapsing leaves the page scrolled far below the short list.
    requestAnimationFrame(() =>
      buttonRef.current?.scrollIntoView({ block: "nearest" }),
    );
  }

  return (
    <>
      {className ? <div className={className}>{visible}</div> : visible}
      {items.length > LIST_START ? (
        <div className="history-expander">
          {remaining > 0 ? (
            <>
              <button
                type="button"
                className="expander-button"
                onClick={() => setShown(shown + LIST_STEP)}
              >
                {more(Math.min(LIST_STEP, remaining))}
              </button>
              {/* With 10 or fewer left, "more" already shows them all. */}
              {remaining > LIST_STEP ? (
                <button
                  type="button"
                  className="expander-button"
                  onClick={() => setShown(items.length)}
                >
                  {all}
                  <small>{remaining} left</small>
                </button>
              ) : null}
            </>
          ) : (
            <button
              ref={buttonRef}
              type="button"
              className="expander-button open"
              onClick={collapse}
            >
              Show fewer
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}

/** A saved game's card, with its amounts in that game's chip unit. */
function SessionCard(
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
    </article>
  );
}

/** The text Share sends: the game, its chip value and who pays whom. */
function settlementText(
  session: PokerSession,
  settlement: Settlement,
  currency: string,
) {
  const lines = [
    `Settle up · ${session.name || `Game ${session.sessionNumber ?? ""}`.trim()} (${formatDate(session.date)})`,
  ];
  if (session.chipValue) {
    lines.push(describeChipValue(session.chipValue, session.chipUnit, currency));
  }
  lines.push("");
  if (settlement.transfers.length) {
    for (const transfer of settlement.transfers) {
      lines.push(
        `${transfer.from} pays ${transfer.to} ${formatCents(transfer.cents, currency)}`,
      );
    }
  } else {
    lines.push("Nobody owes anything.");
  }
  return lines.join("\n");
}

/**
 * Settle up for a saved game: everyone's result in money at the chip value,
 * and who pays whom with the fewest transfers (lib/poker/settle-up.ts). The
 * chip value can be set or changed here. No money moves through the app.
 */
function SettleUpSheet({
  session,
  onSaveChipValue,
  onCopied,
  onClose,
}: {
  session: PokerSession;
  /** Absent for a game at a friend's table: only the host sets the price. */
  onSaveChipValue?: (value: ChipValue | null) => Promise<boolean>;
  onCopied: () => void;
  onClose: () => void;
}) {
  const currency = useContext(CurrencyContext);
  const value = session.chipValue;
  const isHost = onSaveChipValue !== undefined;
  // Prices are asked for the starting stack, the buy-in people know.
  const stackPrice = value
    ? Math.round((value.cents * session.startStack) / value.chips)
    : null;
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState<number | null>(stackPrice);
  const [saving, setSaving] = useState(false);
  const settlement = useMemo(() => {
    try {
      return settleSession(session);
    } catch {
      return null;
    }
  }, [session]);
  // Settle up opens right after a save, when people want the card: have it
  // ready so its preview opens at once.
  useEffect(() => {
    if (!settlement) return;
    const timer = setTimeout(() => prefetchResultsCard(session), 1000);
    return () => clearTimeout(timer);
  }, [session, settlement]);
  const cash = (cents: number) => formatCents(cents, currency);
  const stackChips = formatChips(
    session.startStack,
    session.chipUnit,
    plainChipsCode(currency),
  );
  const priceValid =
    price !== null && price >= 1 && price <= MAX_CHIP_VALUE_CENTS;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function save(next: ChipValue | null) {
    if (!onSaveChipValue) return;
    setSaving(true);
    const saved = await onSaveChipValue(next);
    setSaving(false);
    if (saved) setEditing(false);
  }

  async function share() {
    if (!settlement) return;
    const text = settlementText(session, settlement, currency);
    if (canShare) {
      try {
        await navigator.share({ text });
      } catch {
        // The host closed the share sheet.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      onCopied();
    } catch {
      // Clipboard blocked: the list is on screen to copy by hand.
    }
  }

  return (
    <div
      className="modal show"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet settle-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settle-title"
      >
        <h2 id="settle-title">Settle Up</h2>
        <p className="muted rule-note">
          {session.name || `Game ${session.sessionNumber ?? ""}`} ·{" "}
          {formatDate(session.date)}
        </p>

        <div className={`settle-value${editing ? " editing" : ""}`}>
          {editing ? (
            <>
              <span className="label">Chip value</span>
              <label className="label" htmlFor="settle-price">
                A {stackChips}-chip buy-in costs
              </label>
              <PriceInput
                id="settle-price"
                label="What a buy-in costs"
                value={price}
                onChange={setPrice}
              />
              {priceValid ? (
                <p className="muted small-note">
                  {describePerChip(
                    { chips: session.startStack, cents: price! },
                    session.chipUnit,
                    currency,
                  )}
                </p>
              ) : null}
              <div className="button-pair">
                <button
                  className="ghost"
                  type="button"
                  disabled={saving}
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button
                  className="primary"
                  type="button"
                  disabled={!priceValid || saving}
                  onClick={() =>
                    void save({ chips: session.startStack, cents: price! })
                  }
                >
                  {saving ? "Saving…" : "Save price"}
                </button>
              </div>
              {value ? (
                <button
                  className="text-button"
                  type="button"
                  disabled={saving}
                  onClick={() => void save(null)}
                >
                  Clear the price (1 chip = {cash(100)})
                </button>
              ) : null}
            </>
          ) : (
            <>
              <div className="settle-value-head">
                <span className="label">Chip value</span>
                {isHost ? (
                  <button
                    className="pill-button settle-change"
                    type="button"
                    onClick={() => {
                      setPrice(stackPrice);
                      setEditing(true);
                    }}
                  >
                    <PencilIcon />
                    {value ? "Change" : "Set price"}
                  </button>
                ) : null}
              </div>
              {value && stackPrice !== null ? (
                <>
                  <p className="settle-equation">
                    <span>{stackChips} chips</span>
                    <span className="settle-equals" aria-label="cost">
                      =
                    </span>
                    <span className="settle-price">{cash(stackPrice)}</span>
                  </p>
                  <span className="settle-value-note">
                    {describePerChip(value, session.chipUnit, currency)}
                  </span>
                </>
              ) : (
                <>
                  <p className="settle-equation">
                    <span>1 chip</span>
                    <span className="settle-equals" aria-label="is">
                      =
                    </span>
                    <span className="settle-price">{cash(100)}</span>
                  </p>
                  <span className="settle-value-note">
                    {isHost
                      ? "No price set. Change it if chips cost something else."
                      : "The host set no price."}
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {settlement ? (
          <>
            <span className="label">Results</span>
            <div className="rows">
              {settlement.players.map((player) => (
                <div className="result-row" key={player.name}>
                  <span className="result-name">{player.name}</span>
                  <span className={`result-amount ${toneClass(player.net)}`}>
                    {formatSignedMoney(player.net / 100, currency)}
                  </span>
                </div>
              ))}
              {settlement.house ? (
                <div className="result-row">
                  <span className="result-name">{HOUSE_NAME} (rake)</span>
                  <span className="result-amount pos">
                    {formatSignedMoney(settlement.house / 100, currency)}
                  </span>
                </div>
              ) : null}
            </div>

            <span className="label">Who pays whom</span>
            {settlement.transfers.length ? (
              <div className="rows">
                {settlement.transfers.map((transfer) => (
                  <div
                    className="result-row"
                    key={`${transfer.from}>${transfer.to}`}
                  >
                    <span className="result-name">
                      {transfer.from} <span className="muted">pays</span>{" "}
                      {transfer.to}
                    </span>
                    <span className="result-amount">{cash(transfer.cents)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small-note">Nobody owes anything.</p>
            )}
            <div className="button-pair">
              <button
                className="primary"
                type="button"
                disabled={editing}
                onClick={() => void share()}
              >
                {canShare ? "Share list" : "Copy list"}
              </button>
              <ShareResultsButton
                session={session}
                className="ghost share-button"
                label="Results card"
              />
            </div>
          </>
        ) : (
          <p className="field-error">
            This game&apos;s saved chips don&apos;t add up, so it can&apos;t be
            settled.
          </p>
        )}
        <button className="ghost full" type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

const CARD_SHARE_TEXT = `Scored with ${APP_NAME} · https://pokerize.app`;
/** A loaded card is reused this long, so renames still show up the same day. */
const CARD_CACHE_MS = 30 * 60_000;
/** A card request that hasn't finished by then is dropped and tried again. */
const CARD_TIMEOUT_MS = 20_000;

/**
 * Results card pictures (drawn by the server, see app/api/sessions/[id]/card),
 * kept for this page so a preview opens at once. Keyed by the game's results:
 * a continued game saved again gets a new picture.
 */
const resultsCards = new Map<string, { file: Promise<File>; at: number }>();

function resultsCardKey(session: PokerSession) {
  return [
    session.id,
    session.ended,
    ...session.results.map((result) => `${result.playerId ?? result.name}=${result.net}`),
  ].join("|");
}

/** Starts the made-up id of a game at a friend's table (groupGameSession). */
const FRIEND_GAME_PREFIX = "friend:";

/**
 * Where a game's card is drawn, up to its time zone: the host's own games by
 * id, a friend's game by host and start time (the phone has no game IDs).
 */
function resultsCardPath(session: PokerSession) {
  if (session.id.startsWith(FRIEND_GAME_PREFIX)) {
    const [host, date] = session.id.slice(FRIEND_GAME_PREFIX.length).split(":");
    return `/api/groups/card?host=${encodeURIComponent(host)}&date=${encodeURIComponent(date)}&tz=`;
  }
  return `/api/sessions/${encodeURIComponent(session.id)}/card?tz=`;
}

/** A card the server refused (missing game, chips that don't add up). */
class CardRefused extends Error {}

async function fetchResultsCard(session: PokerSession): Promise<File> {
  let timeZone = "";
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // The server falls back to India time.
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CARD_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${resultsCardPath(session)}${encodeURIComponent(timeZone)}`,
      { cache: "no-store", signal: controller.signal },
    );
    if (response.status >= 400 && response.status < 500) {
      throw new CardRefused(`card ${response.status}`);
    }
    if (!response.ok) throw new Error(`card ${response.status}`);
    const blob = await response.blob();
    const name =
      /filename="([^"]+)"/.exec(
        response.headers.get("Content-Disposition") ?? "",
      )?.[1] ?? "results.png";
    return new File([blob], name, { type: "image/png" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The game's card, from this page's store or the server. A request that
 * fails or stalls (a phone network, a server waking up) is tried once more
 * before giving up; a refusal isn't.
 */
function loadResultsCard(session: PokerSession): Promise<File> {
  const key = resultsCardKey(session);
  const cached = resultsCards.get(key);
  if (cached && Date.now() - cached.at < CARD_CACHE_MS) return cached.file;
  const file = fetchResultsCard(session).catch(async (error) => {
    if (error instanceof CardRefused) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return fetchResultsCard(session);
  });
  resultsCards.set(key, { file, at: Date.now() });
  file.catch(() => {
    if (resultsCards.get(key)?.file === file) resultsCards.delete(key);
  });
  return file;
}

let prefetchQueue: Promise<unknown> = Promise.resolve();

/**
 * Loads a card in the background, ready for a tap, one card at a time so a
 * list of games doesn't load them all at once. Failures wait for the tap.
 */
function prefetchResultsCard(session: PokerSession) {
  prefetchQueue = prefetchQueue.then(() =>
    loadResultsCard(session).catch(() => undefined),
  );
}

function canShareFile(file: File) {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function sessionTitle(session: PokerSession) {
  return session.name || `Game ${session.sessionNumber ?? ""}`.trim();
}

/** Opens the game's results card, to look at and then share. */
function ShareResultsButton({
  session,
  className,
  label,
}: {
  session: PokerSession;
  className: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Load the card once its game is on screen, so the preview is usually
  // ready by the time Share is tapped.
  useEffect(() => {
    const button = buttonRef.current;
    if (!button || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        prefetchResultsCard(session);
      }
    });
    observer.observe(button);
    return () => observer.disconnect();
  }, [session]);

  return (
    <>
      <button
        ref={buttonRef}
        className={className}
        type="button"
        onClick={() => setOpen(true)}
      >
        <ShareIcon />
        {label}
      </button>
      {/* On the body: a game card's glass would otherwise hold the sheet. */}
      {open
        ? createPortal(
            <ResultsCardSheet session={session} onClose={() => setOpen(false)} />,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * A game's results card, shown before sharing. Share is only offered once
 * the picture has loaded: iOS Safari refuses to share once a tap has waited
 * on the network.
 */
function ResultsCardSheet({
  session,
  onClose,
}: {
  session: PokerSession;
  onClose: () => void;
}) {
  const [card, setCard] = useState<{ file: File; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const title = sessionTitle(session);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    loadResultsCard(session)
      .then((file) => {
        if (cancelled) return;
        url = URL.createObjectURL(file);
        setCard({ file, url });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [session, attempt]);

  const shareable = card !== null && canShareFile(card.file);

  async function share() {
    if (!card) return;
    if (!shareable) {
      saveFile(card.file);
      return;
    }
    try {
      await navigator.share({
        files: [card.file],
        title,
        text: CARD_SHARE_TEXT,
      });
    } catch {
      // The host closed the share menu.
    }
  }

  return (
    <div
      className="modal show"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet results-card-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="results-card-title"
      >
        <h2 id="results-card-title">Results Card</h2>
        <div className="results-card-frame">
          {card ? (
            // A plain <img>: it's a local blob, so next/image adds nothing.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.url} alt={`Results card for ${title}`} />
          ) : failed ? (
            <p className="field-error">Couldn&apos;t make the card.</p>
          ) : (
            <p className="muted">Making the card…</p>
          )}
        </div>
        {failed ? (
          <button
            className="primary full"
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt((count) => count + 1);
            }}
          >
            Try again
          </button>
        ) : (
          <button
            className="primary full"
            type="button"
            disabled={!card}
            onClick={() => void share()}
          >
            {card && !shareable ? "Save image" : "Share image"}
          </button>
        )}
        <button className="ghost full" type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

const INELIGIBLE_REASON_TEXT: Record<IneligibleReason, string> = {
  "no-investment": "no chips were bought in",
  "unverified-accounting": "the saved chip totals do not add up",
};

const STANDINGS_START = 4;

/** What a standings row shows; shared by your own and a group's standings. */
type StandingCardEntry = {
  rank: number | null;
  name: string;
  playerId?: string;
  /** Sent with a friend's group, whose players aren't in your list. */
  avatar?: string;
  averageReturn: number | null;
  eligibleSessions: number;
  totalSessions: number;
  invested?: number;
  net?: number;
  hands: number;
  profitableSessions: number;
  isMe?: boolean;
};

function StandingCard({
  id,
  entry,
  open,
  onToggle,
  excluded,
  tag,
  action,
  markNew,
}: {
  id?: string;
  entry: StandingCardEntry;
  open: boolean;
  onToggle: () => void;
  excluded?: React.ReactNode;
  /**
   * What the player is to you, under their name, as on Profile: Friend or
   * Guest on your own standings; Friend on a friend's (user requests
   * 2026-10-26).
   */
  tag?: string | null;
  /** Under the details: Add Friend, or Invite to Pokerize for your guests. */
  action?: React.ReactNode;
  /** Label new players; off while everyone is shown for lack of regulars. */
  markNew: boolean;
}) {
  const { money, signedMoney } = useMoney();
  const profitableRate = Math.round(
    (entry.profitableSessions / entry.totalSessions) * 100,
  );
  const stats: Array<[string, string, number | null]> = [
    [
      "Sessions",
      entry.eligibleSessions === entry.totalSessions
        ? String(entry.totalSessions)
        : `${entry.totalSessions} (${entry.eligibleSessions} ranked)`,
      null,
    ],
    ["Profitable", `${entry.profitableSessions} (${profitableRate}%)`, null],
    ["Hands", entry.hands.toLocaleString("en-IN"), null],
  ];
  if (entry.invested !== undefined) {
    stats.push(["Invested", money(entry.invested), null]);
  }
  // What they ended with: chips put in plus the result, in hundredths so
  // amounts with cents add exactly.
  if (entry.invested !== undefined && entry.net !== undefined) {
    stats.push([
      "Total",
      money(Math.round((entry.invested + entry.net) * 100) / 100),
      null,
    ]);
  }
  if (entry.net !== undefined) {
    stats.push(["Net", signedMoney(entry.net), entry.net]);
  }
  const status =
    entry.averageReturn === null
      ? "Unranked · no verified buy-ins"
      : markNew && isNewPlayer(entry)
        ? "Newcomer"
        : null;
  const head = (
    <>
      <span
        className={`medal ${
          entry.rank === 1
            ? "gold"
            : entry.rank === 2
              ? "silver"
              : entry.rank === 3
                ? "bronze"
                : ""
        }`}
      >
        {entry.rank ?? "–"}
      </span>
      <Avatar
        name={entry.name}
        playerId={entry.playerId}
        avatar={entry.avatar}
        size="small"
      />
      <span className="standing-name">
        <b>
          {entry.name}
          {entry.isMe ? <span className="you-tag">You</span> : null}
        </b>
        {tag || status ? (
          <small>
            {tag}
            {tag && status ? " · " : null}
            {status}
          </small>
        ) : null}
      </span>
      <span className={`standing-return ${toneClass(entry.averageReturn)}`}>
        {entry.averageReturn === null ? "—" : formatPercent(entry.averageReturn)}
      </span>
      <span className="chevron" aria-hidden="true">
        {open ? "▲" : "▼"}
      </span>
    </>
  );
  return (
    <section id={id} className="glass standing-card">
      <button
        className="standing-toggle"
        type="button"
        aria-expanded={open}
        onClick={onToggle}
      >
        {head}
      </button>
      {open ? (
        <div className="standing-details">
          <dl>
            {stats.map(([label, value, tone]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={toneClass(tone)}>{value}</dd>
              </div>
            ))}
          </dl>
          {excluded}
          {action}
        </div>
      ) : null}
    </section>
  );
}

/**
 * The Ranks screen: your own standings, plus the standings of every group
 * whose host has you as a linked friend.
 */
function RanksView({
  groups,
  groupsError,
  onToast,
  onRequestSent,
  ...props
}: Parameters<typeof StandingsView>[0] & {
  /** Friends' groups, kept by the app so the picker shows at once. */
  groups: GroupStandings[];
  groupsError: string;
  onToast: (message: string) => void;
  /** After a friend request from a group's standings: reload friends. */
  onRequestSent: () => void;
}) {
  const [selected, setSelected] = useState("mine");
  const group = groups.find((item) => item.hostAccountId === selected);

  return (
    <div className="stack-list">
      <HostPicker
        label="Whose standings"
        groups={groups}
        selected={selected}
        onSelect={setSelected}
      />
      {groupsError ? <p className="muted small-note">{groupsError}</p> : null}
      {group ? (
        <GroupStandingsView
          group={group}
          onToast={onToast}
          onRequestSent={onRequestSent}
        />
      ) : (
        <StandingsView {...props} onToast={onToast} />
      )}
    </div>
  );
}

/**
 * My Hosted Games or a friend's hosted games, at the top of Ranks and Games.
 * Shown only when a friend's group has a game you played in.
 */
function HostPicker({
  label,
  groups,
  selected,
  onSelect,
}: {
  label: string;
  groups: GroupStandings[];
  /** "mine", or a host's account id. */
  selected: string;
  onSelect: (id: string) => void;
}) {
  if (!groups.length) return null;
  // No game counts: a friend's group shows only games they played in, and a
  // count next to the host's name would read as the host's total.
  const options = [
    { id: "mine", label: "My Hosted Games" },
    ...groups.map((item) => ({
      id: item.hostAccountId,
      label: hostedGamesTitle(item.hostName),
    })),
  ];
  // One picker for any number of hosts: the phone's own list scales where
  // side-by-side buttons run out of room.
  return (
    <div className="standings-picker">
      <select
        className="select-control"
        aria-label={label}
        value={selected}
        onChange={(event) => onSelect(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The heading between the graph and the ranked list, shared by My Hosted
 * Games and every friend's group. Its "i" says whose ranking this is, then
 * how players are ranked.
 */
function StandingsHeading({
  intro,
  hidden,
}: {
  intro: string;
  /** For a friend's group: what is kept from you to protect other players. */
  hidden?: readonly string[];
}) {
  const [showRankingHelp, setShowRankingHelp] = useState(false);
  return (
    <>
      <div className="section-heading">
        <div className="heading-with-info">
          <h2>Player Standings</h2>
          <button
            className="info-button"
            type="button"
            aria-label="About these standings"
            onClick={() => setShowRankingHelp(true)}
          >
            i
          </button>
        </div>
      </div>
      {showRankingHelp ? (
        <RankingHelp
          intro={intro}
          hidden={hidden}
          onClose={() => setShowRankingHelp(false)}
        />
      ) : null}
    </>
  );
}

/**
 * The Newcomers switch with its "i", on a row of its own under the
 * standings heading: by the list it filters, not above the graph (user
 * decision 2026-10-26).
 */
function NewPlayersBar({
  showNew,
  onShowNewChange,
  applies,
}: {
  showNew: boolean;
  onShowNewChange: (show: boolean) => void;
  /** False while there are too few regulars: everyone shows, switch greyed. */
  applies: boolean;
}) {
  const [showHelp, setShowHelp] = useState(false);
  return (
    <>
      <div className="new-players-bar">
        <div className="heading-with-info">
          <label className="switch-row">
            <span>Newcomers</span>
            <button
              className="switch"
              type="button"
              role="switch"
              aria-checked={showNew || !applies}
              aria-label="Show newcomers"
              disabled={!applies}
              onClick={() => onShowNewChange(!showNew)}
            />
          </label>
          <button
            className="info-button"
            type="button"
            aria-label="About newcomers"
            onClick={() => setShowHelp(true)}
          >
            i
          </button>
        </div>
      </div>
      {showHelp ? (
        <InfoSheet label="About newcomers" onClose={() => setShowHelp(false)}>
          <ul className="info-sheet-list">
            <li>
              Players with {NEW_PLAYER_MAX_SESSIONS + 1} or more sessions are{" "}
              <b>regulars</b> and are shown in the rankings.
            </li>
            <li>
              Players with fewer than {NEW_PLAYER_MAX_SESSIONS + 1} sessions are{" "}
              <b>newcomers</b> and are hidden, so a few lucky games can&apos;t
              put them on top.
            </li>
          </ul>
          <p>Turn this on to include newcomers in the rankings.</p>
        </InfoSheet>
      ) : null}
    </>
  );
}

/** "Asha's Hosted Games": the name of another host's group on Ranks. */
function hostedGamesTitle(hostName: string | null) {
  return `${hostName ?? "Friend"}'s Hosted Games`;
}

function GroupStandingsView({
  group,
  onToast,
  onRequestSent,
}: {
  group: GroupStandings;
  onToast: (message: string) => void;
  onRequestSent: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [showNew, setShowNew] = useState(false);
  // The graph's lines follow the rows, so the same players drop out of both.
  const allLines = useMemo(() => chartLinesFromGroup(group), [group]);
  const shown = useMemo(() => filterNewPlayers(group.rows, showNew), [group, showNew]);
  const rows = shown.rows;
  const lines = useMemo(
    () => shown.kept.map((index) => allLines[index]),
    [shown, allLines],
  );
  const visible = showAll ? rows : rows.slice(0, STANDINGS_START);
  const hostName = group.hostName ?? "Your friend";
  const newPlayersBar = group.rows.length ? (
    <NewPlayersBar
      showNew={showNew}
      onShowNewChange={setShowNew}
      applies={shown.applies}
    />
  ) : null;

  function toggle(index: number) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  // Amounts show in the currency this host counts their games in.
  return (
    <CurrencyContext.Provider value={group.currency}>
    <div className="stack-list">
      {lines.length ? (
        <LeaderboardChart sessionCount={group.games} lines={lines} />
      ) : null}
      {group.rows.length ? (
        <StandingsHeading
          intro={`Your ranking among the players you've sat with in games hosted by ${hostName}.`}
          hidden={GROUP_HIDDEN_INFO}
        />
      ) : null}
      {newPlayersBar}
      {rows.length ? (
        visible.map((row, index) => (
          <StandingCard
            key={`${row.name}-${index}`}
            entry={row}
            open={expanded.has(index)}
            onToggle={() => toggle(index)}
            markNew={shown.applies}
            tag={row.account?.relation === "friends" ? "Friend" : null}
            action={
              row.account && row.account.relation !== "friends" ? (
                <StandingFriendRequest
                  key={`${row.account.id}-${row.account.relation}`}
                  name={row.name}
                  account={row.account}
                  onToast={onToast}
                  onRequestSent={onRequestSent}
                />
              ) : null
            }
          />
        ))
      ) : (
        <section className="glass card">
          <p className="muted">{hostName} hasn&apos;t saved any games yet.</p>
        </section>
      )}
      {rows.length > STANDINGS_START ? (
        <button
          className="glass-button full accent-text"
          type="button"
          onClick={() => setShowAll((shown) => !shown)}
        >
          {showAll ? "Show fewer" : `Show all ${rows.length} players`}
        </button>
      ) : null}
      {shown.pinnedSelf ? (
        <StandingCard
          entry={shown.pinnedSelf}
          open={expanded.has(-1)}
          onToggle={() => toggle(-1)}
          markNew
        />
      ) : null}
    </div>
    </CurrencyContext.Provider>
  );
}

function StandingsView({
  history,
  players,
  selfPlayerId,
  hostName,
  focusKey,
  loading,
  error,
  onRetry,
  onToast,
}: {
  history: PokerSession[];
  /** Current names: a renamed guest or a friend's chosen name wins over saved ones. */
  players: PlayerProfile[];
  selfPlayerId: string | null;
  /** Your name, for Invite to Pokerize's message. */
  hostName: string;
  /** A player's card to open and scroll to, from "View standings". */
  focusKey: string | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onToast: (message: string) => void;
}) {
  // Your current guests, who can be invited to Pokerize (migration 0030).
  const invitable = useMemo(
    () =>
      new Map(
        players
          .filter(
            (player) =>
              !player.discardedAt && !player.linked && player.id !== selfPlayerId,
          )
          .map((player) => [player.id, player]),
      ),
    [players, selfPlayerId],
  );
  const [inviting, setInviting] = useState<PlayerProfile | null>(null);
  const standings = useMemo(() => {
    const built = buildStandings(history);
    const byId = new Map(players.map((player) => [player.id, player]));
    const selfKey = selfPlayerId ? `id:${selfPlayerId}` : null;
    return {
      ...built,
      entries: built.entries.map((entry) => {
        const player = entry.playerId ? byId.get(entry.playerId) : undefined;
        return {
          ...entry,
          name: player?.name || entry.name,
          isMe: entry.key === selfKey,
          // A friend's account, as on Profile; anyone else is a guest.
          linked: Boolean(player?.linked),
        };
      }),
    };
  }, [history, players, selfPlayerId]);
  // "View standings" on a new player turns new players on, or the card
  // it opens would be hidden.
  const [showNew, setShowNew] = useState(() =>
    standings.entries.some((entry) => entry.key === focusKey && isNewPlayer(entry)),
  );
  const shown = useMemo(
    () => filterNewPlayers(standings.entries, showNew),
    [standings, showNew],
  );
  const leaderboard = shown.rows;
  const lines = useMemo(() => {
    const allLines = chartLinesFromStandings(standings);
    return shown.kept.map((index) => allLines[index]);
  }, [standings, shown]);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(focusKey ? [focusKey] : []),
  );
  // A focused player past the first few opens the full list.
  const [showAll, setShowAll] = useState(
    () =>
      Boolean(focusKey) &&
      leaderboard.findIndex((entry) => entry.key === focusKey) >= STANDINGS_START,
  );
  useEffect(() => {
    if (!focusKey || loading) return;
    document
      .getElementById(`standing-${focusKey}`)
      ?.scrollIntoView({ block: "center" });
  }, [focusKey, loading, showAll]);
  const sessionTitles = useMemo(
    () =>
      new Map(
        history.map((session) => [
          session.id,
          session.name || `Game ${session.sessionNumber || ""}`,
        ]),
      ),
    [history],
  );
  const visible = showAll ? leaderboard : leaderboard.slice(0, STANDINGS_START);
  const newPlayersBar = (
    <NewPlayersBar
      showNew={showNew}
      onShowNewChange={setShowNew}
      applies={shown.applies}
    />
  );

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function standingCard(entry: (typeof leaderboard)[number]) {
    return (
      <StandingCard
        key={entry.key}
        id={`standing-${entry.key}`}
        entry={entry}
        open={expanded.has(entry.key)}
        onToggle={() => toggle(entry.key)}
        markNew={shown.applies}
        tag={entry.isMe ? null : entry.linked ? "Friend" : "Guest"}
        action={
          entry.playerId && invitable.has(entry.playerId) ? (
            <div className="standing-action">
              <button
                className="glass-button full"
                type="button"
                onClick={() => setInviting(invitable.get(entry.playerId!) ?? null)}
              >
                Invite to Pokerize
              </button>
            </div>
          ) : null
        }
        excluded={
          entry.ineligible.length ? (
            <ul className="leaderboard-excluded">
              {entry.ineligible.map(({ sessionId, reason }) => (
                <li key={sessionId}>
                  Not ranked: {sessionTitles.get(sessionId) ?? sessionId}{" "}
                  — {INELIGIBLE_REASON_TEXT[reason]}
                </li>
              ))}
            </ul>
          ) : null
        }
      />
    );
  }

  if (error) {
    return (
      <section className="glass card">
        <p className="muted">{error}</p>
        <button className="glass-button full" type="button" onClick={onRetry}>
          Try again
        </button>
      </section>
    );
  }
  if (loading) {
    return (
      <section className="glass card">
        <p className="muted">Loading the shared ledger…</p>
      </section>
    );
  }
  if (!standings.entries.length) {
    return (
      <section className="glass card">
        <p className="muted">
          No saved sessions yet. Finish a game with “Finish And Save Session”
          and it will show up here.
        </p>
      </section>
    );
  }

  return (
    <div className="stack-list">
      {lines.length ? (
        <LeaderboardChart sessionCount={standings.timeline.length} lines={lines} />
      ) : null}

      <StandingsHeading intro="This is the overall ranking of everyone who has played in sessions you hosted." />
      {newPlayersBar}
      {visible.map(standingCard)}
      {leaderboard.length > STANDINGS_START ? (
        <button
          className="glass-button full accent-text"
          type="button"
          onClick={() => setShowAll((shown) => !shown)}
        >
          {showAll ? "Show fewer" : `Show all ${leaderboard.length} players`}
        </button>
      ) : null}
      {shown.pinnedSelf ? standingCard(shown.pinnedSelf) : null}
      {inviting ? (
        <InviteSheet
          guest={inviting}
          hostName={hostName}
          onToast={onToast}
          onClose={() => setInviting(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * A friend request to a player in a friend's standings who has an account
 * and isn't your friend yet: you sat at the same table, so you likely know
 * them (user request 2026-10-26). Friends are marked Friend under their
 * name instead, and a request you sent is listed in the Profile bell.
 */
function StandingFriendRequest({
  name,
  account,
  onToast,
  onRequestSent,
}: {
  name: string;
  account: NonNullable<GroupStandingRow["account"]>;
  onToast: (message: string) => void;
  onRequestSent: () => void;
}) {
  const [relation, setRelation] = useState(account.relation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await friendsApi({ action: "send-coplayer", accountId: account.id });
      setRelation("request-sent");
      onToast("Request Sent");
      onRequestSent();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The request was not sent");
    } finally {
      setBusy(false);
    }
  }

  // A request you sent shows in the Profile bell, not on the card.
  if (relation === "friends" || relation === "request-sent") return null;
  if (relation === "request-received") {
    return (
      <p className="standing-action muted">
        <span className="literal-text">{name}</span> sent you a friend request.
        Answer it on Profile.
      </p>
    );
  }
  return (
    <div className="standing-action">
      <button
        className="glass-button full"
        type="button"
        disabled={busy}
        onClick={() => void send()}
      >
        {busy ? "Sending…" : "Add Friend"}
      </button>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * What a friend's group leaves out, matching what the server sends
 * (lib/friends/group-standings.ts; user decisions 2026-10-05). Since
 * 2026-10-26 the games you played in are on Games with everyone's results,
 * so only other players' totals stay out of the standings.
 */
const GROUP_HIDDEN_INFO = [
  "Games you didn't play in",
  "Players you've never sat with",
  "How many games and players the host has in total",
] as const;

function RankingHelp({
  intro,
  hidden,
  onClose,
}: {
  intro: string;
  hidden?: readonly string[];
  onClose: () => void;
}) {
  return (
    <InfoSheet label="About these standings" onClose={onClose}>
      <p>{intro}</p>
      <p>
        Players are ranked by their <b>average session return</b>: how much
        they won or lost in each game as a percentage of the chips they put
        in, averaged over their games.
      </p>
      {hidden?.length ? (
        <>
          <p>
            <b>Hidden to protect other players&apos; privacy:</b>
          </p>
          <ul className="info-sheet-list">
            {hidden.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
    </InfoSheet>
  );
}

/**
 * Explains the betting panel's minimum with this hand's numbers: the
 * standard rule that a raise adds at least the last bet or raise.
 */
function RaiseHelp({
  game,
  onClose,
}: {
  game: GameState;
  onClose: () => void;
}) {
  const { money } = useMoney();
  const hand = game.hand!;
  const step = raiseSize(game);

  return (
    <InfoSheet label="About the raise amount" onClose={onClose}>
      {hand.roundHigh > 0 ? (
        <p>
          Standard poker rule: a raise must go up by at least the last bet or
          raise. <b>Min raise = current bet + last raise</b>, so here{" "}
          {money(hand.roundHigh)} + {money(step)} ={" "}
          <b>{money(hand.roundHigh + step)}</b>.
        </p>
      ) : (
        <p>
          Standard poker rule: with no bet yet this round, the smallest bet is
          the big blind, <b>{money(step)}</b>.
        </p>
      )}
    </InfoSheet>
  );
}

/**
 * The sheet an "i" button opens: closes with Got it, a tap outside it or the
 * Escape key. It renders into the page body because the glass cards that hold
 * the "i" buttons blur their backdrop, which would otherwise pin the sheet
 * inside the card instead of the bottom of the screen.
 */
function InfoSheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet info-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
        <button className="primary" type="button" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The Games screen: your own saved games, or the games you played in at a
 * friend's table (picked like Ranks).
 */
function SessionsView({
  groups,
  groupsError,
  onCopied,
  ...props
}: Parameters<typeof OwnSessionsView>[0] & {
  /** Settle up's Copy list on a friend's game. */
  onCopied: () => void;
  /** Friends' groups, kept by the app so the picker shows at once. */
  groups: GroupStandings[];
  groupsError: string;
}) {
  const [selected, setSelected] = useState("mine");
  const group = groups.find((item) => item.hostAccountId === selected);

  return (
    <div className="stack-list">
      <HostPicker
        label="Whose games"
        groups={groups}
        selected={selected}
        onSelect={setSelected}
      />
      {groupsError ? <p className="muted small-note">{groupsError}</p> : null}
      {group ? (
        <GroupGamesView group={group} onCopied={onCopied} />
      ) : (
        <OwnSessionsView {...props} />
      )}
    </div>
  );
}

/**
 * The games you played in at one friend's table, newest first, on the same
 * cards as your own games: Share, Details and Settle up, but no Continue game
 * or price changes, which stay with the host (user decisions 2026-10-26).
 */
function GroupGamesView({
  group,
  onCopied,
}: {
  group: GroupStandings;
  onCopied: () => void;
}) {
  const [settlingId, setSettlingId] = useState<string | null>(null);
  // Older answers from the server may not have the games yet.
  const games = useMemo(
    () => (group.sharedGames ?? []).map((game) => groupGameSession(group, game)),
    [group],
  );
  const settling = games.find((item) => item.session.id === settlingId)?.session;

  return (
    <CurrencyContext.Provider value={group.currency}>
      {games.length ? (
        <ExpandingList
          items={games}
          render={({ session, youIndex }) => (
            <SessionCard
              key={session.id}
              session={session}
              youIndex={youIndex}
              onSettle={setSettlingId}
            />
          )}
          more={(count) => `Show ${count} more game${count === 1 ? "" : "s"}`}
          all="Show all games"
        />
      ) : (
        <section className="glass card">
          <p className="muted">No games with this host yet.</p>
        </section>
      )}
      {settling
        ? createPortal(
            <SettleUpSheet
              key={settling.id}
              session={settling}
              onCopied={onCopied}
              onClose={() => setSettlingId(null)}
            />,
            document.body,
          )
        : null}
    </CurrencyContext.Provider>
  );
}

/**
 * A friend's game as a saved game, for the shared card and Settle up. Its id
 * is made up here (the server sends none; see resultsCardPath) and its name
 * is "Asha's game": a number would reveal how many games the host has.
 */
function groupGameSession(group: GroupStandings, game: GroupGame) {
  const session: PokerSession = {
    id: `${FRIEND_GAME_PREFIX}${group.hostAccountId}:${game.date}`,
    name: hostedGameName(group.hostName),
    date: game.date,
    ended: game.ended ?? game.date,
    ...(game.kind ? { kind: game.kind } : {}),
    ...(game.chipUnit ? { chipUnit: game.chipUnit } : {}),
    ante: game.ante ?? 0,
    ...(game.blindHistory ? { blindHistory: game.blindHistory } : {}),
    startStack: game.startStack,
    hands: game.hands,
    ...(game.rebuyRules ? { rebuyRules: game.rebuyRules } : {}),
    ...(game.bigBlindAnte ? { bigBlindAnte: true } : {}),
    ...(game.rakeRules ? { rakeRules: game.rakeRules } : {}),
    ...(game.rake ? { rake: game.rake } : {}),
    ...(game.chipValue ? { chipValue: game.chipValue } : {}),
    // Everything the card shows; the avatar and You tag are handled apart.
    results: game.results.map((result) => ({
      name: result.name,
      net: result.net,
      end: result.end,
      ...(result.buyIns ? { buyIns: result.buyIns } : {}),
      ...(result.handsPlayed !== undefined ? { handsPlayed: result.handsPlayed } : {}),
      ...(result.joinedHand !== undefined ? { joinedHand: result.joinedHand } : {}),
      ...(result.joinedAt !== undefined ? { joinedAt: result.joinedAt } : {}),
      ...(result.leftHand !== undefined ? { leftHand: result.leftHand } : {}),
      ...(result.leftAt !== undefined ? { leftAt: result.leftAt } : {}),
    })),
  };
  const you = game.results.findIndex((result) => result.isMe);
  return { session, youIndex: you >= 0 ? you : undefined };
}

function OwnSessionsView({
  history,
  discardedSessions,
  loading,
  error,
  onRetry,
  onDiscard,
  onContinue,
  onSettle,
  onRestore,
  onDeletePermanently,
  onExport,
  onImport,
}: {
  history: PokerSession[];
  discardedSessions: PokerSession[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onDiscard: (id: string) => void;
  onContinue: (id: string) => void;
  onSettle: (id: string) => void;
  onRestore: (id: string) => void;
  onDeletePermanently: (id: string) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const latestSessions = useMemo(
    () => [...history].sort((a, b) => b.date - a.date),
    [history],
  );
  const importInput = useRef<HTMLInputElement>(null);

  return (
    <div className="stack-list">
      {error ? (
        <section className="glass card">
          <p className="muted">{error}</p>
          <button className="glass-button full" type="button" onClick={onRetry}>
            Try again
          </button>
        </section>
      ) : loading ? (
        <section className="glass card">
          <p className="muted">Loading the shared ledger…</p>
        </section>
      ) : history.length ? (
        <ExpandingList
          items={latestSessions}
          render={(session) => (
            <SessionCard
              key={session.id}
              session={session}
              onDiscard={onDiscard}
              onContinue={onContinue}
              onSettle={onSettle}
            />
          )}
          more={(count) => `Show ${count} more game${count === 1 ? "" : "s"}`}
          all="Show all games"
        />
      ) : (
        <section className="glass card">
          <p className="muted">
            No saved games yet. Finished games appear here, newest first.
          </p>
        </section>
      )}

      {!error && discardedSessions.length ? (
        <>
          <div className="section-heading">
            <h2>Discarded</h2>
            <span className="card-note">
              Not counted in the standings · {discardedSessions.length}
            </span>
          </div>
          {discardedSessions.map((session) => (
            <SessionCard
              discarded
              key={session.id}
              session={session}
              onRestore={onRestore}
              onDeletePermanently={onDeletePermanently}
            />
          ))}
        </>
      ) : null}

      <section className="glass card">
        <div className="button-pair">
          <button className="glass-button raised" type="button" onClick={onExport}>
            Export backup
          </button>
          <button
            className="glass-button raised"
            type="button"
            onClick={() => importInput.current?.click()}
          >
            Import
          </button>
        </div>
        <input
          ref={importInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={onImport}
        />
        <p className="muted small-note">
          History is shared from Neon across every device. Export gives you an
          extra offline backup; importing never overwrites and only adds
          sessions that are not already in the ledger.
        </p>
      </section>
    </div>
  );
}

type ChartPoint = {
  index: number;
  /** Running average return after this game, in percent. */
  value: number;
  /** Null when the player missed this game and the average carried forward. */
  sessionReturn: number | null;
  sampleCount: number;
  /** Money won or lost so far, in currency units. */
  net: number;
};

type ChartLine = {
  key: string;
  name: string;
  averageReturn: number | null;
  /** Money won or lost over every ranked game. */
  net: number;
  points: ChartPoint[];
};

/** What the standings graph plots (user request 2026-10-26). */
type ChartMetric = "return" | "net";

function chartLinesFromStandings(standings: Standings): ChartLine[] {
  return standings.entries.map((entry) => {
    const line = standings.series.get(entry.key);
    return {
      key: entry.key,
      name: entry.name,
      averageReturn: entry.averageReturn,
      net: entry.net,
      points: (line?.returns ?? []).flatMap((point) =>
        point
          ? [
              {
                index: point.sessionIndex,
                value: point.runningAverage,
                sessionReturn: point.sessionReturn,
                sampleCount: point.sampleCount,
                net: line?.cumulativeNet[point.sessionIndex] ?? 0,
              },
            ]
          : [],
      ),
    };
  });
}

/** Rebuilds each friend-visible line, carrying the last point across missed games. */
function chartLinesFromGroup(group: GroupStandings): ChartLine[] {
  return group.rows.map((row, rowIndex) => {
    const played = group.chart?.[rowIndex] ?? [];
    const points: ChartPoint[] = [];
    played.forEach(([index, value, sessionReturn, net = 0], playedIndex) => {
      const sampleCount = playedIndex + 1;
      const nextPlayed = played[playedIndex + 1]?.[0] ?? group.games + 1;
      points.push({ index, value, sessionReturn, sampleCount, net });
      for (let missed = index + 1; missed < nextPlayed; missed += 1) {
        points.push({ index: missed, value, sessionReturn: null, sampleCount, net });
      }
    });
    return {
      key: `row-${rowIndex}`,
      name: row.name,
      averageReturn: row.averageReturn,
      net: row.net,
      points,
    };
  });
}

/** An axis amount, short enough for the graph's edge: "+₹50K", "−₹1.5M". */
function compactSignedMoney(value: number, symbol: string) {
  if (value === 0) return `${symbol}0`;
  const amount = Math.abs(value);
  const short =
    amount >= 1_000_000
      ? `${Number((amount / 1_000_000).toFixed(2))}M`
      : amount >= 1_000
        ? `${Number((amount / 1_000).toFixed(2))}K`
        : String(Number(amount.toFixed(2)));
  return `${value > 0 ? "+" : "−"}${symbol}${short}`;
}

function LeaderboardChart({
  sessionCount,
  lines,
}: {
  sessionCount: number;
  lines: ChartLine[];
}) {
  const { symbol, signedMoney } = useMoney();
  const clipId = useId();
  const [metric, setMetric] = useState<ChartMetric>("return");
  const [highlight, setHighlight] = useState<string | null>(null);
  const chartWidth = 320;
  const chartHeight = 240;
  const plot = { top: 10, right: 8, bottom: 36, left: 48 };
  const plotWidth = chartWidth - plot.left - plot.right;
  const plotHeight = chartHeight - plot.top - plot.bottom;
  const isNet = metric === "net";
  const series = lines.map((entry) => {
    const points = entry.points.map((point, pointIndex) => {
      const gameNet = point.net - (entry.points[pointIndex - 1]?.net ?? 0);
      return {
        index: point.index,
        value: isNet ? point.net : point.value,
        marked: point.sessionReturn !== null,
        label: isNet
          ? `${entry.name}, game ${point.index}: ${
              point.sessionReturn === null ? "did not play" : `${signedMoney(gameNet)} this game`
            } · ${signedMoney(point.net)} so far`
          : `${entry.name}, game ${point.index}: ${
              point.sessionReturn === null
                ? "did not play"
                : `game return ${formatPercent(point.sessionReturn)}`
            } · average ${formatPercent(point.value)} over ${
              point.sampleCount
            } game${point.sampleCount === 1 ? "" : "s"}`,
      };
    });
    // Money starts from nothing the game before a player's first.
    const first = entry.points[0];
    if (isNet && first) {
      points.unshift({
        index: first.index - 1,
        value: 0,
        marked: false,
        label: `${entry.name}: before their first game`,
      });
    }
    return {
      color: playerColor(entry.name),
      entry,
      points,
    };
  });
  // The legend follows the metric: rank order for returns, most won first for money.
  const legend = isNet
    ? [...series].sort((a, b) => b.entry.net - a.entry.net)
    : series;

  // Returns fit where the lines settle, so a player's first wild games can
  // run off the edge; money fits every point.
  const axis = isNet
    ? chartAxis(
        series.flatMap((player) => player.points.map((point) => point.value)),
        { minSpan: 10 },
      )
    : chartAxis(
        settledValues(lines.map((entry) => entry.points)),
        { minSpan: 10 },
      );
  const xFor = (index: number) =>
    plot.left + (index / Math.max(1, sessionCount)) * plotWidth;
  const yFor = (value: number) =>
    plot.top + ((axis.max - value) / (axis.max - axis.min || 1)) * plotHeight;
  const xLabelEvery = Math.max(1, Math.ceil(sessionCount / 5));
  const tickLabel = (value: number) => {
    if (isNet) return compactSignedMoney(value, symbol);
    if (value === 0) return "0%";
    return `${value > 0 ? "+" : "−"}${Math.abs(value)}%`;
  };
  const title = isNet ? "Net Profit or Loss" : "Average Return";
  const description = isNet
    ? "Each colored line shows the money one player has won or lost so far, after every ranked game. Games they missed keep the line flat."
    : "Each colored line shows one player's running average return after every game, starting at their first ranked game. Games they missed carry the previous average forward. A player's first games can run past the top or bottom edge.";
  // Draw the highlighted line last so it sits on top.
  const drawOrder = [...series].sort(
    (a, b) =>
      Number(a.entry.key === highlight) - Number(b.entry.key === highlight),
  );

  return (
    <>
      <div className="section-heading chart-heading">
        <h2>{title}</h2>
        <div className="segmented chart-metric" role="group" aria-label="Graph shows">
          {(
            [
              ["return", "Return %"],
              ["net", "Net"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={metric === value ? "selected" : ""}
              aria-pressed={metric === value}
              onClick={() => setMetric(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <figure className="glass card leaderboard-chart" aria-label={title}>
        <svg
          className="chart-plot"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
          aria-labelledby="standings-chart-title standings-chart-description"
        >
          <title id="standings-chart-title">{title}</title>
          <desc id="standings-chart-description">{description}</desc>
          <defs>
            <clipPath id={clipId}>
              <rect
                x={plot.left - 4}
                y={plot.top - 4}
                width={plotWidth + 8}
                height={plotHeight + 8}
              />
            </clipPath>
          </defs>

          {axis.ticks.map((tick) => (
            <g key={tick}>
              <line
                className={tick === 0 ? "chart-zero" : "chart-grid"}
                x1={plot.left}
                x2={chartWidth - plot.right}
                y1={yFor(tick)}
                y2={yFor(tick)}
              />
              <text
                className="chart-label"
                x={plot.left - 6}
                y={yFor(tick) + 3}
                textAnchor="end"
              >
                {tickLabel(tick)}
              </text>
            </g>
          ))}

          {Array.from({ length: sessionCount + 1 }, (_, index) =>
            index === 0 ||
            index === sessionCount ||
            (index % xLabelEvery === 0 && sessionCount - index >= xLabelEvery / 2) ? (
              <text
                className="chart-label"
                key={index}
                x={xFor(index)}
                y={plot.top + plotHeight + 14}
                textAnchor={index === 0 ? "start" : index === sessionCount ? "end" : "middle"}
              >
                {index === 0 ? "Start" : index}
              </text>
            ) : null,
          )}
          <text
            className="chart-axis-title"
            x={plot.left + plotWidth / 2}
            y={chartHeight - 2}
            textAnchor="middle"
          >
            Game
          </text>

          <g clipPath={`url(#${clipId})`}>
            {drawOrder.map((player) => {
              const last = player.points.at(-1);
              const dimmed = highlight !== null && highlight !== player.entry.key;
              const focused = highlight === player.entry.key;
              return (
                <g
                  key={player.entry.key}
                  className="chart-series"
                  opacity={dimmed ? 0.12 : 1}
                >
                  <polyline
                    className="chart-line"
                    points={player.points
                      .map((point) => `${xFor(point.index)},${yFor(point.value)}`)
                      .join(" ")}
                    stroke={player.color}
                    strokeWidth={focused ? 3 : 1.8}
                  />
                  {player.points.map((point) =>
                    point.marked || point === last ? (
                      <circle
                        cx={xFor(point.index)}
                        cy={yFor(point.value)}
                        fill={player.color}
                        key={point.index}
                        r={point === last ? 3.2 : 1.4}
                      >
                        <title>{point.label}</title>
                      </circle>
                    ) : null,
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {/* Two columns read top to bottom, left column first, so rank order
            runs down each column. */}
        <div
          className="chart-legend"
          style={{ gridTemplateRows: `repeat(${Math.ceil(legend.length / 2)}, auto)` }}
        >
          {legend.map(({ color, entry }) => {
            const value = entry.averageReturn;
            const dimmed = highlight !== null && highlight !== entry.key;
            return (
              <button
                className="legend-item"
                key={entry.key}
                type="button"
                aria-pressed={highlight === entry.key}
                style={{ opacity: dimmed ? 0.4 : 1 }}
                onClick={() =>
                  setHighlight((current) =>
                    current === entry.key ? null : entry.key,
                  )
                }
              >
                <span className="legend-dot" style={{ backgroundColor: color }} />
                <span className="legend-name">{entry.name}</span>
                <span
                  className={`legend-value ${toneClass(isNet ? entry.net : value)}`}
                >
                  {value === null
                    ? "unranked"
                    : isNet
                      ? signedMoney(entry.net)
                      : formatPercent(value)}
                </span>
              </button>
            );
          })}
        </div>
      </figure>
    </>
  );
}

function Modal({
  state,
  onClose,
  onConfirm,
}: {
  state: ModalState;
  onClose: () => void;
  onConfirm: () => void;
}) {
  function confirm() {
    state.onConfirm();
    onConfirm();
  }

  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm action"
      >
        <div className="msg">
          {state.kind === "recent-sign-in" ? (
            <>
              For safety, {state.purpose} needs a sign-in from the last{" "}
              {RECENT_SIGN_IN_WINDOW_MS / 60_000} minutes. We will email a new
              sign-in link to{" "}
              <span className="literal-text">{state.email}</span>. Open it on
              this device, then try again.
            </>
          ) : state.points?.length ? (
            <>
              <p className="msg-title">{state.message}</p>
              <ul className="msg-points">
                {state.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </>
          ) : (
            state.message
          )}
        </div>
        {state.kind === "confirm" && state.alternative ? (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              state.alternative?.onChoose();
              onConfirm();
            }}
          >
            {state.alternative.label}
          </button>
        ) : null}
        <button
          className={
            state.kind === "confirm" && state.danger ? "danger" : "primary"
          }
          onClick={confirm}
        >
          {state.confirmLabel}
        </button>
        {state.kind === "confirm" && state.hideDismiss ? null : (
          <button className="ghost" onClick={onClose}>
            {(state.kind === "confirm" && state.dismissLabel) || "Cancel"}
          </button>
        )}
      </div>
    </div>
  );
}
