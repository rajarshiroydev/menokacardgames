import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { dealNewHand } from "../lib/poker/game.ts";
import {
  buildLiveSnapshot,
  deriveLiveView,
  isLiveToken,
  validateLiveSnapshot,
  type LiveSnapshot,
} from "../lib/poker/live-view.ts";
import type { GameState } from "../lib/poker/types.ts";

function game(stacks: number[], buyIns?: number[][]): GameState {
  return {
    sessionLabel: "Game 26",
    ante: 100,
    startStack: 10_000,
    startedAt: Date.UTC(2026, 8, 25),
    players: stacks.map((stack, index) => ({
      name: ["Debraj", "Rajarshi", "Pratik"][index],
      stack,
      buyIns: buyIns?.[index] ?? [10_000],
    })),
    hand: null,
    handNo: 3,
    dealerIndex: 0,
    log: [],
    _setupCount: 0,
  };
}

function snapshot(overrides: Partial<LiveSnapshot> = {}): LiveSnapshot {
  return {
    gameName: "Game 26",
    startStack: 10_000,
    handNo: 3,
    handInProgress: false,
    bigBlind: 100,
    players: [
      { name: "Debraj", stack: 14_000, buyIns: [10_000], settledStack: 14_000 },
      { name: "Rajarshi", stack: 6_000, buyIns: [10_000], settledStack: 6_000 },
    ],
    ...overrides,
  };
}

describe("live view snapshot", () => {
  test("between hands, the live and settled stacks are the same", () => {
    const built = buildLiveSnapshot(game([15_000, 5_000, 10_000]));
    assert.equal(built.gameName, "Game 26");
    assert.equal(built.handInProgress, false);
    assert.deepEqual(
      built.players.map((player) => [player.stack, player.settledStack]),
      [[15_000, 15_000], [5_000, 5_000], [10_000, 10_000]],
    );
  });

  test("during a hand, settled stacks come from the start of the hand", () => {
    const state = game([15_000, 5_000, 10_000]);
    dealNewHand(state);
    const built = buildLiveSnapshot(state);
    assert.equal(built.handInProgress, true);
    assert.equal(built.handNo, 4);
    assert.deepEqual(
      built.players.map((player) => player.settledStack),
      [15_000, 5_000, 10_000],
    );
    // The blinds have left two stacks, so the live total is lower.
    const live = built.players.reduce((sum, player) => sum + player.stack, 0);
    assert.equal(live, 30_000 - 150);
    // It still validates and ranks on settled chips.
    const view = deriveLiveView(validateLiveSnapshot(built));
    assert.deepEqual(
      view.standings.map((row) => [row.name, row.net]),
      [["Debraj", 5_000], ["Pratik", 0], ["Rajarshi", -5_000]],
    );
  });

  test("carries no player IDs or hand details", () => {
    const state = game([10_000, 10_000]);
    state.players[0].id = "a0d20199-57b0-4f55-a23a-64d012950724";
    state.log = ["Hand 3: Debraj wins ₹200"];
    const text = JSON.stringify(buildLiveSnapshot(state));
    assert.equal(text.includes("a0d20199"), false);
    assert.equal(text.includes("wins"), false);
  });
});

describe("live view standings", () => {
  test("counts rebuys as invested and ranks by net", () => {
    const view = deriveLiveView(
      validateLiveSnapshot(
        buildLiveSnapshot(
          game([25_000, 5_000, 10_000], [[10_000, 10_000], [10_000], [10_000]]),
        ),
      ),
    );
    assert.deepEqual(view.standings, [
      { rank: 1, name: "Debraj", stack: 25_000, invested: 20_000, net: 5_000, rebuys: 1 },
      { rank: 2, name: "Pratik", stack: 10_000, invested: 10_000, net: 0, rebuys: 0 },
      { rank: 3, name: "Rajarshi", stack: 5_000, invested: 10_000, net: -5_000, rebuys: 0 },
    ]);
  });

  test("tied players share a rank, ordered by name", () => {
    const view = deriveLiveView(
      validateLiveSnapshot(buildLiveSnapshot(game([10_000, 10_000, 10_000]))),
    );
    assert.deepEqual(
      view.standings.map((row) => [row.rank, row.name]),
      [[1, "Debraj"], [1, "Pratik"], [1, "Rajarshi"]],
    );
  });

  test("refuses settled chips that don't balance", () => {
    const unbalanced = snapshot();
    unbalanced.players[0].stack = 15_000;
    unbalanced.players[0].settledStack = 15_000;
    assert.throws(() => deriveLiveView(validateLiveSnapshot(unbalanced)), /balance/);
  });
});

describe("live view validation", () => {
  test("accepts a valid snapshot and cleans names", () => {
    const input = snapshot();
    input.players[0].name = "  Debraj   Das ";
    assert.equal(validateLiveSnapshot(input).players[0].name, "Debraj Das");
  });

  const rejects: Array<[string, (input: LiveSnapshot) => void]> = [
    ["a missing game name", (input) => { input.gameName = " "; }],
    ["one player", (input) => { input.players = input.players.slice(0, 1); }],
    ["a fractional stack", (input) => { input.players[0].stack = 1.5; }],
    ["a negative stack", (input) => { input.players[0].stack = -1; }],
    ["a string stack", (input) => {
      (input.players[0] as unknown as { stack: string }).stack = "100";
    }],
    ["a first buy-in other than the starting stack", (input) => {
      input.players[0].buyIns = [5_000];
    }],
    ["a made-up rebuy", (input) => { input.players[0].buyIns = [10_000, 777]; }],
    ["too many buy-ins", (input) => {
      input.players[0].buyIns = Array(65).fill(10_000);
    }],
    ["live and settled stacks that differ between hands", (input) => {
      input.players[0].stack = 13_900;
    }],
    ["a stack that grew during a hand", (input) => {
      input.handInProgress = true;
      input.players[0].stack = 14_100;
    }],
    ["duplicate names", (input) => { input.players[1].name = "debraj"; }],
  ];

  for (const [label, change] of rejects) {
    test(`rejects ${label}`, () => {
      const input = structuredClone(snapshot());
      change(input);
      assert.throws(() => deriveLiveView(validateLiveSnapshot(input)));
    });
  }

  test("tokens must be 32 bytes of base64url", () => {
    assert.equal(isLiveToken("A".repeat(43)), true);
    assert.equal(isLiveToken("A".repeat(42)), false);
    assert.equal(isLiveToken(`${"A".repeat(42)}=`), false);
    assert.equal(isLiveToken("../../api/sessions"), false);
  });
});
