import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  groupLog,
  linesToSave,
  LOG_LIMIT,
  parseLogLine,
} from "../lib/poker/action-log.ts";
import { parseActionLog } from "../lib/poker/session-validation.ts";

const names = ["Asha", "Asha Rao", "Dev"];

describe("parseLogLine", () => {
  test("reads a betting action with its hand and street", () => {
    const parsed = parseLogLine("Hand 29 FLOP: Asha Rao raises to ₹1,300", names);
    assert.equal(parsed.hand, 29);
    assert.equal(parsed.title, "Hand 29");
    assert.equal(parsed.street, "Flop");
    assert.deepEqual(
      { ...parsed.entry, line: undefined },
      {
        line: undefined,
        kind: "raise",
        player: 1,
        verb: "Raises to",
        amount: "₹1,300",
        note: null,
        number: null,
      },
    );
  });

  test("reads folds, checks, calls and bets", () => {
    const kinds = [
      "Hand 3 PREFLOP: Dev folds",
      "Hand 3 PREFLOP: Dev checks",
      "Hand 3 PREFLOP: Dev calls ₹50",
      "Hand 3 TURN: Dev bets $0.75",
    ].map((line) => parseLogLine(line, names).entry.kind);
    assert.deepEqual(kinds, ["fold", "check", "call", "bet"]);
  });

  test("keeps the all-in's total and short raise as a note", () => {
    const { entry } = parseLogLine(
      "Hand 4 RIVER: Asha goes all-in for ₹300 (to ₹500), short of a full raise",
      names,
    );
    assert.equal(entry.kind, "all-in");
    assert.equal(entry.amount, "₹300");
    assert.equal(entry.note, "to ₹500, short of a full raise");
  });

  test("reads wins, side pots and splits", () => {
    const win = parseLogLine("Hand 5: Dev wins ₹900 (others folded)", names);
    assert.equal(win.street, null);
    assert.deepEqual(
      [win.entry.kind, win.entry.verb, win.entry.amount, win.entry.note],
      ["win", "Wins", "₹900", "others folded"],
    );
    const side = parseLogLine("Hand 5: Asha wins side pot 2 ₹200", names).entry;
    assert.deepEqual([side.verb, side.amount], ["Wins side pot 2", "₹200"]);
    const split = parseLogLine(
      "Hand 5: split main pot ₹600 between Asha, Dev",
      names,
    ).entry;
    assert.deepEqual(
      [split.kind, split.player, split.verb, split.amount, split.note],
      ["split", null, "Split main pot", "₹600", "Asha, Dev"],
    );
  });

  test("puts buy-ins during a hand with that hand, and changes before one apart", () => {
    const during = parseLogLine("During hand 7: Dev buys in for ₹10,000", names);
    assert.deepEqual([during.hand, during.title], [7, "Hand 7"]);
    assert.equal(during.entry.verb, "Buys in");
    const before = parseLogLine(
      "Before hand 8: Dev joins and buys in for ₹10,000",
      names,
    );
    assert.deepEqual([before.hand, before.title], [null, "Before hand 8"]);
    assert.equal(before.entry.verb, "Joins");
  });

  test("reads a buy-in taken back when saving", () => {
    const { entry } = parseLogLine(
      "Asha takes back a buy-in of ₹10,000 when saving (no hand finished with it)",
      names,
    );
    assert.deepEqual(
      [entry.kind, entry.player, entry.verb, entry.amount, entry.note],
      ["take-back", 0, "Buy-in taken back", "₹10,000", "No hand finished with it"],
    );
    assert.equal(
      parseLogLine(
        "Dev takes back 2 buy-ins of ₹20,000 when saving (no hand finished with them)",
        names,
      ).entry.verb,
      "2 buy-ins taken back",
    );
  });

  test("reads blinds and rake, and keeps anything else whole", () => {
    const blinds = parseLogLine(
      "Hand 9: blinds up to ₹100/₹200 (level 3)",
      names,
    ).entry;
    assert.deepEqual(
      [blinds.kind, blinds.amount, blinds.note],
      ["blinds", "₹100/₹200", "Level 3"],
    );
    const note = parseLogLine("Blind clock resumed", names);
    assert.deepEqual(
      [note.title, note.entry.kind, note.entry.verb],
      [null, "note", "Blind clock resumed"],
    );
  });
});

