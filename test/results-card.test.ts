import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AVATAR_IDS, fallbackAvatarId } from "../lib/avatars.ts";
import {
  cardLength,
  cardName,
  cardReturn,
  cardTimeZone,
  CARD_DEFAULT_TIME_ZONE,
  resultsCard,
} from "../lib/poker/results-card.ts";
import type { PokerSession, SessionResult } from "../lib/poker/types.ts";

const HOUR = 3_600_000;
// 13 Oct 2026, 20:00 in India.
const EVENING = Date.UTC(2026, 9, 13, 14, 30);

function game(
  results: Array<[string, number, number[]?]>,
  extra: Partial<PokerSession> = {},
): PokerSession {
  const startStack = extra.startStack ?? 10_000;
  return {
    id: "s1",
    name: "Game 14",
    sessionNumber: 14,
    date: EVENING,
    ended: EVENING + 3 * HOUR + 20 * 60_000,
    ante: 100,
    startStack,
    hands: 42,
    results: results.map(([name, net, buyIns]): SessionResult => {
      const invested = (buyIns ?? [startStack]).reduce((a, b) => a + b, 0);
      return {
        playerId: `p-${name}`,
        name,
        net,
        end: invested + net,
        ...(buyIns ? { buyIns } : {}),
      };
    }),
    ...extra,
  };
}

const options = { currency: "INR", timeZone: "Asia/Kolkata" };

describe("results card", () => {
  it("lists everyone biggest winner first, in plain chips with returns", () => {
    const card = resultsCard(
      game([
        ["Bikram", -10_000],
        ["Asha", 12_000],
        ["Chitra", -2_000],
      ]),
      options,
    );
    assert.equal(card.title, "Game 14");
    assert.equal(card.when, "13 Oct 2026 · 3 h 20 min");
    assert.equal(card.played, "42 hands · Blinds 50/100");
    assert.deepEqual(
      card.rows.map((row) => [
        row.rank,
        row.name,
        row.result,
        row.return,
        row.tone,
      ]),
      [
        [1, "Asha", "+12,000", "+120%", "pos"],
        [2, "Chitra", "−2,000", "−20%", "neg"],
        [3, "Bikram", "−10,000", "−100%", "neg"],
      ],
    );
    assert.equal(card.winner?.name, "Asha");
    assert.equal(card.rake, null);
    // No currency sign anywhere: the card never shows money.
    assert.doesNotMatch(JSON.stringify(card), /₹/);
  });

  it("shares a rank on a tie, and has no single winner when the top ties", () => {
    const card = resultsCard(
      game([
        ["Asha", 5_000],
        ["Bikram", 5_000],
        ["Chitra", -10_000],
      ]),
      options,
    );
    assert.deepEqual(
      card.rows.map((row) => row.rank),
      [1, 1, 3],
    );
    assert.equal(card.winner, null);
  });

  it("has no winner when nobody finished ahead", () => {
    const card = resultsCard(
      game([
        ["Asha", 0],
        ["Bikram", 0],
      ]),
      options,
    );
    assert.equal(card.winner, null);
    assert.deepEqual(
      card.rows.map((row) => [row.result, row.return, row.tone]),
      [
        ["0", "0%", "zero"],
        ["0", "0%", "zero"],
      ],
    );
  });

  it("counts rebuys and works returns on everything bought in", () => {
    const card = resultsCard(
      game([
        ["Asha", 4_000, [10_000, 10_000]],
        ["Bikram", 1_000, [10_000, 5_000, 5_000]],
        ["Chitra", -5_000],
      ]),
      options,
    );
    const byName = new Map(card.rows.map((row) => [row.name, row]));
    assert.equal(byName.get("Asha")!.rebuys, "1 rebuy");
    assert.equal(byName.get("Asha")!.return, "+20%");
    assert.equal(byName.get("Bikram")!.rebuys, "2 rebuys");
    assert.equal(byName.get("Bikram")!.return, "+5%");
    assert.equal(byName.get("Chitra")!.rebuys, null);
  });

  it("shows the blinds the game rose to", () => {
    const card = resultsCard(
      game(
        [
          ["Asha", 1_000],
          ["Bikram", -1_000],
        ],
        {
          blindHistory: {
            plans: [
              {
                effectiveHand: 1,
                effectiveAt: EVENING,
                baseBigBlind: 100,
                schedule: {
                  unit: "hands",
                  every: 10,
                  raiseType: "multiply",
                  raiseBy: 2,
                },
              },
            ],
            levels: [
              { handNo: 1, dealtAt: EVENING, bigBlind: 100 },
              { handNo: 11, dealtAt: EVENING + HOUR, bigBlind: 200 },
              { handNo: 21, dealtAt: EVENING + 2 * HOUR, bigBlind: 400 },
            ],
            smallBlindRatio: { small: 40, big: 100 },
          },
        },
      ),
      options,
    );
    assert.equal(card.played, "42 hands · Blinds 40/100 to 160/400");
  });

  it("says Quick ledger for a quick ledger, with no hands or blinds", () => {
    const card = resultsCard(
      game(
        [
          ["Asha", 2_500],
          ["Bikram", -2_500],
        ],
        { kind: "ledger", hands: 0, ante: 0 },
      ),
      options,
    );
    assert.equal(card.played, "Quick ledger");
  });

  it("shows the house rake, in chips", () => {
    const card = resultsCard(
      game(
        [
          ["Asha", 3_000],
          ["Bikram", -4_200],
        ],
        { rake: 1_200, rakeRules: { percent: 5, cap: 300 } },
      ),
      options,
    );
    assert.equal(card.rake, "House rake 1,200");
  });

  it("shows a cents game to the cent", () => {
    const card = resultsCard(
      game(
        [
          ["Asha", 1_025],
          ["Bikram", -1_025],
        ],
        { chipUnit: "cents", startStack: 5_000, ante: 50 },
      ),
      options,
    );
    assert.deepEqual(
      card.rows.map((row) => row.result),
      ["+10.25", "−10.25"],
    );
    assert.equal(card.played, "42 hands · Blinds 0.25/0.50");
  });

  it("groups digits the host's way: lakhs for rupees, thousands for dollars", () => {
    const session = game([
      ["Asha", 150_000, [100_000]],
      ["Bikram", -100_000, [100_000]],
      ["Chitra", -50_000, [100_000]],
    ]);
    assert.equal(resultsCard(session, options).rows[0].result, "+1,50,000");
    assert.equal(
      resultsCard(session, { ...options, currency: "USD" }).rows[0].result,
      "+150,000",
    );
  });

  it("uses each player's current name and avatar, with stand-ins otherwise", () => {
    const session = game([
      ["Asha", 1_000],
      ["Old Name", -1_000],
    ]);
    session.results[0] = { ...session.results[0], playerId: undefined };
    const card = resultsCard(session, {
      ...options,
      players: new Map([
        ["p-Old Name", { name: "New Name", avatar: AVATAR_IDS[3] }],
      ]),
    });
    assert.deepEqual(
      card.rows.map((row) => [row.name, row.avatar]),
      [
        ["Asha", fallbackAvatarId("Asha")],
        ["New Name", AVATAR_IDS[3]],
      ],
    );
  });

  it("fits ten players with long names", () => {
    const names = Array.from(
      { length: 10 },
      (_, i) => `Player number ${i + 1} with a long name`,
    );
    const nets = [
      9_000, 4_000, 2_000, 1_000, 0, 0, -1_000, -3_000, -5_000, -7_000,
    ];
    const card = resultsCard(
      game(names.map((name, i) => [name, nets[i]])),
      options,
    );
    assert.equal(card.rows.length, 10);
    for (const row of card.rows) assert.ok(Array.from(row.name).length <= 18);
    assert.equal(card.rows[0].name, "Player number 1 w…");
  });

  it("refuses a game whose chips don't add up, as Settle up does", () => {
    assert.throws(() =>
      resultsCard(
        game([
          ["Asha", 1_000],
          ["Bikram", -500],
        ]),
        options,
      ),
    );
  });

  it("shows the date in the phone's time zone", () => {
    const lateNight = game(
      [
        ["Asha", 1_000],
        ["Bikram", -1_000],
      ],
      // 00:30 on 14 Oct in India, still 13 Oct in London.
      {
        date: Date.UTC(2026, 9, 13, 19, 0),
        ended: Date.UTC(2026, 9, 13, 20, 0),
      },
    );
    assert.match(resultsCard(lateNight, options).when, /^14 Oct 2026/);
    assert.match(
      resultsCard(lateNight, { ...options, timeZone: "Europe/London" }).when,
      /^13 Oct 2026/,
    );
  });
});

