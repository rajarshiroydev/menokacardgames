import type { ChipUnit } from "./money.ts";
import { inUnit } from "./stakes.ts";

/**
 * The host's physical chips, for counting a stack colour by colour (plan
 * entry "count chips by colour (plan)"; kept on the account, migration 0036).
 * Values are in hundredths of the game's counting unit, like every amount
 * before it is put in a game's unit: 500 chips is 50000. A whole-chip game
 * can't use a colour worth a fraction of a chip, so it leaves that colour out.
 */
export const CHIP_COLOURS = [
  "white",
  "red",
  "blue",
  "green",
  "black",
  "purple",
  "yellow",
  "orange",
  "pink",
  "grey",
] as const;

export type ChipColour = (typeof CHIP_COLOURS)[number];

export type ChipSetEntry = { colour: ChipColour; value: number };

export type ChipSet = ChipSetEntry[];

export const MAX_CHIP_COLOURS = 8;

/** The most a single chip can be worth: 10,000,000 units. */
export const MAX_CHIP_VALUE = 1_000_000_000;

/** Offered the first time, to edit: white 5, red 25, green 100, black 500, purple 1,000. */
export const STARTER_CHIP_SET: ChipSet = [
  { colour: "white", value: 500 },
  { colour: "red", value: 2_500 },
  { colour: "green", value: 10_000 },
  { colour: "black", value: 50_000 },
  { colour: "purple", value: 100_000 },
];

export function isChipColour(value: unknown): value is ChipColour {
  return CHIP_COLOURS.includes(value as ChipColour);
}

/**
 * A chip set as the server accepts it, sorted by value, or an error a host
 * can act on. Colours and values must each be different.
 */
export function readChipSet(value: unknown): { chipSet: ChipSet } | { error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "Add at least one chip colour" };
  }
  if (value.length > MAX_CHIP_COLOURS) {
    return { error: `A chip set has up to ${MAX_CHIP_COLOURS} colours` };
  }
  const chipSet: ChipSet = [];
  for (const entry of value) {
    const { colour, value: chipValue } = (entry ?? {}) as Record<string, unknown>;
    if (!isChipColour(colour)) return { error: "Choose each colour from the list" };
    if (
      typeof chipValue !== "number" ||
      !Number.isSafeInteger(chipValue) ||
      chipValue < 1 ||
      chipValue > MAX_CHIP_VALUE
    ) {
      return { error: "Give every colour a value above 0" };
    }
    if (chipSet.some((chip) => chip.colour === colour)) {
      return { error: "Each colour can be used once" };
    }
    if (chipSet.some((chip) => chip.value === chipValue)) {
      return { error: "Each colour needs its own value" };
    }
    chipSet.push({ colour, value: chipValue });
  }
  chipSet.sort((a, b) => a.value - b.value);
  return { chipSet };
}

/** A stored chip set read back, or null when it is missing or no longer valid. */
export function storedChipSet(value: unknown): ChipSet | null {
  const read = readChipSet(value);
  return "chipSet" in read ? read.chipSet : null;
}

/** The colours a game can count with, each worth whole chips in its unit. */
export function chipsForUnit(chipSet: ChipSet, unit: ChipUnit | undefined) {
  const gameUnit = unit ?? "whole";
  return chipSet
    .filter((chip) => Number.isInteger(inUnit(chip.value, gameUnit)))
    .map((chip) => ({ colour: chip.colour, chips: inUnit(chip.value, gameUnit) }));
}

/**
 * The stack a colour count adds up to, in the game's chips. `counts` is by
 * colour; missing, negative or fractional counts count as 0.
 */
export function countedStack(
  chips: ReadonlyArray<{ colour: ChipColour; chips: number }>,
  counts: Partial<Record<ChipColour, number>>,
) {
  return chips.reduce((sum, chip) => {
    const count = counts[chip.colour] ?? 0;
    return Number.isSafeInteger(count) && count > 0 ? sum + count * chip.chips : sum;
  }, 0);
}

export const CHIP_COLOUR_NAMES: Record<ChipColour, string> = {
  white: "White",
  red: "Red",
  blue: "Blue",
  green: "Green",
  black: "Black",
  purple: "Purple",
  yellow: "Yellow",
  orange: "Orange",
  pink: "Pink",
  grey: "Grey",
};
