import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type DuePurge,
  type PurgeStore,
  purgeDueAccounts,
} from "../lib/accounts/purge.ts";

function fakeStore(due: DuePurge[], identities: Set<string>) {
  const calls: string[] = [];
  const failures = new Map<string, string>();
  const deleted = new Set<string>();
  const store: PurgeStore = {
    async claimDueAccounts(max) {
      calls.push(`claim:${max}`);
      return due;
    },
    async authIdentityExists(id) {
      return identities.has(id);
    },
    async recordIdentityDeleted(accountId) {
      calls.push(`identity-recorded:${accountId}`);
    },
    async deleteAccountData(accountId) {
      calls.push(`data:${accountId}`);
      deleted.add(accountId);
      return true;
    },
    async recordFailure(accountId, failure) {
      failures.set(accountId, failure);
    },
  };
  return { store, calls, failures, deleted };
}

describe("account purge", () => {
  it("deletes the identity before the data and confirms it is gone", async () => {
    const identities = new Set(["auth-a"]);
    const { store, calls, deleted } = fakeStore(
      [{ accountId: "acct-a", authUserId: "auth-a", attempts: 0 }],
      identities,
    );
    const order: string[] = [];

    const report = await purgeDueAccounts(store, async (id) => {
      order.push(`identity:${id}`);
      identities.delete(id);
    });

    assert.deepEqual(report, {
      due: 1,
      purged: 1,
      failed: 0,
      outcomes: [{ accountId: "acct-a", status: "purged" }],
    });
    assert.deepEqual(order, ["identity:auth-a"]);
    assert.deepEqual(calls, [
      "claim:10",
      "identity-recorded:acct-a",
      "data:acct-a",
    ]);
    assert.ok(deleted.has("acct-a"));
  });

  it("keeps the data when the identity survives the provider call", async () => {
    const { store, failures, deleted } = fakeStore(
      [{ accountId: "acct-a", authUserId: "auth-a", attempts: 0 }],
      new Set(["auth-a"]),
    );

    const report = await purgeDueAccounts(store, async () => {});

    assert.equal(report.failed, 1);
    assert.equal(report.outcomes[0].step, "identity");
    assert.match(failures.get("acct-a") ?? "", /still exists/);
    assert.equal(deleted.size, 0);
  });

  it("records provider errors and keeps the data for a retry", async () => {
    const { store, failures, deleted } = fakeStore(
      [{ accountId: "acct-a", authUserId: "auth-a", attempts: 2 }],
      new Set(["auth-a"]),
    );

    await purgeDueAccounts(store, async () => {
      throw new Error("Neon API returned 503");
    });

    assert.equal(failures.get("acct-a"), "identity: Neon API returned 503");
    assert.equal(deleted.size, 0);
  });

  it("resumes when the identity was already deleted by an earlier run", async () => {
    let providerCalls = 0;
    const { store, deleted } = fakeStore(
      [{ accountId: "acct-a", authUserId: "auth-a", attempts: 1 }],
      new Set(),
    );

    const report = await purgeDueAccounts(store, async () => {
      providerCalls += 1;
    });

    assert.equal(providerCalls, 0);
    assert.equal(report.purged, 1);
    assert.ok(deleted.has("acct-a"));
  });

  it("does not let one failure block other accounts", async () => {
    const identities = new Set(["auth-a", "auth-b"]);
    const { store, deleted } = fakeStore(
      [
        { accountId: "acct-a", authUserId: "auth-a", attempts: 0 },
        { accountId: "acct-b", authUserId: "auth-b", attempts: 0 },
      ],
      identities,
    );

    const report = await purgeDueAccounts(store, async (id) => {
      if (id === "auth-a") throw new Error("timeout");
      identities.delete(id);
    });

    assert.equal(report.purged, 1);
    assert.equal(report.failed, 1);
    assert.deepEqual([...deleted], ["acct-b"]);
  });

  it("records a data deletion failure after the identity is gone", async () => {
    const identities = new Set(["auth-a"]);
    const { store, failures } = fakeStore(
      [{ accountId: "acct-a", authUserId: "auth-a", attempts: 0 }],
      identities,
    );
    store.deleteAccountData = async () => false;

    const report = await purgeDueAccounts(store, async (id) => {
      identities.delete(id);
    });

    assert.equal(report.outcomes[0].step, "data");
    assert.match(failures.get("acct-a") ?? "", /not ready/);
  });

  it("reports nothing to do when no account is due", async () => {
    const { store } = fakeStore([], new Set());
    const report = await purgeDueAccounts(store, async () => {});
    assert.deepEqual(report, { due: 0, purged: 0, failed: 0, outcomes: [] });
  });
});
