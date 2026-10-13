import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bestHand,
  cardName,
  cardProblem,
  compareHands,
  describeHand,
  evaluateFive,
  handDetail,
  handName,
  isCard,
  judgeShowdown,
  shownOrder,
} from "../lib/poker/hands.ts";

const cards = (text: string) => text.split(" ");

function judge(board: string, ...players: Array<[string, string]>) {
  return judgeShowdown(
    cards(board),
    players.map(([name, hole]) => ({ name, cards: cards(hole) })),
  );
}

describe("five-card hands", () => {
  const cases: Array<[string, string, number[], string]> = [
    ["As Ks Qs Js Ts", "Royal Flush", [14], "a royal flush"],
    ["9h 8h 7h 6h 5h", "Straight Flush", [9], "a straight flush, Five to Nine"],
    ["Qc Qd Qh Qs 7d", "Four of a Kind", [12, 7], "four of a kind, Queens"],
    ["Ks Kh Kd 4c 4s", "Full House", [13, 4], "a full house, three Kings and two Fours"],
    ["Ad Jd 8d 6d 2d", "Flush", [14, 11, 8, 6, 2], "a flush, Ace high"],
    ["Tc 9d 8s 7h 6c", "Straight", [10], "a straight, Six to Ten"],
    ["7s 7h 7d Kc 3s", "Three of a Kind", [7, 13, 3], "three of a kind, Sevens"],
    ["Jh Jc 5s 5d Ah", "Two Pair", [11, 5, 14], "two pair, Jacks and Fives"],
    ["Td Ts Kh 6c 2s", "One Pair", [10, 13, 6, 2], "a pair of Tens"],
    ["Ac Qd 9s 5h 3c", "High Card", [14, 12, 9, 5, 3], "Ace high"],
  ];
  for (const [hand, name, ranks, words] of cases) {
    it(`reads ${name}`, () => {
      const result = evaluateFive(cards(hand));
      assert.equal(handName(result), name);
      assert.deepEqual(result.ranks, ranks);
      assert.equal(describeHand(result), words);
    });
  }

  it("gives a short detail to show after the hand's name", () => {
    const detail = (hand: string) => handDetail(evaluateFive(cards(hand)));
    assert.equal(detail("As Ks Qs Js Ts"), "");
    assert.equal(detail("Ad Jd 8d 6d 2d"), "Ace high");
    assert.equal(detail("Tc 9d 8s 7h 6c"), "Six to Ten");
    assert.equal(detail("Ks Kh Kd 4c 4s"), "three Kings and two Fours");
    assert.equal(detail("Jh Jc 5s 5d Ah"), "Jacks and Fives");
    assert.equal(detail("Td Ts Kh 6c 2s"), "Tens");
  });

  it("counts the Ace low in a wheel and shows it last", () => {
    const wheel = evaluateFive(cards("Ac 2d 3s 4h 5c"));
    assert.equal(handName(wheel), "Straight");
    assert.deepEqual(wheel.ranks, [5]);
    assert.deepEqual(wheel.cards, cards("5c 4h 3s 2d Ac"));
    assert.equal(describeHand(wheel), "a straight, Ace to Five");

    const steel = evaluateFive(cards("Ah 2h 3h 4h 5h"));
    assert.equal(handName(steel), "Straight Flush");
    assert.deepEqual(steel.ranks, [5]);
  });

  it("doesn't wrap a straight round the Ace", () => {
    assert.equal(handName(evaluateFive(cards("Kc Ad 2s 3h 4c"))), "High Card");
  });

  it("puts the most important cards first", () => {
    assert.deepEqual(
      evaluateFive(cards("5s Jh Ah 5d Jc")).cards,
      cards("Jh Jc 5s 5d Ah"),
    );
  });

  it("orders hands by type, then by rank", () => {
    const flush = evaluateFive(cards("Ad Jd 8d 6d 2d"));
    const straight = evaluateFive(cards("As Kd Qh Jc Tc"));
    assert.ok(compareHands(flush, straight) > 0);
    const kings = evaluateFive(cards("Kh Kd 9c 4s 2d"));
    const kingsBetterKicker = evaluateFive(cards("Ks Kc Ah 4d 2c"));
    assert.ok(compareHands(kingsBetterKicker, kings) > 0);
    assert.equal(
      compareHands(evaluateFive(cards("Ah Kd 9c 4s 2d")), evaluateFive(cards("Ad Kc 9h 4d 2s"))),
      0,
    );
  });
});

