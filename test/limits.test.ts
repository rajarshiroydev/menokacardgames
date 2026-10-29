import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DATABASE_SIZE_ALERT_BYTES,
  DATABASE_SIZE_LIMIT_BYTES,
  databaseSizeWarning,
} from "../lib/accounts/purge.ts";
import { GAME_BACKUP_MIN_INTERVAL_MS } from "../lib/poker/game-backup.ts";
import {
  limitErrorFromDatabase,
  limitErrorResponse,
  RATE_LIMITS,
  STORAGE_CAPS,
} from "../lib/security/limits.ts";

describe("per-account limits", () => {
  it("keeps the numbers the user decided (2026-10-29)", () => {
    assert.deepEqual(RATE_LIMITS, {
      writes: { limit: 60, windowSeconds: 60 },
      cards: { limit: 120, windowSeconds: 600 },
      "friend-lookups": { limit: 30, windowSeconds: 600 },
      "game-data": { limit: 25 * 1024 * 1024, windowSeconds: 86_400 },
    });
    assert.deepEqual(STORAGE_CAPS, { players: 500, games: 5000, backups: 5 });
  });

  it("leaves a host playing with the live link more than twice the room they need", () => {
    const liveUpdatesPerMinute = 60_000 / 3_000;
    const backupsPerMinute = 60_000 / GAME_BACKUP_MIN_INTERVAL_MS;
    assert.ok(
      (liveUpdatesPerMinute + backupsPerMinute) * 2 <= RATE_LIMITS.writes.limit,
    );
  });

  it("matches the caps the database enforces (migration 0033)", () => {
    const migration = readFileSync(
      new URL("../migrations/0033_rate_limits_and_caps.sql", import.meta.url),
      "utf8",
    );
    assert.match(migration, new RegExp(`>= ${STORAGE_CAPS.players} THEN\\s+RAISE EXCEPTION 'quota:players'`));
    assert.match(migration, new RegExp(`>= ${STORAGE_CAPS.games} THEN\\s+RAISE EXCEPTION 'quota:games'`));
    assert.match(migration, new RegExp(`OFFSET ${STORAGE_CAPS.backups - 1}\\b`));
  });
});

describe("limit errors from the database", () => {
  it("reads a rate limit, with the seconds to wait", () => {
    const limit = limitErrorFromDatabase(new Error("rate:limited:cards:417"));
    assert.deepEqual(limit, {
      kind: "rate",
      status: 429,
      error: "Too many results cards in a short time. Try again in a few minutes.",
      code: "rate-limited",
      retryAfterSeconds: 417,
    });
  });

  it("reads the storage caps", () => {
    assert.equal(
      limitErrorFromDatabase(new Error("quota:players"))?.error,
      "You can have up to 500 players. Delete players you no longer play with to add more.",
    );
    assert.equal(
      limitErrorFromDatabase(new Error("quota:games"))?.error,
      "You can keep up to 5,000 games. Permanently delete discarded games to save more.",
    );
  });

  it("ignores everything else", () => {
    for (const message of [
      "rate:limited:unknown-bucket:5",
      "rate:no-account",
      "quota:everything",
      "friend:not-found",
      "connection reset",
    ]) {
      assert.equal(limitErrorFromDatabase(new Error(message)), null, message);
    }
    assert.equal(limitErrorFromDatabase("rate:limited:writes:5"), null);
    assert.equal(limitErrorResponse(new Error("boom")), null);
  });

  it("answers a rate limit with 429 and Retry-After", async () => {
    const response = limitErrorResponse(new Error("rate:limited:writes:12"))!;
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "12");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), {
      error: "Too many requests in a short time. Wait a minute, then try again.",
      code: "rate-limited",
    });
  });

  it("answers a full cap with 409 and no Retry-After", async () => {
    const response = limitErrorResponse(new Error("quota:games"))!;
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("Retry-After"), null);
    assert.equal((await response.json()).code, "quota-games");
  });
});

describe("database size warning (daily job)", () => {
  it("warns from 70% of the plan's 1 GB", () => {
    assert.equal(DATABASE_SIZE_LIMIT_BYTES, 1024 ** 3);
    assert.equal(databaseSizeWarning(DATABASE_SIZE_ALERT_BYTES - 1), null);
    assert.equal(databaseSizeWarning(35 * 1024 ** 2), null);
    assert.equal(
      databaseSizeWarning(DATABASE_SIZE_ALERT_BYTES),
      "The database is 717 MB of the plan's 1024 MB",
    );
  });
});
