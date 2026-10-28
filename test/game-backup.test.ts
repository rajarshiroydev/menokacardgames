import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  gameBackupId,
  isDeviceId,
  isGameBackupId,
  summarizeGameBackup,
  validateGameBackupState,
} from "../lib/poker/game-backup.ts";
import { LOG_LIMIT } from "../lib/poker/action-log.ts";
import type { GameState } from "../lib/poker/types.ts";

function game(overrides: Partial<GameState> = {}): GameState {
  return {
    sessionLabel: "Game 79",
    ante: 100,
    startStack: 10_000,
    startedAt: 1_760_000_000_000,
    players: [
      { id: "a", name: "Asha", stack: 12_000, buyIns: [10_000] },
      { id: "b", name: "Bikram", stack: 8_000, buyIns: [10_000] },
      { id: "c", name: "Chirag", stack: 10_000, buyIns: [10_000], left: true },
    ],
    hand: null,
    handNo: 12,
    dealerIndex: 0,
    log: ["Hand 12: Asha wins ₹400"],
    _setupCount: 3,
    ...overrides,
  };
}

describe("game backup IDs", () => {
  it("uses the save ID, or the saved game's ID when continued", () => {
    assert.equal(gameBackupId(game()), "s1760000000000");
    assert.equal(
      gameBackupId(
        game({ continues: { id: "s17", sessionNumber: 6, ended: 2, hands: 40 } }),
      ),
      "s17",
    );
  });

  it("accepts only safe game and device IDs", () => {
    assert.equal(isGameBackupId("s1760000000000"), true);
    assert.equal(isGameBackupId("s1 OR 1=1"), false);
    assert.equal(isGameBackupId(""), false);
    assert.equal(isDeviceId("Ab3_-Ab3_-Ab3_-Ab3_-Ab3_"), true);
    assert.equal(isDeviceId("short"), false);
    assert.equal(isDeviceId("x".repeat(65)), false);
  });
});

describe("validateGameBackupState", () => {
  it("accepts a game in progress stored under its own ID", () => {
    const state = game();
    assert.equal(validateGameBackupState(state, "s1760000000000"), state);
  });

  it("refuses a game stored under another game's ID", () => {
    assert.throws(
      () => validateGameBackupState(game(), "s1"),
      /doesn't match its game/,
    );
  });

  const refusals: Array<[string, unknown]> = [
    ["something that isn't a game", "hello"],
    ["an array", []],
    ["one player", game({ players: [{ name: "Asha", stack: 1 }] })],
    ["eleven players", game({
      players: Array.from({ length: 11 }, (_, index) => ({
        name: `P${index}`,
        stack: 1,
      })),
    })],
    ["a player without a name", game({
      players: [{ name: " ", stack: 1 }, { name: "B", stack: 1 }],
    })],
    ["a negative stack", game({
      players: [{ name: "A", stack: -1 }, { name: "B", stack: 1 }],
    })],
    ["a fractional stack", game({
      players: [{ name: "A", stack: 0.5 }, { name: "B", stack: 1 }],
    })],
    ["no starting stack", game({ startStack: 0 })],
    ["a made-up hand number", game({ handNo: -3 })],
    ["a log that isn't text", game({ log: [1, 2] as unknown as string[] })],
    ["a log over the limit", game({ log: Array(LOG_LIMIT + 1).fill("line") })],
  ];
  for (const [label, state] of refusals) {
    it(`refuses ${label}`, () => {
      assert.throws(() => validateGameBackupState(state, "s1760000000000"));
    });
  }
});

describe("summarizeGameBackup", () => {
  it("names the game and counts the players still at the table", () => {
    assert.deepEqual(
      summarizeGameBackup("s1760000000000", game(), 1_760_000_100_000, false),
      {
        gameId: "s1760000000000",
        thisDevice: false,
        name: "Game 79",
        ledger: false,
        handNo: 12,
        handInProgress: false,
        players: 2,
        updatedAt: 1_760_000_100_000,
      },
    );
  });
});
