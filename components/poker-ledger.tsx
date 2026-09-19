"use client";

import {
  ChangeEvent,
  FormEvent,
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
  bigBlindAtLevel,
  blindStatus,
  buildLeaderboard,
  buyInPlayer,
  dealNewHand,
  DEFAULT_BLIND_SCHEDULE,
  editBlindSchedule,
  formatDate,
  formatRupees,
  GAME_STORAGE_KEY,
  HISTORY_STORAGE_KEY,
  minimumRaise,
  nextBuyIn,
  nextPlayerToAct,
  pendingIndexes,
  pendingBlindPlan,
  playerBuyIns,
  returnToBetweenHands,
  smallBlindFor,
  STAGES,
  startingBigBlind,
  totalBuyIns,
} from "@/lib/poker/game";
import type {
  BlindSchedule,
  GameState,
  PlayerAction,
  PlayerProfile,
  PokerSession,
  WinnerAnnouncement,
} from "@/lib/poker/types";

type View = "home" | "setup" | "game" | "history" | "players";
type ModalState =
  | {
      kind: "rules";
    }
  | {
      kind: "hands";
    }
  | {
      kind: "confirm";
      message: string;
      confirmLabel: string;
      onConfirm: () => void;
    }
  | {
      kind: "password";
      message: string;
      confirmLabel: string;
      onConfirm: (password: string) => void;
    };

const HANDS_PINNED_KEY = "pokerLedger.handsPinned.v1";
const POKER_HANDS = [
  { name: "Royal Flush", cards: "A K Q J 10", note: "Same Suit" },
  { name: "Straight Flush", cards: "9 8 7 6 5", note: "Same Suit" },
  { name: "Four Of A Kind", cards: "A A A A K", note: "" },
  { name: "Full House", cards: "K K K 7 7", note: "" },
  { name: "Flush", cards: "A J 8 4 2", note: "Same Suit" },
  { name: "Straight", cards: "9 8 7 6 5", note: "" },
  { name: "Three Of A Kind", cards: "Q Q Q 8 3", note: "" },
  { name: "Two Pair", cards: "J J 4 4 9", note: "" },
  { name: "One Pair", cards: "10 10 A 7 3", note: "" },
  { name: "High Card", cards: "A J 8 6 2", note: "" },
] as const;

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
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || "Could not reach the ledger");
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
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || "Could not reach the player list");
  }
  return data;
}