describe("results card helpers", () => {
  it("formats the length of a game", () => {
    assert.equal(cardLength(20_000), "1 min");
    assert.equal(cardLength(45 * 60_000), "45 min");
    assert.equal(cardLength(2 * HOUR), "2 h");
    assert.equal(cardLength(3 * HOUR + 20 * 60_000), "3 h 20 min");
  });

  it("formats returns", () => {
    assert.equal(cardReturn(12_000, 10_000), "+120%");
    assert.equal(cardReturn(-250, 10_000), "−2.5%");
    assert.equal(cardReturn(0, 10_000), "0%");
    assert.equal(cardReturn(5, 0), "0%");
  });

  it("cuts long names and tidies spaces", () => {
    assert.equal(cardName("  Asha   Rao "), "Asha Rao");
    assert.equal(cardName("Abcdefghijklmnopqr"), "Abcdefghijklmnopqr");
    assert.equal(cardName("Abcdefghijklmnopqrs"), "Abcdefghijklmnopq…");
  });

  it("accepts real time zones only", () => {
    assert.equal(cardTimeZone("Europe/London"), "Europe/London");
    assert.equal(cardTimeZone("Not/AZone"), CARD_DEFAULT_TIME_ZONE);
    assert.equal(cardTimeZone(null), CARD_DEFAULT_TIME_ZONE);
    assert.equal(cardTimeZone("x".repeat(65)), CARD_DEFAULT_TIME_ZONE);
  });
});
