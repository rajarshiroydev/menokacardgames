import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatChips,
  formatMoney,
  formatSignedChips,
  chipCurrency,
  plainChipsCode,
} from "../lib/poker/money.ts";
import {
  chipsToCents,
  HOUSE_NAME,
  normalizeChipValue,
  parseChipValue,
  sessionMoney,
  settleSession,
  settleUp,
  type Balance,
  type Transfer,
} from "../lib/poker/settle-up.ts";
import { gameFromSession } from "../lib/poker/continue-session.ts";
import { createLedgerGame, ledgerSession } from "../lib/poker/ledger.ts";
import {
  buildLiveSnapshot,
  deriveLiveView,
  validateLiveSnapshot,
} from "../lib/poker/live-view.ts";
import { isSameSession } from "../lib/poker/session-conflict.ts";
import { validateSession } from "../lib/poker/session-validation.ts";
import { buildStandings } from "../lib/poker/standings.ts";
import type { PokerSession, SessionResult } from "../lib/poker/types.ts";

function game(
  results: Array<[string, number, number[]?]>,
  extra: Partial<PokerSession> = {},
): PokerSession {
  const startStack = extra.startStack ?? 10_000;
  return {
    id: "s1",
    date: 1,
    ended: 2,
    ante: 100,
    startStack,
    hands: 10,
    results: results.map(([name, net, buyIns]): SessionResult => {
      const invested = (buyIns ?? [startStack]).reduce((a, b) => a + b, 0);
      return {
        name,
        net,
        end: invested + net,
        ...(buyIns ? { buyIns } : {}),
      };
    }),
    ...extra,
  };
}

/** Applies transfers to balances; everyone must end at zero. */
function settledBalances(balances: Balance[], transfers: Transfer[]) {
  const left = new Map(balances.map((entry) => [entry.name, entry.cents]));
  for (const transfer of transfers) {
    assert.ok(transfer.cents > 0, "transfers are positive");
    left.set(transfer.from, left.get(transfer.from)! + transfer.cents);
    left.set(transfer.to, left.get(transfer.to)! - transfer.cents);
  }
  return [...left.values()];
}

describe("chip value", () => {
  it("accepts whole positive chips and price, and nothing else", () => {
    assert.deepEqual(normalizeChipValue({ chips: 10_000, cents: 50_000 }), {
      chips: 10_000,
      cents: 50_000,
    });
    for (const bad of [
      null,
      [],
      { chips: 0, cents: 100 },
      { chips: 100, cents: 0 },
      { chips: 1.5, cents: 100 },
      { chips: 100, cents: -1 },
      { chips: 100, cents: 100_000_000_001 },
      { chips: "100", cents: "x" },
    ]) {
      assert.equal(normalizeChipValue(bad), null);
    }
    assert.equal(parseChipValue(undefined), undefined);
    assert.equal(parseChipValue(null), undefined);
    assert.throws(() => parseChipValue({ chips: 0, cents: 1 }), /chip value/);
  });

  it("converts chips at the price, and a chip per unit without one", () => {
    const value = { chipValue: { chips: 10_000, cents: 50_000 } };
    assert.equal(chipsToCents(12_000, value), 60_000);
    assert.equal(chipsToCents(-10_000, value), -50_000);
    assert.equal(chipsToCents(12_000, {}), 1_200_000);
    assert.equal(chipsToCents(150, { chipUnit: "cents" }), 150);
    // ₹500 for 3 chips: 1 chip is ₹166.666…, rounded to the paisa.
    assert.equal(chipsToCents(1, { chipValue: { chips: 3, cents: 50_000 } }), 16_667);
    assert.equal(chipsToCents(-1, { chipValue: { chips: 3, cents: 50_000 } }), -16_667);
    // Halves round away from zero.
    assert.equal(chipsToCents(1, { chipValue: { chips: 2, cents: 1 } }), 1);
    assert.equal(chipsToCents(-1, { chipValue: { chips: 2, cents: 1 } }), -1);
  });

  it("formats a valued game's chips as plain counts", () => {
    assert.equal(formatChips(10_000, "whole", plainChipsCode("INR")), "10,000");
    assert.equal(formatChips(100_000, "whole", plainChipsCode("INR")), "1,00,000");
    assert.equal(formatChips(100_000, "whole", plainChipsCode("USD")), "100,000");
    assert.equal(formatChips(25, "cents", plainChipsCode("USD")), "0.25");
    assert.equal(formatSignedChips(-2_000, "whole", plainChipsCode("INR")), "−2,000");
    assert.equal(chipCurrency("INR", undefined), "INR");
    assert.equal(formatMoney(5, chipCurrency("INR", { chips: 1, cents: 1 })), "5");
  });
});

