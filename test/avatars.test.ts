import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  AVATAR_IDS,
  AVATARS,
  avatarSpec,
  fallbackAvatarId,
  isAvatarId,
  SKIN_TONES,
} from "../lib/avatars.ts";
import { buildGroupStandings } from "../lib/friends/group-standings.ts";
import {
  deriveLiveView,
  validateLiveSnapshot,
} from "../lib/poker/live-view.ts";

const migration = readFileSync(
  new URL("../migrations/0015_avatars.sql", import.meta.url),
  "utf8",
);

describe("avatars", () => {
  it("have unique ids the database accepts", () => {
    assert.equal(new Set(AVATAR_IDS).size, AVATAR_IDS.length);
    // The CHECK constraint on accounts.avatar and players.avatar.
    for (const id of AVATAR_IDS) assert.match(id, /^[a-z][a-z0-9-]{1,31}$/);
    for (const avatar of AVATARS) {
      assert.ok(SKIN_TONES[avatar.skin], `${avatar.id} has a skin tone`);
    }
  });

  it("include every id the database can pick by default", () => {
    // random_avatar() picks p01 to pNN; each must be drawable.
    const count = Number(/floor\(random\(\) \* (\d+)\)/.exec(migration)?.[1]);
    assert.ok(count > 0);
    for (let n = 1; n <= count; n += 1) {
      assert.ok(isAvatarId(`p${String(n).padStart(2, "0")}`), `p${n} exists`);
    }
  });

  it("accepts only known ids", () => {
    assert.equal(isAvatarId("p01"), true);
    assert.equal(isAvatarId("p99"), false);
    assert.equal(isAvatarId(""), false);
    assert.equal(isAvatarId(7), false);
  });

  it("draws a stable stand-in for unknown ids", () => {
    assert.equal(fallbackAvatarId("Asha"), fallbackAvatarId(" asha "));
    assert.ok(isAvatarId(fallbackAvatarId("Asha")));
    assert.equal(avatarSpec("p99", "Asha").id, fallbackAvatarId("Asha"));
    assert.equal(avatarSpec("p03", "Asha").id, "p03");
  });
});

describe("avatars on the live link", () => {
  const players = [
    { name: "Debraj", avatar: "p17", stack: 14_000, buyIns: [10_000], settledStack: 14_000 },
    { name: "Rajarshi", avatar: "nope", stack: 6_000, buyIns: [10_000], settledStack: 6_000 },
  ];

  it("keeps known avatars and drops ones the server can't draw", () => {
    const snapshot = validateLiveSnapshot({
      gameName: "Game 26",
      startStack: 10_000,
      handNo: 3,
      handInProgress: false,
      bigBlind: 100,
      players,
    });
    assert.equal(snapshot.players[0].avatar, "p17");
    assert.equal("avatar" in snapshot.players[1], false);

    const view = deriveLiveView(snapshot);
    assert.equal(view.standings[0].name, "Debraj");
    assert.equal(view.standings[0].avatar, "p17");
    assert.equal(view.standings[1].avatar, undefined);
  });
});

describe("avatars in a friend's group", () => {
  it("shows each player as the host's list does, without ids", () => {
    const standings = buildGroupStandings({
      hostAccountId: "host",
      hostName: "Rajarshi",
      myPlayerId: "p-deb",
      myPlayerName: "Debraj",
      sessions: [
        {
          id: "s1",
          date: Date.UTC(2026, 8, 1),
          startStack: 1000,
          hands: 10,
          results: [
            { playerId: "p-raj", name: "Rajarshi", avatar: "p19", net: 500, end: 1500, buyIns: [1000] },
            { playerId: "p-deb", name: "Debraj", net: -500, end: 500, buyIns: [1000] },
          ],
        },
      ],
    });
    const byName = new Map(standings.rows.map((row) => [row.name, row.avatar]));
    assert.equal(byName.get("Rajarshi"), "p19");
    // Games from before avatars fall back to the stand-in for the name.
    assert.equal(byName.get("Debraj"), fallbackAvatarId("Debraj"));
    assert.equal(JSON.stringify(standings).includes("p-raj"), false);
  });
});
