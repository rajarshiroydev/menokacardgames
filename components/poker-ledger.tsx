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
  PokerSession,
  RaiseRule,
} from "@/lib/poker/types";

type View = "table" | "history";
type ModalState =
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
  const [view, setView] = useState<View>("table");
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

  useEffect(() => {
    const hydrationTimer = setTimeout(() => {
      setGame(readStoredGame());
      setReady(true);
      void refreshHistory();
    }, 0);
    return () => {
      clearTimeout(hydrationTimer);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refreshHistory]);

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
      names: string[];
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
        players: input.names.map((name) => ({
          name,
          stack: input.stack,
        })),
        hand: null,
        handNo: 0,
        log: [],
        _setupCount: input.names.length,
      };
      dealNewHand(nextGame);
      setGame(nextGame);
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
      () => setGame(null),
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

  const topRight =
    view === "history"
      ? historyLoading
        ? "Syncing"
        : `${history.length} saved`
      : game?.players
        ? `Hand ${Math.max(1, game.handNo)}`
        : "Setup";

  return (
    <main className="ledger-shell">
      <header className="topbar">
        <div className="brand">
          <span className="spade" aria-hidden="true">
            ♠
          </span>
          <span className="word">Ledger</span>
        </div>
        <div className="topright">{topRight}</div>
      </header>

      <div className="app">
        <nav className="tabs" aria-label="Poker ledger sections">
          <button
            className={view === "table" ? "on" : ""}
            onClick={() => {
              setView("table");
              window.scrollTo(0, 0);
            }}
          >
            Table
          </button>
          <button
            className={view === "history" ? "on" : ""}
            onClick={() => {
              setView("history");
              window.scrollTo(0, 0);
            }}
          >
            History
          </button>
        </nav>

        {view === "history" ? (
          <HistoryView
            history={history}
            loading={historyLoading}
            error={historyError}
            onRetry={() => void refreshHistory()}
            onDelete={deleteSession}
            onExport={exportData}
            onImport={importData}
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
          <SetupView onStart={startGame} />
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

function SetupView({
  onStart,
}: {
  onStart: (input: {
    stack: number;
    ante: number;
    names: string[];
    raiseRule: RaiseRule;
  }) => void;
}) {
  const [stack, setStack] = useState(10_000);
  const [ante, setAnte] = useState(100);
  const [raiseRule, setRaiseRule] = useState<RaiseRule>("ante");
  const [playerCount, setPlayerCount] = useState(3);
  const [names, setNames] = useState(["", "", ""]);

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
    setNames((current) =>
      Array.from({ length: count }, (_, index) => current[index] || ""),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onStart({
      stack,
      ante,
      raiseRule,
      names: names.map((name, index) => name.trim() || `Player ${index + 1}`),
    });
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="hdr">
        <b>New game</b>
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
      <label htmlFor="player-count">Number of players</label>
      <input
        id="player-count"
        type="number"
        inputMode="numeric"
        min="2"
        max="10"
        value={playerCount}
        onChange={(event) => updatePlayerCount(Number(event.target.value))}
      />
      <div className="names">
        <label>Player names</label>
        {names.map((name, index) => (
          <input
            key={index}
            aria-label={`Player ${index + 1} name`}
            placeholder={`Player ${index + 1}`}
            value={name}
            onChange={(event) =>
              setNames((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? event.target.value : item,
                ),
              )
            }
          />
        ))}
      </div>
      <button className="primary full start-game" type="submit">
        Start game
      </button>
    </form>
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
    if (state.kind === "password") {
      if (!password) return;
      state.onConfirm(password);
    } else {
      state.onConfirm();
    }
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
