import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { inCurrencyUnits } from "../lib/admin/data.ts";
import { gameFromSession } from "../lib/poker/continue-session.ts";
import { awardPots, dealNewHand } from "../lib/poker/game.ts";
import {
  buildLiveSnapshot,
  deriveLiveView,
  validateLiveSnapshot,
} from "../lib/poker/live-view.ts";
import {
  chipsInCents,
  chipsToInput,
  formatChips,
  formatMoney,
  formatSignedChips,
  parseChips,
} from "../lib/poker/money.ts";
import { isSameSession } from "../lib/poker/session-conflict.ts";
import { validateSession } from "../lib/poker/session-validation.ts";
import {
  bigBlindChoices,
  chipUnitFor,
  defaultBigBlind,
  fromUnit,
  inUnit,
  smallBlindShare,
  STACK_PRESETS,
} from "../lib/poker/stakes.ts";
import { buildStandings } from "../lib/poker/standings.ts";
import { buildProfileStats } from "../lib/profile/stats.ts";
import type { GameState, PokerSession } from "../lib/poker/types.ts";

/** $0.25/$0.50 with $50 stacks, everything stored in cents. */
function centsGame(): GameState {
  return {
    currency: "USD",
    chipUnit: "cents",
    ante: 50,
    baseAnte: 50,
    blinds: null,
    blindLevel: 0,
    blindPlans: [
      { effectiveHand: 1, effectiveAt: 1, baseBigBlind: 50, schedule: null },
    ],
    blindLevels: [],
    startStack: 5_000,
    startedAt: 1,
    players: ["A", "B", "C"].map((name) => ({
      name,
      stack: 5_000,
      buyIns: [5_000],
    })),
    hand: null,
    handNo: 0,
    dealerIndex: -1,
    log: [],
    _setupCount: 3,
  };
}

function centsSession(overrides: Partial<PokerSession> = {}): PokerSession {
  return {
    id: "c1",
    date: 1_000,
    ended: 2_000,
    chipUnit: "cents",
    ante: 50,
    startStack: 5_000,
    hands: 4,
    results: [
      { playerId: "a", name: "A", net: 1_275, end: 6_275, buyIns: [5_000] },
      { playerId: "b", name: "B", net: -1_275, end: 3_725, buyIns: [5_000] },
    ],
    ...overrides,
  };
}

