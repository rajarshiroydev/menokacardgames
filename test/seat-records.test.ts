import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { gameFromSession, continuationError } from "../lib/poker/continue-session.ts";
import {
  awardPots,
  cancelCurrentHand,
  cashOutPlayer,
  dealNewHand,
  joinGame,
  returnToTable,
  savedPlayerRecord,
  undoLastHand,
} from "../lib/poker/game.ts";
import {
  createLedgerGame,
  ledgerCashOut,
  ledgerJoin,
  ledgerReturn,
  ledgerSession,
} from "../lib/poker/ledger.ts";
import { isSameSession, type SavedSession } from "../lib/poker/session-conflict.ts";
import { validateSession } from "../lib/poker/session-validation.ts";
import type { GameState, PokerSession } from "../lib/poker/types.ts";

/** A new tracked game with three players, before the first hand. */
function newGame(): GameState {
  return {
    currency: "INR",
    ante: 100,
    baseAnte: 100,
    blinds: null,
    blindLevel: 0,
    blindPlans: [{ effectiveHand: 1, effectiveAt: 1_000, baseBigBlind: 100, schedule: null }],
    blindLevels: [],
    startStack: 10_000,
    startedAt: 1_000,
    players: [
      { id: "a", name: "Asha", stack: 10_000, buyIns: [10_000] },
      { id: "b", name: "Bikram", stack: 10_000, buyIns: [10_000] },
      { id: "c", name: "Chitra", stack: 10_000, buyIns: [10_000] },
    ],
    hand: null,
    handNo: 0,
    dealerIndex: -1,
    log: [],
    tracksPlayers: true,
    _setupCount: 3,
  };
}

/** Deals a hand and gives the pot to the first player dealt in. */
function playHand(game: GameState, now: number) {
  dealNewHand(game, now);
  const winner = game.hand!.in.findIndex(Boolean);
  assert.equal(awardPots(game, [[winner]]), true);
}

const hands = (game: GameState) => game.players.map((player) => player.handsPlayed);

describe("hands played", () => {
  it("counts each hand a player is dealt into", () => {
    const game = newGame();
    playHand(game, 2_000);
    playHand(game, 3_000);
    assert.deepEqual(hands(game), [2, 2, 2]);
  });

  it("doesn't count a cancelled hand twice", () => {
    const game = newGame();
    playHand(game, 2_000);
    dealNewHand(game, 3_000);
    assert.equal(cancelCurrentHand(game, 4_000), true);
    // The hand is dealt again, so it counts once.
    assert.deepEqual(hands(game), [2, 2, 2]);
  });

  it("takes an undone hand back, with the next hand if it was dealt", () => {
    const game = newGame();
    playHand(game, 2_000);
    playHand(game, 3_000);
    dealNewHand(game, 4_000);
    assert.deepEqual(hands(game), [3, 3, 3]);
    assert.equal(undoLastHand(game, 5_000), true);
    // Hand 2 is dealt again; hand 3 is gone.
    assert.deepEqual(hands(game), [2, 2, 2]);
    assert.equal(game.hand?.no, 2);
  });

  it("doesn't count a busted player who sits out", () => {
    const game = newGame();
    playHand(game, 2_000);
    game.players[2].stack = 0;
    playHand(game, 3_000);
    assert.deepEqual(hands(game), [2, 2, 1]);
  });

  it("isn't recorded in older games", () => {
    const game = newGame();
    delete game.tracksPlayers;
    playHand(game, 2_000);
    assert.deepEqual(hands(game), [undefined, undefined, undefined]);
    assert.deepEqual(savedPlayerRecord(game, 0, 1), {});
  });
});

describe("late joins and cash-outs", () => {
  it("records the first hand a late joiner can play and when", () => {
    const game = newGame();
    playHand(game, 2_000);
    assert.equal(joinGame(game, { id: "d", name: "Dev" }, 3, 10_000, 2_500), true);
    assert.equal(game.players[3].joinedHand, 2);
    assert.equal(game.players[3].joinedAt, 2_500);
    playHand(game, 3_000);
    assert.equal(game.players[3].handsPlayed, 1);
  });

  it("doesn't call a join before the first hand late", () => {
    const game = newGame();
    game.hand = null;
    assert.equal(joinGame(game, { id: "d", name: "Dev" }, 3, 10_000, 1_500), true);
    assert.equal(game.players[3].joinedAt, undefined);
  });

  it("records a cash-out's last hand and time, and clears it on return", () => {
    const game = newGame();
    playHand(game, 2_000);
    playHand(game, 3_000);
    assert.equal(cashOutPlayer(game, 1, 3_500), true);
    assert.equal(game.players[1].leftHand, 2);
    assert.equal(game.players[1].leftAt, 3_500);
    assert.equal(returnToTable(game, 1), true);
    assert.equal(game.players[1].leftHand, undefined);
    assert.equal(game.players[1].leftAt, undefined);
  });

  it("saves the record without a hand still in progress", () => {
    const game = newGame();
    playHand(game, 2_000);
    assert.equal(cashOutPlayer(game, 2, 2_500), true);
    assert.equal(joinGame(game, { id: "d", name: "Dev" }, 3, 10_000, 2_600), true);
    dealNewHand(game, 3_000);
    // Hand 2 is in progress, so 1 hand is saved.
    assert.deepEqual(savedPlayerRecord(game, 0, 1), { handsPlayed: 1 });
    assert.deepEqual(savedPlayerRecord(game, 2, 1), {
      handsPlayed: 1,
      leftHand: 1,
      leftAt: 2_500,
    });
    assert.deepEqual(savedPlayerRecord(game, 3, 1), {
      handsPlayed: 0,
      joinedHand: 2,
      joinedAt: 2_600,
    });
  });

  it("records times only in a quick ledger", () => {
    const game = createLedgerGame({
      gameName: "",
      sessionLabel: "Game 1",
      currency: "INR",
      chipUnit: "whole",
      startStack: 1_000,
      players: [
        { id: "a", name: "Asha" },
        { id: "b", name: "Bikram" },
      ],
      buyIns: null,
      startedAt: 1_000,
    })!;
    assert.equal(ledgerJoin(game, { id: "c", name: "Chitra" }, 1_000, 2_000), true);
    assert.equal(ledgerCashOut(game, 0, 1_500, 3_000), true);
    assert.equal(ledgerCashOut(game, 1, 0, 3_100), true);
    assert.equal(ledgerReturn(game, 1), true);
    const session = ledgerSession(game, [null, 500, 1_000], 4_000);
    assert.deepEqual(
      session.results.map(({ joinedAt, leftAt, handsPlayed }) => ({ joinedAt, leftAt, handsPlayed })),
      [
        { joinedAt: undefined, leftAt: 3_000, handsPlayed: undefined },
        { joinedAt: undefined, leftAt: undefined, handsPlayed: undefined },
        { joinedAt: 2_000, leftAt: undefined, handsPlayed: undefined },
      ],
    );
    assert.doesNotThrow(() => validateSession(session));
  });
});

