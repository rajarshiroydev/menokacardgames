"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BlindsPill,
  BlindTimer,
  blindsLine,
  nextBlindsText,
  PotCard,
  SeatStrip,
  shortBlinds,
  StandingRow,
  StreetPips,
  WinnerSummary,
} from "@/components/game-parts";

import {
  activeIndexes,
  awardPots,
  cancelCurrentHand,
  bigBlindAtLevel,
  blindStatus,
  hasBlindClock,
  pauseBlindClock,
  resumeBlindClock,
  buyInPlayer,
  completedHandRecord,
  dealNewHand,
  DEFAULT_BLIND_SCHEDULE,
  editBlindSchedule,
  formatDate,
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
  undoableStreet,
  undoStreet,
  dealNextStreet,
  handContributions,
  nextBuyIn,
  nextPlayerToAct,
  pendingIndexes,
  pendingBlindPlan,
  isValidSmallBlind,
  smallBlindFor,
  STAGES,
  startingBigBlind,
  playerBuyIns,
  totalBuyIns,
  undoLastHand,
  lastHandNumber,
  recordHandResult,
  isShowdown,
  seatRole,
  seatStatusParts,
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
  takeBackRebuys,
  unplayedRebuys,
  upcomingBigBlinds,
} from "@/lib/poker/game";
import {
  LOG_LIMIT,
} from "@/lib/poker/action-log";
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
  withoutForgottenBackups,
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
  currencySymbol,
  formatChips,
  parseChips,
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

import { signOut, signOutEverywhere } from "@/app/auth/sign-in/actions";
import { emptyWhoWinsDraft, HandChecker } from "@/components/hand-checker";
import { NotificationBell } from "@/components/notification-bell";
import { ActionLog, savedActionLog } from "@/components/ledger/action-log";
import {
  ApiError,
  friendsApi,
  gameBackupApi,
  liveApi,
  needsRecentSignIn,
  playersApi,
  sessionsApi,
} from "@/components/ledger/api";
import { Avatar, toneClass } from "@/components/ledger/avatar";
import { SessionsView } from "@/components/ledger/games-view";
import { HomeView } from "@/components/ledger/home-view";
import {
  ClearIcon,
  InfinityIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  SplitIcon,
  TurnSeatsIcon,
  UndoIcon,
} from "@/components/ledger/icons";
import { ImportReview, LegacySessionReview } from "@/components/ledger/import-review";
import { InfoSheet } from "@/components/ledger/info-sheet";
import { type AskOptions, Modal, type ModalState } from "@/components/ledger/modal";
import {
  AvatarContext,
  buildAvatarLookup,
  ChipInput,
  ChipUnitContext,
  CurrencyContext,
  describeBlindSchedule,
  describePerChip,
  formatCents,
  GameAmounts,
  PriceInput,
  useMoney,
} from "@/components/ledger/money";
import { NewGameView } from "@/components/ledger/new-game-view";
import { profileStatsApi, ProfileView } from "@/components/ledger/profile-view";
import { RanksView } from "@/components/ledger/ranks-view";
import { Segmented } from "@/components/ledger/segmented";
import { savedLogs } from "@/components/ledger/session-card";
import { SettleUpSheet } from "@/components/ledger/settle-up-sheet";
import { LiveShareSheet } from "@/components/ledger/share-sheets";
import { SettingsView } from "@/components/settings-view";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  type AccountProfile,
} from "@/lib/accounts/identity-code";
import { DELETION_GRACE_PERIOD_DAYS } from "@/lib/accounts/lifecycle";
import {
  type GroupStandings,
} from "@/lib/friends/group-standings";
import {
  type FriendOverview,
} from "@/lib/friends/requests";
import { apiErrorMessage } from "@/lib/security/rate-limit-message";
import {
  standingsKey,
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
} from "@/lib/poker/import-plan";
import {
  MAX_CHIP_VALUE_CENTS,
  normalizeChipValue,
} from "@/lib/poker/settle-up";
import type {
  BlindSchedule,
  ChipValue,
  GameState,
  PlayerAction,
  PlayerProfile,
  PokerSession,
  RakeRules,
  RebuyRules,
  SavedActionLog,
  WinnerAnnouncement,
} from "@/lib/poker/types";

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

function readStoredLiveToken(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
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
  game.log = game.log.slice(0, LOG_LIMIT);
}