describe("card order on screen", () => {
  it("shows a straight low to high, the Ace first in Ace to Five", () => {
    assert.deepEqual(shownOrder(evaluateFive(cards("6d 5c 4d 3h 2s"))), cards("2s 3h 4d 5c 6d"));
    assert.deepEqual(shownOrder(evaluateFive(cards("Ad 2s 3h 4d 5c"))), cards("Ad 2s 3h 4d 5c"));
    assert.deepEqual(shownOrder(evaluateFive(cards("As Ks Qs Js Ts"))), cards("Ts Js Qs Ks As"));
  });

  it("keeps other hands in deciding order", () => {
    const pair = evaluateFive(cards("Qs Qh Ks 6c 5c"));
    assert.deepEqual(shownOrder(pair), pair.cards);
  });
});

describe("best five of seven", () => {
  it("finds the highest of several straights", () => {
    assert.deepEqual(bestHand(cards("4c 5d 6h 7s 8c 9d Th")).ranks, [10]);
  });

  it("keeps the five highest of six suited cards", () => {
    const hand = bestHand(cards("Ah Kh 9h 4h 2c Qh 3h"));
    assert.equal(handName(hand), "Flush");
    assert.deepEqual(hand.ranks, [14, 13, 12, 9, 4]);
  });

  it("uses the two highest of three pairs and the best kicker", () => {
    const hand = bestHand(cards("Ks Kd 5c 5h 2s 2d Ac"));
    assert.equal(handName(hand), "Two Pair");
    assert.deepEqual(hand.ranks, [13, 5, 14]);
  });

  it("makes a full house from two sets of three", () => {
    const hand = bestHand(cards("9s 9d 9h 4c 4d 4s Ac"));
    assert.equal(handName(hand), "Full House");
    assert.deepEqual(hand.ranks, [9, 4]);
  });

  it("gives four of a kind the best kicker", () => {
    assert.deepEqual(bestHand(cards("Qc Qd Qh Qs 2c Ah 3d")).ranks, [12, 14]);
  });

  it("prefers a flush over a straight in the same cards", () => {
    assert.equal(handName(bestHand(cards("5h 6h 7h 8c 2h 9s Kh"))), "Flush");
  });
});

describe("card checks", () => {
  it("knows a card code", () => {
    assert.ok(isCard("Ah"));
    assert.ok(isCard("Tc"));
    assert.ok(!isCard("1h"));
    assert.ok(!isCard("Ax"));
    assert.ok(!isCard("10h"));
    assert.equal(cardName("Td"), "Ten of diamonds");
  });

  it("needs a full board, two players and two cards each", () => {
    const players = [
      { name: "Asha", cards: cards("Ac Kc") },
      { name: "Bikram", cards: cards("2d 3d") },
    ];
    assert.equal(cardProblem(cards("4h 5h 6h 7h"), players), "All five community cards are needed");
    assert.equal(cardProblem(cards("4h 5h 6h 7h 8s"), players.slice(0, 1)), "Add at least two players");
    assert.equal(
      cardProblem(cards("4h 5h 6h 7h 8s"), [players[0], { name: "Bikram", cards: ["2d"] }]),
      "Each player needs two cards",
    );
    assert.equal(cardProblem(cards("4h 5h 6h 7h 8s"), players), null);
  });

  it("refuses a card entered twice", () => {
    assert.equal(
      cardProblem(cards("Ah 5h 6h 7h 8s"), [
        { name: "Asha", cards: cards("Ah Kc") },
        { name: "Bikram", cards: cards("2d 3d") },
      ]),
      "Ace of hearts is entered twice",
    );
    assert.throws(() => judge("Ah 5h 6h 7h 8s", ["Asha", "Ah Kc"], ["Bikram", "2d 3d"]));
  });
});

