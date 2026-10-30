import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  accountGameStorageKey,
  normalizeGameState,
  prepareLegacySessionsForAdoption,
} from "../lib/poker/storage.ts";
import type { GameState, PokerSession } from "../lib/poker/types.ts";

const session = (id: string, playerId: string): PokerSession => ({
  id,
  name: id,
  sessionNumber: 1,
  date: 1,
  ended: 2,
  ante: 100,
  startStack: 1000,
  hands: 1,
  results: [
    { playerId, name: "One", net: 100, end: 1100 },
    { playerId: `${playerId}-two`, name: "Two", net: -100, end: 900 },
  ],
});

describe("account-scoped browser storage", () => {
  it("uses a different active-game key for each account", () => {
    assert.notEqual(
      accountGameStorageKey("account-a"),
      accountGameStorageKey("account-b"),
    );
  });

  it("adopts only reviewed sessions and remaps players by name", () => {
    const adopted = prepareLegacySessionsForAdoption(
      [session("one", "legacy-one"), session("two", "legacy-two")],
      new Set(["two"]),
    );

    assert.deepEqual(adopted.map((item) => item.id), ["two"]);
    assert.equal("playerId" in adopted[0].results[0], false);
    assert.equal(adopted[0].results[0].name, "One");
  });
});

// A game as an older version of the app kept it: one fixed big blind, no
// buy-in lists, no blind plans.
function olderGame(): Record<string, unknown> {
  return {
    ante: 200,
    startStack: 10_000,
    startedAt: 5,
    players: [
      { name: "One", stack: 12_000 },
      { name: "Two", stack: 8_000 },
    ],
    hand: null,
    handNo: 3,
    dealerIndex: 1,
    log: [],
    _setupCount: 2,
  };
}

describe("a stored or restored game", () => {
  it("is null when it isn't a game", () => {
    for (const input of [null, undefined, {}, "game", 7, { players: null }]) {
      assert.equal(normalizeGameState(input), null);
    }
  });

  it("gains the blind plan and buy-ins older versions didn't keep", () => {
    const game = normalizeGameState(olderGame()) as GameState;
    assert.equal(game.baseAnte, 200);
    assert.equal(game.blinds, null);
    assert.equal(game.blindLevel, 0);
    assert.deepEqual(game.blindPlans, [
      { effectiveHand: 1, effectiveAt: 5, baseBigBlind: 200, schedule: null },
    ]);
    assert.deepEqual(game.blindLevels, [{ handNo: 1, dealtAt: 5, bigBlind: 200 }]);
    assert.deepEqual(
      game.players.map((player) => player.buyIns),
      [[10_000], [10_000]],
    );
    assert.equal(game.hand, null);
  });

  it("records a later big blind as the current level", () => {
    const game = normalizeGameState({ ...olderGame(), baseAnte: 100 }) as GameState;
    assert.equal(game.blindLevels?.length, 2);
    assert.equal(game.blindLevels?.[1].handNo, 3);
    assert.equal(game.blindLevels?.[1].bigBlind, 200);
  });

  it("keeps a valid chip value and drops one that isn't", () => {
    const kept = normalizeGameState({ ...olderGame(), chipValue: { chips: 100, cents: 50 } });
    assert.deepEqual(kept?.chipValue, { chips: 100, cents: 50 });
    const dropped = normalizeGameState({ ...olderGame(), chipValue: { chips: 0, cents: 50 } });
    assert.equal(dropped && "chipValue" in dropped, false);
  });

  it("gives the last hand the buy-ins from before it", () => {
    const game = normalizeGameState({
      ...olderGame(),
      lastHand: { handNo: 2 },
    }) as GameState;
    assert.deepEqual(game.lastHand?.buyInsBefore, [[10_000], [10_000]]);
  });

  it("deals a fresh hand in a game from before positional betting", () => {
    const game = normalizeGameState({
      ...olderGame(),
      dealerIndex: undefined,
      hand: { stacksBeforeHand: [11_500, 9_000] },
      winnerAnnouncement: { names: ["One"], pot: 100, handNo: 3, split: false },
    }) as GameState;
    assert.equal(Number.isInteger(game.dealerIndex), true);
    assert.ok(game.hand);
    assert.equal(game.winnerAnnouncement, null);
    // Stacks go back to the start of the unfinished hand before the deal.
    assert.equal(
      game.players.reduce((total, player) => total + player.stack, 0) + game.hand.pot,
      20_500,
    );
  });
});
