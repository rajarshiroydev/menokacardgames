import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cleanDisplayName } from "../lib/accounts/identity-code.ts";
import {
  ADMIN_SIGN_IN_WINDOW_MS,
  MAX_SESSION_AGE_MS,
  sessionTooOld,
  signedInRecently,
} from "../lib/auth/recent-sign-in.ts";
import { afterSignInPath } from "../lib/auth/sign-in-destination.ts";
import { cleanPlayerName, playerNameKey } from "../lib/poker/player-validation.ts";
import { visibleText } from "../lib/visible-text.ts";

const HOUR = 60 * 60_000;

describe("names without hidden characters", () => {
  it("removes direction overrides that make one name look like another", () => {
    // "Rajarshi" followed by a right-to-left override and a reversed word.
    assert.equal(visibleText("Raj‮ihsra"), "Rajihsra");
    assert.equal(visibleText("⁦Asha⁩"), "Asha");
    assert.equal(visibleText("Asha‏"), "Asha");
  });

  it("removes zero-width spaces, soft hyphens, controls and blank fillers", () => {
    assert.equal(visibleText("As​ha"), "Asha");
    assert.equal(visibleText("﻿Asha"), "Asha");
    assert.equal(visibleText("As­ha"), "Asha");
    assert.equal(visibleText("As\u0007ha"), "Asha");
    assert.equal(visibleText("ㅤ"), "");
    assert.equal(visibleText("⠀⠀"), "");
  });

  it("keeps the joiners Bengali, Hindi and emoji need", () => {
    const bengali = "র‍্য";
    assert.equal(visibleText(bengali), bengali);
    const hindi = "क्‌ष";
    assert.equal(visibleText(hindi), hindi);
    const family = "👨‍👩‍👧";
    assert.equal(visibleText(family), family);
    assert.equal(visibleText("Rāhul 🃏"), "Rāhul 🃏");
  });

  it("writes accents one way, so two looks of a name are one name", () => {
    assert.equal(visibleText("José"), "José");
    assert.equal(playerNameKey("José"), playerNameKey("José"));
  });

  it("makes runs of spaces one and trims", () => {
    assert.equal(visibleText("  Big    Host\t"), "Big Host");
  });

  it("refuses a player or account name that is only hidden characters", () => {
    assert.throws(() => cleanPlayerName("​ㅤ"), /1 to 80 characters/);
    assert.throws(() => cleanDisplayName("‮⠀"), /1 to 40 characters/);
    assert.equal(cleanPlayerName(" Dev​ C. "), "Dev C.");
    assert.equal(cleanDisplayName("Meera⁦"), "Meera");
  });
});

describe("sign-in age", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");

  it("asks admins for a sign-in from the last hour", () => {
    assert.equal(ADMIN_SIGN_IN_WINDOW_MS, HOUR);
    assert.equal(signedInRecently(now - 59 * 60_000, now, ADMIN_SIGN_IN_WINDOW_MS), true);
    assert.equal(signedInRecently(now - HOUR - 1, now, ADMIN_SIGN_IN_WINDOW_MS), false);
    // The default window, for permanent deletion, is still 10 minutes.
    assert.equal(signedInRecently(now - 11 * 60_000, now), false);
  });

  it("ends a sign-in after 90 days, however often it is used", () => {
    assert.equal(MAX_SESSION_AGE_MS, 90 * 24 * HOUR);
    assert.equal(sessionTooOld(now - 89 * 24 * HOUR, now), false);
    assert.equal(sessionTooOld(now - MAX_SESSION_AGE_MS, now), false);
    assert.equal(sessionTooOld(now - MAX_SESSION_AGE_MS - 1, now), true);
    assert.equal(sessionTooOld("2026-07-01T00:00:00Z", now), true);
  });

  it("doesn't end a sign-in whose start it can't read", () => {
    assert.equal(sessionTooOld(undefined, now), false);
    assert.equal(sessionTooOld("not a date", now), false);
  });
});

describe("where a sign-in link leads", () => {
  const token = "Ab3dEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
  const params = (query: string) => new URLSearchParams(query);

  it("goes back to an invite, then the admin dashboard, otherwise Home", () => {
    assert.equal(afterSignInPath(params(`invite=${token}`)), `/join/${token}`);
    assert.equal(afterSignInPath(params("next=admin")), "/admin");
    assert.equal(afterSignInPath(params("")), "/");
  });

  it("never follows anything else", () => {
    for (const query of [
      "next=https://evil.example",
      "next=//evil.example",
      "next=/admin",
      "next=settings",
      "invite=../../admin",
    ]) {
      assert.equal(afterSignInPath(params(query)), "/", query);
    }
  });
});