describe("cents games", () => {
  test("typed amounts become whole cents, with at most two decimals", () => {
    assert.equal(parseChips("0.25", "cents"), 25);
    assert.equal(parseChips(".5", "cents"), 50);
    assert.equal(parseChips("1", "cents"), 100);
    assert.equal(parseChips("12.5", "cents"), 1_250);
    assert.equal(parseChips("1,000.05", "cents"), 100_005);
    assert.equal(parseChips("0.255", "cents"), null);
    assert.equal(parseChips(".", "cents"), null);
    assert.equal(parseChips("-1", "cents"), null);
    assert.equal(parseChips("1.5", "whole"), null);
    assert.equal(parseChips("1,000", "whole"), 1_000);
    assert.equal(parseChips("", "whole"), null);
  });

  test("stored cents go back into an input unchanged", () => {
    assert.equal(chipsToInput(25, "cents"), "0.25");
    assert.equal(chipsToInput(150, "cents"), "1.50");
    assert.equal(chipsToInput(200, "cents"), "2");
    assert.equal(chipsToInput(200, "whole"), "200");
    assert.equal(chipsToInput(200, undefined), "200");
  });

  test("amounts show two decimals only when they have cents", () => {
    assert.equal(formatChips(25, "cents", "USD"), "$0.25");
    assert.equal(formatChips(150, "cents", "USD"), "$1.50");
    assert.equal(formatChips(100, "cents", "USD"), "$1");
    assert.equal(formatChips(123_456, "cents", "USD"), "$1,234.56");
    assert.equal(formatChips(100, "whole", "USD"), "$100");
    assert.equal(formatSignedChips(-75, "cents", "EUR"), "−€0.75");
    assert.equal(formatMoney(0.1 + 0.2, "USD"), "$0.30");
  });

  test("hundredths from either unit add exactly", () => {
    assert.equal(chipsInCents(25, "cents"), 25);
    assert.equal(chipsInCents(3, "whole"), 300);
    assert.equal(chipsInCents(3, undefined), 300);
  });

  test("blinds are posted in cents and the log shows decimals", () => {
    const game = centsGame();
    game.blinds = { unit: "hands", every: 1, raiseType: "add", raiseBy: 25 };
    game.blindPlans![0].schedule = game.blinds;
    dealNewHand(game, 1);
    assert.equal(game.hand?.pot, 75);
    game.hand = null;
    dealNewHand(game, 2);
    assert.equal(game.ante, 75);
    assert.match(game.log.join("\n"), /blinds up to \$0\.37\/\$0\.75/);
  });

  test("a split pot gives the odd cent to one winner", () => {
    const game = centsGame();
    dealNewHand(game, 1);
    const hand = game.hand!;
    // C put in a cent and folded, so $1.01 splits two ways.
    hand.committed = [50, 50, 1];
    hand.in = [true, true, false];
    hand.pot = 101;
    game.players.forEach((player, index) => {
      player.stack = 5_000 - hand.committed[index];
    });
    assert.ok(awardPots(game, [[0, 1]]));
    const total = game.players.reduce((sum, player) => sum + player.stack, 0);
    assert.equal(total, 15_000);
    assert.deepEqual(
      game.players.map((player) => player.stack).slice(0, 2).sort(),
      [5_000, 5_001],
    );
    assert.match(game.log.join("\n"), /split pot \$1\.01 between A, B/);
  });

  test("a saved cents game keeps its unit, and whole games stay as they were", () => {
    assert.equal(validateSession(centsSession()).chipUnit, "cents");
    const whole = validateSession(centsSession({ chipUnit: "whole" }));
    assert.equal("chipUnit" in whole, false);
    assert.equal("chipUnit" in validateSession(centsSession({ chipUnit: undefined })), false);
    assert.throws(
      () => validateSession({ ...centsSession(), chipUnit: "paise" }),
      /chip unit/,
    );
  });

  test("the same game saved with another unit is a different game", () => {
    const saved = { ...centsSession(), sessionNumber: 1 };
    assert.equal(isSameSession(saved, centsSession()), true);
    assert.equal(isSameSession(saved, centsSession({ chipUnit: undefined })), false);
  });

  test("a continued game stays in cents", () => {
    const game = gameFromSession(
      { ...centsSession(), sessionNumber: 3 },
      [],
      "USD",
      3_000,
      () => 0,
    );
    assert.equal(game.chipUnit, "cents");
    assert.equal(game.ante, 50);
  });

  test("standings add cents games and whole games in currency units", () => {
    const whole: PokerSession = {
      id: "w1",
      date: 500,
      ended: 600,
      ante: 10,
      startStack: 100,
      hands: 3,
      results: [
        { playerId: "a", name: "A", net: -20, end: 80, buyIns: [100] },
        { playerId: "b", name: "B", net: 20, end: 120, buyIns: [100] },
      ],
    };
    const standings = buildStandings([whole, centsSession()]);
    const a = standings.entries.find((entry) => entry.key === "id:a")!;
    // −20 in the whole game, +12.75 in the cents game.
    assert.equal(a.net, -7.25);
    assert.equal(a.invested, 150);
    assert.deepEqual(standings.series.get("id:a")!.cumulativeNet, [0, -20, -7.25]);
    // Returns don't depend on the unit: −20% and +25.5%.
    assert.equal(a.averageReturn, (-20 + 25.5) / 2);
  });

  test("profile net adds cents and whole games in currency units", () => {
    const stats = buildProfileStats(
      [
        {
          currency: "USD",
          myPlayerId: "a",
          sessions: [
            {
              id: "w1",
              date: 500,
              startStack: 100,
              hands: 3,
              results: [
                { playerId: "a", name: "A", net: -20, end: 80, buyIns: [100] },
                { playerId: "b", name: "B", net: 20, end: 120, buyIns: [100] },
              ],
            },
            {
              id: "c1",
              date: 1_000,
              chipUnit: "cents",
              startStack: 5_000,
              hands: 4,
              results: centsSession().results.map((result) => ({
                ...result,
                playerId: result.playerId!,
              })),
            },
          ],
        },
      ],
      "USD",
    );
    assert.equal(stats.net, -7.25);
    assert.deepEqual(
      stats.recent.map((game) => game.net),
      [-20, 12.75],
    );
  });

  test("the live link carries the unit to the players' page", () => {
    const game = centsGame();
    const snapshot = validateLiveSnapshot(
      JSON.parse(JSON.stringify(buildLiveSnapshot(game))),
    );
    assert.equal(snapshot.chipUnit, "cents");
    const view = deriveLiveView(snapshot);
    assert.equal(view.chipUnit, "cents");
    assert.equal(view.bigBlind, 50);
    assert.equal(view.smallBlind, 25);

    const { chipUnit, ...wholeGame } = centsGame();
    void chipUnit;
    assert.equal("chipUnit" in deriveLiveView(buildLiveSnapshot(wholeGame)), false);
    assert.throws(
      () => validateLiveSnapshot({ ...buildLiveSnapshot(game), chipUnit: "paise" }),
      /chip unit/,
    );
  });

  test("the admin dashboard shows a cents game in currency units", () => {
    const game = {
      recordId: "r",
      number: 1,
      name: null,
      hostId: "h",
      hostName: "Host",
      hostAvatar: "p01",
      currency: "USD",
      playedAt: 1,
      endedAt: 2,
      hands: 4,
      bigBlind: 50,
      startingStack: 5_000,
      results: [
        {
          playerId: "a",
          name: "A",
          avatar: "p01",
          kind: "guest" as const,
          invested: 5_000,
          endingStack: 6_275,
          net: 1_275,
          rebuys: 0,
        },
      ],
    };
    const cents = inCurrencyUnits({ ...game, chipUnit: "cents" });
    assert.equal(cents.bigBlind, 0.5);
    assert.equal(cents.results[0].net, 12.75);
    assert.deepEqual(inCurrencyUnits({ ...game, chipUnit: "whole" }).results, game.results);
  });

  test("stacks run from 20 to 50K, and the big blind follows the stack", () => {
    assert.deepEqual(
      STACK_PRESETS.map((stack) => stack / 100),
      [20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000],
    );
    // 200, 100, 50 and 20 big blinds deep, in hundredths.
    assert.deepEqual(bigBlindChoices(2_000), [10, 20, 40, 100]);
    assert.deepEqual(bigBlindChoices(5_000), [25, 50, 100, 250]);
    assert.deepEqual(bigBlindChoices(1_000_000), [5_000, 10_000, 20_000, 50_000]);
    assert.deepEqual(bigBlindChoices(0), []);
    assert.equal(defaultBigBlind(5_000), 50);
    assert.equal(defaultBigBlind(1_000_000), 10_000);
    // Whole-chip stacks round the big blind to whole chips: 1,234 → 12.
    assert.equal(defaultBigBlind(123_400), 1_200);
    // A stack with cents rounds to the cent.
    assert.equal(defaultBigBlind(123_450), 1_235);
  });

  test("small stacks and amounts with cents make a cents game", () => {
    assert.equal(chipUnitFor(5_000, [50]), "cents");
    assert.equal(chipUnitFor(99_900, [1_000]), "cents");
    assert.equal(chipUnitFor(100_000, [1_000]), "whole");
    assert.equal(chipUnitFor(1_000_000, [10_000, null]), "whole");
    assert.equal(chipUnitFor(1_000_000, [10_050]), "cents");
    assert.equal(chipUnitFor(1_000_050, [10_000]), "cents");
  });

  test("form amounts convert to the game's unit and back", () => {
    assert.equal(inUnit(10_000, "whole"), 100);
    assert.equal(inUnit(25, "cents"), 25);
    assert.equal(fromUnit(100, "whole"), 10_000);
    assert.equal(fromUnit(25, "cents"), 25);
  });

  test("small blind shares round to the game's unit", () => {
    assert.equal(smallBlindShare(25, 40, "cents"), 10);
    assert.equal(smallBlindShare(10_000, 40, "whole"), 4_000);
    // 25% of ₹50 is 12.50; a whole-chip game rounds it to 13.
    assert.equal(smallBlindShare(5_000, 25, "whole"), 1_300);
    assert.equal(smallBlindShare(1, 25, "cents"), 1);
  });
});
