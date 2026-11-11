import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type PastGameDraft,
  pastGameGap,
  pastGameSession,
  pastGameStart,
} from "../lib/poker/past-game.ts";
import { validateSession } from "../lib/poker/session-validation.ts";

const NOW = new Date(2026, 10, 11, 18, 0).getTime();

function draft(change: Partial<PastGameDraft> = {}): PastGameDraft {
  return {
    name: "",
    date: "2026-11-08",
    time: "21:30",
    minutes: 150,
    players: [
      { playerId: "p1", name: "Asha", buyIns: [1_000_000, 1_000_000], end: 2_500_000 },
      { playerId: "p2", name: "Dev", buyIns: [1_000_000], end: 500_000 },
      { playerId: "p3", name: "Meera", buyIns: [1_000_000], end: 1_000_000 },
    ],
    ...change,
  };
}

describe("past games", () => {
  it("builds a quick ledger the server accepts", () => {
    const session = pastGameSession(draft({ name: " Diwali night " }), NOW);
    assert.equal(session.kind, "ledger");
    assert.equal(session.id, `past-${NOW}`);
    assert.equal(session.name, "Diwali night");
    assert.equal(session.date, new Date(2026, 10, 8, 21, 30).getTime());
    assert.equal(session.ended - session.date, 150 * 60_000);
    assert.equal(session.chipUnit, undefined);
    assert.equal(session.startStack, 10_000);
    assert.deepEqual(
      session.results.map(({ name, net, end, buyIns }) => ({ name, net, end, buyIns })),
      [
        { name: "Asha", net: 5_000, end: 25_000, buyIns: [10_000, 10_000] },
        { name: "Dev", net: -5_000, end: 5_000, buyIns: [10_000] },
        { name: "Meera", net: 0, end: 10_000, buyIns: [10_000] },
      ],
    );
    assert.deepEqual(validateSession(session).results, session.results);
  });

  it("starts at midnight without a time and has no length without one", () => {
    const session = pastGameSession(draft({ time: "", minutes: null }), NOW);
    assert.equal(session.date, new Date(2026, 10, 8).getTime());
    assert.equal(session.ended, session.date);
  });

  it("keeps cents when an amount has them", () => {
    const session = pastGameSession(
      draft({
        players: [
          { playerId: "p1", name: "Asha", buyIns: [2_000], end: 2_550 },
          { playerId: "p2", name: "Dev", buyIns: [2_000], end: 1_450 },
        ],
      }),
      NOW,
    );
    assert.equal(session.chipUnit, "cents");
    assert.deepEqual(session.results.map((result) => result.end), [2_550, 1_450]);
    assert.equal(session.startStack, 2_000);
    validateSession(session);
  });

  it("refuses the future, bad dates, missing amounts and unbalanced ends", () => {
    const refuse = (change: Partial<PastGameDraft>, message: string) =>
      assert.throws(() => pastGameSession(draft(change), NOW), { message });
    refuse({ date: "2026-11-12" }, "A past game can't start in the future");
    refuse({ date: "2026-11-11", time: "17:00", minutes: 120 }, "A past game can't end in the future");
    refuse({ date: "2026-02-30" }, "Choose the day the game was played");
    refuse({ date: "" }, "Choose the day the game was played");
    refuse({ players: draft().players.slice(0, 1) }, "Pick 2 to 10 players");
    const [asha, dev, meera] = draft().players;
    refuse(
      { players: [{ ...asha, buyIns: [1_000_000, null] }, dev, meera] },
      "Every buy-in needs an amount above 0 (Asha)",
    );
    refuse({ players: [asha, { ...dev, end: null }, meera] }, "Enter Dev's chips at the end");
    refuse(
      { players: [asha, { ...dev, end: 400_000 }, meera] },
      "The chips at the end must add up to the chips bought in",
    );
    refuse({ name: "x".repeat(81) }, "Game names must be 80 characters or fewer");
  });

  it("measures the gap like the final count", () => {
    const [asha, dev] = draft().players;
    assert.equal(pastGameGap([asha, { ...dev, end: 0 }]), 500_000);
    assert.equal(pastGameGap([asha, { ...dev, end: null }]), 500_000);
    assert.equal(pastGameGap(draft().players), 0);
    assert.equal(pastGameStart({ date: "2026-11-08", time: "bad" }), new Date(2026, 10, 8).getTime());
  });
});
