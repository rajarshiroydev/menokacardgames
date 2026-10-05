"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  activeIndexes,
  cancelCurrentHand,
  bigBlindAtLevel,
  betStops,
  blindStatus,
  sessionBlindHistory,
  buyInPlayer,
  completedHandRecord,
  dealNewHand,
  DEFAULT_BLIND_SCHEDULE,
  editBlindSchedule,
  formatDate,
  formatPercent,
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
  totalBuyIns,
  undoLastHand,
  editRebuyRules,
  mostRebuysUsed,
  rebuyBlockReason,
  upcomingBigBlinds,
} from "@/lib/poker/game";
import {
  describeMaxRebuys,
  describeRebuyRules,
  MAX_REBUYS,
  normalizeRebuyRules,
} from "@/lib/poker/buy-ins";
import { gameFromSession } from "@/lib/poker/continue-session";
import {
  CURRENCIES,
  currencySymbol,
  DEFAULT_CURRENCY,
  formatMoney,
  formatSignedMoney,
} from "@/lib/poker/money";
import {
  accountGameStorageKey,
  accountLiveTokenStorageKey,
  LEGACY_GAME_STORAGE_KEY,
  LEGACY_HISTORY_STORAGE_KEY,
  prepareLegacySessionsForAdoption,
  readHandLayout,
  readTurnSound,
  storeHandLayout,
  storeTurnSound,
  type HandLayout,
} from "@/lib/poker/storage";
import { playTurnSound } from "@/lib/turn-sound";
import { useRouter } from "next/navigation";
import qrcode from "qrcode-generator";

import { signOut } from "@/app/auth/sign-in/actions";
import { AvatarArt } from "@/components/avatar-art";
import { AvatarPicker, randomAvatarId } from "@/components/avatar-picker";
import { BrandMark } from "@/components/brand-mark";
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
import type { GroupStandings } from "@/lib/friends/group-standings";
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
  sessionReturn,
  standingsKey,
  type IneligibleReason,
  type Standings,
} from "@/lib/poker/standings";
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
import type {
  BlindSchedule,
  GameState,
  Player,
  PlayerAction,
  PlayerProfile,
  PokerSession,
  RebuyRules,
  WinnerAnnouncement,
} from "@/lib/poker/types";

/** The signed-in host's currency, for every amount the ledger shows. */
const CurrencyContext = createContext<string>(DEFAULT_CURRENCY);

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

function useMoney() {
  const currency = useContext(CurrencyContext);
  return useMemo(
    () => ({
      currency,
      symbol: currencySymbol(currency),
      money: (value: number) => formatMoney(value, currency),
      signedMoney: (value: number) => formatSignedMoney(value, currency),
    }),
    [currency],
  );
}

type View =
  | "home"
  | "setup"
  | "game"
  | "history"
  | "sessions"
  | "profile"
  | "hands";
const VIEWS: readonly View[] = [
  "home",
  "setup",
  "game",
  "history",
  "sessions",
  "profile",
  "hands",
];

/**
 * Screens that show the player list or its count. It is reloaded when one
 * opens, because a friend accepting a request on their phone adds or links a
 * player here.
 */
function showsPlayerList(view: View) {
  return view === "home" || view === "profile" || view === "setup";
}

