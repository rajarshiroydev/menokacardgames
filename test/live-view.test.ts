import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  awardPots,
  dealNewHand,
  handsUntilBigBlind,
  undoLastHand,
} from "../lib/poker/game.ts";
import {
  buildLiveSnapshot,
  deriveLiveView,
  isLiveToken,
  validateLiveSnapshot,
  type LiveSnapshot,
} from "../lib/poker/live-view.ts";
import type { GameState } from "../lib/poker/types.ts";

function game(stacks: number[], buyIns?: number[][]): GameState {
  return {
    sessionLabel: "Game 26",
    ante: 100,
    startStack: 10_000,
    startedAt: Date.UTC(2026, 8, 25),
    players: stacks.map((stack, index) => ({
      name: ["Debraj", "Rajarshi", "Pratik"][index],
      stack,
      buyIns: buyIns?.[index] ?? [10_000],
    })),
    hand: null,
    handNo: 3,
    dealerIndex: 0,
    log: [],
    _setupCount: 0,
  };
}

function snapshot(overrides: Partial<LiveSnapshot> = {}): LiveSnapshot {
  return {
    gameName: "Game 26",
    startStack: 10_000,
    handNo: 3,
    handInProgress: false,
    bigBlind: 100,
    players: [
      { name: "Debraj", stack: 14_000, buyIns: [10_000], settledStack: 14_000 },
      { name: "Rajarshi", stack: 6_000, buyIns: [10_000], settledStack: 6_000 },
    ],
    ...overrides,
  };
}

describe("live view snapshot", () => {
  test("a raked game balances at minus the house's rake", () => {
    const raked = snapshot({
      rake: 250,
      players: [
        { name: "Debraj", stack: 13_750, buyIns: [10_000], settledStack: 13_750 },
        { name: "Rajarshi", stack: 6_000, buyIns: [10_000], settledStack: 6_000 },
      ],
    });
    const view = deriveLiveView(validateLiveSnapshot(raked));
    assert.equal(view.rake, 250);
    assert.deepEqual(view.standings.map((row) => row.net), [3_750, -4_000]);
    assert.throws(() =>
      deriveLiveView(validateLiveSnapshot({ ...raked, rake: undefined })),
    );
  });

  test("between hands, the live and settled stacks are the same", () => {
    const built = buildLiveSnapshot(game([15_000, 5_000, 10_000]));
    assert.equal(built.gameName, "Game 26");
    assert.equal(built.handInProgress, false);
    assert.deepEqual(
      built.players.map((player) => [player.stack, player.settledStack]),
      [[15_000, 15_000], [5_000, 5_000], [10_000, 10_000]],
    );
  });

  test("during a hand, settled stacks come from the start of the hand", () => {
    const state = game([15_000, 5_000, 10_000]);
    dealNewHand(state);
    const built = buildLiveSnapshot(state);
    assert.equal(built.handInProgress, true);
    assert.equal(built.handNo, 4);
    assert.deepEqual(
      built.players.map((player) => player.settledStack),
      [15_000, 5_000, 10_000],
    );
    // The blinds have left two stacks, so the live total is lower.
    const live = built.players.reduce((sum, player) => sum + player.stack, 0);
    assert.equal(live, 30_000 - 150);
    // It still validates and ranks on settled chips.
    const view = deriveLiveView(validateLiveSnapshot(built));
    assert.deepEqual(
      view.standings.map((row) => [row.name, row.net]),
      [["Debraj", 5_000], ["Pratik", 0], ["Rajarshi", -5_000]],
    );
  });

  test("carries no player IDs or hand details", () => {
    const state = game([10_000, 10_000]);
    state.players[0].id = "a0d20199-57b0-4f55-a23a-64d012950724";
    state.log = ["Hand 3: Debraj wins ₹200"];
    const text = JSON.stringify(buildLiveSnapshot(state));
    assert.equal(text.includes("a0d20199"), false);
    assert.equal(text.includes("wins"), false);
  });
});

describe("live view standings", () => {
  test("counts rebuys as invested and ranks by net", () => {
    const view = deriveLiveView(
      validateLiveSnapshot(
        buildLiveSnapshot(
          game([25_000, 5_000, 10_000], [[10_000, 10_000], [10_000], [10_000]]),
        ),
      ),
    );
    assert.deepEqual(
      view.standings.map(({ rank, name, stack, invested, start, net, rebuys }) => ({
        rank,
        name,
        stack,
        invested,
        start,
        net,
        rebuys,
      })),
      [
        { rank: 1, name: "Debraj", stack: 25_000, invested: 20_000, start: 10_000, net: 5_000, rebuys: 1 },
        { rank: 2, name: "Pratik", stack: 10_000, invested: 10_000, start: 10_000, net: 0, rebuys: 0 },
        { rank: 3, name: "Rajarshi", stack: 5_000, invested: 10_000, start: 10_000, net: -5_000, rebuys: 0 },
      ],
    );
  });

  test("tied players share a rank, ordered by name", () => {
    const view = deriveLiveView(
      validateLiveSnapshot(buildLiveSnapshot(game([10_000, 10_000, 10_000]))),
    );
    assert.deepEqual(
      view.standings.map((row) => [row.rank, row.name]),
      [[1, "Debraj"], [1, "Pratik"], [1, "Rajarshi"]],
    );
  });

  test("refuses settled chips that don't balance", () => {
    const unbalanced = snapshot();
    unbalanced.players[0].stack = 15_000;
    unbalanced.players[0].settledStack = 15_000;
    assert.throws(() => deriveLiveView(validateLiveSnapshot(unbalanced)), /balance/);
  });
});