describe("session money", () => {
  it("is the chips in currency without a chip value", () => {
    const money = sessionMoney(
      game([
        ["Asha", 12_000],
        ["Bikram", -12_000],
      ]),
    );
    assert.deepEqual(money, {
      results: [
        { net: 1_200_000, invested: 1_000_000 },
        { net: -1_200_000, invested: 1_000_000 },
      ],
      house: 0,
    });
  });

  it("converts at the chip value, buy-ins included", () => {
    const money = sessionMoney(
      game(
        [
          ["Asha", 12_000],
          ["Arjun", 3_000],
          ["Bikram", -10_000, [10_000, 10_000]],
          ["Dev", -5_000],
        ],
        { chipValue: { chips: 10_000, cents: 50_000 } },
      ),
    );
    assert.deepEqual(
      money.results.map((result) => result.net),
      [60_000, 15_000, -50_000, -25_000],
    );
    assert.deepEqual(
      money.results.map((result) => result.invested),
      [50_000, 50_000, 100_000, 50_000],
    );
  });

  it("rounds results so they still add up to zero", () => {
    // ₹1 for 3 chips: +1 chip each is 33.33… paise.
    const money = sessionMoney(
      game(
        [
          ["A", 1],
          ["B", 1],
          ["C", -2],
        ],
        { startStack: 3, chipValue: { chips: 3, cents: 100 } },
      ),
    );
    const nets = money.results.map((result) => result.net);
    // Rounded down to 33, 33 and −67, one paisa short; all three are a
    // third over, so the first result gets it.
    assert.deepEqual(nets, [34, 33, -67]);
  });

  it("adds up to minus the house's rake", () => {
    const money = sessionMoney(
      game(
        [
          ["A", 7],
          ["B", -4],
          ["C", -4],
        ],
        {
          startStack: 30,
          rake: 1,
          rakeRules: { percent: 5, cap: 10 },
          chipValue: { chips: 3, cents: 100 },
        },
      ),
    );
    assert.equal(money.house, 33);
    assert.equal(
      money.results.reduce((sum, result) => sum + result.net, 0),
      -33,
    );
  });

  it("refuses a game whose chips don't balance", () => {
    assert.throws(() =>
      sessionMoney(
        game([
          ["A", 100],
          ["B", -50],
        ]),
      ),
    );
  });
});

describe("settle up", () => {
  it("pays the example from the plan in three transfers", () => {
    const settlement = settleSession(
      game(
        [
          ["Asha", 12_000],
          ["Arjun", 3_000],
          ["Bikram", -10_000, [10_000, 10_000]],
          ["Dev", -5_000],
        ],
        { chipValue: { chips: 10_000, cents: 50_000 } },
      ),
    );
    assert.deepEqual(
      settlement.players.map((player) => [player.name, player.net]),
      [
        ["Asha", 60_000],
        ["Arjun", 15_000],
        ["Dev", -25_000],
        ["Bikram", -50_000],
      ],
    );
    assert.equal(settlement.transfers.length, 3);
    assert.deepEqual(settlement.transfers[0], {
      from: "Bikram",
      to: "Asha",
      cents: 50_000,
    });
    assert.deepEqual(
      settledBalances(
        settlement.players.map(({ name, net }) => ({ name, cents: net })),
        settlement.transfers,
      ),
      [0, 0, 0, 0],
    );
  });

  it("needs nothing when everyone broke even", () => {
    assert.deepEqual(settleUp([{ name: "A", cents: 0 }, { name: "B", cents: 0 }]), []);
  });

  it("finds pairs that settle among themselves", () => {
    // Largest-first matching would take 4 transfers here; the exact answer
    // is 3 (A→D settles alone; B and C pay E).
    const balances: Balance[] = [
      { name: "A", cents: -5 },
      { name: "B", cents: -7 },
      { name: "C", cents: -3 },
      { name: "D", cents: 5 },
      { name: "E", cents: 10 },
    ];
    const transfers = settleUp(balances);
    assert.equal(transfers.length, 3);
    assert.deepEqual(settledBalances(balances, transfers), [0, 0, 0, 0, 0]);
    assert.ok(
      transfers.some(
        (transfer) =>
          transfer.from === "A" && transfer.to === "D" && transfer.cents === 5,
      ),
    );
  });

  it("never needs more than one fewer transfer than people", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 48_271) % 2_147_483_647;
      return seed / 2_147_483_647;
    };
    for (let round = 0; round < 200; round += 1) {
      const size = 2 + Math.floor(random() * 10);
      const balances: Balance[] = Array.from({ length: size - 1 }, (_, i) => ({
        name: `P${i}`,
        cents: Math.round((random() - 0.5) * 2_000) * 50,
      }));
      balances.push({
        name: `P${size - 1}`,
        cents: -balances.reduce((sum, entry) => sum + entry.cents, 0),
      });
      const transfers = settleUp(balances);
      const people = balances.filter((entry) => entry.cents !== 0).length;
      assert.ok(transfers.length <= Math.max(0, people - 1));
      assert.ok(settledBalances(balances, transfers).every((left) => left === 0));
    }
  });

  it("refuses balances that don't add up", () => {
    assert.throws(() => settleUp([{ name: "A", cents: 5 }, { name: "B", cents: -4 }]));
  });

  it("owes the rake to the house", () => {
    const settlement = settleSession(
      game(
        [
          ["Asha", 8_000],
          ["Bikram", -8_300],
        ],
        { rake: 300, rakeRules: { percent: 5, cap: 300 } },
      ),
    );
    assert.equal(settlement.house, 30_000);
    assert.deepEqual(
      settlement.transfers.map((transfer) => [transfer.from, transfer.to, transfer.cents]),
      [
        ["Bikram", "Asha", 800_000],
        ["Bikram", HOUSE_NAME, 30_000],
      ],
    );
  });

  it("tells apart two players with the same name", () => {
    const session = game([
      ["Arjun", 500],
      ["arjun", -500],
    ]);
    session.results.forEach((result, index) => {
      result.playerId = `p${index}`;
    });
    const settlement = settleSession(session);
    assert.deepEqual(settlement.transfers, [
      { from: "arjun (2)", to: "Arjun", cents: 50_000 },
    ]);
  });
});

