import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  friendNotifications,
  shortTimeAgo,
} from "../lib/friends/notifications.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;

function friend(accountId: string, since: number) {
  return {
    accountId,
    displayName: accountId,
    since,
    myPlayer: null,
    theirNameForMe: null,
  };
}

function request(requestId: string, sentAt: number) {
  return {
    requestId,
    displayName: null,
    sentAt,
    claimedPlayerCode: null,
    claimedPlayer: null,
  };
}

describe("friend notifications", () => {
  it("lists nothing before the overview loads", () => {
    assert.deepEqual(friendNotifications(null, 0, NOW), []);
  });

  it("keeps waiting requests unread and sorts newest first", () => {
    const list = friendNotifications(
      {
        received: [request("r1", NOW - 3 * DAY)],
        friends: [friend("Ana", NOW - DAY)],
      },
      NOW,
      NOW,
    );
    assert.deepEqual(
      list.map((item) => [item.key, item.unread, item.displayName]),
      [
        ["friend:Ana", false, "Ana"],
        ["request:r1", true, "Someone"],
      ],
    );
  });

  it("marks friendships made after the bell was last opened as unread", () => {
    const list = friendNotifications(
      { received: [], friends: [friend("Old", NOW - 5 * DAY), friend("New", NOW - DAY)] },
      NOW - 2 * DAY,
      NOW,
    );
    assert.deepEqual(
      list.map((item) => [item.key, item.unread]),
      [
        ["friend:New", true],
        ["friend:Old", false],
      ],
    );
  });

  it("drops friendships older than 30 days", () => {
    const list = friendNotifications(
      { received: [], friends: [friend("Ancient", NOW - 31 * DAY)] },
      0,
      NOW,
    );
    assert.deepEqual(list, []);
  });
});

describe("short time ago", () => {
  it("rounds down to the largest unit", () => {
    assert.equal(shortTimeAgo(NOW - 20_000, NOW), "Just now");
    assert.equal(shortTimeAgo(NOW - 5 * 60_000, NOW), "5m");
    assert.equal(shortTimeAgo(NOW - 3 * 60 * 60_000, NOW), "3h");
    assert.equal(shortTimeAgo(NOW - 2 * DAY, NOW), "2d");
    assert.equal(shortTimeAgo(NOW - 15 * DAY, NOW), "2w");
  });
});
