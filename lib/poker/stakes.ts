import type { ChipUnit } from "./money.ts";

/**
 * Game setup's stakes. The form works in hundredths of a currency unit, so
 * a 0.25 blind and a 10,000 stack use the same boxes, and picks the game's
 * chip unit itself: nobody chooses "cents". Small stacks (under 1,000) and
 * any amount typed with cents make a cents game; everything else counts in
 * whole chips, exactly as games did before cents existed.
 */

/** Stacks from 1,000 up are whole-chip games unless an amount has cents. */
export const WHOLE_STACK_FROM = 1_000 * 100;

/** Starting stack chips, in hundredths: 20 up to 50K, in two rows of six with Other. */
export const STACK_PRESETS = [
  20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000,
].map((amount) => amount * 100);

export const DEFAULT_STACK = 10_000 * 100;

/**
 * Big blinds offered for a stack, as fractions of it: 200, 100, 50 and 20
 * big blinds deep. 100 big blinds is the usual buy-in and the default.
 */
const BIG_BLIND_DEPTHS = [200, 100, 50, 20] as const;
const DEFAULT_DEPTH = 100;

/** Smallest step for amounts worked out from this stack: a cent, or a whole chip. */
function stepFor(stack: number) {
  return stack < WHOLE_STACK_FROM || stack % 100 !== 0 ? 1 : 100;
}

function roundTo(amount: number, step: number) {
  return Math.max(step, Math.round(amount / step) * step);
}

/** The big blind choices for a stack, smallest first, without repeats. */
export function bigBlindChoices(stack: number) {
  if (!(stack > 0)) return [];
  const step = stepFor(stack);
  return [
    ...new Set(BIG_BLIND_DEPTHS.map((depth) => roundTo(stack / depth, step))),
  ].sort((a, b) => a - b);
}

/** The big blind picked when a stack is chosen: 100 big blinds deep. */
export function defaultBigBlind(stack: number) {
  return stack > 0 ? roundTo(stack / DEFAULT_DEPTH, stepFor(stack)) : 0;
}

/**
 * A small blind share of the big blind (percent), rounded to the cent in a
 * cents game and to a whole chip otherwise, from 0.01 up to the big blind.
 */
export function smallBlindShare(bigBlind: number, percent: number, unit: ChipUnit) {
  const step = unit === "cents" ? 1 : 100;
  return Math.min(bigBlind, roundTo((bigBlind * percent) / 100, step));
}

/**
 * The game's unit: cents for a stack under 1,000 or when any amount (all in
 * hundredths) has cents; otherwise whole chips.
 */
export function chipUnitFor(stack: number, amounts: Array<number | null>): ChipUnit {
  return stepFor(stack) === 1 ||
    amounts.some((amount) => amount !== null && amount % 100 !== 0)
    ? "cents"
    : "whole";
}

/** An amount in hundredths as stored chips in `unit`. */
export function inUnit(hundredths: number, unit: ChipUnit) {
  return unit === "cents" ? hundredths : hundredths / 100;
}

/** Stored chips in `unit` as hundredths, the reverse of `inUnit`. */
export function fromUnit(chips: number, unit: ChipUnit) {
  return unit === "cents" ? chips : chips * 100;
}
