import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chipsForUnit,
  countedStack,
  readChipSet,
  STARTER_CHIP_SET,
  storedChipSet,
} from "../lib/poker/chip-set.ts";

describe("chip sets", () => {
  it("accepts a valid set and sorts it by value", () => {
    const read = readChipSet([
      { colour: "black", value: 50_000 },
      { colour: "white", value: 500 },
    ]);
    assert.deepEqual(read, {
      chipSet: [
        { colour: "white", value: 500 },
        { colour: "black", value: 50_000 },
      ],
    });
  });

  it("accepts the starter set", () => {
    assert.ok("chipSet" in readChipSet(STARTER_CHIP_SET));
  });

  it("refuses empty, oversized, repeated and invalid sets", () => {
    assert.deepEqual(readChipSet([]), { error: "Add at least one chip colour" });
    assert.deepEqual(readChipSet(null), { error: "Add at least one chip colour" });
    const nine = ["white", "red", "blue", "green", "black", "purple", "yellow", "orange", "pink"]
      .map((colour, index) => ({ colour, value: (index + 1) * 100 }));
    assert.deepEqual(readChipSet(nine), { error: "A chip set has up to 8 colours" });
    assert.deepEqual(readChipSet([{ colour: "gold", value: 100 }]), {
      error: "Choose each colour from the list",
    });
    for (const value of [0, -100, 1.5, "100", 1_000_000_001]) {
      assert.deepEqual(readChipSet([{ colour: "red", value }]), {
        error: "Give every colour a value above 0",
      });
    }
    assert.deepEqual(
      readChipSet([
        { colour: "red", value: 100 },
        { colour: "red", value: 200 },
      ]),
      { error: "Each colour can be used once" },
    );
    assert.deepEqual(
      readChipSet([
        { colour: "red", value: 100 },
        { colour: "blue", value: 100 },
      ]),
      { error: "Each colour needs its own value" },
    );
    assert.equal(storedChipSet({ colour: "red" }), null);
  });

  it("puts values in the game's unit and leaves out fractional chips", () => {
    const set = [
      { colour: "white" as const, value: 25 },
      { colour: "red" as const, value: 500 },
    ];
    assert.deepEqual(chipsForUnit(set, "whole"), [{ colour: "red", chips: 5 }]);
    assert.deepEqual(chipsForUnit(set, "cents"), [
      { colour: "white", chips: 25 },
      { colour: "red", chips: 500 },
    ]);
    assert.deepEqual(chipsForUnit(set, undefined), [{ colour: "red", chips: 5 }]);
  });

  it("adds a colour count up exactly", () => {
    const chips = chipsForUnit(STARTER_CHIP_SET, "whole");
    assert.equal(countedStack(chips, { white: 3, green: 12, black: 8 }), 15 + 1_200 + 4_000);
    assert.equal(countedStack(chips, { red: -2, purple: 1.5, black: 1 }), 500);
    assert.equal(countedStack(chips, {}), 0);
    // 0.25 chips in a cents game: four make a dollar.
    assert.equal(
      countedStack(chipsForUnit([{ colour: "red", value: 25 }], "cents"), { red: 4 }),
      100,
    );
  });
});
