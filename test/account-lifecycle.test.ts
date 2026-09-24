import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  accountAccessError,
  canRecoverAccount,
  DELETION_GRACE_PERIOD_DAYS,
  deletionDeadline,
  isAuthUserId,
  type HostAccount,
} from "../lib/accounts/lifecycle.ts";

function account(
  lifecycleState: HostAccount["lifecycleState"],
): HostAccount {
  return {
    id: "a0d20199-57b0-4f55-a23a-64d012950724",
    authUserId: "8f054970-6316-4206-a16a-f42f2090d132",
    lifecycleState,
    deletionRequestedAt:
      lifecycleState === "active" ? null : Date.UTC(2026, 8, 20),
  };
}

describe("host account boundary", () => {
  test("accepts provider UUIDs without trusting arbitrary identifiers", () => {
    assert.equal(isAuthUserId("8f054970-6316-4206-a16a-f42f2090d132"), true);
    assert.equal(isAuthUserId("therajarshiroy@gmail.com"), false);
    assert.equal(isAuthUserId("../another-account"), false);
  });

  test("allows active accounts", () => {
    assert.equal(accountAccessError(account("active")), null);
  });

  test("locks accounts throughout deletion", () => {
    assert.match(
      accountAccessError(account("deletion_requested")) || "",
      /deletion is pending/,
    );
    assert.match(
      accountAccessError(account("purging")) || "",
      /permanently deleted/,
    );
  });
});

describe("account deletion grace period", () => {
  const requestedAt = Date.UTC(2026, 8, 20);
  const day = 24 * 60 * 60 * 1000;

  test("schedules permanent deletion thirty days after the request", () => {
    assert.equal(DELETION_GRACE_PERIOD_DAYS, 30);
    assert.equal(deletionDeadline(requestedAt), requestedAt + 30 * day);
  });

  test("allows recovery only before the deadline", () => {
    const pending = account("deletion_requested");
    assert.equal(canRecoverAccount(pending, requestedAt + 29 * day), true);
    assert.equal(canRecoverAccount(pending, requestedAt + 30 * day - 1), true);
    assert.equal(canRecoverAccount(pending, requestedAt + 30 * day), false);
  });

  test("never recovers active or purging accounts", () => {
    assert.equal(canRecoverAccount(account("active"), requestedAt), false);
    assert.equal(canRecoverAccount(account("purging"), requestedAt), false);
  });
});