describe("who wins and why", () => {
  it("says which type of hand beats which", () => {
    const result = judge("Ah 9h 6h 8c 2s", ["Asha", "Kh 3h"], ["Bikram", "Tc 7d"]);
    assert.equal(result.headline, "Asha wins with a flush, Ace high");
    assert.deepEqual(result.reasons, ["Asha's flush beats Bikram's straight."]);
    assert.deepEqual(result.winners.map((winner) => winner.name), ["Asha"]);
    assert.deepEqual(result.results[0].unused, cards("8c 2s"));
  });

  it("explains a kicker", () => {
    const result = judge("Kh Kd 7c 4s 2d", ["Bikram", "Qs Jh"], ["Asha", "Ac 9d"]);
    assert.equal(result.headline, "Asha wins with a pair of Kings");
    assert.deepEqual(result.reasons, [
      "Both have a pair of Kings. Asha's next card, an Ace, beats Bikram's Queen.",
    ]);
  });

  it("names the shared kickers when a later card decides", () => {
    const result = judge("Kh Kd Ac 4s 2d", ["Asha", "Th 9d"], ["Bikram", "9c 8h"]);
    assert.deepEqual(result.reasons, [
      "Both have a pair of Kings and the same next card (Ace). Asha's next card, a Ten, beats Bikram's Nine.",
    ]);
  });

  it("explains the higher straight", () => {
    const result = judge("6c 7d 8h 2s 2c", ["Asha", "9s Td"], ["Bikram", "5h 9h"]);
    assert.deepEqual(result.reasons, [
      "Both have a straight; Asha's goes up to the Ten, Bikram's only to the Nine.",
    ]);
  });

  it("explains a full house decided by its three of a kind", () => {
    const result = judge("Ks Kd 4c 4h 9s", ["Asha", "Kh 2c"], ["Bikram", "9d 9c"]);
    assert.equal(result.headline, "Asha wins with a full house, three Kings and two Fours");
    assert.deepEqual(result.reasons, [
      "Both have a full house; the three of a kind counts first, and Asha's three Kings beat Bikram's three Nines.",
    ]);
  });

  it("splits when the board plays", () => {
    const result = judge("9c Td Jh Qs Kc", ["Asha", "2c 3d"], ["Bikram", "4h 5s"]);
    assert.equal(result.headline, "Asha and Bikram split the pot with a straight, Nine to King");
    assert.equal(result.winners.length, 2);
    assert.match(result.reasons[0], /the five community cards/);
  });

  it("splits when only the suits differ", () => {
    const result = judge("Ah Kd 7c 4s 2d", ["Asha", "Qc 9h"], ["Bikram", "Qd 9s"]);
    assert.equal(result.winners.length, 2);
    assert.match(result.reasons[0], /Suits never break a tie\.$/);
  });

  it("shares places in a three-way hand", () => {
    const result = judge(
      "2c 7d 9h Js Kc",
      ["Chirag", "3d 4d"],
      ["Asha", "Ah Qd"],
      ["Bikram", "As Qc"],
    );
    assert.deepEqual(
      result.results.map((entry) => [entry.name, entry.place]),
      [
        ["Asha", 1],
        ["Bikram", 1],
        ["Chirag", 3],
      ],
    );
    assert.equal(result.headline, "Asha and Bikram split the pot with Ace high");
    assert.equal(
      result.reasons[1],
      "Nobody has a pair, so the highest card counts: Asha's and Bikram's Aces beat Chirag's King.",
    );
  });

  it("explains a counterfeited two pair", () => {
    const result = judge("Kh Kd 9c 9s 3d", ["Asha", "4c 4d"], ["Bikram", "Ac 2d"]);
    assert.equal(result.headline, "Bikram wins with two pair, Kings and Nines");
    assert.deepEqual(result.reasons, [
      "Both have Kings and Nines, so the fifth card decides: Bikram's Ace beats Asha's Four.",
    ]);
    assert.ok(result.notes.some((note) => note.startsWith("Asha has three pairs")));
  });

  it("notes the wheel and two sets of three", () => {
    const wheel = judge("Ac 2d 3s 9h Kc", ["Asha", "4h 5d"], ["Bikram", "Kd Qs"]);
    assert.ok(wheel.notes.some((note) => note.includes("Ace, Two, Three, Four, Five is a straight")));

    const sets = judge("9s 9d 4c 4h 2c", ["Asha", "9h 4d"], ["Bikram", "Ac Kd"]);
    assert.deepEqual(sets.reasons, ["Asha's full house beats Bikram's two pair."]);
    assert.ok(sets.notes.some((note) => note.startsWith("Asha has two sets of three")));
  });

  it("notes a sixth card of the suit", () => {
    const result = judge("Ah Kh 9h 4h 2c", ["Asha", "Qh 3h"], ["Bikram", "As Kd"]);
    assert.ok(result.notes.includes("Asha has 6 cards of one suit; only the five highest count."));
  });

  it("names a royal flush", () => {
    const result = judge("As Ks Qs 2d 3c", ["Asha", "Js Ts"], ["Bikram", "Ad Ac"]);
    assert.equal(result.headline, "Asha wins with a royal flush");
    assert.deepEqual(result.reasons, ["Asha's royal flush beats Bikram's three of a kind."]);
  });

  it("groups players beaten by the same hand", () => {
    const result = judge(
      "Ah 9h 6h 8c 2s",
      ["Asha", "Kh 3h"],
      ["Bikram", "Tc 7d"],
      ["Chirag", "Td 7c"],
    );
    assert.deepEqual(result.reasons, ["Asha's flush beats Bikram's and Chirag's straight."]);
  });
});
