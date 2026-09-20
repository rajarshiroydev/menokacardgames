import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  accountAccessError,
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
