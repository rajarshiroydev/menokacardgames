import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { linkableFriends, madeAtAccept } from "../lib/friends/link-guest.ts";

const friend = (id: string, since: number) => ({ id, since, myPlayer: { id: `p-${id}` } });

describe("link a guest to a friend", () => {
  it("treats a player made in the accept as never linked, within rounding", () => {
    assert.equal(madeAtAccept({ createdAt: 5000 }, 5000), true);
    assert.equal(madeAtAccept({ createdAt: 4999 }, 5000), true);
    assert.equal(madeAtAccept({ createdAt: 5001 }, 5000), true);
    assert.equal(madeAtAccept({ createdAt: 1000 }, 5000), false);
  });

  it("lists only unlinked friends who became friends after the guest", () => {
    const guest = { createdAt: 3000 };
    const players = new Map([
      ["p-new", { createdAt: 5000 }], // made at accept, after the guest
      ["p-linked", { createdAt: 1000 }], // already linked to an older guest
      ["p-early", { createdAt: 2000 }], // made at accept, before the guest
    ]);
    const friends = [
      friend("new", 5000),
      friend("linked", 6000),
      friend("early", 2000),
      { id: "gone", since: 7000, myPlayer: null },
    ];
    assert.deepEqual(
      linkableFriends(guest, friends, players).map((item) => item.id),
      ["new"],
    );
  });

  it("offers nothing to a guest added after every friendship", () => {
    const players = new Map([["p-new", { createdAt: 5000 }]]);
    assert.deepEqual(linkableFriends({ createdAt: 9000 }, [friend("new", 5000)], players), []);
  });
});
