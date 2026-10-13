/**
 * Who Wins?: Texas Hold'em hands for beginners. Five board cards and two
 * cards per player; each player's hand is the best five of their seven, and
 * the result says who wins and why in plain sentences.
 *
 * Pure rules, no React or persistence. A card is a two-letter code, rank then
 * suit: "Ah" is the Ace of hearts, "Td" the Ten of diamonds.
 */

export const SUITS = ["s", "h", "d", "c"] as const;
export type Suit = (typeof SUITS)[number];

/** Ranks from Ace down, the order the picker shows them. */
export const RANK_CODES = [
  "A",
  "K",
  "Q",
  "J",
  "T",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
] as const;
export type RankCode = (typeof RANK_CODES)[number];

export const BOARD_SIZE = 5;
export const HOLE_SIZE = 2;
export const MIN_PLAYERS = 2;
/** 2 hole cards each for 10 players and a board of 5 is 25 of the 52 cards. */
export const MAX_PLAYERS = 10;

const RANK_VALUE: Record<RankCode, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const RANK_WORD: Record<number, [one: string, many: string]> = {
  2: ["Two", "Twos"],
  3: ["Three", "Threes"],
  4: ["Four", "Fours"],
  5: ["Five", "Fives"],
  6: ["Six", "Sixes"],
  7: ["Seven", "Sevens"],
  8: ["Eight", "Eights"],
  9: ["Nine", "Nines"],
  10: ["Ten", "Tens"],
  11: ["Jack", "Jacks"],
  12: ["Queen", "Queens"],
  13: ["King", "Kings"],
  14: ["Ace", "Aces"],
};

const SUIT_INFO: Record<Suit, { symbol: string; name: string; red: boolean }> = {
  s: { symbol: "♠", name: "spades", red: false },
  h: { symbol: "♥", name: "hearts", red: true },
  d: { symbol: "♦", name: "diamonds", red: true },
  c: { symbol: "♣", name: "clubs", red: false },
};

/** Hand types from worst to best; the index is the strength. */
export const CATEGORIES = [
  "High Card",
  "One Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
] as const;

const HIGH_CARD = 0;
const ONE_PAIR = 1;
const TWO_PAIR = 2;
const THREE_OF_A_KIND = 3;
const STRAIGHT = 4;
const FLUSH = 5;
const FULL_HOUSE = 6;
const FOUR_OF_A_KIND = 7;
const STRAIGHT_FLUSH = 8;

/** The type of hand in a sentence, after "a" where it reads that way. */
const CATEGORY_PHRASE = [
  "high card",
  "a pair",
  "two pair",
  "three of a kind",
  "a straight",
  "a flush",
  "a full house",
  "four of a kind",
  "a straight flush",
] as const;

export type Hand = {
  /** Index into `CATEGORIES`. */
  category: number;
  /**
   * What breaks a tie within the category, most important first: the pair's
   * rank then the kickers, the straight's top card, and so on.
   */
  ranks: number[];
  /** The five cards, most important first (a wheel ends with its Ace). */
  cards: string[];
};

export function isCard(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === 2 &&
    value[0] in RANK_VALUE &&
    (SUITS as readonly string[]).includes(value[1])
  );
}

export function cardRank(card: string) {
  return RANK_VALUE[card[0] as RankCode];
}

export function cardSuit(card: string) {
  return card[1] as Suit;
}

/** "10" for a Ten, the letter otherwise. */
export function rankLabel(card: string) {
  return card[0] === "T" ? "10" : card[0];
}

export function suitSymbol(card: string) {
  return SUIT_INFO[cardSuit(card)].symbol;
}

export function isRed(card: string) {
  return SUIT_INFO[cardSuit(card)].red;
}

/** "Ace of hearts". */
export function cardName(card: string) {
  return `${RANK_WORD[cardRank(card)][0]} of ${SUIT_INFO[cardSuit(card)].name}`;
}

function rankWord(rank: number) {
  return RANK_WORD[rank][0];
}

function rankWords(rank: number) {
  return RANK_WORD[rank][1];
}

/** "an Ace", "a King". */
function aRank(rank: number) {
  return `${rank === 8 || rank === 14 ? "an" : "a"} ${rankWord(rank)}`;
}

