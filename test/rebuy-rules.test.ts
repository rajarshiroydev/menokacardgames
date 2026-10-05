import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  describeRebuyRules,
  normalizeRebuyRules,
  parseRebuyRules,
  rebuyBlock,
} from "../lib/poker/buy-ins.ts";
import { gameFromSession } from "../lib/poker/continue-session.ts";
import {
  buyInPlayer,
  dealNewHand,
  editBlindSchedule,
  editRebuyRules,
  mostRebuysUsed,
  nextBuyIn,
  rebuyBlockReason,
  upcomingBigBlinds,
} from "../lib/poker/game.ts";
import {
  buildLiveSnapshot,
  deriveLiveView,
  validateLiveSnapshot,
} from "../lib/poker/live-view.ts";
import { isSameSession } from "../lib/poker/session-conflict.ts";
import { validateSession } from "../lib/poker/session-validation.ts";
import type { BlindSchedule, GameState, RebuyRules } from "../lib/poker/types.ts";

const DOUBLE_EVERY_HAND: BlindSchedule = {
  unit: "hands",
  every: 1,
  raiseType: "multiply",
  raiseBy: 2,
};

function game(rules?: RebuyRules, blinds: BlindSchedule | null = null): GameState {
  return {
    ante: 100,
    baseAnte: 100,
    blinds,
    blindLevel: 0,
    startStack: 10_000,
    ...(rules ? { rebuyRules: rules } : {}),
    startedAt: 1,
    players: ["A", "B", "C"].map((name) => ({
      name,
      stack: 10_000,
      buyIns: [10_000],
    })),
    hand: null,
    handNo: 0,
    dealerIndex: -1,
    log: [],
    _setupCount: 3,
  };
}

function bust(state: GameState, index: number) {
  state.players[index].stack = 0;
}

describe("rebuy limits", () => {
  test("no rules, or both limits off, keep unlimited rebuys", () => {
    assert.equal(normalizeRebuyRules({ maxRebuys: null, closeAtBigBlind: null }), undefined);
    assert.equal(rebuyBlock(undefined, 40, 1_000_000), null);
    const state = game();
    bust(state, 0);
    for (let rebuy = 0; rebuy < 5; rebuy += 1) {
      assert.equal(buyInPlayer(state, 0), 10_000);
      bust(state, 0);
    }
    assert.equal(nextBuyIn(state, 0), 10_000);
  });

  test("stops a player at the most rebuys allowed", () => {
    const state = game({ maxRebuys: 1, closeAtBigBlind: null });
    bust(state, 0);
    assert.equal(buyInPlayer(state, 0), 10_000);
    bust(state, 0);
    assert.equal(nextBuyIn(state, 0), null);
    assert.equal(rebuyBlockReason(state, 0), "max");
    // Another player still has their rebuy.
    bust(state, 1);
    assert.equal(nextBuyIn(state, 1), 10_000);
  });

  test("allows no rebuys at all with a limit of 0", () => {
    const state = game({ maxRebuys: 0, closeAtBigBlind: null });
    bust(state, 2);
    assert.equal(nextBuyIn(state, 2), null);
    assert.equal(rebuyBlockReason(state, 2), "max");
  });

  test("closes rebuys once the big blind reaches the closing amount", () => {
    const state = game({ maxRebuys: null, closeAtBigBlind: 400 }, DOUBLE_EVERY_HAND);
    dealNewHand(state, 1); // hand 1 at 100
    state.hand = null;
    bust(state, 0);
    assert.equal(nextBuyIn(state, 0), 10_000);
    state.players[0].stack = 10_000;
    dealNewHand(state, 2); // hand 2 at 200
    state.hand = null;
    bust(state, 0);
    assert.equal(nextBuyIn(state, 0), 10_000);
    state.players[0].stack = 10_000;
    dealNewHand(state, 3); // hand 3 at 400
    assert.equal(state.ante, 400);
    state.hand = null;
    bust(state, 0);
    assert.equal(nextBuyIn(state, 0), null);
    assert.equal(rebuyBlockReason(state, 0), "closed");
  });

  test("the closing amount still applies after the blind plan changes", () => {
    const state = game({ maxRebuys: null, closeAtBigBlind: 300 }, DOUBLE_EVERY_HAND);
    dealNewHand(state, 1);
    state.hand = null;
    // From hand 2 the blinds add 100 a hand: 100, 200, 300, ...
    editBlindSchedule(state, { unit: "hands", every: 1, raiseType: "add", raiseBy: 100 }, 2);
    assert.deepEqual(upcomingBigBlinds(state), [200, 300, 400, 500]);
    for (const now of [3, 4, 5]) {
      state.hand = null;
      dealNewHand(state, now);
    }
    state.hand = null;
    assert.equal(state.ante, 300);
    bust(state, 1);
    assert.equal(rebuyBlockReason(state, 1), "closed");
  });

  test("offers the next big blinds above the current one", () => {
    const state = game(undefined, DOUBLE_EVERY_HAND);
    assert.deepEqual(upcomingBigBlinds(state, 3), [200, 400, 800]);
    assert.deepEqual(upcomingBigBlinds(game()), [], "fixed blinds never rise");
  });

  test("editing can't set a limit below rebuys already made", () => {
    const state = game();
    bust(state, 0);
    buyInPlayer(state, 0);
    bust(state, 0);
    buyInPlayer(state, 0);
    assert.equal(mostRebuysUsed(state), 2);

    assert.equal(editRebuyRules(state, { maxRebuys: 1, closeAtBigBlind: null }), false);
    assert.equal(state.rebuyRules, undefined);
    assert.equal(state.log.length, 0);

    assert.equal(editRebuyRules(state, { maxRebuys: 2, closeAtBigBlind: 800 }), true);
    assert.deepEqual(state.rebuyRules, { maxRebuys: 2, closeAtBigBlind: 800 });
    assert.equal(
      state.log[0],
      "Before hand 1: rebuy rules changed to up to 2 rebuys each, until the big blind reaches ₹800",
    );

    assert.equal(editRebuyRules(state, { maxRebuys: null, closeAtBigBlind: null }), true);
    assert.equal("rebuyRules" in state, false);
  });

  test("describes the rules in a line", () => {
    assert.equal(describeRebuyRules(undefined), null);
    assert.equal(describeRebuyRules({ maxRebuys: 0, closeAtBigBlind: 400 }), "No rebuys");
    assert.equal(describeRebuyRules({ maxRebuys: 1, closeAtBigBlind: null }), "Up to 1 rebuy each");
    assert.equal(
      describeRebuyRules({ maxRebuys: null, closeAtBigBlind: 1_600 }),
      "Unlimited rebuys, until the big blind reaches ₹1,600",
    );
  });
});