type ModalState =
  | {
      kind: "confirm";
      message: string;
      /** Shown as a list under the message, for confirmations with several facts. */
      points?: string[];
      confirmLabel: string;
      danger?: boolean;
      onConfirm: () => void;
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
    const data = JSON.parse(
      window.localStorage.getItem(storageKey) || "null",
    ) as GameState | null;
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

function formatCountdown(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function describeBlindSchedule(
  schedule: BlindSchedule | null,
  currency: string,
) {
  if (!schedule) return "Fixed blinds";
  const interval = `${schedule.every} ${schedule.unit === "hands"
    ? schedule.every === 1 ? "hand" : "hands"
    : schedule.every === 1 ? "minute" : "minutes"}`;
  return schedule.raiseType === "add"
    ? `Add ${formatMoney(schedule.raiseBy, currency)} to the big blind every ${interval}`
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
  const pot = hand.pot;
  game.players[playerIndex].stack += pot;
  recordWin(
    game,
    `Hand ${hand.no}: ${game.players[playerIndex].name} wins ${formatMoney(
      pot,
      game.currency,
    )}${automatic ? " (others folded)" : ""}`,
  );
  game.lastHand = completedHandRecord(game);
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
  const money = (value: number) => formatMoney(value, currency);
  const gameStorageKey = accountGameStorageKey(accountId);
  const liveTokenStorageKey = accountLiveTokenStorageKey(accountId);
  const [game, setGame] = useState<GameState | null>(null);
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
  /** The standings card "View standings" opens; cleared when Ranks closes. */
  const [rankFocus, setRankFocus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [editingBlinds, setEditingBlinds] = useState(false);
  const [editingRebuys, setEditingRebuys] = useState(false);
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
  const refreshForView = useCallback(
    (nextView: View) => {
      if (showsPlayerList(nextView)) void refreshPlayers({ quiet: true });
      if (nextView === "home" || nextView === "profile") void refreshFriends();
      if (nextView === "profile") void refreshProfileStats();
      if (nextView === "history") void refreshGroups();
    },
    [refreshFriends, refreshGroups, refreshPlayers, refreshProfileStats],
  );

  const navigate = useCallback(
    (nextView: View, options: { replace?: boolean } = {}) => {
      setView(nextView);
      if (nextView !== "history") setRankFocus(null);
      refreshForView(nextView);
      const state = { ...window.history.state, appView: nextView };
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
      window.history.replaceState(
        { ...window.history.state, appView: "home" },
        "",
      );
      if (storedGame) {
        window.history.pushState(
          { ...window.history.state, appView: "game" },
          "",
        );
        setView("game");
      }
      setReady(true);
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
      name: string;
      stack: number;
      ante: number;
      /** An odd small blind; null keeps the usual half. */
      smallBlind: number | null;
      blinds: BlindSchedule | null;
      /** Rebuy limits; null or both limits off means none. */
      rebuyRules: RebuyRules | null;
      players: PlayerProfile[];
      /** Draw the first dealer now; otherwise seat 1 deals first. */
      randomDealer: boolean;
    }) => {
      if (input.ante <= 0) {
        showToast("Big blind must be greater than 0");
        return;
      }
      if (
        input.smallBlind !== null &&
        !isValidSmallBlind(input.smallBlind, input.ante)
      ) {
        showToast(
          `Small blind must be from ${formatMoney(1, currency)} up to the big blind`,
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
      const rebuyRules = normalizeRebuyRules(input.rebuyRules);
      const gameName = input.name.trim();
      const startedAt = Date.now();
      const firstDealer = input.randomDealer
        ? Math.floor(Math.random() * input.players.length)
        : 0;
      const nextGame: GameState = {
        ...(gameName ? { gameName } : {}),
        sessionLabel: gameName || `Game ${nextSessionNumber}`,
        currency,
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
        ...(rebuyRules ? { rebuyRules } : {}),
        startedAt,
        players: input.players.map((player) => ({
          id: player.id,
          name: player.name,
          stack: input.stack,
          buyIns: [input.stack],
        })),
        hand: null,
        handNo: 0,
        // The first hand deals from the seat after this one.
        dealerIndex: firstDealer - 1,
        log: [],
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
    ask(
      `Give the ${money(game.hand.pot)} pot to ${
        game.players[playerIndex].name
      }?`,
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
    const each = Math.floor(hand.pot / winners.length);
    const remainder = hand.pot - each * winners.length;
    winners.forEach((playerIndex, index) => {
      next.players[playerIndex].stack += each + (index < remainder ? 1 : 0);
    });
    recordWin(
      next,
      `Hand ${hand.no}: split ${money(hand.pot)} between ${winners
        .map((index) => next.players[index].name)
        .join(", ")}`,
    );
    next.lastHand = completedHandRecord(next);
    next.winnerAnnouncement = {
      names: winners.map((index) => next.players[index].name),
      pot: hand.pot,
      handNo: hand.no,
      split: true,
    };
    next.hand = null;
    setGame(next);
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
    if (!game || game.hand) return;
    const amount = nextBuyIn(game, playerIndex);
    if (amount === null) return;
    const player = game.players[playerIndex];
    ask(
      `Buy in ${player.name} for ${money(amount)}?`,
      `Buy In · ${money(amount)}`,
      () => {
        const next = structuredClone(game);
        const confirmedAmount = buyInPlayer(next, playerIndex);
        if (confirmedAmount === null) return;
        const confirmedPlayer = next.players[playerIndex];
        recordWin(
          next,
          `Hand ${next.handNo}: ${confirmedPlayer.name} buys in for ${money(confirmedAmount)}`,
        );
        setGame(next);
        showToast(
          `${confirmedPlayer.name} buys in for ${money(confirmedAmount)}`,
        );
      },
    );
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

  function cancelHand() {
    if (!game?.hand) return;
    ask(
      `Cancel hand ${game.hand.no}? Everyone gets their money back, including the blinds.`,
      "Cancel hand",
      () => {
        const next = structuredClone(game);
        if (!cancelCurrentHand(next)) return;
        setGame(next);
        showToast("Hand cancelled");
      },
    );
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
        : "Reset everything and start a new game? All current stacks are lost.",
      "Reset game",
      () => {
        endLiveSharing();
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
      hands: completedHands,
      results: game.players.map((player, index) => ({
        ...(player.id ? { playerId: player.id } : {}),
        name: player.name,
        net: endStacks[index] - totalBuyIns(game, index),
        end: endStacks[index],
        ...(player.buyIns && player.buyIns.length > 1
          ? { buyIns: player.buyIns }
          : {}),
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

  function closeModal() {
    setModal(null);
  }

  const header: { title: string } | null =
    view === "home"
      ? null
      : view === "game" && game
        ? {
            title: game.hand
              ? game.hand.stage === STAGES.length - 1 &&
                !pendingIndexes(game).length
                ? "Showdown"
                : `Hand ${game.hand.no}`
              : "Between Hands",
          }
        : view === "setup"
          ? { title: "Table Setup" }
          : view === "history"
            ? { title: "Standings" }
            : view === "sessions"
              ? { title: "My Hosted Games" }
              : view === "profile"
                ? { title: "Profile" }
                : view === "hands"
                  ? { title: "Hand Rankings" }
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
      onAdoptLegacyGame={offerLegacyGameAdoption}
      onGame={() => navigate(game ? "game" : "setup")}
      onSetup={() => navigate("setup")}
      onSessions={() => navigate("sessions")}
      onReviewRequests={openPlayers}
      onOpenHands={openHands}
      onReviewLegacySessions={() => setReviewingLegacySessions(true)}
    />
  );

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
          {view === "profile" ? <ThemeToggle /> : null}
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
            history={history}
            players={[...players, ...discardedPlayers]}
            selfPlayerId={profile.selfPlayerId}
            focusKey={rankFocus}
            loading={historyLoading}
            error={historyError}
            onRetry={() => void refreshHistory()}
          />
        ) : view === "sessions" ? (
          <SessionsView
            discardedSessions={discardedSessions}
            history={history}
            loading={historyLoading}
            error={historyError}
            onRetry={() => void refreshHistory()}
            onDiscard={discardSession}
            onContinue={continueSession}
            onRestore={(id) => void updateSessionState(id, "restore")}
            onDeletePermanently={deleteSessionPermanently}
            onExport={exportData}
            onImport={importData}
          />
        ) : view === "profile" ? (
          <ProfileView
            profile={profile}
            accountEmail={accountEmail}
            onDeleteAccount={deleteAccount}
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
        ) : view === "hands" ? (
          <PokerHandsChart />
        ) : view === "setup" ? (
          <SetupView
            players={players}
            selfPlayerId={profile.selfPlayerId}
            loading={playersLoading}
            error={playersError}
            onRetry={() => void refreshPlayers()}
            suggestedName={`Game ${nextSessionNumber}`}
            onStart={startGame}
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
            onCancelHand={cancelHand}
            onBuyIn={buyIn}
            onNextHand={startNextHand}
            onEndSession={endSession}
            onUndoHand={undoHand}
            onDiscard={discardGame}
            onEditBlinds={() => setEditingBlinds(true)}
            onEditRebuys={() => setEditingRebuys(true)}
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
            navigate(game ? "game" : "setup");
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
  if (view === "setup" || view === "game") return "play";
  if (view === "hands") return "home";
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
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      <AvatarArt id={avatar ?? lookup(playerId, name)} seed={name} />
      {role ? (
        <span className={`role-badge ${role === "D" ? "dealer" : ""}`}>
          {role}
        </span>
      ) : null}
    </span>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? "selected" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
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

function HomeView({
  game,
  displayName,
  selfPlayerId,
  history,
  friendRequests,
  legacyGame,
  legacySessionCount,
  onAdoptLegacyGame,
  onGame,
  onSetup,
  onSessions,
  onReviewRequests,
  onOpenHands,
  onReviewLegacySessions,
}: {
  game: GameState | null;
  displayName: string | null;
  selfPlayerId: string | null;
  history: PokerSession[];
  friendRequests: FriendOverview["received"];
  legacyGame: GameState | null;
  legacySessionCount: number;
  onAdoptLegacyGame: () => void;
  onGame: () => void;
  onSetup: () => void;
  onSessions: () => void;
  onReviewRequests: () => void;
  onOpenHands: () => void;
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
        {game ? (
          <HomeLiveCard game={game} selfPlayerId={selfPlayerId} onOpen={onGame} />
        ) : (
          <button className="home-start-card" type="button" onClick={onSetup}>
            <span className="home-start-watermark" aria-hidden="true">
              ♠
            </span>
            <span className="home-start-kicker">No game running</span>
            <span className="home-start-row">
              <span>
                <strong>Start a game</strong>
                <small>Seat players, set stacks, deal</small>
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
  const leader = game.players.reduce<Player | null>(
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
              {game.players.length} player{game.players.length === 1 ? "" : "s"}
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
  const { signedMoney } = useMoney();
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
    `${session.hands} hand${session.hands === 1 ? "" : "s"}`,
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
              {signedMoney(featured.net)}
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
              <em className={toneClass(winner.net)}>{signedMoney(winner.net)}</em>
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
                <b className={toneClass(result.net)}>{signedMoney(result.net)}</b>
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
  const { money } = useMoney();
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
                  {formatDate(session.date)} · Big Blind {money(session.ante)}
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
  const { money } = useMoney();
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
                  {formatDate(session.date)} · Big Blind{" "}
                  {money(session.ante)}
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
  players,
  selfPlayerId,
  loading,
  error,
  onRetry,
  suggestedName,
  onStart,
}: {
  players: PlayerProfile[];
  /** Your own player, listed first and marked You. */
  selfPlayerId: string | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  suggestedName: string;
  onStart: (input: {
    name: string;
    stack: number;
    ante: number;
    smallBlind: number | null;
    blinds: BlindSchedule | null;
    rebuyRules: RebuyRules | null;
    players: PlayerProfile[];
    randomDealer: boolean;
  }) => void;
}) {
  const { money, symbol } = useMoney();
  const [name, setName] = useState("");
  const [stack, setStack] = useState(10_000);
  const [ante, setAnte] = useState(100);
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
  const [customAnte, setCustomAnte] = useState(false);
  // Odd blinds: off keeps the usual half. A chip picks a share of the big
  // blind, so it follows big blind changes; Other is a fixed amount.
  const [oddBlinds, setOddBlinds] = useState(false);
  const [smallBlindShare, setSmallBlindShare] = useState(40);
  const [customSmallBlind, setCustomSmallBlind] = useState(false);
  const [smallBlindAmount, setSmallBlindAmount] = useState(40);
  const [rebuyRules, setRebuyRules] = useState<RebuyRules>({
    maxRebuys: null,
    closeAtBigBlind: null,
  });
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
  const ladder = schedule && scheduleValid
    ? Array.from({ length: 4 }, (_, level) =>
        bigBlindAtLevel(Math.max(1, ante), schedule, level),
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
    onStart({
      name,
      stack,
      ante,
      smallBlind,
      blinds: schedule,
      rebuyRules: setupRebuyRules,
      players: selectedPlayers,
      randomDealer,
    });
  }

  const selectionComplete =
    playerCount >= 2 &&
    playerCount <= MAX_SEATS &&
    new Set(selectedIds).size === playerCount;
  const nameFor = (playerId: string) =>
    players.find((player) => player.id === playerId)?.name ?? "";
  const stackPreset = STACK_PRESETS.some((option) => option.value === stack);
  const antePreset = ANTE_PRESETS.some((option) => option.value === ante);
  const bigBlindForShares = Math.max(1, ante);
  const smallBlindOptions = SMALL_BLIND_SHARES.map((percent) => ({
    percent,
    amount: Math.min(
      bigBlindForShares,
      Math.max(1, Math.round((bigBlindForShares * percent) / 100)),
    ),
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
    <form className="stack-list setup-view" onSubmit={submit}>
      <section className="glass card">
        <label className="label" htmlFor="game-name">
          Game name <span className="label-note">(optional)</span>
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
              <span className="label">Seating Order</span>
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
                    <span className="seat-number" aria-hidden="true">
                      {index + 1}
                    </span>
                    <Avatar name={seatName} playerId={selectedId} size="small" />
                    <span className="seat-name">{seatName}</span>
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
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </section>

      <section className="glass card">
        <div className="card-row">
          <span className="label">Starting stack</span>
          <span className="card-note">First buy-in {money(stack)}</span>
        </div>
        <Segmented
          label="Starting stack"
          options={[...STACK_PRESETS, { value: "other", label: "Other" }]}
          value={customStack || !stackPreset ? "other" : stack}
          onChange={(value) => {
            if (value === "other") {
              setCustomStack(true);
            } else {
              setCustomStack(false);
              setStack(value);
            }
          }}
        />
        {customStack || !stackPreset ? (
          <input
            className="field"
            id="stack"
            aria-label="Starting stack amount"
            type="number"
            inputMode="numeric"
            min="1"
            value={stack}
            onChange={(event) => setStack(Number(event.target.value))}
          />
        ) : null}
      </section>

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
              By default the small blind is <b>half the big blind</b>, rounded
              down. Turn on odd blinds to pick a different small blind, such
              as {money(40)} with a {money(100)} big blind.
            </p>
          </InfoSheet>
        ) : null}
        <Segmented
          label="Big blind"
          options={[
            ...ANTE_PRESETS.map((option) => ({
              ...option,
              label: `${symbol}${option.label}`,
            })),
            { value: "other", label: "Other" },
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
          <input
            className="field"
            id="ante"
            aria-label="Big blind amount"
            type="number"
            inputMode="numeric"
            min="1"
            value={ante}
            onChange={(event) => setAnte(Number(event.target.value))}
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
              <input
                className="field"
                aria-label="Small blind amount"
                type="number"
                inputMode="numeric"
                min="1"
                max={Math.max(1, ante)}
                value={smallBlindAmount}
                onChange={(event) =>
                  setSmallBlindAmount(Number(event.target.value))
                }
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
                <input
                  className="field"
                  id="blind-raise-by"
                  type="number"
                  inputMode="decimal"
                  min={blindRaiseType === "multiply" ? "1.1" : "1"}
                  step={blindRaiseType === "multiply" ? "0.1" : "1"}
                  value={blindRaiseBy}
                  onChange={(event) =>
                    setBlindRaiseBy(Number(event.target.value))
                  }
                />
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
            A busted player can buy back in for the starting stack,{" "}
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

      <button
        className="cta"
        type="submit"
        disabled={
          !selectionComplete ||
          stack < 1 ||
          ante < 1 ||
          !scheduleValid ||
          !smallBlindValid ||
          Boolean(rebuyError)
        }
      >
        Deal First Hand
      </button>
    </form>
  );
}

const MAX_SEATS = 10;
/** Odd small blind chips, as percentages of the big blind (100: 25–100). */
const SMALL_BLIND_SHARES = [25, 40, 60, 75, 100] as const;
const STACK_PRESETS = [
  { value: 5_000, label: "5K" },
  { value: 10_000, label: "10K" },
  { value: 20_000, label: "20K" },
  { value: 50_000, label: "50K" },
] as const;
const ANTE_PRESETS = [
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 200, label: "200" },
  { value: 500, label: "500" },
  { value: 1_000, label: "1K" },
] as const;

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
  onDeleteAccount,
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
  onDeleteAccount: () => void;
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
        onDeleteAccount={onDeleteAccount}
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
            const onApp = row.kind === "self" || row.kind === "friend";
            return (
              <div className="profile-row-wrap" key={row.key}>
                <PressableRow
                  className={`profile-row${row.kind === "removed" ? " removed" : ""}`}
                  onLongPress={
                    actions.length ? (element) => openMenu(row.key, element) : null
                  }
                >
                  <span
                    className={`profile-avatar${onApp ? " on-app" : ""}`}
                    aria-hidden="true"
                  >
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

/** Profile's switch for the click on each action, saved on this device. */
function TurnSoundSetting() {
  // Profile only opens after the app has loaded, so storage can be read here.
  const [on, setOn] = useState(readTurnSound);
  return (
    <div className="profile-sound">
      <span>
        <small>Sounds · on this device</small>
        <b>Click when a player acts</b>
      </span>
      <button
        className="switch"
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Click when a player acts"
        onClick={() => {
          storeTurnSound(!on);
          setOn(!on);
        }}
      />
    </div>
  );
}

/** Profile's ⋯ button: who is signed in, Sign out and Delete my account. */
function AccountMenu({
  email,
  onEditName,
  onDeleteAccount,
}: {
  email: string;
  onEditName: () => void;
  onDeleteAccount: () => void;
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
          <button
            type="button"
            role="menuitem"
            className="danger-text"
            onClick={() => {
              setOpen(false);
              onDeleteAccount();
            }}
          >
            Delete my account
          </button>
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

/** The card at the top: name, record, user code and currency. */
function ProfileCard({
  profile,
  accountEmail,
  onDeleteAccount,
  onProfile,
  onScannedCode,
  onToast,
  stats,
  statsError,
}: {
  profile: AccountProfile;
  accountEmail: string;
  onDeleteAccount: () => void;
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

  const netText = stats ? signedMoney(stats.net) : "–";
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
            onDeleteAccount={onDeleteAccount}
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
      <TurnSoundSetting />
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
    <section className="glass profile-request">
      <div className="profile-request-head">
        <span className="profile-avatar on-app" aria-hidden="true">
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
              <span className="profile-avatar on-app" aria-hidden="true">
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
  onCancelHand: () => void;
  onBuyIn: (playerIndex: number) => void;
  onNextHand: () => void;
  onEndSession: () => void;
  onUndoHand: () => void;
  onDiscard: () => void;
  onEditBlinds: () => void;
  onEditRebuys: () => void;
  liveSharing: boolean;
  liveFailing: boolean;
  onShareLive: () => void;
};

function GameView(props: GameViewProps) {
  const { currency, money, signedMoney } = useMoney();
  const { game } = props;
  const hand = game.hand;
  const net = (index: number) =>
    game.players[index].stack - totalBuyIns(game, index);
  const enoughPlayers = game.players.filter((player) => player.stack > 0).length >= 2;
  // Timed levels run on the clock between hands too, so keep the countdown live.
  const now = useBlindClock(game.blinds?.unit === "minutes");
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
        : `${nextBlinds} in ${formatCountdown(blinds.msLeft)}`;
  const blindSchedule = (
    <>
      {blinds.schedule && !pendingPlan ? (
        <div
          className={`blind-timer ${blinds.dueNow ? "due" : ""}`}
          aria-live="polite"
        >
          {blindNote}
        </div>
      ) : null}
      {pendingPlan ? (
        <div className="blind-timer due">
          From hand {pendingPlan.effectiveHand}:{" "}
          {describeBlindSchedule(pendingPlan.schedule, currency)}
        </div>
      ) : null}
    </>
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
            blinds.schedule ? ` · L${blinds.level + 1}` : ""
          }`}
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
              <span className="label">Pot · Hand {hand.no}</span>
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
                  .filter((index) => !hand.in[index] && index !== closer),
              ].map((playerIndex) => (
                <PlayerRow
                  key={`${hand.no}-${hand.stage}-${playerIndex}-${hand.acted[playerIndex]}`}
                  game={game}
                  playerIndex={playerIndex}
                  roundClosed={playerIndex === closer}
                  flash={flashFor(game, props.lastTurn, playerIndex)}
                  onAct={props.onAct}
                  onUndo={props.onUndoAction}
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
                <small>Invested {money(totalBuyIns(game, index))}</small>
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
          { value: "unlimited", label: "∞" },
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
            <input
              className="field"
              id={`${idPrefix}-close-at`}
              aria-label="Big blind at which rebuys close"
              type="number"
              inputMode="numeric"
              min="1"
              value={rules.closeAtBigBlind ?? ""}
              onChange={(event) =>
                onChange({
                  ...rules,
                  closeAtBigBlind: Number(event.target.value),
                })
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
            {describeRebuyRules(effective, game.currency) ?? "Unlimited rebuys"}
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
                <input
                  id="edit-blind-raise-by"
                  type="number"
                  min={raiseType === "multiply" ? "1.1" : "1"}
                  step={raiseType === "multiply" ? "0.1" : "1"}
                  value={raiseBy}
                  onChange={(event) => setRaiseBy(Number(event.target.value))}
                />
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
  const rules = describeRebuyRules(game.rebuyRules, game.currency);

  return (
    <div className="buy-in-options">
      <span className="label">Buy in</span>
      <p className="muted small-note">
        A busted player can buy back in for the starting stack.
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
          <span className="contender-amount">Buy in · {money(amount)}</span>
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
        <span className="eyebrow">Pot won · Hand {announcement.handNo}</span>
        <h2 id="winner-title">{winnerText}</h2>
        <p className="gradient-text winner-pot">
          {money(announcement.pot)}
        </p>
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

  return (
    <section className="glass card winner-picker">
      <div className="card-row">
        <span className="label">Pick the winner</span>
        <span className="accent-amount">{money(hand.pot)}</span>
      </div>
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
          <span className="contender-amount">{money(hand.pot)}</span>
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
  onNextStage,
  onPickWinner,
  onBeginSplit,
  onEndSplit,
  onToggleSplit,
  onSplitPot,
  onCancelHand,
  lastTurn,
}: GameViewProps & {
  blindsText: string;
  blindSchedule: ReactNode;
}) {
  const { money } = useMoney();
  // The seat tapped for its Undo; it clears once that seat can't undo.
  const [picked, setPicked] = useState<number | null>(null);
  const hand = game.hand;
  if (!hand) return null;
  const lastStage = STAGES.length - 1;
  const pending = pendingIndexes(game).length > 0;
  const showdown = hand.stage === lastStage && !pending;
  const splitting = Boolean(hand.splitSel);
  const crowded = game.players.length > 6;
  const current = hand.currentPlayer;
  const undoSeat =
    picked !== null && hand.last[picked] && !splitting ? picked : null;

  function tapSeat(index: number) {
    if (showdown) {
      if (!hand?.in[index]) return;
      if (splitting) onToggleSplit(index);
      else onPickWinner(index);
      return;
    }
    if (!hand?.last[index]) return;
    setPicked((seat) => (seat === index ? null : index));
  }

  return (
    <>
      <section
        className={`poker-table ${crowded ? "crowded" : ""}`}
        aria-label={`Table, hand ${hand.no}`}
      >
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
              ? splitting
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
          <span className="table-blinds">{blindsText}</span>
        </div>
        {showdown
          ? null
          : game.players.map((_, index) => {
              const chips = hand.committed[index];
              if (!(chips > 0)) return null;
              // Chips sit in front of the seat, clear of the pot: under the
              // name for seats along the top, over the avatar for the rest.
              const spot = seatPosition(index, game.players.length);
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
        {game.players.map((player, index) => {
          const spot = seatPosition(index, game.players.length);
          const folded = !hand.in[index];
          const isTurn = !showdown && current === index;
          const flash = showdown ? undefined : flashFor(game, lastTurn, index);
          const contender = showdown && !folded;
          const inSplit = hand.splitSel?.includes(index) ?? false;
          const tappable = showdown
            ? contender
            : Boolean(hand.last[index]) && !splitting;
          const status = folded
            ? "Folded"
            : isTurn
              ? "To act"
              : showdown
                ? splitting
                  ? inSplit
                    ? "In split"
                    : "Tap to add"
                  : "Tap to award"
                : seatStatus(game, index, money)
                    .replace("Small blind", "SB")
                    .replace("Big blind", "BB");
          const state = [
            folded ? "folded" : "",
            isTurn ? "turn" : "",
            contender ? (inSplit ? "in-split" : "contender") : "",
            undoSeat === index ? "picked" : "",
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

      {undoSeat !== null ? (
        <div className="glass table-undo">
          <Avatar
            name={game.players[undoSeat].name}
            playerId={game.players[undoSeat].id}
            size="small"
          />
          <span className="seat-copy">
            <b>{game.players[undoSeat].name}</b>
            <small>{seatStatus(game, undoSeat, money)}</small>
          </span>
          <button
            className="pill-button"
            type="button"
            onClick={() => {
              setPicked(null);
              onUndoAction(undoSeat);
            }}
          >
            Undo
          </button>
        </div>
      ) : null}

      {splitting ? (
        <SplitView
          game={game}
          onToggle={onToggleSplit}
          onSplit={onSplitPot}
          onBack={onEndSplit}
        />
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
          onUndo={onUndoAction}
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
      <button
        className="glass-button full tall danger-text"
        type="button"
        onClick={onCancelHand}
      >
        Cancel hand
      </button>
      {!showdown && !splitting ? (
        <p className="dashed-button full tall table-hint">
          Tap on player to undo their action.
        </p>
      ) : null}
    </>
  );
}

function seatStatus(
  game: GameState,
  playerIndex: number,
  money: (value: number) => string,
) {
  const hand = game.hand!;
  const player = game.players[playerIndex];
  const committed = hand.committed[playerIndex];
  if (!hand.in[playerIndex]) return "Folded";
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
  onUndo,
  roundClosed = false,
  dock = false,
  flash,
}: {
  game: GameState;
  playerIndex: number;
  onAct: GameViewProps["onAct"];
  onUndo: (playerIndex: number) => void;
  /** This player's action closed the round; keep the card open but locked. */
  roundClosed?: boolean;
  /** Set while this player's action is the latest; its status flashes. */
  flash?: number;
  /** The table's action dock under the oval, which names who is to act. */
  dock?: boolean;
}) {
  const { money, symbol } = useMoney();
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
  const canUndo = hand.last[playerIndex] && !hand.splitSel;
  const hasAmount = amount.trim() !== "";
  const stops = betStops(minimum, player.stack);
  const betAmount = hasAmount
    ? Math.floor(Number(amount))
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
          {canUndo ? (
            <button
              className="pill-button"
              type="button"
              onClick={() => onUndo(playerIndex)}
            >
              Undo
            </button>
          ) : null}
        </div>
        <div className="bet-panel" aria-hidden="true" inert>
          <div className="bet-summary">
            <p>
              Betting round complete
              <br />
              Deal <b>{STAGES[hand.stage + 1]}</b> next
            </p>
            <label className="bet-input">
              <span>{symbol.trim()}</span>
              <input type="number" disabled placeholder="—" />
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
    return (
      <div className={`glass seat-card ${folded ? "folded" : ""}`}>
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
          {canUndo ? (
            <button
              className="pill-button"
              type="button"
              onClick={() => onUndo(playerIndex)}
            >
              Undo
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
            <label className="bet-input">
              <span>{symbol.trim()}</span>
              <input
                type="number"
                inputMode="numeric"
                min={minimum}
                placeholder={String(stops[0] ?? "")}
                aria-label={
                  raising ? "Chips to put in for the raise" : "Bet amount"
                }
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
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
                setAmount(index === 0 ? "" : String(stops[index]));
              }}
            />
            <div className="quick-sizes">
              {quickSizes.map((size) => {
                const sizeAmount = String(size.value);
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
  const selected = [...hand.splitSel].sort((a, b) => a - b);
  const each = selected.length ? Math.floor(hand.pot / selected.length) : 0;
  const remainder = selected.length ? hand.pot - each * selected.length : 0;

  return (
    <section className="glass card winner-picker">
      <div className="card-row">
        <span className="label">Split the pot</span>
        <span className="accent-amount">{money(hand.pot)}</span>
      </div>
      {activeIndexes(game).map((playerIndex) => {
        const isSelected = hand.splitSel?.includes(playerIndex) ?? false;
        const rank = selected.indexOf(playerIndex);
        const share = isSelected ? each + (rank < remainder ? 1 : 0) : 0;
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
      {selected.length > 1 ? (
        <button className="blue-button full tall" type="button" onClick={onSplit}>
          Split {money(hand.pot)} {selected.length} ways
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

function SessionCard({
  session,
  discarded = false,
  onContinue,
  onRestore,
  onDeletePermanently,
}: {
  session: PokerSession;
  discarded?: boolean;
  onContinue?: (id: string) => void;
  /** Not shown for now: the Discard button is hidden (user decision 2026-10-01). */
  onDiscard?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDeletePermanently?: (id: string) => void;
}) {
  const { currency, money, signedMoney } = useMoney();
  const sortedResults = [...session.results].sort((a, b) => b.net - a.net);
  const blinds = sessionBlindHistory(session);
  const lastBigBlind = blinds.levels.at(-1)!.bigBlind;

  return (
    <article className={`glass card session-card ${discarded ? "discarded" : ""}`}>
      <div className="session-head">
        <div>
          <h2 className="card-title">
            {session.name || `Game ${session.sessionNumber || ""}`}
          </h2>
          <p className="muted session-meta">
            {formatDate(session.date)} · {session.hands} hands · Big blind{" "}
            {money(session.ante)} · {session.results.length} players
          </p>
          {session.rebuyRules ? (
            <p className="muted session-meta">
              {describeRebuyRules(session.rebuyRules, currency)}
            </p>
          ) : null}
        </div>
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
          ) : onContinue ? (
            <button
              className="pill-button"
              type="button"
              onClick={() => onContinue(session.id)}
            >
              Continue game
            </button>
          ) : null}
          {/* Discard is hidden until users ask for it back (user decision
              2026-10-01); onDiscard and discardSession stay for that. */}
        </div>
      </div>
      <details className="session-blind-history">
        <summary>
          Blind history · {blinds.levels.length} amount
          {blinds.levels.length === 1 ? "" : "s"} used · finished at{" "}
          {money(smallBlindFor(lastBigBlind, blinds.smallBlindRatio))}/
          {money(lastBigBlind)}
        </summary>
        <div className="session-blind-history-content">
          <b>Plans</b>
          {blinds.plans.map((plan) => (
            <div key={plan.effectiveHand}>
              From hand {plan.effectiveHand}: {money(
                smallBlindFor(plan.baseBigBlind, blinds.smallBlindRatio),
              )}/{money(plan.baseBigBlind)} ·{" "}
              {describeBlindSchedule(plan.schedule, currency)}
            </div>
          ))}
          <b>Blinds used</b>
          {blinds.levels.map((level) => (
            <div key={level.handNo}>
              Hand {level.handNo}: {money(
                smallBlindFor(level.bigBlind, blinds.smallBlindRatio),
              )}/{money(level.bigBlind)}
            </div>
          ))}
        </div>
      </details>
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
              {result.buyIns && result.buyIns.length > 1 ? (
                <small>
                  Buy-ins{" "}
                  {money(
                    result.buyIns.reduce((sum, amount) => sum + amount, 0),
                  )}
                </small>
              ) : null}
            </span>
            <span className={`result-amount ${toneClass(result.net)}`}>
              {signedMoney(result.net)}
            </span>
          </div>
        ))}
      </div>
    </article>
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
  invested: number;
  net: number;
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
}: {
  id?: string;
  entry: StandingCardEntry;
  open: boolean;
  onToggle: () => void;
  excluded?: React.ReactNode;
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
    ["Invested", money(entry.invested), null],
    ["Net", signedMoney(entry.net), entry.net],
  ];
  return (
    <section id={id} className="glass standing-card">
      <button
        className="standing-toggle"
        type="button"
        aria-expanded={open}
        onClick={onToggle}
      >
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
          {entry.averageReturn === null ? (
            <small>Unranked · no verified buy-ins</small>
          ) : null}
        </span>
        <span className={`standing-return ${toneClass(entry.averageReturn)}`}>
          {entry.averageReturn === null ? "—" : formatPercent(entry.averageReturn)}
        </span>
        <span className="chevron" aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
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
  ...props
}: Parameters<typeof StandingsView>[0] & {
  /** Friends' groups, kept by the app so the picker shows at once. */
  groups: GroupStandings[];
  groupsError: string;
}) {
  const [selected, setSelected] = useState("mine");

  const group = groups.find((item) => item.hostAccountId === selected);
  const gameCount = (count: number) => `${count} game${count === 1 ? "" : "s"}`;
  const options = [
    {
      id: "mine",
      label: "My Hosted Games",
      detail: gameCount(props.history.length),
    },
    ...groups.map((item) => ({
      id: item.hostAccountId,
      label: hostedGamesTitle(item.hostName),
      detail: gameCount(item.games),
    })),
  ];

  return (
    <div className="stack-list">
      {groups.length ? (
        // One picker for any number of hosts: the phone's own list scales
        // where side-by-side buttons run out of room.
        <div className="standings-picker">
          <select
            className="select-control"
            aria-label="Whose standings"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {`${option.label} · ${option.detail}`}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {groupsError ? <p className="muted small-note">{groupsError}</p> : null}
      {group ? <GroupStandingsView group={group} /> : <StandingsView {...props} />}
    </div>
  );
}

/**
 * The heading between the graph and the ranked list, shared by My Hosted
 * Games and every friend's group. Its "i" says whose ranking this is, then
 * how players are ranked.
 */
function StandingsHeading({ intro }: { intro: string }) {
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
        <RankingHelp intro={intro} onClose={() => setShowRankingHelp(false)} />
      ) : null}
    </>
  );
}

/** "Asha's Hosted Games": the name of another host's group on Ranks. */
function hostedGamesTitle(hostName: string | null) {
  return `${hostName ?? "Friend"}'s Hosted Games`;
}

function GroupStandingsView({ group }: { group: GroupStandings }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const rows = group.rows;
  const visible = showAll ? rows : rows.slice(0, STANDINGS_START);
  const hostName = group.hostName ?? "Your friend";

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
      {rows.length ? (
        <LeaderboardChart
          sessionCount={group.games}
          lines={chartLinesFromGroup(group)}
        />
      ) : null}
      {rows.length ? (
        <StandingsHeading
          intro={`This is your overall ranking among everyone who has played in sessions hosted by ${hostName}.`}
        />
      ) : null}
      {rows.length ? (
        visible.map((row, index) => (
          <StandingCard
            key={`${row.name}-${index}`}
            entry={row}
            open={expanded.has(index)}
            onToggle={() => toggle(index)}
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
    </div>
    </CurrencyContext.Provider>
  );
}

function StandingsView({
  history,
  players,
  selfPlayerId,
  focusKey,
  loading,
  error,
  onRetry,
}: {
  history: PokerSession[];
  /** Current names: a renamed guest or a friend's chosen name wins over saved ones. */
  players: PlayerProfile[];
  selfPlayerId: string | null;
  /** A player's card to open and scroll to, from "View standings". */
  focusKey: string | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const standings = useMemo(() => {
    const built = buildStandings(history);
    const names = new Map(players.map((player) => [player.id, player.name]));
    const selfKey = selfPlayerId ? `id:${selfPlayerId}` : null;
    return {
      ...built,
      entries: built.entries.map((entry) => ({
        ...entry,
        name: (entry.playerId && names.get(entry.playerId)) || entry.name,
        isMe: entry.key === selfKey,
      })),
    };
  }, [history, players, selfPlayerId]);
  const leaderboard = standings.entries;
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

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
  if (!leaderboard.length) {
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
      <LeaderboardChart
        sessionCount={standings.timeline.length}
        lines={chartLinesFromStandings(standings)}
      />

      <StandingsHeading intro="This is the overall ranking of everyone who has played in sessions you hosted." />
      {visible.map((entry) => (
        <StandingCard
          key={entry.key}
          id={`standing-${entry.key}`}
          entry={entry}
          open={expanded.has(entry.key)}
          onToggle={() => toggle(entry.key)}
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
      ))}
      {leaderboard.length > STANDINGS_START ? (
        <button
          className="glass-button full accent-text"
          type="button"
          onClick={() => setShowAll((shown) => !shown)}
        >
          {showAll ? "Show fewer" : `Show all ${leaderboard.length} players`}
        </button>
      ) : null}
    </div>
  );
}

function RankingHelp({
  intro,
  onClose,
}: {
  intro: string;
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

function SessionsView({
  history,
  discardedSessions,
  loading,
  error,
  onRetry,
  onDiscard,
  onContinue,
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
  value: number;
  /** Null when the player missed this game and the average carried forward. */
  sessionReturn: number | null;
  sampleCount: number;
};

type ChartLine = {
  key: string;
  name: string;
  averageReturn: number | null;
  points: ChartPoint[];
};

function chartLinesFromStandings(standings: Standings): ChartLine[] {
  return standings.entries.map((entry) => ({
    key: entry.key,
    name: entry.name,
    averageReturn: entry.averageReturn,
    points: (standings.series.get(entry.key)?.returns ?? []).flatMap((point) =>
      point
        ? [
            {
              index: point.sessionIndex,
              value: point.runningAverage,
              sessionReturn: point.sessionReturn,
              sampleCount: point.sampleCount,
            },
          ]
        : [],
    ),
  }));
}

/** Rebuilds each friend-visible line, carrying the average across missed games. */
function chartLinesFromGroup(group: GroupStandings): ChartLine[] {
  return group.rows.map((row, rowIndex) => {
    const played = group.chart?.[rowIndex] ?? [];
    const points: ChartPoint[] = [];
    played.forEach(([index, value, sessionReturn], playedIndex) => {
      const sampleCount = playedIndex + 1;
      const nextPlayed = played[playedIndex + 1]?.[0] ?? group.games + 1;
      points.push({ index, value, sessionReturn, sampleCount });
      for (let missed = index + 1; missed < nextPlayed; missed += 1) {
        points.push({ index: missed, value, sessionReturn: null, sampleCount });
      }
    });
    return {
      key: `row-${rowIndex}`,
      name: row.name,
      averageReturn: row.averageReturn,
      points,
    };
  });
}

function LeaderboardChart({
  sessionCount,
  lines,
}: {
  sessionCount: number;
  lines: ChartLine[];
}) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const chartWidth = 320;
  const chartHeight = 200;
  const plot = { top: 8, right: 6, bottom: 24, left: 40 };
  const plotWidth = chartWidth - plot.left - plot.right;
  const plotHeight = chartHeight - plot.top - plot.bottom;
  const series = lines.map((entry) => {
    const points = entry.points.map((point) => ({
      index: point.index,
      value: point.value,
      marked: point.sessionReturn !== null,
      label: `${entry.name}, session ${point.index}: ${
        point.sessionReturn === null
          ? "did not play"
          : `session return ${formatPercent(point.sessionReturn)}`
      } · running average ${formatPercent(point.value)} over ${
        point.sampleCount
      } session${point.sampleCount === 1 ? "" : "s"}`,
    }));
    return {
      color: playerColor(entry.name),
      entry,
      points,
    };
  });

  const maxMagnitude = Math.max(
    1,
    ...series.flatMap((player) => player.points.map((point) => Math.abs(point.value))),
  );
  const step = 25;
  const axisMagnitude = Math.max(step, Math.ceil(maxMagnitude / step) * step);
  const yTicks = [axisMagnitude, axisMagnitude / 2, 0, -axisMagnitude / 2, -axisMagnitude];
  const xFor = (index: number) =>
    plot.left + (index / Math.max(1, sessionCount)) * plotWidth;
  const yFor = (value: number) =>
    plot.top + ((axisMagnitude - value) / (axisMagnitude * 2)) * plotHeight;
  const xLabelEvery = Math.max(1, Math.ceil(sessionCount / 4));
  const tickLabel = (value: number) => {
    if (value === 0) return "0%";
    return `${value > 0 ? "+" : "−"}${Math.abs(value)}%`;
  };
  const title = "Average Return";
  const description =
    "Each colored line shows one player's running average session return, starting at their first ranked session. Sessions they missed carry the previous average forward.";
  // Draw the highlighted line last so it sits on top.
  const drawOrder = [...series].sort(
    (a, b) =>
      Number(a.entry.key === highlight) - Number(b.entry.key === highlight),
  );

  return (
    <>
      <div className="section-heading">
        <h2>{title}</h2>
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

          {yTicks.map((tick) => (
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
                y={chartHeight - 6}
                textAnchor={index === 0 ? "start" : index === sessionCount ? "end" : "middle"}
              >
                {index === 0 ? "Start" : index}
              </text>
            ) : null,
          )}

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
        </svg>
        <div className="chart-legend">
          {series.map(({ color, entry }) => {
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
                <span className={`legend-value ${toneClass(value)}`}>
                  {value === null ? "unranked" : formatPercent(value)}
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
        <button
          className={
            state.kind === "confirm" && state.danger ? "danger" : "primary"
          }
          onClick={confirm}
        >
          {state.confirmLabel}
        </button>
        <button className="ghost" onClick={onClose}>
          Never mind
        </button>
      </div>
    </div>
  );
}