/** A saved tracked game: Bikram cashed out after hand 3, Dev joined for hand 2. */
function savedGame(): SavedSession {
  return {
    id: "s1000",
    sessionNumber: 4,
    date: 1_000,
    ended: 9_000,
    ante: 100,
    startStack: 10_000,
    hands: 5,
    results: [
      { playerId: "a", name: "Asha", net: 5_000, end: 15_000, handsPlayed: 5 },
      { playerId: "b", name: "Bikram", net: -2_000, end: 8_000, handsPlayed: 3, leftHand: 3, leftAt: 5_000 },
      { playerId: "d", name: "Dev", net: -3_000, end: 7_000, handsPlayed: 4, joinedHand: 2, joinedAt: 2_000 },
    ],
  };
}

describe("saving the record", () => {
  it("accepts a consistent record", () => {
    const session = validateSession(savedGame());
    assert.deepEqual(session.results[1], savedGame().results[1]);
  });

  for (const [label, change] of [
    ["more hands than the game", { handsPlayed: 6 }],
    ["more hands than the player was there for", { handsPlayed: 4 }],
    ["a join at hand 1", { joinedHand: 1, joinedAt: 2_000 }],
    ["a cash-out after the last hand", { leftHand: 6 }],
    ["a cash-out time after the end", { leftAt: 10_000 }],
    ["a cash-out hand without its time", { leftAt: undefined }],
  ] as const) {
    it(`refuses ${label}`, () => {
      const session = savedGame();
      Object.assign(session.results[1], change);
      assert.throws(() => validateSession(session));
    });
  }

  it("refuses hands played for some players only", () => {
    const session = savedGame();
    delete session.results[0].handsPlayed;
    assert.throws(() => validateSession(session), /Every player's hands played/);
  });

  it("refuses hands in a quick ledger", () => {
    const session: PokerSession = {
      ...savedGame(),
      kind: "ledger",
      ante: 0,
      hands: 0,
      results: savedGame().results.map(({ playerId, name, net, end }) => ({ playerId, name, net, end })),
    };
    assert.doesNotThrow(() => validateSession(session));
    session.results[0].handsPlayed = 0;
    assert.throws(() => validateSession(session), /no hands/);
  });

  it("treats a retry with a different record as a different game", () => {
    const changed = savedGame();
    changed.results[1].leftAt = 5_001;
    assert.equal(isSameSession(savedGame(), savedGame()), true);
    assert.equal(isSameSession(savedGame(), changed), false);
  });
});

describe("continuing a tracked game", () => {
  it("keeps cash-outs out and carries the counts on", () => {
    const game = gameFromSession(savedGame(), [], "INR", 10_000, () => 0);
    assert.equal(game.tracksPlayers, true);
    assert.equal(game.players[1].left, true);
    assert.equal(game.players[1].leftHand, 3);
    assert.equal(game.players[2].joinedHand, 2);
    dealNewHand(game, 11_000);
    assert.deepEqual(hands(game), [6, 3, 5]);
  });

  it("seats everyone again in an older game", () => {
    const older = savedGame();
    older.results.forEach((result) => {
      delete result.handsPlayed;
      delete result.leftHand;
      delete result.leftAt;
      delete result.joinedHand;
      delete result.joinedAt;
    });
    const game = gameFromSession(older, [], "INR", 10_000, () => 0);
    assert.equal(game.tracksPlayers, undefined);
    assert.equal(game.players[1].left, undefined);
  });

  it("refuses a continuation that loses earlier hands", () => {
    const later = { ...savedGame(), ended: 12_000, hands: 6 };
    later.results = later.results.map((result) => ({ ...result }));
    later.results[0].handsPlayed = 6;
    assert.equal(continuationError(savedGame(), later), null);
    later.results[2].handsPlayed = 3;
    assert.match(continuationError(savedGame(), later) ?? "", /record/);
  });
});
