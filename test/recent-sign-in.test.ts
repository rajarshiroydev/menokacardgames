import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RECENT_SIGN_IN_WINDOW_MS,
  signedInRecently,
} from "../lib/auth/recent-sign-in.ts";

const now = Date.parse("2026-09-24T12:00:00.000Z");

describe("recent sign-in", () => {
  it("accepts a sign-in inside the window", () => {
    assert.equal(signedInRecently(new Date(now - 60_000), now), true);
    assert.equal(
      signedInRecently(new Date(now - RECENT_SIGN_IN_WINDOW_MS), now),
      true,
    );
  });

  it("rejects a sign-in older than the window", () => {
    assert.equal(
      signedInRecently(new Date(now - RECENT_SIGN_IN_WINDOW_MS - 1), now),
      false,
    );
  });

  it("reads the ISO strings returned by the auth provider", () => {
    assert.equal(signedInRecently("2026-09-24T11:55:00.000Z", now), true);
    assert.equal(signedInRecently("2026-09-24T11:00:00.000Z", now), false);
  });

  it("tolerates small clock differences but not future timestamps", () => {
    assert.equal(signedInRecently(new Date(now + 30_000), now), true);
    assert.equal(signedInRecently(new Date(now + 5 * 60_000), now), false);
  });

  it("treats missing or unreadable timestamps as not recent", () => {
    assert.equal(signedInRecently(undefined, now), false);
    assert.equal(signedInRecently(null, now), false);
    assert.equal(signedInRecently("not a date", now), false);
  });
});
