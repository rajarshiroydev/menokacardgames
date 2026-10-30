"use client";

import {
  ChangeEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";


import {
  activeIndexes,
  awardPots,
  cancelCurrentHand,
  pauseBlindClock,
  resumeBlindClock,
  buyInPlayer,
  completedHandRecord,
  dealNewHand,
  editBlindSchedule,
  formatDate,
  payablePots,
  normalizeRakeRules,
  potLabel,
  resolvePotWinners,
  splitShares,
  takeRake,
  applyRaiseRules,
  mayRaise,
  minimumRaise,
  undoRaiseRules,
  undoableStreet,
  undoStreet,
  dealNextStreet,
  nextBuyIn,
  nextPlayerToAct,
  pendingIndexes,
  isValidSmallBlind,
  smallBlindFor,
  STAGES,
  startingBigBlind,
  totalBuyIns,
  undoLastHand,
  lastHandNumber,
  recordHandResult,
  editRebuyRules,
  cashOutPlayer,
  joinGame,
  returnToTable,
  savedPlayerRecord,
  takeBackRebuys,
  unplayedRebuys,
} from "@/lib/poker/game";
import {
  LOG_LIMIT,
} from "@/lib/poker/action-log";
import {
  isValidBuyIn,
  normalizeRebuyRules,
} from "@/lib/poker/buy-ins";
import { gameFromSession } from "@/lib/poker/continue-session";
import {
  createLedgerGame,
  isLedgerGame,
  ledgerBuyIn,
  ledgerCashOut,
  ledgerJoin,
  ledgerReturn,
  ledgerSession,
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
  type ChipUnit,
  chipCurrency,
  formatChips,
} from "@/lib/poker/money";
import {
  accountGameStorageKey,
  readDeviceId,
  accountLiveTokenStorageKey,
  LEGACY_GAME_STORAGE_KEY,
  LEGACY_HISTORY_STORAGE_KEY,
  prepareLegacySessionsForAdoption,
  readHandLayout,
  readTurnSound,
  storeHandLayout,
  type HandLayout,
} from "@/lib/poker/storage";
import { playTurnSound } from "@/lib/turn-sound";
import { useRouter } from "next/navigation";

import { signOut, signOutEverywhere } from "@/app/auth/sign-in/actions";
import { emptyWhoWinsDraft, HandChecker } from "@/components/hand-checker";
import { NotificationBell } from "@/components/notification-bell";
import { savedActionLog } from "@/components/ledger/action-log";
import {
  ApiError,
  friendsApi,
  gameBackupApi,
  liveApi,
  needsRecentSignIn,
  playersApi,
  sessionsApi,
} from "@/components/ledger/api";
import {
  BuyInSheet,
  CashOutSheet,
  JoinGameSheet,
} from "@/components/ledger/buy-in-sheets";
import { BlindEditor, RebuyEditor } from "@/components/ledger/game-editors";
import { GameView } from "@/components/ledger/game-screen";
import type { LastTurn } from "@/components/ledger/game-shared";
import { SessionsView } from "@/components/ledger/games-view";
import { titleCase } from "@/components/ledger/hand-buttons";
import { PokerHandsChart } from "@/components/ledger/hand-rankings";
import { HomeView } from "@/components/ledger/home-view";
import { ImportReview, LegacySessionReview } from "@/components/ledger/import-review";
import { LedgerCashOutSheet, LedgerView } from "@/components/ledger/ledger-screen";
import { type AskOptions, Modal, type ModalState } from "@/components/ledger/modal";
import {
  AvatarContext,
  buildAvatarLookup,
  CurrencyContext,
  GameAmounts,
} from "@/components/ledger/money";
import { NewGameView } from "@/components/ledger/new-game-view";
import { WinnerCard } from "@/components/ledger/pot-winners";
import { profileStatsApi, ProfileView } from "@/components/ledger/profile-view";
import { RanksView } from "@/components/ledger/ranks-view";
import { savedLogs } from "@/components/ledger/session-card";
import { SettleUpSheet } from "@/components/ledger/settle-up-sheet";
import { SetupView } from "@/components/ledger/setup-view";
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

  /**
   * Saving or discarding the game ends its live link, also one shared from
   * another device before the game moved here: this device then has no
   * token, but the account has only one link, so the request always goes
   * (found 2026-10-30; before, such a link stayed up until it expired).
   */
  function endLiveSharing() {
    if (liveToken) {
      rememberLiveToken(null);
      setSharingLive(false);
    }
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

