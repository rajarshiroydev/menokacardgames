import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  accountLabel,
  formatDuration,
  gamePot,
  matchesQuery,
  parseAccountId,
  parseAdminView,
  relativeTime,
  sortRows,
} from "../lib/admin/data.ts";

describe("admin dashboard helpers", () => {
  it("reads the view and user from the URL", () => {
    assert.equal(parseAdminView("users"), "users");
    assert.equal(parseAdminView("nope"), "overview");
    assert.equal(parseAdminView(["users"]), "overview");
    assert.equal(parseAdminView(undefined), "overview");

    const id = "99FB8C44-54C2-413D-B0D4-EE99A7078044";
    assert.equal(parseAccountId(id), id.toLowerCase());
    assert.equal(parseAccountId("99fb8c44'; drop table"), null);
    assert.equal(parseAccountId(undefined), null);
  });

  it("names an account by its chosen name, then sign-in name, then email", () => {
    assert.equal(accountLabel({ displayName: "Asha", authName: "A", email: "a@x" }), "Asha");
    assert.equal(accountLabel({ displayName: null, authName: "A", email: "a@x" }), "A");
    assert.equal(accountLabel({ displayName: null, authName: null, email: "a@x" }), "a@x");
    assert.equal(accountLabel({ displayName: null, authName: null, email: null }), "Unnamed");
  });

  it("describes how long ago something happened", () => {
    const now = Date.UTC(2026, 9, 2, 12);
    assert.equal(relativeTime(null, now), "Never");
    assert.equal(relativeTime(now - 30_000, now), "Just now");
    assert.equal(relativeTime(now - 5 * 60_000, now), "5m ago");
    assert.equal(relativeTime(now - 3 * 3_600_000, now), "3h ago");
    assert.equal(relativeTime(now - 2 * 86_400_000, now), "2d ago");
    assert.equal(relativeTime(now - 21 * 86_400_000, now), "3w ago");
    assert.equal(relativeTime(now + 60_000, now), "Just now");
  });

  it("formats durations", () => {
    assert.equal(formatDuration(45 * 60_000), "45m");
    assert.equal(formatDuration(125 * 60_000), "2h 05m");
    assert.equal(formatDuration(-1), "0m");
  });

  it("counts the pot as the winners' gains", () => {
    assert.equal(gamePot({ results: [] }), 0);
    const results = [2000, -1000, -1000].map((net) => ({
      playerId: String(net),
      name: "x",
      avatar: "p01",
      kind: "guest" as const,
      invested: 0,
      endingStack: 0,
      net,
      rebuys: 0,
    }));
    assert.equal(gamePot({ results }), 2000);
  });

  it("sorts with nulls last in either direction", () => {
    const rows = [{ v: 2 }, { v: null }, { v: 10 }, { v: 1 }];
    assert.deepEqual(sortRows(rows, (row) => row.v, "desc").map((row) => row.v), [10, 2, 1, null]);
    assert.deepEqual(sortRows(rows, (row) => row.v, "asc").map((row) => row.v), [1, 2, 10, null]);
    const names = [{ v: "bikram" }, { v: "Asha" }, { v: "ravi" }];
    assert.deepEqual(sortRows(names, (row) => row.v, "asc").map((row) => row.v), ["Asha", "bikram", "ravi"]);
  });

  it("matches every word of a search anywhere in the fields", () => {
    assert.equal(matchesQuery("", ["anything"]), true);
    assert.equal(matchesQuery("asha", ["Asha Host", null]), true);
    assert.equal(matchesQuery("asha menoka", ["Asha Host", "asha@menoka.test"]), true);
    assert.equal(matchesQuery("asha ravi", ["Asha Host", "asha@menoka.test"]), false);
  });
});