describe("live view validation", () => {
  test("a player who cashed out keeps their chips and is marked as left", () => {
    const left = game([15_000, 5_000, 10_000]);
    left.players[0].left = true;
    const built = buildLiveSnapshot(left);
    assert.equal(built.players[0].left, true);
    assert.equal(built.players[1].left, undefined);
    const view = deriveLiveView(validateLiveSnapshot(built));
    assert.deepEqual(
      view.standings.map((row) => [row.name, row.stack, row.left ?? false]),
      [["Debraj", 15_000, true], ["Pratik", 10_000, false], ["Rajarshi", 5_000, false]],
    );
  });

  test("accepts buy-ins players chose themselves", () => {
    const view = deriveLiveView(
      validateLiveSnapshot(
        snapshot({
          players: [
            { name: "Debraj", stack: 9_000, buyIns: [5_000], settledStack: 9_000 },
            { name: "Rajarshi", stack: 16_000, buyIns: [10_000, 10_000], settledStack: 16_000 },
          ],
        }),
      ),
    );
    assert.deepEqual(
      view.standings.map((row) => [row.name, row.invested, row.net]),
      [["Debraj", 5_000, 4_000], ["Rajarshi", 20_000, -4_000]],
    );
  });

  test("accepts a valid snapshot and cleans names", () => {
    const input = snapshot();
    input.players[0].name = "  Debraj   Das ";
    assert.equal(validateLiveSnapshot(input).players[0].name, "Debraj Das");
  });

  const rejects: Array<[string, (input: LiveSnapshot) => void]> = [
    ["a missing game name", (input) => { input.gameName = " "; }],
    ["one player", (input) => { input.players = input.players.slice(0, 1); }],
    ["a fractional stack", (input) => { input.players[0].stack = 1.5; }],
    ["a negative stack", (input) => { input.players[0].stack = -1; }],
    ["a string stack", (input) => {
      (input.players[0] as unknown as { stack: string }).stack = "100";
    }],
    ["a buy-in of nothing", (input) => {
      input.players[0].buyIns = [0];
      input.players[0].stack = input.players[0].settledStack = 4_000;
    }],
    ["a fractional rebuy", (input) => {
      input.players[0].buyIns = [10_000, 0.5];
    }],
    ["too many buy-ins", (input) => {
      input.players[0].buyIns = Array(65).fill(10_000);
    }],
    ["live and settled stacks that differ between hands", (input) => {
      input.players[0].stack = 13_900;
    }],
    ["a stack that grew during a hand", (input) => {
      input.handInProgress = true;
      input.players[0].stack = 14_100;
    }],
    ["duplicate names", (input) => { input.players[1].name = "debraj"; }],
    ["a table status other than left", (input) => {
      (input.players[0] as unknown as { left: string }).left = "yes";
    }],
    ["a player who left but is still in the hand", (input) => {
      input.handInProgress = true;
      input.players[0].left = true;
      input.players[0].stack = 13_900;
    }],
  ];

  for (const [label, change] of rejects) {
    test(`rejects ${label}`, () => {
      const input = structuredClone(snapshot());
      change(input);
      assert.throws(() => deriveLiveView(validateLiveSnapshot(input)));
    });
  }

  test("tokens must be 32 bytes of base64url", () => {
    assert.equal(isLiveToken("A".repeat(43)), true);
    assert.equal(isLiveToken("A".repeat(42)), false);
    assert.equal(isLiveToken(`${"A".repeat(42)}=`), false);
    assert.equal(isLiveToken("../../api/sessions"), false);
  });
});

