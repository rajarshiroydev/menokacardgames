import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  inviteErrorFromDatabase,
  inviteMessage,
  invitePath,
  isInviteToken,
} from "../lib/friends/invites.ts";

describe("invites to Pokerize (migration 0030)", () => {
  it("accepts only tokens shaped like the ones the server makes", () => {
    assert.equal(isInviteToken("a".repeat(43)), true);
    assert.equal(isInviteToken("Ab9_-".repeat(8) + "xyz"), true);
    assert.equal(isInviteToken("a".repeat(42)), false);
    assert.equal(isInviteToken("a".repeat(42) + "/"), false);
    assert.equal(isInviteToken(undefined), false);
  });

  it("builds the invite page and the shared message", () => {
    assert.equal(invitePath("tok"), "/join/tok");
    assert.equal(
      inviteMessage("Asha", "Jay B."),
      "Asha invited you to Pokerize, where your poker results as Jay B. are waiting.",
    );
  });

  it("maps the database's invite errors and ignores others", () => {
    assert.deepEqual(inviteErrorFromDatabase(new Error("invite:not-found")), {
      status: 404,
      error: "This invite has expired or was already used",
      code: "invite-not-found",
    });
    assert.equal(inviteErrorFromDatabase(new Error("invite:unknown")), null);
    assert.equal(inviteErrorFromDatabase(new Error("friend:self")), null);
  });
});