function readStoredGame() {
  try {
    const data = JSON.parse(
      window.localStorage.getItem(GAME_STORAGE_KEY) || "null",
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

function readStoredHistory() {
  try {
    const data = JSON.parse(
      window.localStorage.getItem(HISTORY_STORAGE_KEY) || "[]",
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

function belongsToHand(line: string, handNo: number) {
  return (
    line.startsWith(`Hand ${handNo} `) ||
    line.startsWith(`Hand ${handNo}:`) ||
    line.startsWith(`H${handNo} `) ||
    line.startsWith(`H${handNo}:`)
  );
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
  game.lastHand = {
    stacksBefore: [...hand.stacksBeforeHand],
    buyInsBefore: game.players.map((_, index) => [
      ...playerBuyIns(game, index),
    ]),
  };
  game.winnerAnnouncement = {
    names: [game.players[playerIndex].name],
    pot,
    handNo: hand.no,
    split: false,
  };
  game.hand = null;
  return pot;
}

export function PokerLedger() {
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
  const [handsPinned, setHandsPinned] = useState(false);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [editingBlinds, setEditingBlinds] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
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
      const localHistory = readStoredHistory();
      if (localHistory.length) {
        await sessionsApi("", {
          method: "POST",
          body: JSON.stringify({ sessions: localHistory }),
        });
        window.localStorage.removeItem(HISTORY_STORAGE_KEY);
      }
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
      const storedGame = readStoredGame();
      setGame(storedGame);
      setHandsPinned(
        window.localStorage.getItem(HANDS_PINNED_KEY) === "true",
      );
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
  }, [refreshHistory, refreshPlayers]);

  useEffect(() => {
    function handleBrowserBack(event: PopStateEvent) {
      const nextView = event.state?.menokaView;
      if (event.state?.menokaModal === "hands") {
        setModal({ kind: "hands" });
      } else {
        setModal(null);
      }
      if (
        nextView === "home" ||
        nextView === "setup" ||
        nextView === "game" ||
        nextView === "history" ||
        nextView === "players"
      ) {
        setView(nextView);
      } else {
        setView("home");
      }
      window.scrollTo(0, 0);
    }

    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (game) {
      window.localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(game));
    } else {
      window.localStorage.removeItem(GAME_STORAGE_KEY);
    }
  }, [game, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(HANDS_PINNED_KEY, String(handsPinned));
  }, [handsPinned, ready]);

  const ask = useCallback(
    (message: string, confirmLabel: string, onConfirm: () => void) => {
      setModal({ kind: "confirm", message, confirmLabel, onConfirm });
    },
    [],
  );

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
      kind: "password",
      message: `Permanently delete ${player.name}? This cannot be undone. Players with saved session history cannot be permanently deleted.`,
      confirmLabel: "Delete Permanently",
      onConfirm: (password) =>
        void deleteRemotePlayerPermanently(player, password),
    });
  }

  async function deleteRemotePlayerPermanently(
    player: PlayerProfile,
    password: string,
  ) {
    try {
      await playersApi(`?id=${encodeURIComponent(player.id)}`, {
        method: "DELETE",
        headers: { "X-Delete-Password": password },
      });
      setDiscardedPlayers((current) =>
        current.filter((item) => item.id !== player.id),
      );
      showToast("Player Permanently Deleted");
    } catch (error) {
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
      hand.acted[playerIndex] = true;
      recordAction(
        next,
        playerIndex,
        { type, chips: 0 },
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
      hand.acted[playerIndex] = true;
      recordAction(
        next,
        playerIndex,
        { type, chips: 0 },
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
      hand.acted[playerIndex] = true;
      recordAction(
        next,
        playerIndex,
        { type, chips: needed },
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
      const opening = !hand.committed.some(
        (committed, index) => index !== playerIndex && committed > 0,
      );
      player.stack -= chips;
      hand.committed[playerIndex] += chips;
      hand.pot += chips;
      hand.acted[playerIndex] = true;
      if (wasRaise) {
        hand.roundHigh = total;
        hand.acted = hand.acted.map((_, index) =>
          index === playerIndex || !hand.in[index] || next.players[index].stack === 0,
        );
      }
      const description =
        type === "all-in"
          ? `goes all-in for ${formatRupees(chips)}${
              wasRaise ? ` (to ${formatRupees(total)})` : ""
            }`
          : wasRaise
            ? opening
              ? `bets ${formatRupees(chips)}`
              : `raises to ${formatRupees(total)}`
            : `calls ${formatRupees(chips)}`;
      recordAction(
        next,
        playerIndex,
        { type, chips },
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
    next.lastHand = {
      stacksBefore: [...hand.stacksBeforeHand],
      buyInsBefore: next.players.map((_, index) => [
        ...playerBuyIns(next, index),
      ]),
    };
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
      if (!next.lastHand) return;
      next.players.forEach((player, index) => {
        player.stack = next.lastHand?.stacksBefore[index] ?? player.stack;
        player.buyIns = next.lastHand?.buyInsBefore?.[index] ?? player.buyIns;
      });
      const undoneNumber = next.hand ? next.hand.no - 1 : next.handNo;
      const currentHandNumber = next.hand?.no;
      next.log = next.log.filter(
        (line) =>
          !belongsToHand(line, undoneNumber) &&
          (!currentHandNumber || !belongsToHand(line, currentHandNumber)),
      );
      next.handNo = undoneNumber - 1;
      next.lastHand = null;
      next.hand = null;
      dealNewHand(next);
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
      kind: "password",
      message: `Permanently delete ${session.name || "this game"} from ${formatDate(
        session.date,
      )}? This cannot be undone.`,
      confirmLabel: "Delete Permanently",
      onConfirm: (password) =>
        void deleteRemoteSessionPermanently(id, password),
    });
  }

  async function deleteRemoteSessionPermanently(
    id: string,
    password: string,
  ) {
    try {
      await sessionsApi(`?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "X-Delete-Password": password },
      });
      setDiscardedSessions((current) =>
        current.filter((session) => session.id !== id),
      );
      showToast("Session Permanently Deleted");
    } catch (error) {
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

    try {
      const data = JSON.parse(await file.text()) as
        | PokerSession[]
        | { sessions?: PokerSession[] };
      const incoming = Array.isArray(data) ? data : data.sessions;
      if (!Array.isArray(incoming)) {
        showToast("No sessions in that file");
        return;
      }
      const existing = new Set(
        [...history, ...discardedSessions].map((session) => session.id),
      );
      const additions = incoming.filter(
        (session) =>
          session?.id && session.results && !existing.has(session.id),
      );
      if (!additions.length) {
        showToast("Already up to date");
        return;
      }
      await sessionsApi("", {
        method: "POST",
        body: JSON.stringify({ sessions: additions }),
      });
      await refreshHistory();
      showToast(
        `Added ${additions.length} session${additions.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      showToast(
        error instanceof SyntaxError ? "Not a valid file" : "Import failed",
      );
    }
  }

  function openPlayers() {
    navigate("players");
  }

  function goBack() {
    window.history.back();
  }

  function openHands() {
    window.history.pushState(
      {
        ...window.history.state,
        menokaView: view,
        menokaModal: "hands",
      },
      "",
    );
    setModal({ kind: "hands" });
  }

  function closeModal() {
    if (
      modal?.kind === "hands" &&
      window.history.state?.menokaModal === "hands"
    ) {
      window.history.back();
      return;
    }
    setModal(null);
  }

  function toggleHandsPinned() {
    setHandsPinned((current) => !current);
  }

  const screenTitle =
    view === "game"
      ? game?.sessionLabel || game?.gameName || "Game"
      : view === "setup"
        ? "New Game"
        : view === "history"
          ? "Standings"
          : "Players";

  return (
    <main className={`ledger-shell ${view === "home" ? "home-shell" : ""}`}>
      {view !== "home" ? (
        <header className="topbar">
          <button
            className="back-button"
            type="button"
            aria-label="Go Back"
            onClick={goBack}
          >
            <span>Back</span>
          </button>
          <span className="topbar-title">{screenTitle}</span>
          <button
            className="rules-trigger"
            type="button"
            onClick={() => setModal({ kind: "rules" })}
          >
            Rules
          </button>
        </header>
      ) : null}

      <div className={`app ${view === "home" ? "home-app" : ""}`}>
        {view === "home" ? (
          <HomeView
            hasGame={Boolean(game)}
            historyCount={history.length}
            playerCount={players.length}
            onGame={() => navigate(game ? "game" : "setup")}
            onHistory={() => navigate("history")}
            onPlayers={openPlayers}
            onOpenHands={openHands}
            onRules={() => setModal({ kind: "rules" })}
          />
        ) : view === "history" ? (
          <HistoryView
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
          <HomeView
            hasGame={false}
            historyCount={history.length}
            playerCount={players.length}
            onGame={() => navigate("setup")}
            onHistory={() => navigate("history")}
            onPlayers={openPlayers}
            onOpenHands={openHands}
            onRules={() => setModal({ kind: "rules" })}
          />
        )}
      </div>

      <div className={`toast ${toast ? "show" : ""}`} role="status">
        {toast}
      </div>
      {modal ? (
        <Modal
          state={modal}
          handsPinned={handsPinned}
          onToggleHandsPin={toggleHandsPinned}
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
    </main>
  );
}

function HomeView({
  hasGame,
  historyCount,
  playerCount,
  onGame,
  onHistory,
  onPlayers,
  onOpenHands,
  onRules,
}: {
  hasGame: boolean;
  historyCount: number;
  playerCount: number;
  onGame: () => void;
  onHistory: () => void;
  onPlayers: () => void;
  onOpenHands: () => void;
  onRules: () => void;
}) {
  return (
    <section className="home-view">
      <div className="home-hero">
        <div className="home-emblem" aria-hidden="true">
          <span>♠</span>
        </div>
        <div className="home-kicker">House Poker, Kept Properly</div>
        <h1>
          Menoka
          <span>Card Games</span>
        </h1>
        <p>
          Choose A Table, Keep Every Stack Straight, And Let The House Ledger
          Remember The Rest.
        </p>
      </div>

      <div className="home-menu">
        <button className="home-action featured" type="button" onClick={onGame}>
          <span className="home-suit" aria-hidden="true">
            ♦
          </span>
          <span className="home-action-copy">
            <strong>
              {hasGame ? "Continue Game Session" : "Start A New Game"}
            </strong>
            <small>
              {hasGame
                ? "Return To The Hand In Progress"
                : "Choose The Players And Blinds"}
            </small>
          </span>
        </button>

        <button className="home-action" type="button" onClick={onHistory}>
          <span className="home-suit" aria-hidden="true">
            ♣
          </span>
          <span className="home-action-copy">
            <strong>All Time Standings</strong>
            <small>
              {historyCount} Saved Game Session
              {historyCount === 1 ? "" : "s"}
            </small>
          </span>
        </button>

        <button className="home-action" type="button" onClick={onPlayers}>
          <span className="home-suit red-suit" aria-hidden="true">
            ♥
          </span>
          <span className="home-action-copy">
            <strong>Existing Players</strong>
            <small>
              {playerCount} Player{playerCount === 1 ? "" : "s"} Ready To Play
            </small>
          </span>
        </button>
      </div>

      <div className="home-hands">
        <button
          className="home-action home-hands-action"
          type="button"
          onClick={onOpenHands}
        >
          <span className="home-suit" aria-hidden="true">♠</span>
          <span className="home-action-copy">
            <strong>Poker Hand Rankings</strong>
            <small>View all ten hands, strongest to weakest</small>
          </span>
        </button>
      </div>

      <button className="home-rules" type="button" onClick={onRules}>
        Read The Poker Rules
      </button>
    </section>
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
  const [playerCount, setPlayerCount] = useState(3);
  const [selectedIds, setSelectedIds] = useState(["", "", ""]);
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

  function updatePlayerCount(value: number) {
    const count = Math.max(2, Math.min(10, value || 2));
    setPlayerCount(count);
    setSelectedIds((current) =>
      Array.from({ length: count }, (_, index) => current[index] || ""),
    );
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
    selectedIds.length === playerCount &&
    selectedIds.every(Boolean) &&
    new Set(selectedIds).size === playerCount;

  return (
    <form className="card setup-card" onSubmit={submit}>
      <div className="hdr">
        <b>Start A New Game</b>
      </div>
      <label htmlFor="game-name">
        Game Name <span className="label-optional">(Optional)</span>
      </label>
      <input
        className="game-name-input"
        id="game-name"
        maxLength={80}
        placeholder={suggestedName}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="row setup-row">
        <div>
          <label htmlFor="stack">Starting Stack / First Buy-In</label>
          <input
            id="stack"
            type="number"
            inputMode="numeric"
            min="0"
            value={stack}
            onChange={(event) => setStack(Number(event.target.value))}
          />
        </div>
        <div>
          <label htmlFor="ante">Big blind</label>
          <input
            id="ante"
            type="number"
            inputMode="numeric"
            min="1"
            value={ante}
            onChange={(event) => setAnte(Number(event.target.value))}
          />
        </div>
      </div>
      <p className="muted rule-note">
        Small blind {formatRupees(smallBlindFor(Math.max(1, ante)))} · first
        pre-flop raise to {formatRupees(Math.max(1, ante) * 2)} · later raises
        can be any higher amount.
      </p>

      <div className="blind-toggle">
        <label htmlFor="rising-blinds">Blinds Go Up During The Game</label>
        <input
          id="rising-blinds"
          type="checkbox"
          checked={risingBlinds}
          onChange={(event) => setRisingBlinds(event.target.checked)}
        />
      </div>
      {risingBlinds ? (
        <>
          <div className="row setup-row">
            <div>
              <label htmlFor="blind-every">Raise Blinds Every</label>
              <input
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
              <label htmlFor="blind-unit">Counted In</label>
              <select
                className="select-control"
                id="blind-unit"
                value={blindUnit}
                onChange={(event) =>
                  setBlindUnit(event.target.value as BlindSchedule["unit"])
                }
              >
                <option value="hands">Hands</option>
                <option value="minutes">Minutes</option>
              </select>
            </div>
          </div>
          <div className="row setup-row">
            <div>
              <label htmlFor="blind-raise-type">Increase By</label>
              <select
                className="select-control"
                id="blind-raise-type"
                value={blindRaiseType}
                onChange={(event) => {
                  const nextType = event.target
                    .value as BlindSchedule["raiseType"];
                  setBlindRaiseType(nextType);
                  setBlindRaiseBy(
                    nextType === "multiply" ? 2 : Math.max(1, ante),
                  );
                }}
              >
                <option value="multiply">Multiplying The Big Blind</option>
                <option value="add">Adding A Fixed Amount</option>
              </select>
            </div>
            <div>
              <label htmlFor="blind-raise-by">
                {blindRaiseType === "multiply" ? "Multiplier" : "Amount"}
              </label>
              <input
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
          <p className="muted rule-note">
            {scheduleValid ? (
              <>
                Every {blindEvery}{" "}
                {blindUnit === "hands"
                  ? blindEvery === 1
                    ? "hand"
                    : "hands"
                  : blindEvery === 1
                    ? "minute"
                    : "minutes"}
                , the big blind steps up:{" "}
                {ladder
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

      <label htmlFor="player-count">Number Of Players</label>
      <select
        className="select-control"
        id="player-count"
        value={playerCount}
        onChange={(event) => updatePlayerCount(Number(event.target.value))}
      >
        {Array.from({ length: 9 }, (_, index) => index + 2).map((count) => (
          <option key={count} value={count}>
            {count} Players
          </option>
        ))}
      </select>

      <div className="names player-selects">
        <div className="player-select-heading">
          <label>Select Players &amp; Seating Order</label>
          <button
            type="button"
            className="text-button"
            onClick={onManagePlayers}
          >
            Manage Players
          </button>
        </div>
        {error ? (
          <div className="inline-state">
            <span>{error}</span>
            <button type="button" className="text-button" onClick={onRetry}>
              Try Again
            </button>
          </div>
        ) : null}
        <p className="muted seat-order-help">
          Drag a player by the grip to change seats. Seat 1 deals first; the
          dealer moves to the next active player each hand.
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
                key={selectedId || `empty-seat-${index}`}
                style={
                  shift
                    ? { transform: `translate3d(0, ${shift}px, 0)` }
                    : undefined
                }
              >
                <span className="seat-number" aria-hidden="true">
                  {index + 1}
                </span>
                <select
                  className="select-control"
                  aria-label={`Seat ${index + 1} player`}
                  disabled={loading || Boolean(error)}
                  value={selectedId}
                  onChange={(event) =>
                    setSelectedIds((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ),
                    )
                  }
                >
                  <option value="">
                    {loading ? "Loading Players…" : `Choose Player ${index + 1}`}
                  </option>
                  {players.map((player) => (
                    <option
                      key={player.id}
                      value={player.id}
                      disabled={
                        player.id !== selectedId && selectedIds.includes(player.id)
                      }
                    >
                      {player.name}
                    </option>
                  ))}
                </select>
                <button
                  className="seat-drag-handle"
                  type="button"
                  disabled={!selectedId || loading || Boolean(error)}
                  aria-label={`Move seat ${index + 1} player. Drag or use arrow keys.`}
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
        {!loading && !error && players.length < 2 ? (
          <p className="muted player-help">
            Add At Least Two Players Before Starting A Game.
          </p>
        ) : null}
      </div>
      <button
        className="primary full start-game"
        type="submit"
        disabled={
          !selectionComplete || stack < 0 || ante < 1 || !scheduleValid
        }
      >
        Start Game
      </button>
    </form>
  );
}

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

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || adding) return;
    setAdding(true);
    const player = await onAdd(name);
    if (player) setName("");
    setAdding(false);
  }

  return (
    <>
      <section className="card player-directory-intro">
        <div className="player-directory-header">
          <div>
            <b>Existing Players</b>
            <p className="muted card-note">
              One Saved Name Keeps Every Future Session And Standing Together.
            </p>
          </div>
          <div className="player-tally" aria-label={`${players.length} Active Players`}>
            <strong>{players.length}</strong>
            <span>Active Players</span>
          </div>
        </div>

        <form className="add-player-form" onSubmit={add}>
          <label htmlFor="new-player-name">Add A New Player</label>
          <div className="add-player-row">
            <input
              id="new-player-name"
              maxLength={80}
              placeholder="Enter Their Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button
              className="primary"
              type="submit"
              disabled={!name.trim() || adding}
            >
              {adding ? "Adding…" : "Add Player"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="hdr">
          <b>Player List</b>
        </div>
        {error ? (
          <div className="directory-state">
            <p className="muted">{error}</p>
            <button className="ghost full" type="button" onClick={onRetry}>
              Try Again
            </button>
          </div>
        ) : loading ? (
          <p className="muted">Loading Players…</p>
        ) : players.length ? (
          <div className="player-directory-list">
            {players.map((player, index) => (
              <div className="directory-player" key={player.id}>
                <span className="directory-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="directory-name">{player.name}</span>
                <button
                  className="directory-discard"
                  type="button"
                  onClick={() => onDiscard(player)}
                >
                  Discard
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">
            No Players Yet. Add The First Name Above, Then Return To New Game.
          </p>
        )}
      </section>

      {discardedPlayers.length ? (
        <section className="card discarded-players">
          <div className="hdr">
            <div>
              <b>Discarded Players</b>
              <p className="muted card-note">
                Restore A Player Anytime. Permanent Deletion Is Owner-Protected
                And Unavailable When Saved History Exists.
              </p>
            </div>
            <span className="discarded-count">{discardedPlayers.length}</span>
          </div>
          <div className="player-directory-list">
            {discardedPlayers.map((player) => (
              <div className="directory-player discarded" key={player.id}>
                <span className="directory-index">ID</span>
                <span className="directory-name">{player.name}</span>
                <div className="directory-actions">
                  <button
                    className="restore-player"
                    type="button"
                    onClick={() => onRestore(player)}
                  >
                    Restore
                  </button>
                  <button
                    className="directory-delete"
                    type="button"
                    disabled={player.hasHistory}
                    title={
                      player.hasHistory
                        ? "Saved Session History Must Be Preserved"
                        : "Delete This Player Permanently"
                    }
                    onClick={() => onDeletePermanently(player)}
                  >
                    Delete Permanently
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
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
  const now = useBlindClock(Boolean(hand) && game.blinds?.unit === "minutes");
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

  return (
    <>
      {!hand ? (
        <section className="card next-hand-card">
          <b>{enoughPlayers ? "Ready for the next hand" : "Game over"}</b>
          <p className="muted card-note">
            {enoughPlayers
              ? "The table has enough players with chips to deal again."
              : "Fewer than two players have chips remaining. A busted player can buy in to continue."}
          </p>
          {!game.winnerAnnouncement ? (
            <div className="between-hands-actions">
              <button
                className="ghost full"
                type="button"
                onClick={props.onEditBlinds}
              >
                Edit Blind Plan
              </button>
              <BuyInOptions
                embedded
                game={game}
                onBuyIn={props.onBuyIn}
              />
              {enoughPlayers ? (
                <button
                  className="primary full"
                  type="button"
                  onClick={props.onNextHand}
                >
                  Deal The Next Hand
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="card">
          <button
            className="ghost full hand-back-button"
            type="button"
            onClick={props.onBackToBetweenHands}
          >
            Back To Between Hands
          </button>
          <div className="segs">
            {STAGES.map((stage, index) => (
              <div className={index <= hand.stage ? "on" : ""} key={stage}>
                <div className="bar" />
                <div className="lbl">{stage}</div>
              </div>
            ))}
          </div>
          <div className="pot-panel">
            <div className="stage">Pot</div>
            <div className="pot">{formatRupees(hand.pot)}</div>
            <div className="muted pot-meta">
              hand {hand.no} · blinds {formatRupees(blinds.smallBlind)}/
              {formatRupees(blinds.bigBlind)}
              {blinds.schedule ? ` · level ${blinds.level + 1}` : ""}
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
            <div className="table-positions" aria-label="Table positions">
              <span>Dealer · {game.players[hand.dealerIndex].name}</span>
              <span>
                Small Blind · {game.players[hand.smallBlindIndex].name}
              </span>
              <span>Big Blind · {game.players[hand.bigBlindIndex].name}</span>
            </div>
          </div>
          {hand.splitSel ? (
            <SplitView
              game={game}
              onToggle={props.onToggleSplit}
              onSplit={props.onSplitPot}
              onBack={props.onEndSplit}
            />
          ) : (
            <>
              <div className="plist">
                {[
                  ...activeIndexes(game),
                  ...game.players
                    .map((_, index) => index)
                    .filter((index) => !hand.in[index]),
                ].map((playerIndex) => (
                  <PlayerRow
                    key={`${hand.no}-${hand.stage}-${playerIndex}-${hand.acted[playerIndex]}`}
                    game={game}
                    playerIndex={playerIndex}
                    onAct={props.onAct}
                    onUndo={props.onUndoAction}
                  />
                ))}
              </div>
              <hr />
              {hand.stage < STAGES.length - 1 ? (
                <button
                  className="blue full"
                  disabled={pendingIndexes(game).length > 0}
                  onClick={props.onNextStage}
                >
                  Deal {STAGES[hand.stage + 1]}
                </button>
              ) : (
                <>
                  <div className="showdown">
                    Showdown<small>Pick the winner</small>
                  </div>
                  {activeIndexes(game).map((playerIndex) => (
                    <button
                      className="primary win"
                      disabled={pendingIndexes(game).length > 0}
                      key={playerIndex}
                      onClick={() => props.onPickWinner(playerIndex)}
                    >
                      <span>{game.players[playerIndex].name} wins</span>
                      <span>{formatRupees(hand.pot)}</span>
                    </button>
                  ))}
                  {activeIndexes(game).length > 1 ? (
                    <button
                      className="ghost full"
                      disabled={pendingIndexes(game).length > 0}
                      onClick={props.onBeginSplit}
                    >
                      Split Between Two Or More
                    </button>
                  ) : null}
                </>
              )}
            </>
          )}
          <button
            className="ghost danger full cancel-hand"
            onClick={props.onCancelHand}
          >
            Cancel hand
          </button>
        </section>
      )}

      <section className="card">
        <div className="hdr">
          <b>Standings</b>
          <span className="muted">start {formatRupees(game.startStack)}</span>
        </div>
        {game.players
          .map((player, index) => ({ player, index }))
          .sort((a, b) => b.player.stack - a.player.stack)
          .map(({ player, index }) => (
            <div className="prow standing" key={index}>
              <div className="nm">
                <b>{player.name}</b>
                <small className="stack-value">
                  Invested {formatRupees(totalBuyIns(game, index))}
                </small>
              </div>
              <div className="align-right">
                <b>{formatRupees(player.stack)}</b>
                <div className={net(index) >= 0 ? "pos result" : "neg result"}>
                  {net(index) >= 0 ? "+" : ""}
                  {formatRupees(net(index))}
                </div>
              </div>
            </div>
          ))}
      </section>

      <section className="card">
        <button className="blue full finish" onClick={props.onEndSession}>
          Finish And Save Game Session
        </button>
        <div className="grid2">
          <button onClick={props.onUndoHand}>Undo last hand</button>
          <button className="ghost danger" onClick={props.onDiscard}>
            Discard game
          </button>
        </div>
        {game.log.length ? (
          <>
            <hr />
            <div className="log">
              {game.log.map((line, index) => (
                <div key={`${line}-${index}`}>{line}</div>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}

function PokerHandsChart({
  pinned,
  onTogglePin,
}: {
  pinned?: boolean;
  onTogglePin?: () => void;
}) {
  return (
    <section className={`poker-hands-chart ${pinned ? "pinned" : ""}`}>
      <div className="poker-hands-heading">
        <div>
          <span className="hands-kicker">Strongest To Weakest</span>
          <h2>Poker Hand Rankings</h2>
        </div>
        <button type="button" onClick={onTogglePin}>
          {pinned ? "Unpin" : "Pin Chart"}
        </button>
      </div>
      <div className="hand-rank-grid">
        {POKER_HANDS.map((hand, index) => (
          <div className="hand-rank" key={hand.name}>
            <span className="hand-rank-number">{index + 1}</span>
            <div>
              <strong>{hand.name}</strong>
              <span>
                {hand.cards}
                {hand.note ? ` · ${hand.note}` : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
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
  embedded = false,
}: {
  game: GameState;
  onBuyIn: (playerIndex: number) => void;
  embedded?: boolean;
}) {
  const offers = game.players.flatMap((player, index) => {
    const amount = nextBuyIn(game, index);
    return amount === null ? [] : [{ player, index, amount }];
  });
  if (!offers.length) return null;

  return (
    <section
      className={embedded ? "buy-in-options embedded" : "card buy-in-options"}
    >
      <b>Buy In</b>
      <p className="muted">A busted player can return for half their last buy-in.</p>
      {offers.map(({ player, index, amount }) => (
        <button
          className="buy-in-button"
          key={player.id || index}
          type="button"
          onClick={() => onBuyIn(index)}
        >
          <span>{player.name}</span>
          <strong>Buy In · {formatRupees(amount)}</strong>
        </button>
      ))}
    </section>
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
        <span className="winner-suit" aria-hidden="true">
          ♠
        </span>
        <span className="winner-kicker">
          Hand {announcement.handNo} Complete
        </span>
        <h2 id="winner-title">{winnerText}</h2>
        <p>{formatRupees(announcement.pot)} Pot Awarded</p>
        <button className="primary full" type="button" onClick={onNext}>
          Next
        </button>
      </section>
    </div>
  );
}

function PlayerRow({
  game,
  playerIndex,
  onAct,
  onUndo,
}: {
  game: GameState;
  playerIndex: number;
  onAct: GameViewProps["onAct"];
  onUndo: (playerIndex: number) => void;
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
  const canUndo = hand.last[playerIndex] && !hand.splitSel;
  const hasAmount = amount.trim() !== "";

  if (folded || done || !isTurn) {
    return (
      <div className={`prow ${folded ? "folded" : done ? "done" : "waiting"}`}>
        <div className="nm">
          <b>{player.name}</b>
          <small className="stack-value">{formatRupees(player.stack)}</small>
        </div>
        <span className="tag">
          {folded
            ? "folded"
            : player.stack === 0
              ? "all-in"
              : !isTurn
                ? "waiting"
                : `in ${formatRupees(hand.committed[playerIndex])}`}
        </span>
        {canUndo ? (
          <button className="undo" onClick={() => onUndo(playerIndex)}>
            Undo
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="prow act current-turn">
      <div className="nm">
        <b>{player.name} <span className="turn-chip">Your turn</span></b>
        <small className="stack-value">
          Stack {formatRupees(player.stack)}
          {owed > 0 ? ` · to call ${formatRupees(owed)}` : ""} · min{" "}
          {owed > 0 ? "raise" : "bet"} {formatRupees(minimum)}
        </small>
      </div>
      <div className="ctl">
        <div className="amtwrap">
          <span>₹</span>
          <input
            className="amt"
            type="number"
            inputMode="numeric"
            min={minimum}
            aria-label={owed > 0 ? "Raise amount" : "Bet amount"}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="acts">
          <button
            className="action-call"
            disabled={hasAmount}
            onClick={() => onAct(playerIndex, owed > 0 ? "call" : "check")}
          >
            {owed > 0 ? "Call" : "Check"}
          </button>
          <button
            className="action-raise"
            disabled={!hasAmount}
            onClick={() =>
              onAct(playerIndex, "bet", Math.floor(Number(amount)))
            }
          >
            {owed > 0 ? "Raise" : "Bet"}
          </button>
          <button
            className="danger"
            disabled={hasAmount}
            onClick={() => onAct(playerIndex, "fold")}
          >
            Fold
          </button>
          <button
            className="action-all-in"
            onClick={() => onAct(playerIndex, "all-in")}
          >
            All In · {formatRupees(player.stack)}
          </button>
        </div>
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
    <>
      <div className="showdown">
        Split pot<small>Tap everyone who ties</small>
      </div>
      {activeIndexes(game).map((playerIndex) => {
        const isSelected = hand.splitSel?.includes(playerIndex) ?? false;
        const rank = selected.indexOf(playerIndex);
        const share = isSelected ? each + (rank < remainder ? 1 : 0) : 0;
        return (
          <button
            className={`win ${isSelected ? "primary" : ""}`}
            key={playerIndex}
            onClick={() => onToggle(playerIndex)}
          >
            <span>
              {isSelected ? "✓" : "○"} {game.players[playerIndex].name}
            </span>
            <span>{isSelected ? formatRupees(share) : "—"}</span>
          </button>
        );
      })}
      <button
        className="blue full split-submit"
        disabled={selected.length < 2}
        onClick={onSplit}
      >
        {selected.length > 1
          ? `Split ${formatRupees(hand.pot)} ${selected.length} ways`
          : "Select at least 2 players"}
      </button>
      <button className="ghost full split-back" onClick={onBack}>
        Back
      </button>
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
    <article className={`sess ${discarded ? "discarded" : ""}`}>
      <div className="hdr session-hdr">
        <div>
          <b>{session.name || `Game ${session.sessionNumber || ""}`}</b>
          <div className="muted session-meta">
            {formatDate(session.date)} · {session.hands} hands · big blind{" "}
            {formatRupees(session.ante)} · {session.results.length} players
          </div>
        </div>
        <div className="session-actions">
          {discarded ? (
            <>
              <button
                className="restore-session"
                type="button"
                onClick={() => onRestore?.(session.id)}
              >
                Restore
              </button>
              <button
                className="delete-session"
                type="button"
                onClick={() => onDeletePermanently?.(session.id)}
              >
                Delete Permanently
              </button>
            </>
          ) : (
            <button
              className="discard-session"
              type="button"
              onClick={() => onDiscard?.(session.id)}
            >
              Discard Session
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
      {sortedResults.map((result, index) => (
        <div className="sline" key={`${result.playerId || result.name}-${index}`}>
          <span className="session-result-player">
            {index === 0 ? "🏆 " : ""}
            {result.name}
            {result.buyIns && result.buyIns.length > 1 ? (
              <small>
                Buy-ins {formatRupees(result.buyIns.reduce((sum, amount) => sum + amount, 0))}
              </small>
            ) : null}
          </span>
          <span className={result.net >= 0 ? "pos" : "neg"}>
            {result.net >= 0 ? "+" : ""}
            {formatRupees(result.net)}
          </span>
        </div>
      ))}
    </article>
  );
}

function HistoryView({
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
  const leaderboard = useMemo(() => buildLeaderboard(history), [history]);
  const importInput = useRef<HTMLInputElement>(null);

  return (
    <>
      <section className="card">
        <div className="hdr">
          <b>All-time leaderboard</b>
          <span className="muted">
            {loading
              ? "syncing…"
              : `${history.length} session${history.length === 1 ? "" : "s"}`}
          </span>
        </div>
        {error ? (
          <>
            <p className="muted">{error}</p>
            <button className="ghost full retry" onClick={onRetry}>
              Try again
            </button>
          </>
        ) : loading ? (
          <p className="muted">Loading the shared ledger…</p>
        ) : leaderboard.length ? (
          leaderboard.map((entry, rank) => (
            <div className="prow leaderboard-row" key={entry.name}>
              <span className={`rank ${rank === 0 ? "gold" : ""}`}>
                {rank + 1}
              </span>
              <div className="nm">
                <b>{entry.name}</b>
                <small>
                  {entry.sessions} session{entry.sessions === 1 ? "" : "s"} ·{" "}
                  {entry.hands} hands · won {entry.wins}
                </small>
              </div>
              <div className="align-right">
                <b className={entry.net >= 0 ? "pos" : "neg"}>
                  {entry.net >= 0 ? "+" : ""}
                  {formatRupees(entry.net)}
                </b>
                <div className="muted best">
                  best {entry.best >= 0 ? "+" : ""}
                  {formatRupees(entry.best)}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="muted">
            No Saved Sessions Yet. Finish A Game With “Finish And Save Game
            Session” And It Will Show Up Here.
          </p>
        )}
      </section>

      {!error && history.length ? (
        <section className="card">
          <div className="hdr">
            <b>Game Sessions</b>
          </div>
          {history.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onDiscard={onDiscard}
            />
          ))}
        </section>
      ) : null}

      {!error && discardedSessions.length ? (
        <section className="card discarded-sessions">
          <div className="hdr">
            <div>
              <b>Discarded Sessions</b>
              <p className="muted card-note">
                These Sessions Do Not Count Towards The Leaderboard.
              </p>
            </div>
            <span className="discarded-count">{discardedSessions.length}</span>
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
        </section>
      ) : null}

      <section className="card">
        <div className="grid2">
          <button onClick={onExport}>Export Backup</button>
          <button onClick={() => importInput.current?.click()}>Import</button>
        </div>
        <input
          ref={importInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={onImport}
        />
        <p className="muted backup-note">
          History is shared from Neon across every device. Export gives you an
          extra offline backup; importing never overwrites and only adds
          sessions that are not already in the ledger.
        </p>
      </section>
    </>
  );
}

function Modal({
  state,
  handsPinned,
  onToggleHandsPin,
  onClose,
  onConfirm,
}: {
  state: ModalState;
  handsPinned: boolean;
  onToggleHandsPin: () => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [password, setPassword] = useState("");

  function confirm() {
    if (state.kind === "rules" || state.kind === "hands") {
      onClose();
      return;
    }
    if (state.kind === "password") {
      if (!password) return;
      state.onConfirm(password);
    } else {
      state.onConfirm();
    }
    onConfirm();
  }

  if (state.kind === "hands") {
    return (
      <div
        className="modal hands-modal show"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className="sheet hands-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Poker Hand Rankings"
        >
          <PokerHandsChart
            pinned={handsPinned}
            onTogglePin={onToggleHandsPin}
          />
          <button className="ghost full" type="button" onClick={onClose}>
            Close Chart
          </button>
        </div>
      </div>
    );
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
                  Between Hands, A Busted Player Can Buy In For Half Their
                  Previous Buy-In, Rounded Down To A Whole Chip. Buy-Ins Stop
                  Once Half Would Be Zero.
                </p>
              </div>
            </section>

            <section>
              <span className="rule-number">05</span>
              <div>
                <h3>Raise From Under The Gun</h3>
                <p>
                  The First Player After The Big Blind Is Under The Gun. Their
                  Minimum Pre-Flop Raise Makes The Total Bet Twice The Big
                  Blind. After That First Action, Any Raise Only Needs To Be
                  Higher Than The Current Bet. A Player May Always Go All-In
                  For Less.
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
                  Including Blinds. Undo Last Hand Restores Its Starting
                  Stacks. Finish And Save Game Session Requires One Completed
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
        <div className="msg">{state.message}</div>
        {state.kind === "password" ? (
          <>
            <label htmlFor="delete-password">Deletion password</label>
            <input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              placeholder="Enter password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") confirm();
              }}
            />
          </>
        ) : null}
        <button
          className={state.kind === "password" ? "danger" : "primary"}
          disabled={state.kind === "password" && !password}
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
