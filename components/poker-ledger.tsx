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
  activeIndexes,
  belongsToHand,
  bigBlindAtLevel,
  betStops,
  blindStatus,
  buyInPlayer,
  completedHandRecord,
  dealNewHand,
  DEFAULT_BLIND_SCHEDULE,
  editBlindSchedule,
  formatDate,
  formatPercent,
  formatRupees,
  applyRaiseRules,
  mayRaise,
  minimumRaise,
  undoRaiseRules,
  nextBuyIn,
  nextPlayerToAct,
  pendingIndexes,
  pendingBlindPlan,
  resetRaiseRules,
  returnToBetweenHands,
  smallBlindFor,
  STAGES,
  startingBigBlind,
  totalBuyIns,
  undoLastHand,
} from "@/lib/poker/game";
import {
  accountGameStorageKey,
  LEGACY_GAME_STORAGE_KEY,
  LEGACY_HISTORY_STORAGE_KEY,
  prepareLegacySessionsForAdoption,
} from "@/lib/poker/storage";
import { useRouter } from "next/navigation";

import { signOut } from "@/app/auth/sign-in/actions";
import { DELETION_GRACE_PERIOD_DAYS } from "@/lib/accounts/lifecycle";
import { authClient } from "@/lib/auth/client";
import { apiErrorMessage } from "@/lib/security/rate-limit-message";
import {
  RECENT_SIGN_IN_REQUIRED,
  RECENT_SIGN_IN_WINDOW_MS,
} from "@/lib/auth/recent-sign-in";
import {
  buildStandings,
  type IneligibleReason,
  type Standings,
} from "@/lib/poker/standings";
import {
  planImport,
  sessionsInBackup,
  type ImportPlan,
  type ImportPlayerMapping,
} from "@/lib/poker/import-plan";
import type {
  BlindSchedule,
  GameState,
  PlayerAction,
  PlayerProfile,
  PokerSession,
  WinnerAnnouncement,
} from "@/lib/poker/types";
import { applyTheme, currentTheme, type Theme } from "@/lib/theme";

type View =
  | "home"
  | "setup"
  | "game"
  | "history"
  | "sessions"
  | "players"
  | "hands";
