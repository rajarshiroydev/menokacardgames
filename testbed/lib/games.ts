// Deterministic fake names and finished games for the testbed seed. Kept
// separate from seed.ts so a unit test can check every game passes the app's
// own session validation.
import type { PlayerProfile, PokerSession } from "../../lib/poker/types.ts";

/** Small deterministic generator (mulberry32). */
export function generator(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)];
  const shuffle = <T>(items: readonly T[]) => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(next() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  };
  return { next, int, pick, shuffle };
}
export type Random = ReturnType<typeof generator>;

const FIRST_NAMES = [
  "Aarav", "Aditi", "Amit", "Anika", "Arjun", "Bhavna", "Chirag", "Deepa",
  "Dev", "Diya", "Gaurav", "Isha", "Jay", "Kabir", "Kavya", "Kiran",
  "Lakshmi", "Manish", "Maya", "Mohan", "Neha", "Nikhil", "Pooja", "Pranav",
  "Priya", "Rahul", "Riya", "Rohan", "Sahil", "Sana", "Sanjay", "Shreya",
  "Sid", "Sneha", "Suresh", "Tanvi", "Tara", "Uday", "Varun", "Vidya",
];
const INITIALS = "ABCDGKMNPRSTV";

/** `count` distinct player names, starting with the required ones. */
export function playerNames(random: Random, count: number, required: string[]) {
  const names = new Set(required);
  while (names.size < count) {
    names.add(`${random.pick(FIRST_NAMES)} ${random.pick([...INITIALS])}.`);
  }
  return [...names];
}

/** One finished game whose chips balance, like a game saved from the table. */
export function makeGame(random: Random, id: string, players: PlayerProfile[], date: number): PokerSession {
  const startStack = random.pick([5_000, 10_000, 20_000]);
  const ante = random.pick([50, 100, 200]);
  const seated = random.shuffle(players).slice(0, random.int(3, Math.min(8, players.length)));
  const buyIns = seated.map(() => {
    const rebuys = random.next() < 0.35 ? random.int(1, 3) : 0;
    return Array.from({ length: rebuys + 1 }, () => startStack);
  });
  const pot = buyIns.flat().reduce((total, amount) => total + amount, 0);
  // Some players bust (end on 0); the rest share the pot by random weight.
  const weights = seated.map(() =>
    random.next() < 0.25 ? 0 : random.next() ** 2 + 0.05,
  );
  if (!weights.some((weight) => weight > 0)) weights[0] = 1;
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  const ends = weights.map((weight) => Math.floor((pot * weight) / totalWeight));
  const leader = weights.indexOf(Math.max(...weights));
  ends[leader] += pot - ends.reduce((total, end) => total + end, 0);

  return {
    id,
    date,
    ended: date + random.int(90, 300) * 60_000,
    ante,
    startStack,
    hands: random.int(20, 160),
    results: seated.map((player, index) => {
      const invested = buyIns[index].reduce((total, amount) => total + amount, 0);
      return {
        playerId: player.id,
        name: player.name,
        net: ends[index] - invested,
        end: ends[index],
        buyIns: buyIns[index],
      };
    }),
  };
}
