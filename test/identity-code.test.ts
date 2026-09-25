import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cleanDisplayName,
  formatPlayerCode,
  formatUserCode,
  isIdentityCode,
  MAX_DISPLAY_NAME_LENGTH,
} from "../lib/accounts/identity-code.ts";

describe("identity codes", () => {
  it("accepts eight characters from the unambiguous alphabet", () => {
    assert.equal(isIdentityCode("7KQ4M2XP"), true);
    assert.equal(isIdentityCode("23456789"), true);
    assert.equal(isIdentityCode("ZYXWVUTS"), true);
  });

  it("rejects look-alike characters, wrong lengths and formatted codes", () => {
    for (const code of ["7KQ4M2X0", "7KQ4M2XO", "7KQ4M2X1", "7KQ4M2XI", "7KQ4M2XL"]) {
      assert.equal(isIdentityCode(code), false, code);
    }
    assert.equal(isIdentityCode("7kq4m2xp"), false);
    assert.equal(isIdentityCode("7KQ4M2X"), false);
    assert.equal(isIdentityCode("7KQ4M2XPP"), false);
    assert.equal(isIdentityCode("7KQ4-M2XP"), false);
    assert.equal(isIdentityCode(null), false);
  });

  it("formats user and player codes differently", () => {
    assert.equal(formatUserCode("7KQ4M2XP"), "7KQ4-M2XP");
    assert.equal(formatPlayerCode("7KQ4M2XP"), "P-7KQ4-M2XP");
  });
});

describe("display names", () => {
  it("trims and collapses spaces", () => {
    assert.equal(cleanDisplayName("  Debraj   Das "), "Debraj Das");
  });

  it("rejects empty and too-long names", () => {
    assert.throws(() => cleanDisplayName("   "));
    assert.throws(() => cleanDisplayName(undefined));
    assert.throws(() => cleanDisplayName({ name: "Debraj" }));
    assert.throws(() => cleanDisplayName(42));
    assert.equal(
      cleanDisplayName("a".repeat(MAX_DISPLAY_NAME_LENGTH)).length,
      MAX_DISPLAY_NAME_LENGTH,
    );
    assert.throws(() => cleanDisplayName("a".repeat(MAX_DISPLAY_NAME_LENGTH + 1)));
  });
});