/** The top card of a straight in these ranks, or 0. The wheel tops at Five. */
function straightTop(ranks: number[]) {
  const present = new Set(ranks);
  for (let top = 14; top >= 6; top -= 1) {
    let run = true;
    for (let rank = top; rank > top - 5; rank -= 1) {
      if (!present.has(rank)) {
        run = false;
        break;
      }
    }
    if (run) return top;
  }
  return [14, 2, 3, 4, 5].every((rank) => present.has(rank)) ? 5 : 0;
}

/** A hand of exactly five cards. */
export function evaluateFive(cards: readonly string[]): Hand {
  if (cards.length !== 5) throw new Error("A hand is five cards");
  const sorted = [...cards].sort((a, b) => cardRank(b) - cardRank(a));
  const ranks = sorted.map(cardRank);
  const flush = sorted.every((card) => cardSuit(card) === cardSuit(sorted[0]));
  const top = new Set(ranks).size === 5 ? straightTop(ranks) : 0;

  if (top) {
    // A wheel shows 5 4 3 2 A: the Ace is the low card.
    const ordered =
      top === 5 ? [...sorted.slice(1), sorted[0]] : sorted;
    return {
      category: flush ? STRAIGHT_FLUSH : STRAIGHT,
      ranks: [top],
      cards: ordered,
    };
  }
  if (flush) return { category: FLUSH, ranks, cards: sorted };

  // Group by rank: bigger groups first, then higher ranks.
  const groups = new Map<number, string[]>();
  for (const card of sorted) {
    groups.set(cardRank(card), [...(groups.get(cardRank(card)) ?? []), card]);
  }
  const ordered = [...groups.entries()].sort(
    ([rankA, a], [rankB, b]) => b.length - a.length || rankB - rankA,
  );
  const shape = ordered.map(([, group]) => group.length).join("");
  const category =
    shape === "41"
      ? FOUR_OF_A_KIND
      : shape === "32"
        ? FULL_HOUSE
        : shape === "311"
          ? THREE_OF_A_KIND
          : shape === "221"
            ? TWO_PAIR
            : shape === "2111"
              ? ONE_PAIR
              : HIGH_CARD;
  return {
    category,
    ranks: ordered.map(([rank]) => rank),
    cards: ordered.flatMap(([, group]) => group),
  };
}

/** Positive when `a` is the better hand, 0 for a tie. */
export function compareHands(a: Hand, b: Hand) {
  if (a.category !== b.category) return a.category - b.category;
  for (let index = 0; index < a.ranks.length; index += 1) {
    const difference = a.ranks[index] - b.ranks[index];
    if (difference) return difference;
  }
  return 0;
}

/** The best five of five to seven cards, trying every choice of five. */
export function bestHand(cards: readonly string[]): Hand {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error("A hand is the best five of five to seven cards");
  }
  let best: Hand | null = null;
  for (let a = 0; a < cards.length; a += 1) {
    for (let b = a + 1; b < cards.length; b += 1) {
      for (let c = b + 1; c < cards.length; c += 1) {
        for (let d = c + 1; d < cards.length; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            const hand = evaluateFive([
              cards[a],
              cards[b],
              cards[c],
              cards[d],
              cards[e],
            ]);
            if (!best || compareHands(hand, best) > 0) best = hand;
          }
        }
      }
    }
  }
  return best as Hand;
}

export function isRoyal(hand: Hand) {
  return hand.category === STRAIGHT_FLUSH && hand.ranks[0] === 14;
}

/**
 * The best five in the order to show them. A straight reads low to high, as
 * its name does ("Ace to Five": A 2 3 4 5); other hands keep their deciding
 * order, the pair or set first.
 */
export function shownOrder(hand: Hand): string[] {
  const straight = hand.category === STRAIGHT || hand.category === STRAIGHT_FLUSH;
  return straight ? [...hand.cards].reverse() : [...hand.cards];
}

/** "Flush", or "Royal Flush" for the Ace-high straight flush. */
export function handName(hand: Hand) {
  return isRoyal(hand) ? "Royal Flush" : CATEGORIES[hand.category];
}

function straightSpan(top: number) {
  return top === 5 ? "Ace to Five" : `${rankWord(top - 4)} to ${rankWord(top)}`;
}