const VIEWS: readonly View[] = [
  "home",
  "setup",
  "game",
  "history",
  "sessions",
  "players",
  "hands",
];
type ModalState =
  | {
      kind: "rules";
    }
  | {
      kind: "confirm";
      message: string;
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

function describeBlindSchedule(schedule: BlindSchedule | null) {
  if (!schedule) return "Fixed blinds";
  const interval = `${schedule.every} ${schedule.unit === "hands"
    ? schedule.every === 1 ? "hand" : "hands"
    : schedule.every === 1 ? "minute" : "minutes"}`;
  return schedule.raiseType === "add"
    ? `Add ${formatRupees(schedule.raiseBy)} to the big blind every ${interval}`
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
  if (!hand) return 0;
  const pot = hand.pot;
  game.players[playerIndex].stack += pot;
  recordWin(
    game,
    `Hand ${hand.no}: ${game.players[playerIndex].name} wins ${formatRupees(
      pot,
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
  return pot;
}

export function PokerLedger({
  accountId,
  accountEmail,
}: {
  accountId: string;
  accountEmail: string;
}) {
  const router = useRouter();
  const gameStorageKey = accountGameStorageKey(accountId);
  const [game, setGame] = useState<GameState | null>(null);
  const [history, setHistory] = useState<PokerSession[]>([]);
  const [discardedSessions, setDiscardedSessions] = useState<PokerSession[]>(
    [],
  );
  const [nextSessionNumber, setNextSessionNumber] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [discardedPlayers, setDiscardedPlayers] = useState<PlayerProfile[]>(
    [],
  );
  const [playersLoading, setPlayersLoading] = useState(true);
  const [playersError, setPlayersError] = useState("");
  const [view, setView] = useState<View>("home");
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [editingBlinds, setEditingBlinds] = useState(false);
  const [legacyGame, setLegacyGame] = useState<GameState | null>(null);
  const [legacySessions, setLegacySessions] = useState<PokerSession[]>([]);
  const [reviewingLegacySessions, setReviewingLegacySessions] =
    useState(false);
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  const navigate = useCallback(
    (nextView: View, options: { replace?: boolean } = {}) => {
      setView(nextView);
      const state = { ...window.history.state, menokaView: nextView };
      if (options.replace) {
        window.history.replaceState(state, "");
      } else {
        window.history.pushState(state, "");
      }
      window.scrollTo(0, 0);
    },
    [],
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

  const refreshPlayers = useCallback(async () => {
    setPlayersLoading(true);
    setPlayersError("");
    try {
      const data = await playersApi<{
        discardedPlayers?: PlayerProfile[];
        players?: PlayerProfile[];
      }>();
      setPlayers(Array.isArray(data.players) ? data.players : []);
      setDiscardedPlayers(
        Array.isArray(data.discardedPlayers) ? data.discardedPlayers : [],
      );
    } catch (error) {
      setPlayersError(
        error instanceof Error ? error.message : "Could not load players",
      );
    } finally {
      setPlayersLoading(false);
    }
  }, []);

  useEffect(() => {
    const hydrationTimer = setTimeout(() => {
      const storedGame = readStoredGame(gameStorageKey);
      setGame(storedGame);
      setLegacyGame(readStoredGame(LEGACY_GAME_STORAGE_KEY));
      setLegacySessions(readStoredHistory(LEGACY_HISTORY_STORAGE_KEY));
      window.history.replaceState(
        { ...window.history.state, menokaView: "home" },
        "",
      );
      if (storedGame) {
        window.history.pushState(
          { ...window.history.state, menokaView: "game" },
          "",
        );
        setView("game");
      }
      setReady(true);
      void refreshHistory();
      void refreshPlayers();
    }, 0);
    return () => {
      clearTimeout(hydrationTimer);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [gameStorageKey, refreshHistory, refreshPlayers]);

  useEffect(() => {
    function handleBrowserBack(event: PopStateEvent) {
      const nextView = event.state?.menokaView;
      setModal(null);
      setView(VIEWS.includes(nextView) ? nextView : "home");
      window.scrollTo(0, 0);
    }

    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (game) {
      window.localStorage.setItem(gameStorageKey, JSON.stringify(game));
    } else {
      window.localStorage.removeItem(gameStorageKey);
    }
  }, [game, gameStorageKey, ready]);

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
      blinds: BlindSchedule | null;
      players: PlayerProfile[];
    }) => {
      if (input.ante <= 0) {
        showToast("Big blind must be greater than 0");
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
      const gameName = input.name.trim();
      const startedAt = Date.now();
      const nextGame: GameState = {
        ...(gameName ? { gameName } : {}),
        sessionLabel: gameName || `Game ${nextSessionNumber}`,
        ante: input.ante,
        baseAnte: input.ante,
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
        startedAt,
        players: input.players.map((player) => ({
          id: player.id,
          name: player.name,
          stack: input.stack,
          buyIns: [input.stack],
        })),
        hand: null,
        handNo: 0,
        dealerIndex: -1,
        log: [],
        _setupCount: input.players.length,
      };
      dealNewHand(nextGame);
      setGame(nextGame);
      navigate("game", { replace: true });
    },
    [navigate, nextSessionNumber, showToast],
  );

  const addPlayer = useCallback(
    async (name: string) => {
      try {
        const data = await playersApi<{ player: PlayerProfile }>("", {
          method: "POST",
          body: JSON.stringify({ name }),
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

  function discardPlayer(player: PlayerProfile) {
    ask(
      `Discard ${player.name}? They will be hidden from new games, while their identity and past results stay connected.`,
      "Discard Player",
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
      showToast(action === "discard" ? "Player Discarded" : "Player Restored");
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
      message: `Delete your account? Your players, games and standings are locked and hidden straight away, and you are signed out on every device. You can recover everything by signing in again within ${DELETION_GRACE_PERIOD_DAYS} days. After that, everything is permanently deleted and cannot be recovered. Our database provider keeps short-term recovery copies of deleted data for up to 6 hours.`,
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
          `Cannot check — must call ${formatRupees(
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
        `${player.name} calls ${formatRupees(needed)}`,
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
        showToast(`Only ${formatRupees(player.stack)} left`);
        return;
      }
      const minimum = minimumRaise(next, playerIndex);
      if (chips < minimum && chips < player.stack) {
        showToast(`Minimum is ${formatRupees(minimum)}`);
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
          ? `goes all-in for ${formatRupees(chips)}${
              wasRaise ? ` (to ${formatRupees(total)})` : ""
            }${wasRaise && !raiseBefore.full ? ", short of a full raise" : ""}`
          : wasRaise
            ? opening
              ? `bets ${formatRupees(chips)}`
              : `raises to ${formatRupees(total)}`
            : `calls ${formatRupees(chips)}`;
      recordAction(
        next,
        playerIndex,
        { type, chips, raiseBefore },
        `${player.name} ${description}`,
      );
    }

    const active = activeIndexes(next);
    if (active.length === 1) {
      const winner = active[0];
      const pot = awardPot(next, winner, true);
      setGame(next);
      showToast(`${next.players[winner].name} +${formatRupees(pot)}`);
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
      `Give the ${formatRupees(game.hand.pot)} pot to ${
        game.players[playerIndex].name
      }?`,
      `${game.players[playerIndex].name} wins`,
      () => {
        const next = structuredClone(game);
        const pot = awardPot(next, playerIndex);
        setGame(next);
        showToast(`${next.players[playerIndex].name} +${formatRupees(pot)}`);
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
      `Hand ${hand.no}: split ${formatRupees(hand.pot)} between ${winners
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
    showToast(`Pot split ${winners.length} ways`);
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
        `Blinds up to ${formatRupees(
          smallBlindFor(next.ante),
        )}/${formatRupees(next.ante)}`,
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
      `Buy in ${player.name} for ${formatRupees(amount)}?`,
      `Buy In · ${formatRupees(amount)}`,
      () => {
        const next = structuredClone(game);
        const confirmedAmount = buyInPlayer(next, playerIndex);
        if (confirmedAmount === null) return;
        const confirmedPlayer = next.players[playerIndex];
        recordWin(
          next,
          `Hand ${next.handNo}: ${confirmedPlayer.name} buys in for ${formatRupees(confirmedAmount)}`,
        );
        setGame(next);
        showToast(
          `${confirmedPlayer.name} buys in for ${formatRupees(confirmedAmount)}`,
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

  function cancelHand() {
    if (!game?.hand) return;
    ask(
      `Cancel hand ${game.hand.no}? Everyone gets their money back, including the blinds.`,
      "Cancel hand",
      () => {
        const next = structuredClone(game);
        const hand = next.hand;
        if (!hand) return;
        next.players.forEach((player, index) => {
          player.stack = hand.stacksBeforeHand[index];
        });
        next.log = next.log.filter((line) => !belongsToHand(line, hand.no));
        next.handNo = hand.no - 1;
        next.hand = null;
        dealNewHand(next);
        setGame(next);
        showToast("Hand cancelled");
      },
    );
  }

  function backToBetweenHands() {
    if (!game?.hand) return;
    ask(
      `Return to between hands from hand ${game.hand.no}? All actions from this hand will be cleared and every chip, including the blinds, will be returned.`,
      "Back To Between Hands",
      () => {
        const next = structuredClone(game);
        if (!returnToBetweenHands(next)) return;
        setGame(next);
        showToast("Returned to between hands");
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
      "Reset everything and start a new game? All current stacks are lost.",
      "Reset game",
      () => {
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
      id: `s${game.startedAt}`,
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
            },
          }
        : {}),
      startStack: game.startStack,
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
      await sessionsApi("", {
        method: "POST",
        body: JSON.stringify({ sessions: [session] }),
      });
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
    if (completedHands < 1) {
      showToast("No completed hands to save");
      return;
    }
    ask(
      `Save this session? ${completedHands} hand${
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
    navigate("players");
  }

  function goBack() {
    window.history.back();
  }

  function openHands() {
    navigate("hands");
  }

  function closeModal() {
    setModal(null);
  }

  const gameName = game?.sessionLabel || game?.gameName || "Game";
  const header: { eyebrow: string; title: string } | null =
    view === "home"
      ? null
      : view === "game" && game
        ? {
            eyebrow: gameName,
            title: game.hand
              ? game.hand.stage === STAGES.length - 1 &&
                !pendingIndexes(game).length
                ? "Showdown"
                : `Hand ${game.hand.no}`
              : "Between Hands",
          }
        : view === "setup"
          ? { eyebrow: "New game", title: "Table Setup" }
          : view === "history"
            ? {
                eyebrow: `All-time · ${history.length} session${
                  history.length === 1 ? "" : "s"
                }`,
                title: "Standings",
              }
            : view === "sessions"
              ? {
                  eyebrow: `${history.length} game${
                    history.length === 1 ? "" : "s"
                  }`,
                  title: "Game Sessions",
                }
              : view === "players"
                ? { eyebrow: "Directory", title: "Players" }
                : view === "hands"
                  ? { eyebrow: "Strongest to weakest", title: "Hand Rankings" }
                  : null;
  const homeView = (
    <HomeView
      game={game}
      accountEmail={accountEmail}
      historyCount={history.length}
      legacyGame={legacyGame}
      legacySessionCount={legacySessions.length}
      playerCount={players.length}
      onAdoptLegacyGame={offerLegacyGameAdoption}
      onGame={() => navigate(game ? "game" : "setup")}
      onSetup={() => navigate("setup")}
      onHistory={() => navigate("history")}
      onPlayers={openPlayers}
      onOpenHands={openHands}
      onReviewLegacySessions={() => setReviewingLegacySessions(true)}
      onRules={() => setModal({ kind: "rules" })}
      onDeleteAccount={deleteAccount}
    />
  );

  return (
    <main className={`ledger-shell view-${view}`}>
      <div className={`toast ${toast ? "show" : ""}`} role="status">
        {toast}
      </div>

      {header ? (
        <header className="screen-header">
          <button
            className="round-button"
            type="button"
            aria-label="Go back"
            onClick={goBack}
          >
            ←
          </button>
          <div className="screen-heading">
            <span className="eyebrow">{header.eyebrow}</span>
            <h1
              style={
                { "--chars": header.title.length } as React.CSSProperties
              }
            >
              {header.title}
            </h1>
          </div>
          <ThemeToggle />
        </header>
      ) : null}

      <div className="app">
        {view === "home" ? (
          homeView
        ) : view === "history" ? (
          <StandingsView
            history={history}
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
            onRestore={(id) => void updateSessionState(id, "restore")}
            onDeletePermanently={deleteSessionPermanently}
            onExport={exportData}
            onImport={importData}
          />
        ) : view === "players" ? (
          <PlayersView
            players={players}
            discardedPlayers={discardedPlayers}
            loading={playersLoading}
            error={playersError}
            onRetry={() => void refreshPlayers()}
            onAdd={addPlayer}
            onDiscard={discardPlayer}
            onRestore={(player) => void updatePlayerState(player, "restore")}
            onDeletePermanently={deletePlayerPermanently}
          />
        ) : view === "hands" ? (
          <PokerHandsChart />
        ) : view === "setup" ? (
          <SetupView
            players={players}
            loading={playersLoading}
            error={playersError}
            onRetry={() => void refreshPlayers()}
            suggestedName={`Game ${nextSessionNumber}`}
            onManagePlayers={openPlayers}
            onStart={startGame}
          />
        ) : game ? (
          <GameView
            game={game}
            onAct={act}
            onUndoAction={undoAction}
            onNextStage={nextStage}
            onPickWinner={pickWinner}
            onBeginSplit={beginSplit}
            onEndSplit={endSplit}
            onToggleSplit={toggleSplit}
            onSplitPot={splitPot}
            onCancelHand={cancelHand}
            onBackToBetweenHands={backToBetweenHands}
            onBuyIn={buyIn}
            onNextHand={startNextHand}
            onEndSession={endSession}
            onUndoHand={undoHand}
            onDiscard={discardGame}
            onEditBlinds={() => setEditingBlinds(true)}
          />
        ) : (
          homeView
        )}
      </div>

      <TabBar
        view={view}
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
  );
}

type TabTarget = "home" | "play" | "history" | "sessions" | "players";

const TABS: ReadonlyArray<{ target: TabTarget; icon: string; label: string }> = [
  { target: "home", icon: "♠", label: "Home" },
  { target: "play", icon: "♦", label: "Play" },
  { target: "history", icon: "♣", label: "Ranks" },
  { target: "sessions", icon: "♥", label: "Games" },
  { target: "players", icon: "●", label: "Players" },
];

function tabForView(view: View): TabTarget {
  if (view === "setup" || view === "game") return "play";
  if (view === "hands") return "home";
  return view;
}

function TabBar({
  view,
  onSelect,
}: {
  view: View;
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
        </button>
      ))}
    </nav>
  );
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    // The pre-paint script in the layout may have picked the saved theme.
    const syncTimer = setTimeout(() => setTheme(currentTheme()), 0);
    return () => clearTimeout(syncTimer);
  }, []);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }
  return { theme, toggle };
}

