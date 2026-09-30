import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  currencySymbol,
  formatMoney,
  formatSignedMoney,
  isCurrencyCode,
} from "../lib/poker/money.ts";

describe("money", () => {
  it("formats rupees with Indian grouping by default", () => {
    assert.equal(formatMoney(100000), "₹1,00,000");
    assert.equal(formatMoney(100000, "INR"), "₹1,00,000");
  });

  it("formats other currencies with their own symbol and grouping", () => {
    assert.equal(formatMoney(100000, "USD"), "$100,000");
    assert.equal(formatMoney(2500, "GBP"), "£2,500");
    assert.equal(currencySymbol("EUR"), "€");
  });

  it("signs changes with a real minus sign", () => {
    assert.equal(formatSignedMoney(8000, "INR"), "+₹8,000");
    assert.equal(formatSignedMoney(-2000, "USD"), "−$2,000");
    assert.equal(formatSignedMoney(0), "₹0");
  });

  it("accepts only listed currency codes", () => {
    assert.equal(isCurrencyCode("USD"), true);
    assert.equal(isCurrencyCode("usd"), false);
    assert.equal(isCurrencyCode("XYZ"), false);
    assert.equal(isCurrencyCode(null), false);
  });

  it("falls back to rupees for an unknown code", () => {
    assert.equal(formatMoney(5, "XYZ"), "₹5");
  });
});