/** The hand in words, read after "with": "a pair of Kings", "a flush, Ace high". */
export function describeHand(hand: Hand) {
  const [first, second] = hand.ranks;
  switch (hand.category) {
    case STRAIGHT_FLUSH:
      return isRoyal(hand)
        ? "a royal flush"
        : `a straight flush, ${straightSpan(first)}`;
    case FOUR_OF_A_KIND:
      return `four of a kind, ${rankWords(first)}`;
    case FULL_HOUSE:
      return `a full house, three ${rankWords(first)} and two ${rankWords(second)}`;
    case FLUSH:
      return `a flush, ${rankWord(first)} high`;
    case STRAIGHT:
      return `a straight, ${straightSpan(first)}`;
    case THREE_OF_A_KIND:
      return `three of a kind, ${rankWords(first)}`;
    case TWO_PAIR:
      return `two pair, ${rankWords(first)} and ${rankWords(second)}`;
    case ONE_PAIR:
      return `a pair of ${rankWords(first)}`;
    default:
      return `${rankWord(first)} high`;
  }
}

/** What sets the hand apart within its type, to show after its name: "Ace high", "Kings". */
export function handDetail(hand: Hand) {
  const [first, second] = hand.ranks;
  switch (hand.category) {
    case STRAIGHT_FLUSH:
      return isRoyal(hand) ? "" : straightSpan(first);
    case FOUR_OF_A_KIND:
    case THREE_OF_A_KIND:
    case ONE_PAIR:
      return rankWords(first);
    case FULL_HOUSE:
      return `three ${rankWords(first)} and two ${rankWords(second)}`;
    case STRAIGHT:
      return straightSpan(first);
    case TWO_PAIR:
      return `${rankWords(first)} and ${rankWords(second)}`;
    default:
      return `${rankWord(first)} high`;
  }
}

export type ShowdownPlayer = {
  name: string;
  /** Two hole cards. */
  cards: readonly string[];
};

export type PlayerResult = {
  /** Position in the input list. */
  index: number;
  name: string;
  hand: Hand;
  /** 1 for the winner or winners; players with equal hands share a place. */
  place: number;
  /** The player's two hole cards and the board cards their best five leave out. */
  unused: string[];
};

export type Showdown = {
  /** Best hand first; ties keep the input order. */
  results: PlayerResult[];
  winners: PlayerResult[];
  /** The result in one line: "Asha wins with a flush, Ace high". */
  headline: string;
  /** Why the winners won: one sentence per beaten hand, or why it is a split. */
  reasons: string[];
  /** Rules beginners often miss that applied to these cards. */
  notes: string[];
};

/** A problem with the cards, or null when they can be compared. */
export function cardProblem(
  board: readonly string[],
  players: readonly ShowdownPlayer[],
): string | null {
  if (board.length !== BOARD_SIZE) return "All five community cards are needed";
  if (players.length < MIN_PLAYERS) return "Add at least two players";
  if (players.length > MAX_PLAYERS) return `At most ${MAX_PLAYERS} players`;
  const seen = new Set<string>();
  for (const card of [...board, ...players.flatMap((player) => player.cards)]) {
    if (!isCard(card)) return "One of the cards isn't a playing card";
    if (seen.has(card)) return `${cardName(card)} is entered twice`;
    seen.add(card);
  }
  if (players.some((player) => player.cards.length !== HOLE_SIZE)) {
    return "Each player needs two cards";
  }
  return null;
}

