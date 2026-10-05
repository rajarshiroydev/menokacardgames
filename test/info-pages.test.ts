import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CHANGE_TAG_LABELS, CHANGELOG } from "../lib/info/changelog.ts";
import { formatInfoDate, RECENT_SIGN_IN_MINUTES } from "../lib/info/legal.ts";

describe("What's New", () => {
  it("lists release days newest first, each date once", () => {
    const dates = CHANGELOG.map((entry) => entry.date);
    for (const date of dates) assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(dates, [...dates].sort().reverse());
    assert.equal(new Set(dates).size, dates.length);
  });

  it("gives every entry a title and tagged items", () => {
    for (const entry of CHANGELOG) {
      assert.ok(entry.title.trim(), entry.date);
      assert.ok(entry.items.length > 0, entry.date);
      for (const item of entry.items) {
        assert.ok(item.tag in CHANGE_TAG_LABELS, `${entry.date}: ${item.tag}`);
        assert.ok(item.text.trim(), entry.date);
      }
    }
  });
});

describe("info page facts", () => {
  it("writes dates the way the pages show them", () => {
    assert.equal(formatInfoDate("2026-10-05"), "5 October 2026");
  });

  it("states the recent sign-in window the server enforces", () => {
    assert.equal(RECENT_SIGN_IN_MINUTES, 10);
  });
});
