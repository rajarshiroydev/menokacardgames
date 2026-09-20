import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  accountGameStorageKey,
  prepareLegacySessionsForAdoption,
} from "../lib/poker/storage.ts";
import type { PokerSession } from "../lib/poker/types.ts";

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