function listNames(names: readonly string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function possessive(name: string) {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/** The type of hand without its article: "flush", not "a flush". */
function bareCategory(category: number) {
  return CATEGORY_PHRASE[category].replace(/^a /, "");
}

function possessives(names: readonly string[]) {
  return listNames(names.map(possessive));
}

/**
 * Why `winner` beats `loser` when both have the same type of hand: names
 * what they share and the first card or group that differs.
 */
function sameCategoryReason(
  winnerNames: readonly string[],
  winner: Hand,
  loserNames: readonly string[],
  loser: Hand,
) {
  const at = winner.ranks.findIndex((rank, index) => rank !== loser.ranks[index]);
  const w = possessives(winnerNames);
  const l = possessives(loserNames);
  const win = winner.ranks[at];
  const lose = loser.ranks[at];
  const both = winnerNames.length + loserNames.length > 2 ? "All" : "Both";
  const shared = winner.ranks.slice(0, at);
  const several = winnerNames.length > 1;
  const losersCard = loserNames.length > 1 ? rankWords(lose) : rankWord(lose);
  // "Asha's Ace beats Bikram's King"; split winners each hold one: "Aces beat".
  const cardBeats = several
    ? `${w} ${rankWords(win)} beat ${l} ${losersCard}`
    : `${w} ${rankWord(win)} beats ${l} ${losersCard}`;
  const nextCard = (prefix: string) =>
    several
      ? `${prefix} ${w} next cards, ${rankWords(win)}, beat ${l} ${losersCard}.`
      : `${prefix} ${w} next card, ${aRank(win)}, beats ${l} ${losersCard}.`;

  switch (winner.category) {
    case STRAIGHT:
    case STRAIGHT_FLUSH: {
      const kind = winner.category === STRAIGHT ? "straight" : "straight flush";
      return `${both} have a ${kind}; ${w} ${several ? "go" : "goes"} up to the ${rankWord(win)}, ${l} only to the ${rankWord(lose)}.`;
    }
    case FOUR_OF_A_KIND:
      return at === 0
        ? `${both} have four of a kind; ${w} four ${rankWords(win)} beat ${l} four ${rankWords(lose)}.`
        : `${both} have four ${rankWords(shared[0])}, so the fifth card decides: ${cardBeats}.`;
    case FULL_HOUSE:
      return at === 0
        ? `${both} have a full house; the three of a kind counts first, and ${w} three ${rankWords(win)} beat ${l} three ${rankWords(lose)}.`
        : `${both} have three ${rankWords(shared[0])}, so the pair decides: ${w} ${rankWords(win)} beat ${l} ${rankWords(lose)}.`;
    case FLUSH:
      return at === 0
        ? `${both} have a flush; the highest card counts first, and ${cardBeats}.`
        : nextCard(
            `${both} have a flush with the same ${topCards(shared)}.`,
          );
    case THREE_OF_A_KIND:
      return at === 0
        ? `${both} have three of a kind; ${w} ${rankWords(win)} beat ${l} ${rankWords(lose)}.`
        : nextCard(
            `${both} have three ${rankWords(shared[0])}${kickerSoFar(shared.slice(1))}.`,
          );
    case TWO_PAIR:
      if (at === 0) {
        return `${both} have two pair; the higher pair counts first, and ${w} ${rankWords(win)} beat ${l} ${rankWords(lose)}.`;
      }
      if (at === 1) {
        return `${both} have ${rankWords(shared[0])} as the higher pair, so the second pair decides: ${w} ${rankWords(win)} beat ${l} ${rankWords(lose)}.`;
      }
      return `${both} have ${rankWords(shared[0])} and ${rankWords(shared[1])}, so the fifth card decides: ${cardBeats}.`;
    case ONE_PAIR:
      return at === 0
        ? `${both} have a pair; ${w} ${rankWords(win)} beat ${l} ${rankWords(lose)}.`
        : nextCard(
            `${both} have a pair of ${rankWords(shared[0])}${kickerSoFar(shared.slice(1))}.`,
          );
    default:
      return at === 0
        ? `Nobody has a pair, so the highest card counts: ${cardBeats}.`
        : nextCard(
            `Nobody has a pair, and ${both.toLowerCase()} have the same ${topCards(shared)}.`,
          );
  }
}

/** "top card (Ace)", "top cards (Ace, King)". */
function topCards(ranks: readonly number[]) {
  return `top card${ranks.length === 1 ? "" : "s"} (${ranks.map(rankWord).join(", ")})`;
}

/** " and the same next card (Ace)" for kickers both players share. */
function kickerSoFar(kickers: readonly number[]) {
  if (!kickers.length) return "";
  return ` and the same next card${kickers.length === 1 ? "" : "s"} (${kickers.map(rankWord).join(", ")})`;
}

function splitReason(winners: readonly PlayerResult[], board: readonly string[]) {
  const hand = winners[0].hand;
  const names = listNames(winners.map((winner) => winner.name));
  const boardPlays = winners.every((winner) =>
    winner.hand.cards.every((card) => board.includes(card)),
  );
  if (boardPlays) {
    return `${names} split the pot: the best five cards for each of them are the five community cards (${describeHand(hand)}), and their own cards don't improve it.`;
  }
  return `${names} split the pot: their best five cards have the same ranks (${describeHand(hand)}). Suits never break a tie.`;
}

/** Rules the cards show off, said once each. */
function notesFor(
  results: readonly PlayerResult[],
  board: readonly string[],
  players: readonly ShowdownPlayer[],
) {
  const notes: string[] = [];
  const wheels = results.filter(
    (result) =>
      (result.hand.category === STRAIGHT ||
        result.hand.category === STRAIGHT_FLUSH) &&
      result.hand.ranks[0] === 5,
  );
  if (wheels.length) {
    notes.push(
      `${listNames(wheels.map((result) => result.name))}: Ace, Two, Three, Four, Five is a straight. The Ace can count low, but then it is the lowest straight.`,
    );
  }
  for (const result of results) {
    const seven = [...board, ...players[result.index].cards];
    const counts = new Map<number, number>();
    for (const card of seven) {
      counts.set(cardRank(card), (counts.get(cardRank(card)) ?? 0) + 1);
    }
    const pairs = [...counts.values()].filter((count) => count === 2).length;
    const trips = [...counts.values()].filter((count) => count === 3).length;
    const suited = Math.max(
      ...SUITS.map((suit) => seven.filter((card) => cardSuit(card) === suit).length),
    );
    if (result.hand.category === TWO_PAIR && pairs >= 3) {
      notes.push(
        `${result.name} has three pairs, but a hand is only five cards, so only the two highest pairs count.`,
      );
    } else if (result.hand.category === FULL_HOUSE && trips >= 2) {
      notes.push(
        `${result.name} has two sets of three: one counts as the three of a kind and two of the other as the pair, a full house.`,
      );
    } else if (result.hand.category === FLUSH && suited > 5) {
      notes.push(
        `${result.name} has ${suited} cards of one suit; only the five highest count.`,
      );
    }
  }
  return notes;
}

/**
 * Who wins a Hold'em showdown and why. The board and every player's two
 * cards must be complete and different; check `cardProblem` first.
 */
export function judgeShowdown(
  board: readonly string[],
  players: readonly ShowdownPlayer[],
): Showdown {
  const problem = cardProblem(board, players);
  if (problem) throw new Error(problem);

  const ordered = players
    .map((player, index) => {
      const seven = [...board, ...player.cards];
      const hand = bestHand(seven);
      return {
        index,
        name: player.name,
        hand,
        place: 0,
        unused: seven.filter((card) => !hand.cards.includes(card)),
      };
    })
    .sort((a, b) => compareHands(b.hand, a.hand) || a.index - b.index);

  let place = 0;
  ordered.forEach((result, position) => {
    if (position === 0 || compareHands(result.hand, ordered[position - 1].hand) < 0) {
      place = position + 1;
    }
    result.place = place;
  });

  const winners = ordered.filter((result) => result.place === 1);
  const best = winners[0].hand;
  const winnerNames = winners.map((winner) => winner.name);

  const headline =
    winners.length === 1
      ? `${winners[0].name} wins with ${describeHand(best)}`
      : `${listNames(winnerNames)} split the pot with ${describeHand(best)}`;

  const reasons: string[] = [];
  if (winners.length > 1) reasons.push(splitReason(winners, board));

  // One sentence per group of losers holding the same hand.
  const losers = ordered.filter((result) => result.place !== 1);
  const groups: PlayerResult[][] = [];
  for (const loser of losers) {
    const group = groups.find(
      (existing) => compareHands(existing[0].hand, loser.hand) === 0,
    );
    if (group) group.push(loser);
    else groups.push([loser]);
  }
  for (const group of groups) {
    const hand = group[0].hand;
    const names = group.map((loser) => loser.name);
    if (hand.category !== best.category) {
      // "Asha's flush beats Bikram's straight": who holds what, in one line.
      const bestNoun = isRoyal(best) ? "royal flush" : bareCategory(best.category);
      reasons.push(
        `${possessives(winnerNames)} ${bestNoun} beats ${possessives(names)} ${bareCategory(hand.category)}.`,
      );
    } else {
      reasons.push(sameCategoryReason(winnerNames, best, names, hand));
    }
  }

  return {
    results: ordered,
    winners,
    headline,
    reasons,
    notes: notesFor(ordered, board, players),
  };
}