function recordWin(game: GameState, line: string) {
  game.log.unshift(line);
  game.log = game.log.slice(0, LOG_LIMIT);
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
  recordHandResult(game);
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
  const [sessionsHost, setSessionsHost] = useState("mine");
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
  // Games whose backup is being deleted (discarded or closed), so neither a
  // late update nor a list Home fetched meanwhile brings them back.
  const forgettingBackups = useRef(new Set<string>());
  // Only the newest list request may set Home's list.
  const backupListRequest = useRef(0);
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
    const request = ++backupListRequest.current;
    try {
      const data = await gameBackupApi<{ backups?: GameBackupSummary[] }>(
        "GET",
        { query: { deviceId: readDeviceId() } },
      );
      if (request !== backupListRequest.current) return;
      setGameBackups(
        withoutForgottenBackups(
          Array.isArray(data.backups) ? data.backups : [],
          forgettingBackups.current,
        ),
      );
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
      // Home's last game can be one played at a friend's table.
      if (nextView === "home" || nextView === "history" || nextView === "sessions") {
        void refreshGroups();
      }
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
      options: {
        replace?: boolean;
        setupKind?: "hands" | "ledger";
        /** Whose games Games opens on; your own unless a friend's is named. */
        sessionsHost?: string;
      } = {},
    ) => {
      setView(nextView);
      if (nextView !== "history") setRankFocus(null);
      if (nextView === "sessions") setSessionsHost(options.sessionsHost ?? "mine");
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
      if (forgettingBackups.current.has(gameBackupId(current))) {
        return backupSync.current.pending;
      }
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

  /**
   * A discarded or closed game's backup goes, after any update in flight.
   * Home leaves it out meanwhile, then checks again once the delete is done.
   */
  function forgetGameBackup(current: GameState) {
    const gameId = gameBackupId(current);
    forgettingBackups.current.add(gameId);
    setGameBackups((backups) =>
      withoutForgottenBackups(backups, forgettingBackups.current),
    );
    void backupSync.current.pending
      .then(() =>
        gameBackupApi("DELETE", {
          query: { gameId, deviceId: readDeviceId() },
        }),
      )
      .catch(() => {
        // It expires after 7 days; Home offers it until then.
      })
      .finally(() => {
        forgettingBackups.current.delete(gameId);
        void refreshGameBackups();
      });
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
    (
      message: string,
      confirmLabel: string,
      onConfirm: () => void,
      options: AskOptions = {},
    ) => {
      setModal({ kind: "confirm", message, confirmLabel, onConfirm, ...options });
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
      async () => {
        // The saved log carries on in the continued game. Without it,
        // saving would replace the saved log with only the new lines, so a
        // failed load stops here.
        let saved: SavedActionLog | null;
        try {
          saved = (
            await sessionsApi<{ log: SavedActionLog | null }>(
              `/${encodeURIComponent(id)}/log`,
            )
          ).log;
        } catch (error) {
          showToast(
            error instanceof Error ? error.message : "Couldn't load the game",
          );
          return;
        }
        setGame(
          gameFromSession(
            {
              ...session,
              sessionNumber: session.sessionNumber!,
              ...(saved ? { actionLog: saved } : {}),
            },
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
      // Loaded only when needed: the auth client's validation library probes
      // for eval, which the Content Security Policy reports on every load.
      const { authClient } = await import("@/lib/auth/client");
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

  /**
   * Before signing out on this device (user decision 2026-10-29): the game in
   * progress is backed up, then removed from the device with the live link,
   * so the next person on a shared phone finds nothing of this account. The
   * game comes back as an Unfinished game after signing in again. If the
   * backup can't be sent (offline), the game stays on the device rather than
   * being lost. Data from before accounts stays: it may exist nowhere else.
   */
  async function clearDeviceForSignOut() {
    let keepGame = false;
    if (game) {
      try {
        await gameBackupApi("PUT", {
          body: {
            gameId: gameBackupId(game),
            deviceId: readDeviceId(),
            state: game,
          },
        });
      } catch (error) {
        // Saved already, or carried on elsewhere: the copy here isn't needed.
        keepGame = !(
          error instanceof ApiError &&
          (error.code === "finished" || error.code === "moved")
        );
      }
    }
    try {
      if (!keepGame) window.localStorage.removeItem(gameStorageKey);
      window.localStorage.removeItem(liveTokenStorageKey);
    } catch {
      // Storage is blocked, so nothing was kept on the device.
    }
  }

  async function signOutHere() {
    await clearDeviceForSignOut();
    await signOut();
  }

  function confirmSignOutEverywhere() {
    setModal({
      kind: "confirm",
      danger: true,
      message: "Sign out of all devices?",
      points: [
        "You're signed out on every phone and browser, this one included.",
        "Sign in again with an email link on each device you use.",
      ],
      confirmLabel: "Sign Out Everywhere",
      onConfirm: () => {
        void (async () => {
          await clearDeviceForSignOut();
          const result = await signOutEverywhere();
          if (result?.error) showToast(result.error);
        })();
      },
    });
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
      // Amounts are typed as the total for the street, so the messages
      // name totals too.
      if (chips > player.stack) {
        showToast(
          `The most is ${money(hand.committed[playerIndex] + player.stack)} (all in)`,
        );
        return;
      }
      const minimum = minimumRaise(next, playerIndex);
      if (chips < minimum && chips < player.stack) {
        showToast(`Minimum is ${money(hand.committed[playerIndex] + minimum)}`);
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
    if (!dealNextStreet(next)) return;
    setGame(next);
  }

  function undoNextStreet() {
    if (!game?.hand) return;
    const next = structuredClone(game);
    const street = undoableStreet(next);
    if (!street || !undoStreet(next)) return;
    setLastTurn(null);
    setGame(next);
    showToast(`${titleCase(street.toLowerCase())} taken back`);
  }

  // No confirmation: the winner is tapped first, then awarded with a
  // separate button that names them and the amount.
  function pickWinner(playerIndex: number) {
    if (!game?.hand) return;
    const next = structuredClone(game);
    awardPot(next, playerIndex);
    setGame(next);
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
    recordHandResult(next);
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
    // A short question as the title, with the facts as points under it, like
    // the hand-by-hand save.
    const bought = session.results.reduce(
      (sum, result) =>
        sum +
        (result.buyIns ?? [session.startStack]).reduce((all, chips) => all + chips, 0),
      0,
    );
    ask("Save this game?", "Save game", () => void saveLedgerSession(session), {
      points: [
        `${session.results.length} players, ${money(bought)} bought in`,
        "Goes to Games and counts towards the standings",
      ],
    });
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
    ask(`Undo hand ${lastHandNumber(game)}?`, "Undo hand", () => {
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

  /**
   * Saves the game, or `saving`: a copy of it with unplayed rebuys taken
   * back at the host's choice (endSession).
   */
  async function finishSession(
    completedHands: number,
    saving: GameState | null = game,
  ) {
    // The game as it is saved; the one on screen is left alone until then.
    const game = saving;
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
      actionLog: savedActionLog(game),
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
      savedLogs.delete(session.id);
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
    // A short question as the title, with the facts as points under it.
    const hands = (count: number) => `${count} hand${count === 1 ? "" : "s"}`;
    const label = game.sessionLabel || "the saved game";
    const message = game.continues ? `Save ${label}?` : "Save this game?";
    const points = game.continues
      ? [
          `${newHands} more ${newHands === 1 ? "hand" : "hands"} played, ${completedHands} in all`,
          `Updates ${label} and the standings`,
        ]
      : [
          `${hands(completedHands)} played`,
          "Goes to Games and counts towards the standings",
        ];
    // Rebuys nobody played with (rare): the host chooses, for each, whether
    // the saved game keeps them.
    const unplayed = unplayedRebuys(game);
    if (unplayed.length) {
      setModal({
        kind: "confirm",
        message,
        points,
        confirmLabel: "Save session",
        onConfirm: () => {},
        rebuys: {
          items: unplayed.map(({ playerIndex, amounts }) => ({
            playerIndex,
            playerId: game.players[playerIndex].id,
            name: game.players[playerIndex].name,
            amount: money(amounts.reduce((sum, amount) => sum + amount, 0)),
            count: amounts.length,
          })),
          onSave: (takeBack) => {
            if (!takeBack.length) {
              void finishSession(completedHands);
              return;
            }
            const saving = structuredClone(game);
            takeBackRebuys(saving, takeBack, money);
            void finishSession(completedHands, saving);
          },
        },
      });
      return;
    }
    ask(message, "Save session", () => void finishSession(completedHands), {
      points,
    });
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
      [
        JSON.stringify(
          {
            exported: Date.now(),
            // Whether a game has a log is read-side only; logs aren't exported.
            sessions: history.map((session) => {
              const exported = { ...session };
              delete exported.hasActionLog;
              return exported;
            }),
          },
          null,
          2,
        ),
      ],
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
      groups={groups}
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
      onSessions={(host) => navigate("sessions", { sessionsHost: host })}
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
            focusKey={rankFocus}
            loading={historyLoading}
            error={historyError}
            onRetry={() => void refreshHistory()}
          />
        ) : view === "sessions" ? (
          <SessionsView
            key={sessionsHost}
            initialHost={sessionsHost}
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
            onSignOut={() => void signOutHere()}
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
          <SettingsView
            email={accountEmail}
            onSignOut={() => void signOutHere()}
            onSignOutEverywhere={confirmSignOutEverywhere}
            onDeleteAccount={deleteAccount}
          />
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
            onUndoStreet={undoNextStreet}
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
  onUndoStreet: () => void;
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
  const blindNote = !blinds.schedule
    ? ""
    : nextBlindsText(
        {
          smallBlind: blinds.nextSmallBlind,
          bigBlind: blinds.nextBigBlind,
          dueNow: blinds.dueNow,
          ...(blinds.schedule.unit === "hands"
            ? { handsLeft: blinds.handsLeft }
            : { msLeft: blinds.msLeft }),
        },
        money,
      );
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
    <BlindTimer
      text={blinds.schedule && !pendingPlan ? blindNote : ""}
      due={blinds.dueNow}
      paused={blinds.paused}
    >
      {pendingPlan ? (
        <div className={`blind-timer due ${blinds.paused ? "paused" : ""}`}>
          {pausedNote}From hand {pendingPlan.effectiveHand}:{" "}
          {describeBlindSchedule(pendingPlan.schedule, currency, unit)}
        </div>
      ) : null}
      {clockButton}
    </BlindTimer>
  );
  const blindsDisplay = (
    <BlindsPill
      smallBlind={money(blinds.smallBlind)}
      bigBlind={money(blinds.bigBlind)}
      level={blinds.schedule ? blinds.level : undefined}
    >
      {game.bigBlindAnte ? (
        <span className="muted small-note">
          Big blind ante {money(blinds.bigBlind)}
        </span>
      ) : null}
      {blindSchedule}
    </BlindsPill>
  );

  // The blinds on one line, for the middle of the table and the List view's
  // pot card alike.
  const blindsText = blindsLine(
    {
      smallBlind: blinds.smallBlind,
      bigBlind: blinds.bigBlind,
      ante: Boolean(game.bigBlindAnte),
      level: blinds.schedule ? blinds.level : undefined,
    },
    money,
  );

  const lastStage = STAGES.length - 1;
  const pending = hand ? pendingIndexes(game).length > 0 : false;
  const standings = game.players
    .map((player, index) => ({ player, index }))
    .sort((a, b) => b.player.stack - a.player.stack);
  // When a round has just closed, the player whose action closed it keeps an
  // open (locked) card until the next street is dealt, so nothing above the
  // Deal button changes height and the button stays under the same finger.
  const closer =
    hand && !hand.splitSel && hand.stage < lastStage && !pending
      ? hand.last.findIndex((action) => action?.line === game.log[0])
      : -1;
  const rowOrder = hand ? listOrder(game, closer) : [];
  const rowRef = useTurnShift(rowOrder);
  // The player with the action card: the one to act, or the one whose
  // action just closed the round. Everyone else is a tile above it.
  const lead = closer >= 0 ? closer : (hand?.currentPlayer ?? null);
  const waiting = rowOrder.filter((playerIndex) => playerIndex !== lead);

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
          blindsText={blindsText}
          blindSchedule={blinds.schedule || pendingPlan ? blindSchedule : null}
          {...props}
        />
      ) : (
        <>
          {/* The same as the middle of the table: the streets as small
              bars, "Pot · Turn", the pot and the blinds. */}
          <PotCard
            stage={hand.stage}
            showdown={isShowdown(game)}
            label={potCardLabel(game)}
            pot={money(hand.pot)}
            breakdown={<PotBreakdown game={game} className="table-sidepots" />}
            blinds={blindsText}
            timer={blinds.schedule || pendingPlan ? blindSchedule : null}
          />

          {/* Everyone not acting, in the order they act next, as strips
              above the action card, so the buttons sit right under it as in
              the Table view. */}
          {waiting.length ? (
            <div className="glass waiting-list">
              {waiting.map((playerIndex) => (
                // The wrapper keeps its place in the DOM across turns, so
                // it can move from its old spot.
                <div
                  className="player-slot"
                  key={playerIndex}
                  ref={rowRef(playerIndex)}
                >
                  <WaitingStrip
                    game={game}
                    playerIndex={playerIndex}
                    flash={flashFor(game, props.lastTurn, playerIndex)}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {lead !== null ? (
            <PlayerRow
              key={`${hand.no}-${hand.stage}-${lead}-${hand.acted[lead]}`}
              game={game}
              playerIndex={lead}
              roundClosed={lead === closer}
              flash={flashFor(game, props.lastTurn, lead)}
              onAct={props.onAct}
            />
          ) : null}
          {/* A split keeps the player rows above it, like a side pot's. As
              in the Table view, the winner is picked once the river betting
              is over, not while it is still going. */}
          {hand.splitSel ? (
            <SplitView
              game={game}
              onToggle={props.onToggleSplit}
              onSplit={props.onSplitPot}
              onBack={props.onEndSplit}
            />
          ) : hand.stage < lastStage || pending ? null : hasSidePots(game) ? (
            <SidePotPicker
              key={hand.no}
              game={game}
              onAward={props.onAwardPots}
            />
          ) : (
            <WinnerPicker
              game={game}
              onPickWinner={props.onPickWinner}
              onBeginSplit={props.onBeginSplit}
            />
          )}
          {/* Always there from the deal to the showdown, faded when it
              can't be used, so it never jumps into place or leaves a gap. */}
          <DealButton game={game} onDeal={props.onNextStage} />
          <BuyInOptions game={game} onBuyIn={props.onBuyIn} />
          <UndoTurnButton
            game={game}
            tall
            onUndo={props.onUndoAction}
            onUndoStreet={props.onUndoStreet}
          />
          <HandButtons
            game={game}
            onUndoHand={props.onUndoHand}
            onCancelHand={props.onCancelHand}
          />
        </>
      )}

      <section className="glass card session-standings">
        <h2 className="card-title">Session Standings</h2>
        {game.rakeRules ? (
          <p className="muted small-note">
            {describeRakeRules(game.rakeRules, money)} · house has taken{" "}
            {money(game.rake ?? 0)}
          </p>
        ) : null}
        <div className="rows">
          {standings.map(({ player, index }, rank) => (
            <StandingRow
              key={index}
              rank={rank + 1}
              name={player.name}
              note={`${player.left ? "Cashed out · " : ""}${standingBuyIns(game, index, money)}`}
              stack={money(player.stack)}
              net={signedMoney(net(index))}
              netTone={toneClass(net(index))}
            />
          ))}
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
      </section>

      <button className="cta" type="button" onClick={props.onEndSession}>
        Finish And Save Session
      </button>
      {/* During a hand Undo hand sits beside Cancel hand instead. */}
      <div className={hand ? "" : "button-pair"}>
        {hand ? null : (
          <UndoHandButton game={game} onUndoHand={props.onUndoHand} />
        )}
        <button
          className={`glass-button danger-text ${hand ? "full" : ""}`}
          type="button"
          onClick={props.onDiscard}
        >
          Discard game
        </button>
      </div>

      {game.log.length ? (
        <section className="glass card">
          <h2 className="card-title">Action Log</h2>
          <ActionLog
            lines={game.log}
            players={game.players}
            liveHand={hand?.no ?? null}
          />
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
                      After {player.name}
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

function BuyInOptions({
  game,
  onBuyIn,
}: {
  game: GameState;
  onBuyIn: (playerIndex: number) => void;
}) {
  const { money } = useMoney();
  const hand = game.hand;
  // Hidden while a pot is being split, so the screen stays on the split.
  if (hand?.splitSel) return null;
  const offers = game.players.flatMap((player, index) => {
    const amount = nextBuyIn(game, index);
    return amount === null ? [] : [{ player, index, amount }];
  });
  // Busted players the host's rebuy limits stop, with the reason. During a
  // hand only those who were bust when it was dealt; a player who went all
  // in this hand is still in it.
  const blocked = game.players.flatMap((player, index) => {
    if (hand && (hand.in[index] || (hand.stacksBeforeHand[index] ?? 0) > 0)) {
      return [];
    }
    const reason = player.stack === 0 ? rebuyBlockReason(game, index) : null;
    return reason ? [{ player, index, reason }] : [];
  });
  if (!offers.length && !blocked.length) return null;
  const rules = describeRebuyRules(game.rebuyRules, chipCurrency(game.currency, game.chipValue), game.chipUnit);

  // During a hand it is its own card, in the same place in List and Table
  // view (above Undo), so a buy-in is always found in one spot.
  return (
    <div className={`buy-in-options ${hand ? "glass card" : ""}`}>
      <span className="label">Buy in</span>
      <p className="muted small-note">
        {game.customBuyIns
          ? `A busted player can buy back in for any amount, usually ${money(game.startStack)}.`
          : "A busted player can buy back in for the starting stack."}
        {rules ? ` ${rules}.` : ""}
        {hand ? " They sit out this hand and play from the next one." : ""}
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

function WinnerPicker({
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
  onUndoStreet,
  onBuyIn,
  onNextStage,
  onPickWinner,
  onBeginSplit,
  onEndSplit,
  onToggleSplit,
  onSplitPot,
  onAwardPots,
  onCancelHand,
  onUndoHand,
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
  const showdown = isShowdown(game);
  const splitting = Boolean(hand.splitSel);
  // With side pots the winners are picked per pot on the card below.
  const multiPot = showdown && hasSidePots(game);
  const crowded = count > 6;
  const current = hand.currentPlayer;
  // Like the List view: when a round has just closed, the player whose
  // action closed it keeps a locked card in the dock until the next street
  // is dealt, so the Deal button under it stays where the betting buttons
  // were.
  const closer =
    !splitting && hand.stage < lastStage && !pending
      ? hand.last.findIndex((action) => action?.line === game.log[0])
      : -1;
  // A player bust at the deal can buy in by tapping their seat.

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
          <StreetPips stage={hand.stage} showdown={showdown} />
          <span className="table-label">{potCardLabel(game)}</span>
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
          const status = isTurn ? "To act" : shortBlinds(seatStatus(game, index, money));
          const state = [
            folded ? "folded" : "",
            isTurn ? "turn" : "",
            contender ? (inSplit ? "in-split" : "contender") : "",
            flash ? "just-acted" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            // Seats only show the table (user decision 2026-10-27): the
            // winner is picked and buy-ins made on the cards under it.
            <div
              className={`table-seat ${state}`}
              key={player.id || index}
              role="group"
              aria-label={`${player.name}, ${money(player.stack)}, ${status}`}
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
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
                {/* The whole chosen name, never cut: long names wrap and step down a size. */}
                <b data-length={nameLength(player.name)}>{player.name}</b>
                <span className="table-seat-stack">{money(player.stack)}</span>
                <small>{status}</small>
              </span>
            </div>
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
      ) : closer >= 0 ? (
        <PlayerRow
          key={`${hand.no}-${hand.stage}-${closer}-closed`}
          game={game}
          playerIndex={closer}
          dock
          roundClosed
          onAct={onAct}
        />
      ) : null}

      {/* Always there from the deal to the showdown, faded when it can't be
          used, so it never jumps into place or leaves a gap. */}
      <DealButton game={game} onDeal={onNextStage} />
      <BuyInOptions game={game} onBuyIn={onBuyIn} />
      <UndoTurnButton
        game={game}
        tall
        onUndo={onUndoAction}
        onUndoStreet={onUndoStreet}
      />
      <HandButtons
        game={game}
        onUndoHand={onUndoHand}
        onCancelHand={onCancelHand}
      />
    </>
  );
}

/**
 * What the pot says above its amount, in both views: the street while it's
 * bet, then what the showdown needs.
 */
function potCardLabel(game: GameState) {
  const hand = game.hand;
  if (!hand) return "";
  if (!isShowdown(game)) return `Pot · ${STAGES[hand.stage]}`;
  if (hasSidePots(game) && potsFor(game).pots.length > 1) {
    return "Pick the winners";
  }
  return hand.splitSel ? "Split the pot" : "Pick the winner";
}

/**
 * What a player put in, for the standings: their own starting buy-in, then
 * any rebuys together ("Start ₹10,000 · Buy-ins ₹20,000").
 */
function standingBuyIns(
  game: GameState,
  playerIndex: number,
  money: (value: number) => string,
) {
  const [start = 0, ...rebuys] = playerBuyIns(game, playerIndex);
  const more = rebuys.reduce((total, amount) => total + amount, 0);
  return more > 0
    ? `Start ${money(start)} · Buy-ins ${money(more)}`
    : `Start ${money(start)}`;
}

/**
 * Takes back the last completed hand, named by its number ("Undo hand 23"),
 * greyed when there is none to undo.
 */
function UndoHandButton({
  game,
  onUndoHand,
  tall = false,
}: {
  game: GameState;
  onUndoHand: () => void;
  tall?: boolean;
}) {
  const undoable = lastHandNumber(game);
  return (
    <button
      className={`glass-button ${tall ? "tall" : ""}`}
      type="button"
      disabled={undoable === null}
      onClick={onUndoHand}
    >
      {undoable === null ? "Undo hand" : `Undo hand ${undoable}`}
    </button>
  );
}

/**
 * During a hand, in both views: undo the last hand beside cancelling this
 * one, each named by its number.
 */
function HandButtons({
  game,
  onUndoHand,
  onCancelHand,
}: {
  game: GameState;
  onUndoHand: () => void;
  onCancelHand: () => void;
}) {
  return (
    <div className="button-pair">
      <UndoHandButton game={game} onUndoHand={onUndoHand} tall />
      <button
        className="glass-button tall danger-text"
        type="button"
        onClick={onCancelHand}
      >
        Cancel hand {game.hand?.no}
      </button>
    </div>
  );
}

/**
 * Deals the next street, in both views. It stays from the deal to the
 * showdown, greyed while the street is being bet, while a pot is being split
 * and once the river is out ("River dealt").
 */
function DealButton({ game, onDeal }: { game: GameState; onDeal: () => void }) {
  const hand = game.hand;
  if (!hand) return null;
  const lastStage = STAGES.length - 1;
  const pending = pendingIndexes(game).length > 0;
  return (
    <button
      className="blue-button full tall"
      type="button"
      disabled={Boolean(hand.splitSel) || pending || hand.stage >= lastStage}
      onClick={onDeal}
    >
      {hand.stage < lastStage
        ? `Deal ${STAGES[hand.stage + 1]}`
        : `${STAGES[lastStage]} dealt`}
    </button>
  );
}

/**
 * One Undo for the live hand, in both views: it takes back the latest action
 * this street and names it, like "Undo Asha's call". Before anyone acts on a
 * new street it takes back the street ("Undo Flop"), so a whole hand can be
 * stepped back to the first preflop action. Greyed while a pot is being split
 * or before anyone has acted.
 */
function UndoTurnButton({
  game,
  tall = false,
  onUndo,
  onUndoStreet,
}: {
  game: GameState;
  tall?: boolean;
  onUndo: (playerIndex: number) => void;
  onUndoStreet: () => void;
}) {
  const className = `glass-button full ${tall ? "tall " : ""}undo-turn`;
  const street = game.hand?.splitSel ? null : undoableStreet(game);
  if (street) {
    return (
      <button className={className} type="button" onClick={onUndoStreet}>
        <UndoIcon />
        Undo {titleCase(street.toLowerCase())}
      </button>
    );
  }
  const seat = game.hand?.splitSel ? null : latestActor(game);
  const action = seat === null ? null : game.hand?.last[seat];
  // With nothing to undo it stays, greyed, so the buttons under it don't
  // move.
  if (seat === null || !action) {
    return (
      <button className={className} type="button" disabled>
        <UndoIcon />
        Undo
      </button>
    );
  }
  // First name only, unless another player shares it ("Arjun S.").
  const name = game.players[seat].name;
  const first = name.split(" ")[0];
  const shared = game.players.some(
    (player, index) => index !== seat && player.name.split(" ")[0] === first,
  );
  return (
    <button
      className={className}
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
  const { label, amount } = seatStatusParts(game, playerIndex);
  return amount === undefined ? label : `${label} ${money(amount)}`;
}

function nameLength(name: string): "long" | "longer" | undefined {
  if (name.length > 28) return "longer";
  if (name.length > 14) return "long";
  return undefined;
}

/**
 * The List view's player order. The player to act, or the one whose action
 * just closed the round, comes first, so the action card always sits in the
 * same place under the pot; the others still in follow in turn order from
 * them, then those who folded, in seat order. With nobody to act (the
 * showdown) it is seat order.
 */
function listOrder(game: GameState, closer: number) {
  const hand = game.hand;
  if (!hand) return [];
  const lead = closer >= 0 ? closer : (hand.currentPlayer ?? -1);
  const count = game.players.length;
  const fromLead = Array.from(
    { length: count },
    (_, offset) => (Math.max(lead, 0) + offset) % count,
  );
  return [
    // A closing fold keeps its place until the next street.
    ...fromLead.filter((index) => hand.in[index] || index === lead),
    ...game.players
      .map((_, index) => index)
      .filter(
        (index) =>
          !hand.in[index] && index !== lead && !game.players[index].left,
      ),
  ];
}

/**
 * When the turn order moves on, the waiting players' tiles move from where
 * they were to their new place, each one step nearer their turn. The new
 * action card is left to its own slide-in, and the tile of the player who
 * just left the action card rises into its place from one tile below.
 * Positions are measured within the grid, so scrolling in between doesn't
 * count; nothing moves under reduced motion.
 */
function useTurnShift(order: number[]) {
  const nodes = useRef(new Map<number, HTMLElement>());
  const places = useRef(new Map<number, { left: number; top: number }>());
  const lastOrder = useRef<number[]>([]);
  const orderKey = order.join(",");

  useLayoutEffect(() => {
    const previous = lastOrder.current;
    const moved = previous.length > 0 && previous.join(",") !== orderKey;
    lastOrder.current = order;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const easing = "cubic-bezier(0.2, 0, 0, 1)";
    const next = new Map<number, { left: number; top: number }>();
    nodes.current.forEach((node, id) => {
      const now = { left: node.offsetLeft, top: node.offsetTop };
      next.set(id, now);
      if (!moved || still || id === order[0]) return;
      // The player who just left the action card has no old tile: theirs
      // rises into its place from one tile below.
      if (id === previous[0]) {
        const gap = parseFloat(getComputedStyle(node.parentElement!).rowGap);
        const below = node.offsetHeight + (Number.isNaN(gap) ? 0 : gap);
        node.animate(
          [
            { transform: `translateY(${below}px)`, opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 240, easing },
        );
        return;
      }
      const before = places.current.get(id);
      if (!before || (before.left === now.left && before.top === now.top)) {
        return;
      }
      node.animate(
        [
          {
            transform: `translate(${before.left - now.left}px, ${before.top - now.top}px)`,
          },
          { transform: "none" },
        ],
        { duration: 240, easing },
      );
    });
    places.current = next;
  });

  return (id: number) => (node: HTMLDivElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };
}

/**
 * A waiting player in the List view: the avatar, and beside it the name
 * over three boxes like the action card's, for the stack, what's in this hand and the status. An
 * amount in the status is the box's value, under its words ("Raised to",
 * "₹1,200"), so long statuses still fit.
 */
function WaitingStrip({
  game,
  playerIndex,
  flash,
}: {
  game: GameState;
  playerIndex: number;
  flash?: number;
}) {
  const { money } = useMoney();
  const hand = game.hand;
  if (!hand) return null;
  const player = game.players[playerIndex];
  const status = seatStatusParts(game, playerIndex);
  return (
    <SeatStrip
      avatar={
        <Avatar
          name={player.name}
          playerId={player.id}
          role={seatRole(game, playerIndex)}
          size="small"
        />
      }
      name={player.name}
      folded={!hand.in[playerIndex]}
      stack={{ label: "Stack", value: money(player.stack) }}
      inHand={{
        label: "In hand",
        value: money(handContributions(game)[playerIndex]),
      }}
      status={
        status.amount === undefined
          ? { label: "Status", value: status.label }
          : { label: shortBlinds(status.label), value: money(status.amount) }
      }
      flash={flash}
    />
  );
}

function PlayerRow({
  game,
  playerIndex,
  onAct,
  roundClosed = false,
  dock = false,
  flash,
}: {
  game: GameState;
  playerIndex: number;
  onAct: GameViewProps["onAct"];
  /** This player's action closed the round; keep the card open but locked. */
  roundClosed?: boolean;
  /** Set while this player's action is the latest; its status flashes. */
  flash?: number;
  /** The table's action dock under the oval, which names who is to act. */
  dock?: boolean;
}) {
  const { money, symbol, unit } = useMoney();
  // What is typed, in the game's unit ("0.75" in a cents game): the total
  // this player's bet reaches this street, like "raise to 300".
  const [amount, setAmount] = useState("");
  // The quick size last tapped and the amount it set; it stays highlighted
  // only while the amount is unchanged, so typing clears it.
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
  // The box, the quick sizes and the button all speak in the total the bet
  // reaches this street ("raise to 1,300"); chips to put in now are worked
  // out from it.
  const raising = hand.roundHigh > 0;
  const hasAmount = amount.trim() !== "";
  // Text that isn't an amount (like "1.234" in cents) bets nothing, which
  // disables the bet button. With nothing typed the button offers the minimum.
  const betAmount = hasAmount
    ? (parseChips(amount, unit) ?? 0) - committed
    : Math.min(minimum, player.stack);
  const allIn = betAmount >= player.stack;
  const role = seatRole(game, playerIndex);
  // Everything this player has put in this hand, blinds and ante included,
  // since players ask for the hand's total more than this street's.
  const inHand = handContributions(game)[playerIndex];
  // The stack on its own line, larger, with the hand's total under it.
  const stackLine = (
    <>
      <b className="seat-stack-inline">{money(player.stack)}</b>
      {money(inHand)} in hand
    </>
  );
  // The stack and the hand's total as two tiles, above the amount box.
  const moneyStats = (
    <div className="bet-stats">
      <div className="bet-stat">
        <span>Stack</span>
        <b>{money(player.stack)}</b>
      </div>
      <div className="bet-stat">
        <span>In this hand</span>
        <b>{money(inHand)}</b>
      </div>
    </div>
  );

  if (roundClosed) {
    // The status sits on the right of the name, as on the other rows, so
    // the card is as tall as the betting card. In the dock the seat on the
    // table already shows it.
    return (
      <div className={`glass seat-card round-closed ${dock ? "dock" : ""}`}>
        <div className="seat-main">
          <Avatar name={player.name} playerId={player.id} role={role} />
          <div className="seat-copy">
            <b>{player.name}</b>
          </div>
          {dock ? null : (
            <span
              className={`status-pill ${flash ? "just-acted" : ""}`}
              key={flash ?? "status"}
            >
              {seatStatus(game, playerIndex, money)}
            </span>
          )}
        </div>
        <div className="bet-panel" aria-hidden="true" inert>
          {moneyStats}
          <div className="bet-input">
            <span className="bet-input-caption">Round complete</span>
            <span className="bet-input-box">
              <span className="bet-input-symbol">{symbol.trim()}</span>
              <input type="text" disabled />
              <PencilIcon />
            </span>
          </div>
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
        </div>
      </div>
    );
  }

  if (folded || done || !isTurn) {
    // Buy-ins are on the Buy in card, not here.
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
          <b>{player.name}</b>
        </div>
      </div>
      <div className="bet-panel">
        {moneyStats}
        {/* To call and the minimum live on the Call and Raise buttons, so
            they aren't repeated here. */}
        {raiseClosed ? null : (
          // Not a <label>: it holds the i button, which a label would
          // take as its control.
          <div className="bet-input">
            <span className="bet-input-caption">
              {raising ? "Raise to" : "Bet"}
              <button
                className="info-button inline"
                type="button"
                aria-label="About the raise amount"
                onClick={() => setShowRaiseHelp(true)}
              >
                i
              </button>
            </span>
            {/* Empty until something is typed or a quick size is tapped,
                so it never shows a figure nobody chose. */}
            <span className="bet-input-box">
              <span className="bet-input-symbol">{symbol.trim()}</span>
              <input
                type="text"
                inputMode={unit === "cents" ? "decimal" : "numeric"}
                autoComplete="off"
                aria-label={raising ? "Raise to" : "Bet amount"}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              {/* With an amount in, the pencil becomes a clear button,
                  which also turns Fold and Check or Call back on. */}
              {hasAmount ? (
                <button
                  className="bet-input-clear"
                  type="button"
                  aria-label="Clear amount"
                  onClick={() => setAmount("")}
                >
                  <ClearIcon />
                </button>
              ) : (
                <PencilIcon />
              )}
            </span>
          </div>
        )}
        {showRaiseHelp ? (
          <RaiseHelp game={game} onClose={() => setShowRaiseHelp(false)} />
        ) : null}
        {raiseClosed ? (
          <p className="raise-closed">
            Short all-in: call or fold. It was less than a full raise, so
            betting isn&apos;t reopened for you.
          </p>
        ) : (
          <>
            <div className="quick-sizes">
              {quickSizes.map((size) => {
                const sizeAmount = chipsToInput(committed + size.value, unit);
                const selected =
                  picked?.label === size.label && picked.amount === amount;
                return (
                  <button
                    key={size.label}
                    type="button"
                    className={selected ? "selected" : undefined}
                    aria-pressed={selected}
                    // Tapping the highlighted size again clears it and the
                    // amount, like the clear button.
                    onClick={() => {
                      if (selected) {
                        setAmount("");
                        setPicked(null);
                        return;
                      }
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
        )}
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