describe("chip value across the app", () => {
  const valued = game(
    [
      ["Asha", 10_000],
      ["Bikram", -10_000],
    ],
    { chipValue: { chips: 10_000, cents: 50_000 } },
  );

  it("is kept by a saved game, and a bad one refused", () => {
    assert.deepEqual(validateSession(valued).chipValue, {
      chips: 10_000,
      cents: 50_000,
    });
    assert.equal(validateSession({ ...valued, chipValue: null }).chipValue, undefined);
    assert.throws(
      () => validateSession({ ...valued, chipValue: { chips: 0, cents: 5 } }),
      /chip value/,
    );
  });

  it("doesn't make a retried save or re-import a different game", () => {
    const saved = { ...valued, sessionNumber: 3 };
    assert.equal(isSameSession(saved, { ...valued, chipValue: undefined }), true);
    assert.equal(
      isSameSession(saved, { ...valued, chipValue: { chips: 1, cents: 1 } }),
      true,
    );
  });

  it("puts money in the standings, with the ranking unchanged", () => {
    const plain = buildStandings([{ ...valued, chipValue: undefined }]);
    const money = buildStandings([valued]);
    const asha = (standings: typeof money) =>
      standings.entries.find((entry) => entry.name === "Asha")!;
    assert.equal(asha(plain).net, 10_000);
    assert.equal(asha(money).net, 500);
    assert.equal(asha(money).invested, 500);
    assert.equal(asha(money).averageReturn, asha(plain).averageReturn);
  });

  it("carries over when a saved game is continued", () => {
    const continued = gameFromSession(
      { ...valued, sessionNumber: 3 },
      [],
      "INR",
      10,
      () => 0,
    );
    assert.deepEqual(continued.chipValue, valued.chipValue);
  });

  it("goes from a quick ledger's setup to its saved game", () => {
    const ledger = createLedgerGame({
      gameName: "",
      sessionLabel: "Game 4",
      currency: "INR",
      chipUnit: "whole",
      chipValue: { chips: 10_000, cents: 50_000 },
      startStack: 10_000,
      players: [{ name: "Asha" }, { name: "Bikram" }],
      buyIns: null,
      startedAt: 1,
    })!;
    assert.deepEqual(ledger.chipValue, { chips: 10_000, cents: 50_000 });
    const saved = ledgerSession(ledger, [15_000, 5_000], 2);
    assert.deepEqual(saved.chipValue, { chips: 10_000, cents: 50_000 });
    assert.deepEqual(
      settleSession(saved).transfers,
      [{ from: "Bikram", to: "Asha", cents: 25_000 }],
    );
  });

  it("shows plain chips on the live link without sending the price", () => {
    const ledger = createLedgerGame({
      gameName: "Friday",
      sessionLabel: "Friday",
      currency: "INR",
      chipUnit: "whole",
      chipValue: { chips: 10_000, cents: 50_000 },
      startStack: 10_000,
      players: [{ name: "Asha" }, { name: "Bikram" }],
      buyIns: null,
      startedAt: 1,
    })!;
    const snapshot = buildLiveSnapshot({
      ...ledger,
      kind: undefined,
      ante: 100,
      players: ledger.players.map((player) => ({ ...player, stack: 10_000 })),
    });
    assert.equal(snapshot.plainChips, true);
    assert.equal(JSON.stringify(snapshot).includes("50000"), false);
    const view = deriveLiveView(validateLiveSnapshot(snapshot));
    assert.equal(view.plainChips, true);
  });
});
