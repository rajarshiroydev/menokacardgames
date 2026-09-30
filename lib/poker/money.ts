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

/** "₹1,00,000" for rupees, "$100,000" for dollars. */
export function formatMoney(value: number, code?: string) {
  const { symbol, locale } = currencyInfo(code);
  return `${symbol}${Number(value).toLocaleString(locale)}`;
}

/** "+₹8,000", "−₹2,000" or "₹0". */
export function formatSignedMoney(value: number, code?: string) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatMoney(Math.abs(value), code)}`;
}
