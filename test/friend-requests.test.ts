import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  friendErrorFromDatabase,
  parseCodeInput,
} from "../lib/friends/requests.ts";

describe("reading typed codes", () => {
  it("reads user codes however they are typed", () => {
    for (const typed of ["7KQ4M2XP", "7kq4-m2xp", " 7KQ4 M2XP ", "7KQ4-M2XP"]) {
      assert.deepEqual(parseCodeInput(typed), { kind: "user", code: "7KQ4M2XP" });
    }
  });

  it("tells player codes apart from user codes that start with P", () => {
    assert.deepEqual(parseCodeInput("P-N7QA-2G2P"), { kind: "player", code: "N7QA2G2P" });
    assert.deepEqual(parseCodeInput("pn7qa2g2p"), { kind: "player", code: "N7QA2G2P" });
    assert.deepEqual(parseCodeInput("PQ4M-2XPA"), { kind: "user", code: "PQ4M2XPA" });
  });

  it("rejects anything else", () => {
    for (const typed of ["", "7KQ4M2X", "7KQ4M2X0", "X-7KQ4-M2XP", "P-7KQ4-M2X0", "7KQ4M2XPQ7", null, 42]) {
      assert.equal(parseCodeInput(typed), null, String(typed));
    }
    assert.equal(parseCodeInput("7".repeat(41)), null);
  });
});

describe("friend errors from the database", () => {
  it("maps each known code to a status and message", () => {
    const mapped = friendErrorFromDatabase(new Error("friend:too-many-pending"));
    assert.equal(mapped?.status, 429);
    assert.equal(mapped?.code, "friend-too-many-pending");
    assert.match(mapped?.error ?? "", /20 requests/);
    assert.equal(friendErrorFromDatabase(new Error("friend:declined-recently"))?.status, 429);
    assert.equal(friendErrorFromDatabase(new Error("friend:request-not-found"))?.status, 404);
  });

  it("ignores unknown codes and other errors", () => {
    assert.equal(friendErrorFromDatabase(new Error("friend:made-up")), null);
    assert.equal(friendErrorFromDatabase(new Error("duplicate key value")), null);
    assert.equal(friendErrorFromDatabase(new Error("xfriend:self")), null);
    assert.equal(friendErrorFromDatabase("friend:self"), null);
  });
});