function ThemeToggle({ pill = false }: { pill?: boolean }) {
  const { theme, toggle } = useTheme();
  const label = `Switch to ${theme === "dark" ? "light" : "dark"} theme`;
  return (
    <button
      className={pill ? "theme-pill" : "round-button"}
      type="button"
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      <span className="theme-dot" aria-hidden="true" />
      {pill ? <span>{theme}</span> : null}
    </button>
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

/** "+₹8,000", "−₹2,000" or "₹0". */
function formatSignedRupees(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatRupees(Math.abs(value))}`;
}

function toneClass(value: number | null) {
  return value === null || value === 0 ? "" : value > 0 ? "pos" : "neg";
}

function Avatar({
  name,
  role,
  size = "large",
}: {
  name: string;
  role?: string;
  size?: "large" | "small";
}) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ color: playerColor(name) }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
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

function HomeView({
  game,
  accountEmail,
  historyCount,
  legacyGame,
  legacySessionCount,
  playerCount,
  onAdoptLegacyGame,
  onGame,
  onSetup,
  onHistory,
  onPlayers,
  onOpenHands,
  onReviewLegacySessions,
  onRules,
  onDeleteAccount,
}: {
  game: GameState | null;
  accountEmail: string;
  historyCount: number;
  legacyGame: GameState | null;
  legacySessionCount: number;
  playerCount: number;
  onAdoptLegacyGame: () => void;
  onGame: () => void;
  onSetup: () => void;
  onHistory: () => void;
  onPlayers: () => void;
  onOpenHands: () => void;
  onReviewLegacySessions: () => void;
  onRules: () => void;
  onDeleteAccount: () => void;
}) {
  const hand = game?.hand ?? null;
  const tiles = [
    {
      suit: "♣",
      tone: "green",
      title: "All Time Standings",
      sub: `${historyCount} saved game session${historyCount === 1 ? "" : "s"}`,
      onClick: onHistory,
    },
    {
      suit: "♥",
      tone: "blue",
      title: "Existing Players",
      sub: `${playerCount} player${playerCount === 1 ? "" : "s"} ready to play`,
      onClick: onPlayers,
    },
    {
      suit: "♠",
      tone: "blue",
      title: "Hand Rankings",
      sub: "All ten hands, strongest to weakest",
      onClick: onOpenHands,
    },
    {
      suit: "♦",
      tone: "green",
      title: "New Game",
      sub: game
        ? "Finish the current game first"
        : "Seat players, set stacks and blinds",
      onClick: game ? onGame : onSetup,
    },
  ];

  return (
    <section className="home-view">
      <div className="home-top">
        <div className="brand">
          <span className="brand-chip" aria-hidden="true">
            <span>♠</span>
          </span>
          <span className="brand-name">Menoka</span>
        </div>
        <ThemeToggle pill />
      </div>

      <div className="home-hero">
        <span className="eyebrow">House Poker, Kept Properly</span>
        <h1>
          Menoka
          <span className="gradient-text">Card Games</span>
        </h1>
        <p>
          Choose a table, keep every stack straight, and let the house ledger
          remember the rest.
        </p>
      </div>

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

      {game ? (
        <button className="glass live-card" type="button" onClick={onGame}>
          <span className="live-card-glow" aria-hidden="true" />
          <span className="live-card-top">
            <span className="live-pill">
              <span aria-hidden="true" />
              Live
            </span>
            <span className="live-meta">
              {hand
                ? `Hand ${hand.no} · ${STAGES[hand.stage]}`
                : `Between hands · ${game.handNo} dealt`}
            </span>
          </span>
          <span className="live-card-copy">
            <strong>Continue Game Session</strong>
            <small>
              {hand ? "Return to the hand in progress" : "Deal the next hand"}
            </small>
          </span>
          <span className="live-card-bottom">
            <span>
              <span className="label">{hand ? "Pot" : "Game"}</span>
              <span className="live-pot">
                {hand ? formatRupees(hand.pot) : game.sessionLabel || game.gameName}
              </span>
            </span>
            <span className="arrow-circle" aria-hidden="true">
              →
            </span>
          </span>
        </button>
      ) : (
        <button className="start-card" type="button" onClick={onSetup}>
          <span>
            <strong>Start A Game</strong>
            <small>Seat players, set stacks, deal</small>
          </span>
          <span className="start-arrow" aria-hidden="true">
            →
          </span>
        </button>
      )}

      <div className="home-tiles">
        {tiles.map((tile) => (
          <button
            className={`glass home-tile tone-${tile.tone}`}
            key={tile.title}
            type="button"
            onClick={tile.onClick}
          >
            <span className="tile-watermark" aria-hidden="true">
              {tile.suit}
            </span>
            <span className="tile-suit" aria-hidden="true">
              {tile.suit}
            </span>
            <span className="tile-copy">
              <strong>{tile.title}</strong>
              <small>{tile.sub}</small>
            </span>
          </button>
        ))}
      </div>

      <footer className="home-footer">
        <div className="account-pill">
          <span>
            Signed in as <strong>{accountEmail}</strong>
          </span>
          <form action={signOut}>
            <button type="submit">Sign out</button>
          </form>
        </div>
        <div className="home-links">
          <button type="button" onClick={onRules}>
            Read the poker rules
          </button>
          <button className="danger-link" type="button" onClick={onDeleteAccount}>
            Delete my account
          </button>
        </div>
      </footer>
    </section>
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
                  {formatDate(session.date)} · Big Blind {formatRupees(session.ante)}
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
                  {formatRupees(session.ante)}
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
  loading,
  error,
  onRetry,
  suggestedName,
  onManagePlayers,
  onStart,
}: {
  players: PlayerProfile[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  suggestedName: string;
  onManagePlayers: () => void;
  onStart: (input: {
    name: string;
    stack: number;
    ante: number;
    blinds: BlindSchedule | null;
    players: PlayerProfile[];
  }) => void;
}) {
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
  // Tapping players seats them in tap order; the list below reorders them.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const playerCount = selectedIds.length;
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

  useEffect(() => () => {
    if (seatScrollFrameRef.current !== null) {
      cancelAnimationFrame(seatScrollFrameRef.current);
    }
  }, []);

  useLayoutEffect(() => {
    const landing = seatDropAnimationRef.current;
    if (!landing) return;
    seatDropAnimationRef.current = null;
    landing.row.style.transition = "none";
    landing.row.style.removeProperty("transform");
    const toRect = landing.row.getBoundingClientRect();
    landing.row.style.removeProperty("transition");
    if (
      typeof landing.row.animate !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    landing.row.animate(
      [
        {
          transform: `translate3d(${landing.fromRect.left - toRect.left}px, ${landing.fromRect.top - toRect.top}px, 0) scale(1.03)`,
        },
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
    const x = drag.x - drag.startX;
    const y = drag.y - drag.startY + window.scrollY - drag.startScrollY;
    drag.row.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.03)`;
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
      blinds: schedule,
      players: selectedPlayers,
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
  const blindLevelNote = !risingBlinds
    ? "Blinds stay fixed"
    : !scheduleValid
      ? "Check the blind plan"
      : blindRaiseType === "multiply" && blindRaiseBy === 2
        ? "Big blind doubles each level"
        : blindRaiseType === "multiply"
          ? `Big blind ×${blindRaiseBy} each level`
          : `Big blind +${formatRupees(blindRaiseBy)} each level`;

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
          <span className="label">Seat players</span>
          <span className="card-note">
            {playerCount
              ? `${playerCount} seated${playerCount < 2 ? " · need 2+" : ""}`
              : "Need 2+"}
          </span>
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
            {players.map((player) => {
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
            <p className="muted small-note">
              Seat 1 deals first; the dealer moves to the next active player
              each hand. Drag a grip to change seats.
            </p>
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
                    <Avatar name={seatName} size="small" />
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
        <button type="button" className="text-button" onClick={onManagePlayers}>
          Manage players
        </button>
      </section>

      <section className="glass card">
        <div className="card-row">
          <span className="label">Starting stack</span>
          <span className="card-note">First buy-in {formatRupees(stack)}</span>
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
          <span className="card-note">
            Small blind {formatRupees(smallBlindFor(Math.max(1, ante)))}
          </span>
        </div>
        <Segmented
          label="Big blind"
          options={[...ANTE_PRESETS, { value: "other", label: "Other" }]}
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
        <p className="muted small-note">
          First pre-flop raise to {formatRupees(Math.max(1, ante) * 2)}; each
          raise must add at least as much as the last one.
        </p>
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
            { value: "hands", label: "By hands" },
            { value: "minutes", label: "By minutes" },
          ]}
          value={risingBlinds ? blindUnit : "fixed"}
          onChange={chooseBlindLevels}
        />
        {risingBlinds ? (
          <>
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
                  {blindRaiseType === "multiply" ? "Multiply by" : "Add ₹"}
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
            <p className="muted small-note">
              {scheduleValid ? (
                <>
                  Big blind: {ladder
                    .map((bigBlind) => formatRupees(bigBlind))
                    .join(" → ")}{" "}
                  → …
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

      <button
        className="cta"
        type="submit"
        disabled={
          !selectionComplete || stack < 1 || ante < 1 || !scheduleValid
        }
      >
        Deal First Hand →
      </button>
    </form>
  );
}

const MAX_SEATS = 10;
const STACK_PRESETS = [
  { value: 5_000, label: "5K" },
  { value: 10_000, label: "10K" },
  { value: 20_000, label: "20K" },
  { value: 50_000, label: "50K" },
] as const;
const ANTE_PRESETS = [
  { value: 50, label: "₹50" },
  { value: 100, label: "₹100" },
  { value: 200, label: "₹200" },
  { value: 500, label: "₹500" },
  { value: 1_000, label: "₹1K" },
] as const;

function PlayersView({
  players,
  discardedPlayers,
  loading,
  error,
  onRetry,
  onAdd,
  onDiscard,
  onRestore,
  onDeletePermanently,
}: {
  players: PlayerProfile[];
  discardedPlayers: PlayerProfile[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onAdd: (name: string) => Promise<PlayerProfile | null>;
  onDiscard: (player: PlayerProfile) => void;
  onRestore: (player: PlayerProfile) => void;
  onDeletePermanently: (player: PlayerProfile) => void;
}) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [nameError, setNameError] = useState("");

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adding) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Enter a name first.");
      return;
    }
    const existing = players.find(
      (player) => player.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      setNameError(`${existing.name} is already in the directory.`);
      return;
    }
    setNameError("");
    setAdding(true);
    const player = await onAdd(trimmed);
    if (player) setName("");
    setAdding(false);
  }

  return (
    <div className="stack-list">
      <section className="glass card">
        <div className="count-hero">
          <strong className="gradient-text-vertical">{players.length}</strong>
          <div>
            <span className="eyebrow">Active players</span>
            <p className="muted">
              One saved name keeps every future session and standing together.
            </p>
          </div>
        </div>

        <form className="add-player-row" onSubmit={add}>
          <input
            className="field"
            id="new-player-name"
            aria-label="New player name"
            maxLength={80}
            placeholder="Enter their name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError("");
            }}
          />
          <button className="accent-button" type="submit" disabled={adding}>
            {adding ? "Adding…" : "Add"}
          </button>
        </form>
        {nameError ? (
          <p className="field-error" role="alert">
            {nameError}
          </p>
        ) : null}
      </section>

      <section className="glass card list-card">
        {error ? (
          <div className="directory-state">
            <p className="muted">{error}</p>
            <button className="ghost full" type="button" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : loading ? (
          <p className="muted">Loading players…</p>
        ) : players.length || discardedPlayers.length ? (
          <>
            {players.map((player, index) => (
              <div className="directory-player" key={player.id}>
                <span className="directory-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="directory-name">{player.name}</span>
                <button
                  className="pill-button"
                  type="button"
                  onClick={() => onDiscard(player)}
                >
                  Discard
                </button>
              </div>
            ))}
            {discardedPlayers.map((player, index) => (
              <div className="directory-player discarded" key={player.id}>
                <span className="directory-index">
                  {String(players.length + index + 1).padStart(2, "0")}
                </span>
                <span className="directory-name">
                  {player.name} <small>· discarded</small>
                </span>
                <div className="directory-actions">
                  <button
                    className="pill-button"
                    type="button"
                    onClick={() => onRestore(player)}
                  >
                    Restore
                  </button>
                  {player.hasHistory ? null : (
                    <button
                      className="pill-button danger-text"
                      type="button"
                      title="Delete this player permanently"
                      onClick={() => onDeletePermanently(player)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        ) : (
          <p className="muted">
            No players yet. Add the first name above, then return to New Game.
          </p>
        )}
      </section>
      {discardedPlayers.length ? (
        <p className="muted small-note list-footnote">
          Discarded players are hidden from new games. Players with saved
          history can be restored but not permanently deleted.
        </p>
      ) : null}
    </div>
  );
}

type GameViewProps = {
  game: GameState;
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
  onBackToBetweenHands: () => void;
  onBuyIn: (playerIndex: number) => void;
  onNextHand: () => void;
  onEndSession: () => void;
  onUndoHand: () => void;
  onDiscard: () => void;
  onEditBlinds: () => void;
};

function GameView(props: GameViewProps) {
  const { game } = props;
  const hand = game.hand;
  const net = (index: number) =>
    game.players[index].stack - totalBuyIns(game, index);
  const enoughPlayers = game.players.filter((player) => player.stack > 0).length >= 2;
  // Timed levels run on the clock between hands too, so keep the countdown live.
  const now = useBlindClock(game.blinds?.unit === "minutes");
  const blinds = blindStatus(game, now);
  const pendingPlan = pendingBlindPlan(game);
  const nextBlinds = `${formatRupees(blinds.nextSmallBlind)}/${formatRupees(
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
  const blindsDisplay = (
    <div className="blinds-display" aria-label="Current blinds">
      <div className="blinds-pill">
        <span className="blinds-label">Blinds</span>
        <span className="blinds-value">
          {formatRupees(blinds.smallBlind)}
          <span className="blinds-separator"> / </span>
          {formatRupees(blinds.bigBlind)}
        </span>
        {blinds.schedule ? (
          <span className="blinds-level">L{blinds.level + 1}</span>
        ) : null}
      </div>
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
          {describeBlindSchedule(pendingPlan.schedule)}
        </div>
      ) : null}
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
              : "Fewer than two players have chips remaining. A busted player can buy in to continue."}
          </p>
          {blindsDisplay}
          {!game.winnerAnnouncement ? (
            <>
              {enoughPlayers ? (
                <button className="cta" type="button" onClick={props.onNextHand}>
                  Deal The Next Hand →
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
            </>
          ) : null}
        </section>
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
                    "--chars": formatRupees(hand.pot).length,
                  } as React.CSSProperties
                }
              >
                {formatRupees(hand.pot)}
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
                  Deal {STAGES[hand.stage + 1]} →
                </button>
              ) : (
                <section className="glass card winner-picker">
                  <div className="card-row">
                    <span className="label">Pick the winner</span>
                    <span className="accent-amount">{formatRupees(hand.pot)}</span>
                  </div>
                  {pending ? (
                    <p className="muted small-note">
                      Finish the river betting before picking a winner.
                    </p>
                  ) : null}
                  {activeIndexes(game).map((playerIndex) => (
                    <button
                      className="contender"
                      type="button"
                      disabled={pending}
                      key={playerIndex}
                      onClick={() => props.onPickWinner(playerIndex)}
                    >
                      <Avatar name={game.players[playerIndex].name} size="small" />
                      <span className="contender-name">
                        {game.players[playerIndex].name} wins
                      </span>
                      <span className="contender-amount">
                        {formatRupees(hand.pot)}
                      </span>
                    </button>
                  ))}
                  {activeIndexes(game).length > 1 ? (
                    <button
                      className="dashed-button"
                      type="button"
                      disabled={pending}
                      onClick={props.onBeginSplit}
                    >
                      Split between two or more
                    </button>
                  ) : null}
                </section>
              )}
            </>
          )}
          <div className="button-pair">
            <button
              className="glass-button"
              type="button"
              onClick={props.onBackToBetweenHands}
            >
              Between hands
            </button>
            <button
              className="glass-button danger-text"
              type="button"
              onClick={props.onCancelHand}
            >
              Cancel hand
            </button>
          </div>
        </>
      )}

      <section className="glass card">
        <div className="card-row">
          <h2 className="card-title">Session Standings</h2>
          <span className="card-note">Start {formatRupees(game.startStack)}</span>
        </div>
        <div className="rows">
          {standings.map(({ player, index }, rank) => (
            <div className="standing-row" key={index}>
              <span className="standing-rank">{rank + 1}</span>
              <div className="standing-name">
                <b>{player.name}</b>
                <small>Invested {formatRupees(totalBuyIns(game, index))}</small>
              </div>
              <div className="standing-values">
                <b>{formatRupees(player.stack)}</b>
                <small className={toneClass(net(index))}>
                  {formatSignedRupees(net(index))}
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

function BlindEditor({
  game,
  onClose,
  onSave,
}: {
  game: GameState;
  onClose: () => void;
  onSave: (schedule: BlindSchedule | null) => void;
}) {
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
          Current blinds: {formatRupees(smallBlindFor(game.ante))}/
          {formatRupees(game.ante)}. {game.hand
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
                    formatRupees(bigBlindAtLevel(game.ante, schedule, level)),
                  ).join(" → ")}. ${unit === "minutes" ? "The timer starts when you save." : "The hand count starts with the next hand."}`
                : "Enter a whole hand or minute interval and an increase that raises the big blind."}
            </p>
          </>
        ) : (
          <p className="muted rule-note">
            Blinds will stay at {formatRupees(smallBlindFor(game.ante))}/
            {formatRupees(game.ante)} from the next hand onward.
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
  const offers = game.players.flatMap((player, index) => {
    const amount = nextBuyIn(game, index);
    return amount === null ? [] : [{ player, index, amount }];
  });
  if (!offers.length) return null;

  return (
    <div className="buy-in-options">
      <span className="label">Buy in</span>
      <p className="muted small-note">
        A busted player can buy back in for the starting stack.
      </p>
      {offers.map(({ player, index, amount }) => (
        <button
          className="contender"
          key={player.id || index}
          type="button"
          onClick={() => onBuyIn(index)}
        >
          <Avatar name={player.name} size="small" />
          <span className="contender-name">{player.name}</span>
          <span className="contender-amount">Buy in · {formatRupees(amount)}</span>
        </button>
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
          {formatRupees(announcement.pot)}
        </p>
        <button className="cta" type="button" onClick={onNext}>
          Next →
        </button>
      </section>
    </div>
  );
}

function seatStatus(game: GameState, playerIndex: number) {
  const hand = game.hand!;
  const player = game.players[playerIndex];
  const committed = hand.committed[playerIndex];
  if (!hand.in[playerIndex]) return "Folded";
  if (player.stack === 0) return `All in ${formatRupees(committed)}`;
  const last = hand.last[playerIndex];
  if (last) {
    if (last.type === "check") return "Checked";
    if (last.type === "call") return `Called ${formatRupees(committed)}`;
    if (last.type === "bet") {
      // The log line already says whether the chips opened, raised or called.
      return last.line.includes(" raises to ")
        ? `Raised to ${formatRupees(committed)}`
        : last.line.includes(" bets ")
          ? `Bet ${formatRupees(committed)}`
          : `Called ${formatRupees(committed)}`;
    }
    if (last.type === "all-in") return `All in ${formatRupees(committed)}`;
  }
  if (hand.stage === 0 && committed > 0) {
    if (playerIndex === hand.bigBlindIndex) {
      return `Big blind ${formatRupees(committed)}`;
    }
    if (playerIndex === hand.smallBlindIndex) {
      return `Small blind ${formatRupees(committed)}`;
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
}: {
  game: GameState;
  playerIndex: number;
  onAct: GameViewProps["onAct"];
  onUndo: (playerIndex: number) => void;
  /** This player's action closed the round; keep the card open but locked. */
  roundClosed?: boolean;
}) {
  const [amount, setAmount] = useState("");
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
  // Raises are shown as the total they reach, like "raise to ₹1,300",
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
  const stackLine = `${formatRupees(player.stack)} · in ${formatRupees(committed)}`;

  if (roundClosed) {
    return (
      <div className="glass seat-card round-closed">
        <div className="seat-main">
          <Avatar name={player.name} role={role} />
          <div className="seat-copy">
            <b>{player.name}</b>
            <small>{stackLine}</small>
          </div>
          <span className="status-pill">{seatStatus(game, playerIndex)}</span>
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
              <span>₹</span>
              <input type="number" disabled placeholder="—" />
            </label>
          </div>
          <input className="bet-range" type="range" disabled defaultValue={0} />
          <div className="quick-sizes">
            {["Min", "½ Pot", "Pot", "All in"].map((label) => (
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
          <Avatar name={player.name} role={role} />
          <div className="seat-copy">
            <b>{player.name}</b>
            <small>{stackLine}</small>
          </div>
          <span className="status-pill">{seatStatus(game, playerIndex)}</span>
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
    { label: "Min", value: null },
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
        ? `Raise ${formatRupees(committed + betAmount)}`
        : `Bet ${formatRupees(betAmount)}`;

  return (
    <div className="glass seat-card active">
      <div className="seat-main">
        <Avatar name={player.name} role={role} />
        <div className="seat-copy">
          <b>{player.name}</b>
          <small>{stackLine}</small>
        </div>
        <span className="turn-pill">Your turn</span>
      </div>
      <div className="bet-panel">
        <div className="bet-summary">
          <p>
            To call <b>{formatRupees(Math.min(owed, player.stack))}</b>
            <br />
            {raiseClosed ? (
              "Call or fold only"
            ) : minimum >= player.stack ? (
              <>
                All in <b>{formatRupees(player.stack)}</b>
              </>
            ) : raising ? (
              <>
                Min raise <b>{formatRupees(committed + minimum)}</b>
              </>
            ) : (
              <>
                Min bet <b>{formatRupees(minimum)}</b>
              </>
            )}
          </p>
          {raiseClosed ? null : (
            <label className="bet-input">
              <span>₹</span>
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
                  ? `All in ${formatRupees(betAmount)}`
                  : raising
                    ? `Raise to ${formatRupees(committed + betAmount)}`
                    : formatRupees(betAmount)
              }
              onChange={(event) => {
                const index = Number(event.target.value);
                // The first stop is the default, so it leaves Call and Fold on.
                setAmount(index === 0 ? "" : String(stops[index]));
              }}
            />
            <div className="quick-sizes">
              {quickSizes.map((size) => (
                <button
                  key={size.label}
                  type="button"
                  onClick={() =>
                    setAmount(size.value === null ? "" : String(size.value))
                  }
                >
                  {size.label}
                </button>
              ))}
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
              ? `Call ${formatRupees(Math.min(owed, player.stack))}`
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
  const hand = game.hand;
  if (!hand?.splitSel) return null;
  const selected = [...hand.splitSel].sort((a, b) => a - b);
  const each = selected.length ? Math.floor(hand.pot / selected.length) : 0;
  const remainder = selected.length ? hand.pot - each * selected.length : 0;

  return (
    <section className="glass card winner-picker">
      <div className="card-row">
        <span className="label">Split the pot</span>
        <span className="accent-amount">{formatRupees(hand.pot)}</span>
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
            <Avatar name={game.players[playerIndex].name} size="small" />
            <span className="contender-name">
              {game.players[playerIndex].name}
            </span>
            <span className={`contender-amount ${isSelected ? "" : "muted"}`}>
              {isSelected ? formatRupees(share) : "Tap to include"}
            </span>
          </button>
        );
      })}
      {selected.length > 1 ? (
        <button className="blue-button full tall" type="button" onClick={onSplit}>
          Split {formatRupees(hand.pot)} {selected.length} ways
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
 * Shows the first items of a long list and 10 more per press. The button
 * sits under the last visible item, so it moves down as the list grows;
 * once everything is shown it collapses the list back.
 */
function ExpandingList<T>({
  items,
  render,
  more,
  className,
}: {
  items: T[];
  render: (item: T) => ReactNode;
  more: (count: number) => string;
  className?: string;
}) {
  const [shown, setShown] = useState(LIST_START);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const visible = items.slice(0, shown).map(render);
  const remaining = items.length - shown;

  function toggle() {
    if (remaining > 0) {
      setShown(shown + LIST_STEP);
      return;
    }
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
          <button
            ref={buttonRef}
            type="button"
            className={`expander-button ${remaining > 0 ? "" : "open"}`}
            onClick={toggle}
          >
            <span>
              {remaining > 0
                ? more(Math.min(LIST_STEP, remaining))
                : "Show fewer"}
            </span>
            {remaining > LIST_STEP ? <small>{remaining} left</small> : null}
          </button>
        </div>
      ) : null}
    </>
  );
}

function SessionCard({
  session,
  discarded = false,
  onDiscard,
  onRestore,
  onDeletePermanently,
}: {
  session: PokerSession;
  discarded?: boolean;
  onDiscard?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDeletePermanently?: (id: string) => void;
}) {
  const sortedResults = [...session.results].sort((a, b) => b.net - a.net);

  return (
    <article className={`glass card session-card ${discarded ? "discarded" : ""}`}>
      <div className="session-head">
        <div>
          <h2 className="card-title">
            {session.name || `Game ${session.sessionNumber || ""}`}
          </h2>
          <p className="muted session-meta">
            {formatDate(session.date)} · {session.hands} hands · Big blind{" "}
            {formatRupees(session.ante)} · {session.results.length} players
          </p>
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
          ) : (
            <button
              className="pill-button"
              type="button"
              onClick={() => onDiscard?.(session.id)}
            >
              Discard
            </button>
          )}
        </div>
      </div>
      {session.blindHistory ? (
        <details className="session-blind-history">
          <summary>
            Blind history · {session.blindHistory.levels.length} amount
            {session.blindHistory.levels.length === 1 ? "" : "s"} used · finished at{" "}
            {formatRupees(
              smallBlindFor(session.blindHistory.levels.at(-1)!.bigBlind),
            )}
            /{formatRupees(session.blindHistory.levels.at(-1)!.bigBlind)}
          </summary>
          <div className="session-blind-history-content">
            <b>Plans</b>
            {session.blindHistory.plans.map((plan) => (
              <div key={plan.effectiveHand}>
                From hand {plan.effectiveHand}: {formatRupees(
                  smallBlindFor(plan.baseBigBlind),
                )}/{formatRupees(plan.baseBigBlind)} ·{" "}
                {describeBlindSchedule(plan.schedule)}
              </div>
            ))}
            <b>Blinds used</b>
            {session.blindHistory.levels.map((level) => (
              <div key={level.handNo}>
                Hand {level.handNo}: {formatRupees(
                  smallBlindFor(level.bigBlind),
                )}/{formatRupees(level.bigBlind)}
              </div>
            ))}
          </div>
        </details>
      ) : null}
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
                  {formatRupees(
                    result.buyIns.reduce((sum, amount) => sum + amount, 0),
                  )}
                </small>
              ) : null}
            </span>
            <span className={`result-amount ${toneClass(result.net)}`}>
              {formatSignedRupees(result.net)}
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

function StandingsView({
  history,
  loading,
  error,
  onRetry,
}: {
  history: PokerSession[];
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const standings = useMemo(() => buildStandings(history), [history]);
  const leaderboard = standings.entries;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [showRankingHelp, setShowRankingHelp] = useState(false);
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
      <LeaderboardChart standings={standings} />

      <div className="section-heading">
        <div className="heading-with-info">
          <h2>Player Standings</h2>
          <button
            className="info-button"
            type="button"
            aria-label="How players are ranked"
            onClick={() => setShowRankingHelp(true)}
          >
            i
          </button>
        </div>
        <span className="card-note">
          {leaderboard.length} player{leaderboard.length === 1 ? "" : "s"}
        </span>
      </div>
      {visible.map((entry) => {
        const open = expanded.has(entry.key);
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
          [
            "Profitable",
            `${entry.profitableSessions} (${profitableRate}%)`,
            null,
          ],
          ["Hands", entry.hands.toLocaleString("en-IN"), null],
          ["Invested", formatRupees(entry.invested), null],
          ["Net chips", formatSignedRupees(entry.net), entry.net],
        ];
        return (
          <section className="glass standing-card" key={entry.key}>
            <button
              className="standing-toggle"
              type="button"
              aria-expanded={open}
              onClick={() => toggle(entry.key)}
            >
              <span
                className={`medal ${
                  entry.rank === 1
                    ? "first"
                    : entry.rank === 2 || entry.rank === 3
                      ? "podium"
                      : ""
                }`}
              >
                {entry.rank ?? "–"}
              </span>
              <span className="standing-name">
                <b>{entry.name}</b>
                {entry.averageReturn === null ? (
                  <small>Unranked · no verified buy-ins</small>
                ) : null}
              </span>
              <span className={`standing-return ${toneClass(entry.averageReturn)}`}>
                {entry.averageReturn === null
                  ? "—"
                  : formatPercent(entry.averageReturn)}
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
                {entry.ineligible.length ? (
                  <ul className="leaderboard-excluded">
                    {entry.ineligible.map(({ sessionId, reason }) => (
                      <li key={sessionId}>
                        Not ranked: {sessionTitles.get(sessionId) ?? sessionId}{" "}
                        — {INELIGIBLE_REASON_TEXT[reason]}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
      {leaderboard.length > STANDINGS_START ? (
        <button
          className="glass-button full accent-text"
          type="button"
          onClick={() => setShowAll((shown) => !shown)}
        >
          {showAll ? "Show fewer" : `Show all ${leaderboard.length} players`}
        </button>
      ) : null}
      {showRankingHelp ? (
        <RankingHelp onClose={() => setShowRankingHelp(false)} />
      ) : null}
    </div>
  );
}

function RankingHelp({ onClose }: { onClose: () => void }) {
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
        className="sheet ranking-help"
        role="dialog"
        aria-modal="true"
        aria-label="How players are ranked"
      >
        <p>
          Players are ranked by their <b>average session return</b>: how much
          they won or lost in each game as a percentage of the chips they put
          in, averaged over their games.
        </p>
        <button className="primary" type="button" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}

function SessionsView({
  history,
  discardedSessions,
  loading,
  error,
  onRetry,
  onDiscard,
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
            <SessionCard key={session.id} session={session} onDiscard={onDiscard} />
          )}
          more={(count) => `Show ${count} older game${count === 1 ? "" : "s"}`}
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

function LeaderboardChart({ standings }: { standings: Standings }) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const chartWidth = 320;
  const chartHeight = 200;
  const plot = { top: 8, right: 6, bottom: 24, left: 40 };
  const plotWidth = chartWidth - plot.left - plot.right;
  const plotHeight = chartHeight - plot.top - plot.bottom;
  const sessionCount = standings.timeline.length;
  const series = standings.entries.map((entry) => {
    const line = standings.series.get(entry.key);
    const points = (line?.returns ?? []).flatMap((point) =>
      point
        ? [
            {
              index: point.sessionIndex,
              value: point.runningAverage,
              marked: point.sessionReturn !== null,
              label: `${entry.name}, session ${point.sessionIndex}: ${
                point.sessionReturn === null
                  ? "did not play"
                  : `session return ${formatPercent(point.sessionReturn)}`
              } · running average ${formatPercent(point.runningAverage)} over ${
                point.sampleCount
              } session${point.sampleCount === 1 ? "" : "s"}`,
            },
          ]
        : [],
    );
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
    <figure className="glass card leaderboard-chart" aria-label={title}>
      <figcaption>
        <div>
          <h2 className="card-title">{title}</h2>
          <span className="card-note">Running average after each session</span>
        </div>
      </figcaption>
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
    if (state.kind === "rules") {
      onClose();
      return;
    }
    state.onConfirm();
    onConfirm();
  }

  if (state.kind === "rules") {
    return (
      <div
        className="modal show"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className="sheet rules-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="poker-rules-title"
        >
          <div className="rules-heading">
            <span className="rules-kicker">Menoka House Rules</span>
            <h2 id="poker-rules-title">Poker Rules</h2>
            <p>
              This Is A Chip Ledger For Your Modified Poker Game. It Does Not
              Track Cards Or Real Money.
            </p>
          </div>

          <div className="rules-list">
            <section>
              <span className="rule-number">01</span>
              <div>
                <h3>Set Up The Table</h3>
                <p>
                  Choose A Starting Stack, Big Blind, And Two To Ten Players.
                  Drag Players Into Seating Order Before Starting. One Game
                  Session Can Contain Multiple Hands. The Small Blind Is Half
                  The Big Blind, Rounded Down. Blinds Can Also Be Set To Rise
                  Every Few Hands Or Minutes, Either Multiplying The Big Blind
                  Or Adding A Fixed Amount Each Level. A New Level Takes
                  Effect When The Next Hand Is Dealt, Never Mid-Hand.
                </p>
              </div>
            </section>

            <section>
              <span className="rule-number">02</span>
              <div>
                <h3>Start Every Hand</h3>
                <p>
                  The Dealer Button, Small Blind, And Big Blind Rotate Through
                  The Chosen Seating Order Each Hand, Skipping Players Without
                  Chips. Deal Two Hole Cards, Post Blinds, And Complete A
                  Pre-Flop Betting Round Before Revealing The Flop Physically.
                </p>
              </div>
            </section>

            <section>
              <span className="rule-number">03</span>
              <div>
                <h3>Take Turns Until Bets Match</h3>
                <p>
                  Play pre-flop, flop, turn, then river, burning one physical
                  card before each community-card reveal. Only the highlighted
                  player can act. A raise reopens the action; the street ends
                  only when every active player has called, checked, folded, or
                  is all-in.
                </p>
              </div>
            </section>

            <section>
              <span className="rule-number">04</span>
              <div>
                <h3>Choose An Action</h3>
                <p>
                  Check Only When Nothing Is Owed. Bet To Open The Action, Call
                  The Current Bet, Raise It, Or Fold. All In Commits The
                  Player&apos;s Entire Remaining Stack, Even If It Cannot Cover
                  A Call. If Only One Player Remains, They Win Automatically.
                  Between Hands, A Busted Player Can Buy Back In For The Full
                  Starting Stack, As Many Times As Needed.
                </p>
              </div>
            </section>

            <section>
              <span className="rule-number">05</span>
              <div>
                <h3>Minimum Bets And Raises</h3>
                <p>
                  The Smallest Bet Is The Big Blind. A Raise Must Add At Least
                  As Much As The Last Bet Or Raise On This Street, So Before
                  The Flop The First Raise Makes The Total Twice The Big
                  Blind, And After A Raise From ₹100 To ₹400 The Next Raise Is
                  To At Least ₹700. Each New Street Starts Again At The Big
                  Blind. A Player May Always Go All-In For Less, But That Short
                  All-In Doesn&apos;t Let Players Who Already Acted Raise Again:
                  They May Only Call Or Fold.
                </p>
              </div>
            </section>

            <section>
              <span className="rule-number">06</span>
              <div>
                <h3>Award The Pot</h3>
                <p>
                  After The River, Choose One Winner Or Split The Pot Between
                  Two Or More Active Players. A Split Is Equal, With Any
                  Leftover ₹1 Chips Awarded In Player Order. Confirm The Winner,
                  Then Deal The Next Hand To Rotate The Button And Post Fresh
                  Blinds.
                </p>
              </div>
            </section>

            <section>
              <span className="rule-number">07</span>
              <div>
                <h3>Correct Mistakes And Save</h3>
                <p>
                  Undo Restores A Player&apos;s Latest Action On The Current
                  Street. Cancel Hand Refunds Every Chip From That Hand,
                  Including Blinds. Undo Last Hand Deals It Again Exactly As
                  Before, With The Same Stacks, Dealer And Blinds. Finish And Save Game Session Requires One Completed
                  Hand; Any Unfinished Hand Is Refunded In The Saved Results.
                </p>
              </div>
            </section>
          </div>

          <div className="rules-footer">
            <button className="primary rules-close" onClick={onClose}>
              Close Rules
            </button>
          </div>
        </div>
      </div>
    );
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