describe("live view extras", () => {
  test("a hand in progress sends the street, pot, statuses and positions", () => {
    const state = game([10_000, 10_000, 10_000]);
    dealNewHand(state);
    const view = deriveLiveView(validateLiveSnapshot(buildLiveSnapshot(state)));
    assert.equal(view.hand?.stage, 0);
    assert.equal(view.hand?.pot, 150);
    assert.equal(view.hand?.toAct, state.hand!.currentPlayer);
    const bySeat = new Map(view.standings.map((row) => [row.seat, row]));
    assert.equal(bySeat.get(state.hand!.bigBlindIndex)?.role, "BB");
    assert.deepEqual(bySeat.get(state.hand!.bigBlindIndex)?.status, {
      label: "Big blind",
      amount: 100,
    });
    assert.equal(bySeat.get(state.hand!.bigBlindIndex)?.inHand, 100);
    assert.equal(bySeat.get(state.hand!.bigBlindIndex)?.bigBlindIn, 0);
  });

  test("finished hands give the last result, biggest pot, chart and movement", () => {
    const state = game([10_000, 10_000, 10_000]);
    dealNewHand(state);
    const first = state.hand!.bigBlindIndex;
    assert.ok(awardPots(state, [[first]]));
    dealNewHand(state);
    // Hand 5's big blind is a different player from hand 4's winner.
    const second = state.hand!.bigBlindIndex;
    assert.notEqual(second, first);
    assert.ok(awardPots(state, [[second]]));
    assert.equal(state.handResults?.length, 2);

    const view = deriveLiveView(validateLiveSnapshot(buildLiveSnapshot(state)));
    assert.equal(view.lastHand?.no, 5);
    assert.deepEqual(view.lastHand?.names, [state.players[second].name]);
    // The big blind's uncalled 50 goes back, so each pot paid out 100.
    assert.equal(view.biggestPot?.amount, 100);
    assert.equal(view.biggestPot?.no, 4, "the first of equal pots");
    assert.deepEqual(view.historyHands, [4, 5]);
    const winner = view.standings.find((row) => row.seat === second)!;
    assert.equal(winner.nets?.length, 2);
    assert.equal(winner.nets?.at(-1), winner.net);
    assert.equal(winner.rank, 1);
    assert.ok((winner.move ?? 0) > 0, "moved up after winning");

    // Undoing the last hand takes its result away too.
    assert.ok(undoLastHand(state));
    assert.equal(state.handResults?.length, 1);
  });

  test("rebuys left follow the host's limits", () => {
    const state = game([20_000, 10_000, 10_000], [[10_000, 10_000], [10_000], [10_000]]);
    state.rebuyRules = { maxRebuys: 2, closeAtBigBlind: null };
    const view = deriveLiveView(validateLiveSnapshot(buildLiveSnapshot(state)));
    const left = new Map(view.standings.map((row) => [row.name, row.rebuysLeft]));
    assert.equal(left.get("Debraj"), 1);
    assert.equal(left.get("Pratik"), 2);

    state.rebuyRules = { maxRebuys: 2, closeAtBigBlind: 100 };
    const closed = deriveLiveView(validateLiveSnapshot(buildLiveSnapshot(state)));
    assert.ok(closed.standings.every((row) => row.rebuysClosed && row.rebuysLeft === 0));
  });

  test("timed and hand-based blind levels send what comes next", () => {
    const state = game([10_000, 10_000, 10_000]);
    const plan = (unit: "hands" | "minutes") => [
      {
        effectiveHand: 1,
        effectiveAt: state.startedAt,
        baseBigBlind: 100,
        schedule: { unit, every: 10, raiseType: "multiply" as const, raiseBy: 2 },
      },
    ];
    state.blindPlans = plan("hands");
    const byHands = buildLiveSnapshot(state);
    // Hands 1 to 10 are level 1; three are dealt.
    assert.deepEqual(byHands.nextBlinds, { smallBlind: 100, bigBlind: 200, handsLeft: 7 });
    assert.deepEqual(
      deriveLiveView(validateLiveSnapshot(byHands)).nextBlinds,
      byHands.nextBlinds,
    );

    state.blindPlans = plan("minutes");
    const minute = 60_000;
    const timed = buildLiveSnapshot(state, undefined, state.startedAt + 4 * minute);
    assert.equal(timed.nextBlinds?.endsAt, state.startedAt + 10 * minute);
    state.blindClockPausedAt = state.startedAt + 4 * minute;
    const paused = buildLiveSnapshot(state, undefined, state.startedAt + 9 * minute);
    assert.equal(paused.nextBlinds?.pausedMsLeft, 6 * minute);
  });

  test("the big blind comes round in deal order", () => {
    const state = game([10_000, 10_000, 10_000]);
    state.dealerIndex = 0;
    // Next deal: dealer 1, small blind 2, big blind 0.
    assert.deepEqual(handsUntilBigBlind(state), [1, 2, 3]);
    state.players[2].stack = 0;
    // Heads-up the dealer (seat 1 next) posts the small blind.
    assert.deepEqual(handsUntilBigBlind(state), [1, 2, null]);
  });

  test("rejects statuses, names and pots the app doesn't send", () => {
    const base = snapshot({ handInProgress: true });
    const withPlayer = (extra: object) =>
      validateLiveSnapshot({
        ...base,
        players: [{ ...base.players[0], ...extra }, base.players[1]],
      });
    assert.throws(() => withPlayer({ status: { label: "<b>hi</b>" } }));
    assert.throws(() => withPlayer({ role: "UTG" }));
    assert.throws(() => withPlayer({ inHand: 500 }), /don't match/);
    assert.throws(() =>
      validateLiveSnapshot({
        ...snapshot(),
        lastHand: { no: 2, pot: 100, names: ["Someone else"], split: false },
      }),
    );
    assert.throws(() =>
      validateLiveSnapshot({
        ...snapshot(),
        lastHand: {
          no: 2,
          pot: 100,
          names: ["Debraj"],
          split: false,
          pots: [{ label: "Jackpot", amount: 100, names: ["Debraj"] }],
        },
      }),
    );
  });
});