describe("groupLog", () => {
  test("groups consecutive lines by hand, then by street", () => {
    const groups = groupLog(
      [
        "Hand 2: Dev wins pot ₹300",
        "Hand 2 FLOP: Asha folds",
        "Hand 2 FLOP: Dev bets ₹100",
        "Hand 2 PREFLOP: Asha calls ₹50",
        "Before hand 2: Dev joins and buys in for ₹1,000",
        "Hand 1: Asha wins ₹100 (others folded)",
      ],
      names,
    );
    assert.deepEqual(
      groups.map((group) => [
        group.title,
        group.streets.map((street) => [street.street, street.entries.length]),
      ]),
      [
        ["Hand 2", [[null, 1], ["Flop", 2], ["Preflop", 1]]],
        ["Before hand 2", [[null, 1]]],
        ["Hand 1", [[null, 1]]],
      ],
    );
  });

  test("numbers betting actions from 1 within each hand", () => {
    const lines = [
      "Hand 2: Dev wins pot ₹300",
      "Hand 2 FLOP: Asha folds",
      "Hand 2 FLOP: Dev bets ₹100",
      "Hand 2 PREFLOP: Asha calls ₹50",
      "During hand 2: Asha Rao buys in for ₹1,000",
      "Hand 1: Asha wins ₹100 (others folded)",
      "Hand 1 PREFLOP: Dev folds",
    ];
    const numbers = (groups: ReturnType<typeof groupLog>) =>
      groups.flatMap((group) =>
        group.streets.flatMap((street) =>
          street.entries.map((entry) => entry.number),
        ),
      );
    assert.deepEqual(numbers(groupLog(lines, names)), [
      null, 3, 2, 1, null, null, 1,
    ]);
    // A log that may have lost old lines leaves its oldest hand unnumbered.
    assert.deepEqual(
      numbers(groupLog(lines, names, { complete: false })),
      [null, 3, 2, 1, null, null, null],
    );
  });
});

describe("parseActionLog", () => {
  test("accepts a saved log and leaves none as none", () => {
    const log = {
      players: [{ id: "p1", name: "Asha" }, { name: "Dev" }],
      lines: ["Hand 1 PREFLOP: Dev folds"],
    };
    assert.deepEqual(parseActionLog(log), log);
    assert.equal(parseActionLog(undefined), undefined);
    assert.equal(parseActionLog(null), undefined);
  });

  test("refuses logs of the wrong shape or size", () => {
    const players = [{ name: "Asha" }];
    for (const bad of [
      [],
      { players, lines: "Hand 1" },
      { players, lines: [""] },
      { players, lines: [1] },
      { players, lines: ["x".repeat(301)] },
      { players, lines: Array(LOG_LIMIT + 1).fill("line") },
      { players: [{ name: "" }], lines: [] },
      { players: [{ id: "bad id", name: "Asha" }], lines: [] },
      { players: Array(11).fill({ name: "Asha" }), lines: [] },
    ]) {
      assert.throws(() => parseActionLog(bad));
    }
  });
});

describe("linesToSave", () => {
  const lines = [
    "Hand 12 PREFLOP: Dev calls ₹100",
    "During hand 12: Asha buys in for ₹1,000",
    "Hand 12: blinds up to ₹100/₹200 (level 2)",
    "Hand 11: Dev wins ₹300",
    "Hand 1 PREFLOP: Asha folds",
  ];

  test("leaves out the unfinished hand's lines but keeps its buy-ins", () => {
    assert.deepEqual(linesToSave(lines, 12), [
      "During hand 12: Asha buys in for ₹1,000",
      "Hand 11: Dev wins ₹300",
      "Hand 1 PREFLOP: Asha folds",
    ]);
  });

  test("keeps every line between hands", () => {
    assert.deepEqual(linesToSave(lines, null), lines);
    // Hand 1 isn't hand 12's prefix match.
    assert.equal(linesToSave(lines, 1).length, 4);
  });
});
