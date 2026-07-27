"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  activeIndexes,
  buildLeaderboard,
  dealNewHand,
  formatDate,
  formatRupees,
  GAME_STORAGE_KEY,
  getRaiseRule,
  HISTORY_STORAGE_KEY,
  minimumRaise,
  pendingIndexes,
  RAISE_RULES,
  STAGES,
} from "@/lib/poker/game";
import type {
  GameState,
  PlayerAction,
  PlayerProfile,
  PokerSession,
  RaiseRule,
} from "@/lib/poker/types";

type View = "home" | "setup" | "game" | "history" | "players";
type ModalState =
  | {
      kind: "rules";
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
      onConfirm: (password: string) => void;
    };

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

async function playersApi<T>(options: RequestInit = {}): Promise<T> {
  const response = await fetch("/api/players", {
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
    return data?.players ? data : null;
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

function recordAction(
  game: GameState,
  playerIndex: number,
  action: Omit<PlayerAction, "line">,
  text: string,
) {
  const hand = game.hand;
  if (!hand) return;
  const line = `H${hand.no} ${STAGES[hand.stage]}: ${text}`;
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
    `H${hand.no}: ${game.players[playerIndex].name} wins ${formatRupees(pot)}${
      automatic ? " (others folded)" : ""
    }`,
  );
  game.lastHand = { stacksBefore: [...hand.stacksBeforeHand] };
  game.hand = null;
  dealNewHand(game);
  return pot;
}

export function PokerLedger() {
  const [game, setGame] = useState<GameState | null>(null);
  const [history, setHistory] = useState<PokerSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [playersError, setPlayersError] = useState("");
  const [view, setView] = useState<View>("home");
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  }, []);

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
      const data = await sessionsApi<{ sessions?: PokerSession[] }>();
      setHistory(Array.isArray(data.sessions) ? data.sessions : []);
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
      const data = await playersApi<{ players?: PlayerProfile[] }>();
      setPlayers(Array.isArray(data.players) ? data.players : []);
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
      if (storedGame) setView("game");
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
    if (!ready) return;
    if (game) {
      window.localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(game));
    } else {
      window.localStorage.removeItem(GAME_STORAGE_KEY);
    }
  }, [game, ready]);

  const ask = useCallback(
    (message: string, confirmLabel: string, onConfirm: () => void) => {
      setModal({ kind: "confirm", message, confirmLabel, onConfirm });
    },
    [],
  );

  const startGame = useCallback(
    (input: {
      stack: number;
      ante: number;
      players: PlayerProfile[];
      raiseRule: RaiseRule;
    }) => {
      if (input.ante <= 0) {
        showToast("Buy-in must be greater than 0");
        return;
      }
      const nextGame: GameState = {
        ante: input.ante,
        startStack: input.stack,
        startedAt: Date.now(),
        raiseRule: input.raiseRule,
        players: input.players.map((player) => ({
          id: player.id,
          name: player.name,
          stack: input.stack,
        })),
        hand: null,
        handNo: 0,
        log: [],
        _setupCount: input.players.length,
      };
      dealNewHand(nextGame);
      setGame(nextGame);
      setView("game");
    },
    [showToast],
  );

  const addPlayer = useCallback(
    async (name: string) => {
      try {
        const data = await playersApi<{ player: PlayerProfile }>({
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

  function act(playerIndex: number, type: PlayerAction["type"], amount?: number) {
    if (!game?.hand) return;
    const next = structuredClone(game);
    const hand = next.hand;
    if (!hand || !hand.in[playerIndex] || hand.acted[playerIndex]) return;
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
      const chips = amount ?? minimumRaise(next, playerIndex);
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
      const previousRaise = hand.lastRaise;
      const previousHigh = hand.roundHigh;
      player.stack -= chips;
      hand.committed[playerIndex] += chips;
      hand.pot += chips;
      hand.acted[playerIndex] = true;
      if (wasRaise) {
        hand.lastRaise = Math.max(total - previousHigh, next.ante);
        hand.roundHigh = total;
      }
      recordAction(
        next,
        playerIndex,
        { type, chips, prevRaise: previousRaise },
        `${player.name} ${
          wasRaise
            ? opening
              ? `bets ${formatRupees(chips)}`
              : `raises to ${formatRupees(total)}`
            : `calls ${formatRupees(chips)}`
        }`,
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
    if (action.prevRaise !== undefined) hand.lastRaise = action.prevRaise;
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
    if (game.hand.stage >= 2) {
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
    hand.lastRaise = next.ante;
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
      `H${hand.no}: split ${formatRupees(hand.pot)} between ${winners
        .map((index) => next.players[index].name)
        .join(", ")}`,
    );
    next.lastHand = { stacksBefore: [...hand.stacksBeforeHand] };
    next.hand = null;
    dealNewHand(next);
    setGame(next);
    showToast(`Pot split ${winners.length} ways`);
  }

  function cancelHand() {
    if (!game?.hand) return;
    ask(
      `Cancel hand ${game.hand.no}? Everyone gets their money back, including the buy-in.`,
      "Cancel hand",
      () => {
        const next = structuredClone(game);
        const hand = next.hand;
        if (!hand) return;
        next.players.forEach((player, index) => {
          player.stack = hand.stacksBeforeHand[index];
        });
        next.log = next.log.filter(
          (line) =>
            !line.startsWith(`H${hand.no} `) &&
            !line.startsWith(`H${hand.no}:`),
        );
        next.handNo = hand.no - 1;
        next.hand = null;
        dealNewHand(next);
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
      if (!next.lastHand) return;
      next.players.forEach((player, index) => {
        player.stack = next.lastHand?.stacksBefore[index] ?? player.stack;
      });
      const undoneNumber = next.hand ? next.hand.no - 1 : next.handNo;
      next.log = next.log.filter(
        (line) =>
          !line.startsWith(`H${undoneNumber} `) &&
          !line.startsWith(`H${undoneNumber}:`),
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
        setView("home");
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
      date: game.startedAt,
      ended: Date.now(),
      ante: game.ante,
      startStack: game.startStack,
      hands: completedHands,
      results: game.players.map((player, index) => ({
        ...(player.id ? { playerId: player.id } : {}),
        name: player.name,
        net: endStacks[index] - game.startStack,
        end: endStacks[index],
      })),
    };

    showToast("Saving to shared ledger…");
    try {
      await sessionsApi("", {
        method: "POST",
        body: JSON.stringify({ sessions: [session] }),
      });
      setGame(null);
      setView("history");
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

  function deleteSession(id: string) {
    const session = history.find((item) => item.id === id);
    if (!session) return;
    setModal({
      kind: "password",
      message: `Delete the session from ${formatDate(
        session.date,
      )}? This changes the public leaderboard.`,
      onConfirm: (password) => void deleteRemoteSession(id, password),
    });
  }

  async function deleteRemoteSession(id: string, password: string) {
    try {
      await sessionsApi(`?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "X-Delete-Password": password },
      });
      setHistory((current) => current.filter((session) => session.id !== id));
      showToast("Session deleted");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Session was not deleted",
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
      const existing = new Set(history.map((session) => session.id));
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
      showToast(error instanceof SyntaxError ? "Not a valid file" : "Import failed");
    }
  }

  return (
    <main className={`ledger-shell ${view === "home" ? "home-shell" : ""}`}>
      {view !== "home" ? (
        <header className="topbar">
          <button
            className="brand brand-button"
            type="button"
            aria-label="Return To Menoka Card Games Home"
            onClick={() => {
              setView("home");
              window.scrollTo(0, 0);
            }}
          >
            <span className="spade" aria-hidden="true">
              ♠
            </span>
            <span className="word">Menoka Card Games</span>
          </button>
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
            onGame={() => setView(game ? "game" : "setup")}
            onHistory={() => setView("history")}
            onPlayers={() => setView("players")}
            onRules={() => setModal({ kind: "rules" })}
          />
        ) : view === "history" ? (
          <HistoryView
            history={history}
            loading={historyLoading}
            error={historyError}
            onRetry={() => void refreshHistory()}
            onDelete={deleteSession}
            onExport={exportData}
            onImport={importData}
          />
        ) : view === "players" ? (
          <PlayersView
            players={players}
            loading={playersLoading}
            error={playersError}
            onRetry={() => void refreshPlayers()}
            onAdd={addPlayer}
          />
        ) : view === "setup" ? (
          <SetupView
            players={players}
            loading={playersLoading}
            error={playersError}
            onRetry={() => void refreshPlayers()}
            onManagePlayers={() => setView("players")}
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
            onEndSession={endSession}
            onUndoHand={undoHand}
            onDiscard={discardGame}
          />
        ) : (
          <HomeView
            hasGame={false}
            historyCount={history.length}
            playerCount={players.length}
            onGame={() => setView("setup")}
            onHistory={() => setView("history")}
            onPlayers={() => setView("players")}
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
          onClose={() => setModal(null)}
          onConfirm={() => setModal(null)}
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
  onRules,
}: {
  hasGame: boolean;
  historyCount: number;
  playerCount: number;
  onGame: () => void;
  onHistory: () => void;
  onPlayers: () => void;
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
            <strong>{hasGame ? "Continue Current Game" : "Start A New Game"}</strong>
            <small>
              {hasGame
                ? "Return To The Hand In Progress"
                : "Choose The Players And Buy-In"}
            </small>
          </span>
          <span className="home-arrow" aria-hidden="true">
            →
          </span>
        </button>

        <button className="home-action" type="button" onClick={onHistory}>
          <span className="home-suit" aria-hidden="true">
            ♣
          </span>
          <span className="home-action-copy">
            <strong>All Time Standings</strong>
            <small>
              {historyCount} Saved Session{historyCount === 1 ? "" : "s"}
            </small>
          </span>
          <span className="home-arrow" aria-hidden="true">
            →
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
          <span className="home-arrow" aria-hidden="true">
            →
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
  onManagePlayers,
  onStart,
}: {
  players: PlayerProfile[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onManagePlayers: () => void;
  onStart: (input: {
    stack: number;
    ante: number;
    players: PlayerProfile[];
    raiseRule: RaiseRule;
  }) => void;
}) {
  const [stack, setStack] = useState(10_000);
  const [ante, setAnte] = useState(100);
  const [raiseRule, setRaiseRule] = useState<RaiseRule>("ante");
  const [playerCount, setPlayerCount] = useState(3);
  const [selectedIds, setSelectedIds] = useState(["", "", ""]);

  const ruleExample = useMemo(() => {
    const buyIn = Math.max(1, ante || 100);
    if (raiseRule === "double") {
      return `Open ${formatRupees(buyIn)} → raise ${formatRupees(
        2 * buyIn,
      )} → ${formatRupees(4 * buyIn)} → ${formatRupees(8 * buyIn)}`;
    }
    if (raiseRule === "free") {
      return `Open ${formatRupees(
        buyIn,
      )} → any raise above the current bet`;
    }
    return `Open ${formatRupees(buyIn)} → raise ${formatRupees(
      2 * buyIn,
    )} → ${formatRupees(3 * buyIn)} → ${formatRupees(4 * buyIn)}`;
  }, [ante, raiseRule]);

  function updatePlayerCount(value: number) {
    const count = Math.max(2, Math.min(10, value || 2));
    setPlayerCount(count);
    setSelectedIds((current) =>
      Array.from({ length: count }, (_, index) => current[index] || ""),
    );
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
      stack,
      ante,
      raiseRule,
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
      <div className="row setup-row">
        <div>
          <label htmlFor="stack">Starting stack</label>
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
          <label htmlFor="ante">Buy-in</label>
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
      <label htmlFor="raise-rule">Minimum raise</label>
      <select
        className="select-control"
        id="raise-rule"
        value={raiseRule}
        onChange={(event) => setRaiseRule(event.target.value as RaiseRule)}
      >
        {Object.entries(RAISE_RULES).map(([key, rule]) => (
          <option key={key} value={key}>
            {rule.name}
          </option>
        ))}
      </select>
      <p className="muted rule-note">
        {RAISE_RULES[raiseRule].note}
        <br />
        <b>{ruleExample}</b>
      </p>
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
          <label>Select Players</label>
          <button type="button" className="text-button" onClick={onManagePlayers}>
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
        {selectedIds.map((selectedId, index) => (
          <select
            className="select-control"
            key={index}
            aria-label={`Player ${index + 1}`}
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
        ))}
        {!loading && !error && players.length < 2 ? (
          <p className="muted player-help">
            Add At Least Two Players Before Starting A Game.
          </p>
        ) : null}
      </div>
      <button
        className="primary full start-game"
        type="submit"
        disabled={!selectionComplete || stack < 0 || ante < 1}
      >
        Start Game
      </button>
    </form>
  );
}

function PlayersView({
  players,
  loading,
  error,
  onRetry,
  onAdd,
}: {
  players: PlayerProfile[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onAdd: (name: string) => Promise<PlayerProfile | null>;
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
        <div className="hdr">
          <div>
            <b>Existing Players</b>
            <p className="muted card-note">
              One Saved Name Keeps Every Future Session And Standing Together.
            </p>
          </div>
          <span className="player-count-badge">{players.length}</span>
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
          <span className="muted">Shared Across Every Device</span>
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
                <span>{player.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">
            No Players Yet. Add The First Name Above, Then Return To New Game.
          </p>
        )}
      </section>
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
  onEndSession: () => void;
  onUndoHand: () => void;
  onDiscard: () => void;
};

function GameView(props: GameViewProps) {
  const { game } = props;
  const hand = game.hand;
  const net = (index: number) =>
    game.players[index].stack - game.startStack;

  return (
    <>
      {!hand ? (
        <section className="card">
          <b>Game over</b>
          <p className="muted card-note">
            Fewer than 2 players can post the buy-in of{" "}
            {formatRupees(game.ante)}.
          </p>
        </section>
      ) : (
        <section className="card">
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
              hand {hand.no} · buy-in {formatRupees(game.ante)} · to call{" "}
              {formatRupees(hand.roundHigh)} ·{" "}
              {RAISE_RULES[getRaiseRule(game)].name.toLowerCase()}
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
              {hand.stage < 2 ? (
                <button
                  className="blue full"
                  disabled={pendingIndexes(game).length > 0}
                  onClick={props.onNextStage}
                >
                  Deal {STAGES[hand.stage + 1]} →
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
                      Split between two or more →
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
          Finish &amp; save session
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
  const owed = hand.roundHigh - hand.committed[playerIndex];
  const minimum = minimumRaise(game, playerIndex);
  const canUndo = hand.last[playerIndex] && !hand.splitSel;

  if (folded || done) {
    return (
      <div className={`prow ${folded ? "folded" : "done"}`}>
        <div className="nm">
          <b>{player.name}</b>
          <small>{formatRupees(player.stack)}</small>
        </div>
        <span className="tag">
          {folded ? "folded" : `in ${formatRupees(hand.committed[playerIndex])}`}
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
    <div className="prow act">
      <div className="nm">
        <b>{player.name}</b>
        <small>
          {formatRupees(player.stack)}
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
            placeholder={String(minimum)}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="acts">
          <button
            className="primary"
            onClick={() =>
              onAct(
                playerIndex,
                "bet",
                amount.trim() === "" ? minimum : Math.floor(Number(amount)),
              )
            }
          >
            {owed > 0 ? "Raise" : "Bet"}
          </button>
          <button
            className={owed > 0 ? "blue" : ""}
            onClick={() => onAct(playerIndex, owed > 0 ? "call" : "check")}
          >
            {owed > 0 ? "Call" : "Check"}
          </button>
          <button
            className="danger"
            onClick={() => onAct(playerIndex, "fold")}
          >
            Fold
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
  const remainder = selected.length
    ? hand.pot - each * selected.length
    : 0;

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
        ← Back
      </button>
    </>
  );
}

function HistoryView({
  history,
  loading,
  error,
  onRetry,
  onDelete,
  onExport,
  onImport,
}: {
  history: PokerSession[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onDelete: (id: string) => void;
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
            No saved sessions yet. Finish a game with “Finish &amp; save
            session” and it will show up here.
          </p>
        )}
      </section>

      {!error && history.length ? (
        <section className="card">
          <div className="hdr">
            <b>Sessions</b>
          </div>
          {history.map((session) => {
            const sortedResults = [...session.results].sort(
              (a, b) => b.net - a.net,
            );
            return (
              <article className="sess" key={session.id}>
                <div className="hdr session-hdr">
                  <div>
                    <b>{formatDate(session.date)}</b>
                    <div className="muted session-meta">
                      {session.hands} hands · buy-in{" "}
                      {formatRupees(session.ante)} · {session.results.length}{" "}
                      players
                    </div>
                  </div>
                  <button
                    className="undo"
                    aria-label={`Delete session from ${formatDate(
                      session.date,
                    )}`}
                    onClick={() => onDelete(session.id)}
                  >
                    ✕
                  </button>
                </div>
                {sortedResults.map((result, index) => (
                  <div className="sline" key={`${result.name}-${index}`}>
                    <span>
                      {index === 0 ? "🏆 " : ""}
                      {result.name}
                    </span>
                    <span className={result.net >= 0 ? "pos" : "neg"}>
                      {result.net >= 0 ? "+" : ""}
                      {formatRupees(result.net)}
                    </span>
                  </div>
                ))}
              </article>
            );
          })}
        </section>
      ) : null}

      <section className="card">
        <div className="grid2">
          <button onClick={onExport}>↓ Export backup</button>
          <button onClick={() => importInput.current?.click()}>↑ Import</button>
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
  onClose,
  onConfirm,
}: {
  state: ModalState;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [password, setPassword] = useState("");

  function confirm() {
    if (state.kind === "rules") {
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
                  Choose A Starting Stack, Buy-In, Minimum Raise Rule, And Two
                  To Ten Players. There Are No Small Or Big Blinds.
                </p>
              </div>
            </section>

            <section>
              <span className="rule-number">02</span>
              <div>
                <h3>Start Every Hand</h3>
                <p>
                  Every Player Who Can Afford The Buy-In Posts It
                  Automatically. Deal Two Hole Cards And Reveal The Flop
                  Physically. There Is No Pre-Flop Betting Round, And The App
                  Does Not Record Cards Or Burns.
                </p>
              </div>
            </section>

            <section>
              <span className="rule-number">03</span>
              <div>
                <h3>Take One Action Per Street</h3>
                <p>
                  Play Flop, Turn, Then River, Burning One Physical Card Before
                  Each Community-Card Reveal. Each Active Player Acts Exactly
                  Once On Each Street. A Later Bet Or Raise Does Not Reopen
                  Action For Anyone Who Already Acted. The Street Ends After
                  Every Active Player Has Acted.
                </p>
              </div>
            </section>

            <section>
              <span className="rule-number">04</span>
              <div>
                <h3>Choose An Action</h3>
                <p>
                  Check Only When Nothing Is Owed. Bet To Open The Action, Call
                  The Current Bet, Raise It, Or Fold. A Short-Stacked Player Can
                  Call Or Bet All-In With Their Remaining Chips. If Only One
                  Player Remains, They Win Automatically.
                </p>
              </div>
            </section>

            <section>
              <span className="rule-number">05</span>
              <div>
                <h3>Follow The Selected Raise Rule</h3>
                <ul>
                  <li>
                    <strong>Buy-In Increment:</strong> Raise By At Least One
                    Buy-In.
                  </li>
                  <li>
                    <strong>Match Last Raise:</strong> Raise By At Least The
                    Previous Raise Size, Or One Buy-In If That Is Larger.
                  </li>
                  <li>
                    <strong>Any Amount:</strong> Raise The Current Bet By At
                    Least ₹1.
                  </li>
                </ul>
                <p>
                  An Opening Bet Is At Least One Buy-In Unless The Player Is
                  Going All-In For Less.
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
                  Leftover ₹1 Chips Awarded In Player Order. The Next Hand
                  Starts Automatically And Posts A New Buy-In.
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
                  Including Buy-Ins. Undo Last Hand Restores Its Starting
                  Stacks. Finish And Save Requires One Completed Hand; Any
                  Unfinished Hand Is Refunded In The Saved Results.
                </p>
              </div>
            </section>
          </div>

          <button className="primary rules-close" onClick={onClose}>
            Close Rules
          </button>
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
          {state.kind === "password" ? "Delete session" : state.confirmLabel}
        </button>
        <button className="ghost" onClick={onClose}>
          Never mind
        </button>
      </div>
    </div>
  );
}
