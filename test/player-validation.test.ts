import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  cleanPlayerName,
  playerNameKey,
} from "../lib/poker/player-validation.ts";

describe("player validation", () => {
  test("normalizes spacing without changing the display spelling", () => {
    assert.equal(cleanPlayerName("  Rajarshi   Roy  "), "Rajarshi Roy");
    assert.equal(playerNameKey("  Rajarshi   Roy  "), "rajarshi roy");
  });

  test("rejects empty and oversized names", () => {
    assert.throws(() => cleanPlayerName("   "), /1 to 80/);
    assert.throws(() => cleanPlayerName("a".repeat(81)), /1 to 80/);
  });
});
