import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { deriveSessionAccounting } from "../lib/poker/accounting.ts";
import { validateSession } from "../lib/poker/session-validation.ts";
import type { PlayerProfile } from "../lib/poker/types.ts";
import { TESTBED_PERSONAS } from "../lib/testbed/personas.ts";
import { generator, makeGame, playerNames } from "../testbed/lib/games.ts";

function players(count: number): PlayerProfile[] {
  return playerNames(generator(1), count, ["Asha"]).map((name, index) => ({
    id: `p${index}`,
    name,
    code: "ABCDEFGH",
    linked: false,
    createdAt: 0,
  }));
}

describe("testbed seed games", () => {
  test("every generated game passes the app's own validation and balances", () => {
    const random = generator(20260927);
    const roster = players(60);
    for (let index = 0; index < 500; index += 1) {
      const game = makeGame(random, `tb-${index}`, roster, 1_720_000_000_000 + index);
      assert.deepEqual(validateSession(game), game);
      assert.equal(deriveSessionAccounting(game).totalNet, 0);
    }
  });

  test("the same seed gives the same games", () => {
    const roster = players(12);
    const first = makeGame(generator(7), "a", roster, 1);
    const second = makeGame(generator(7), "a", roster, 1);
    assert.deepEqual(first, second);
  });

  test("player names are distinct and keep the required ones", () => {
    const names = playerNames(generator(3), 60, ["Asha"]);
    assert.equal(names.length, 60);
    assert.equal(new Set(names).size, 60);
    assert.equal(names[0], "Asha");
  });

  test("personas use the undeliverable .test domain and unique keys", () => {
    assert.ok(TESTBED_PERSONAS.every((persona) => persona.email.endsWith(".test")));
    assert.equal(
      new Set(TESTBED_PERSONAS.map((persona) => persona.key)).size,
      TESTBED_PERSONAS.length,
    );
  });
});