describe("saved rebuy limits", () => {
  const session = {
    id: "s1720000000000",
    date: 1720000000000,
    ended: 1720000300000,
    ante: 100,
    startStack: 10_000,
    hands: 4,
    results: [
      { name: "Raj", net: 5_000, end: 25_000, buyIns: [10_000, 10_000] },
      { name: "Sam", net: -5_000, end: 5_000 },
    ],
  };

  test("keeps the rules and drops empty ones", () => {
    const rules = { maxRebuys: 2, closeAtBigBlind: 800 };
    assert.deepEqual(validateSession({ ...session, rebuyRules: rules }).rebuyRules, rules);
    const none = validateSession({
      ...session,
      rebuyRules: { maxRebuys: null, closeAtBigBlind: null },
    });
    assert.equal("rebuyRules" in none, false);
    assert.equal("rebuyRules" in validateSession(session), false);
  });

  test("rejects more rebuys than the limit, and bad limits", () => {
    assert.throws(
      () => validateSession({ ...session, rebuyRules: { maxRebuys: 0, closeAtBigBlind: null } }),
      /More rebuys than the game's rebuy limit/,
    );
    assert.throws(() => parseRebuyRules({ maxRebuys: 64, closeAtBigBlind: null }), /0 to 63/);
    assert.throws(() => parseRebuyRules({ maxRebuys: 1.5, closeAtBigBlind: null }));
    assert.throws(() => parseRebuyRules({ maxRebuys: null, closeAtBigBlind: 0 }));
    assert.throws(() => parseRebuyRules([1]), /Invalid rebuy rules/);
  });

  test("a retry with different rules is a different game", () => {
    const saved = {
      ...validateSession({ ...session, rebuyRules: { maxRebuys: 2, closeAtBigBlind: null } }),
      sessionNumber: 1,
    };
    assert.equal(isSameSession(saved, { ...saved }), true);
    assert.equal(
      isSameSession(saved, { ...saved, rebuyRules: { maxRebuys: 3, closeAtBigBlind: null } }),
      false,
    );
    assert.equal(isSameSession(saved, { ...saved, rebuyRules: undefined }), false);
  });

  test("a continued game keeps the rules", () => {
    const saved = {
      ...validateSession({ ...session, rebuyRules: { maxRebuys: 1, closeAtBigBlind: null } }),
      sessionNumber: 3,
    };
    const continued = gameFromSession(saved, [], "INR", 1720000400000, () => 0);
    assert.deepEqual(continued.rebuyRules, { maxRebuys: 1, closeAtBigBlind: null });
    // Raj used his one rebuy; Sam still has his.
    continued.players[0].stack = 0;
    continued.players[1].stack = 0;
    assert.equal(nextBuyIn(continued, 0), null);
    assert.equal(nextBuyIn(continued, 1), 10_000);
  });

  test("the live standings page shows the rules", () => {
    const state = game({ maxRebuys: 2, closeAtBigBlind: null });
    state.sessionLabel = "Game 9";
    const view = deriveLiveView(validateLiveSnapshot(buildLiveSnapshot(state)));
    assert.deepEqual(view.rebuyRules, { maxRebuys: 2, closeAtBigBlind: null });
    const plain = deriveLiveView(validateLiveSnapshot(buildLiveSnapshot(game())));
    assert.equal("rebuyRules" in plain, false);
  });
});
