/**
 * The currency a host counts their games in. It is a label for chip amounts:
 * one chip is one unit, and nothing is ever converted between currencies.
 * `accounts.currency` stores the code (migration 0013); INR is the default.
 */
export const CURRENCIES = [
  { code: "INR", symbol: "₹", name: "Indian rupee", locale: "en-IN" },
  { code: "USD", symbol: "$", name: "US dollar", locale: "en-US" },
  { code: "EUR", symbol: "€", name: "Euro", locale: "en-IE" },
  { code: "GBP", symbol: "£", name: "British pound", locale: "en-GB" },
  { code: "AUD", symbol: "A$", name: "Australian dollar", locale: "en-AU" },
  { code: "CAD", symbol: "C$", name: "Canadian dollar", locale: "en-CA" },
  { code: "SGD", symbol: "S$", name: "Singapore dollar", locale: "en-SG" },
  { code: "AED", symbol: "AED ", name: "UAE dirham", locale: "en-AE" },
  { code: "BDT", symbol: "৳", name: "Bangladeshi taka", locale: "en-IN" },
  { code: "JPY", symbol: "¥", name: "Japanese yen", locale: "ja-JP" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const DEFAULT_CURRENCY: CurrencyCode = "INR";

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return CURRENCIES.some((currency) => currency.code === value);
}

function currencyInfo(code: string | undefined) {
  return (
    CURRENCIES.find((currency) => currency.code === code) ?? CURRENCIES[0]
  );
}

export function currencySymbol(code: string | undefined) {
  return currencyInfo(code).symbol;
}

/**
 * How a game counts chips. "whole" is one chip per currency unit, as every
 * game before October 2026 did. "cents" counts in hundredths, for small
 * stakes like $0.25/$0.50: a stored 25 is 0.25. Stored amounts are always
 * whole numbers either way, so the game's arithmetic stays exact.
 */
export type ChipUnit = "whole" | "cents";

export function isChipUnit(value: unknown): value is ChipUnit {
  return value === "whole" || value === "cents";
}

/** Stored chips per currency unit. */
export function chipScale(unit: ChipUnit | undefined) {
  return unit === "cents" ? 100 : 1;
}

/** A stored amount in currency units, for display: 25 cents is 0.25. */
export function chipsToAmount(chips: number, unit: ChipUnit | undefined) {
  return chips / chipScale(unit);
}

/**
 * A stored amount in hundredths of a currency unit, so amounts from games
 * with different units can be added exactly.
 */
export function chipsInCents(chips: number, unit: ChipUnit | undefined) {
  return chips * (100 / chipScale(unit));
}

/**
 * Typed text as stored chips: digits, with up to two decimals in a cents
 * game ("0.25", ".5", "12.50"). Commas are ignored. Null for anything else,
 * including more decimals than the unit allows.
 */
export function parseChips(text: string, unit: ChipUnit | undefined) {
  const cleaned = text.trim().replace(/,/g, "");
  const match =
    unit === "cents"
      ? /^(\d*)(?:\.(\d{0,2}))?$/.exec(cleaned)
      : /^(\d+)$/.exec(cleaned);
  if (!match || !/\d/.test(cleaned)) return null;
  const whole = Number(match[1] || "0");
  const cents = unit === "cents" ? Number((match[2] ?? "").padEnd(2, "0")) : 0;
  const chips = whole * chipScale(unit) + cents;
  return Number.isSafeInteger(chips) ? chips : null;
}

/**
 * Stored chips as typed text, the reverse of `parseChips`: "0.25", "1.50",
 * or "2" for a whole amount. No grouping, so it can go back in an input.
 */
export function chipsToInput(chips: number, unit: ChipUnit | undefined) {
  if (unit !== "cents") return String(chips);
  const amount = chipsToAmount(chips, unit);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/**
 * "₹1,00,000" for rupees, "$100,000" for dollars. An amount with a
 * fractional part shows two decimals ("$0.25", "$1.50"); a whole one shows
 * none ("$1").
 */
export function formatMoney(value: number, code?: string) {
  const { symbol, locale } = currencyInfo(code);
  const hasCents = Math.round(Number(value) * 100) % 100 !== 0;
  return `${symbol}${Number(value).toLocaleString(locale, {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

/** "+₹8,000", "−₹2,000" or "₹0". */
export function formatSignedMoney(value: number, code?: string) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatMoney(Math.abs(value), code)}`;
}

/** Stored chips in a game's unit, formatted: 25 cents is "$0.25". */
export function formatChips(
  chips: number,
  unit: ChipUnit | undefined,
  code?: string,
) {
  return formatMoney(chipsToAmount(chips, unit), code);
}

/** Stored chips in a game's unit, signed: "+$0.75". */
export function formatSignedChips(
  chips: number,
  unit: ChipUnit | undefined,
  code?: string,
) {
  return formatSignedMoney(chipsToAmount(chips, unit), code);
}
