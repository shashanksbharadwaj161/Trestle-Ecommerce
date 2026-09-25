import { describe, expect, it } from "vitest";
import {
  allocateProportionally,
  computeCardTotals,
  discountCentsFor,
  formatCents,
  microsToCents,
  shippingCentsFor,
  sortSizes,
  CARD_PAYMENT_RANK,
} from "../src";

describe("card money in exact minor units", () => {
  it("converts micro-USD to cents exactly and refuses fractions of a cent", () => {
    expect(microsToCents(129_990_000n)).toBe(12999);
    expect(() => microsToCents(1n)).toThrow();
    expect(() => microsToCents(-10_000n)).toThrow();
  });

  it("formats cents without floating point", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(-1250)).toBe("-$12.50");
  });

  it("applies free standard delivery on the discounted subtotal", () => {
    expect(shippingCentsFor("standard", 14_999)).toBe(800);
    expect(shippingCentsFor("standard", 15_000)).toBe(0);
    expect(shippingCentsFor("express", 50_000)).toBe(2_000);
  });

  it("rounds percentage discounts down and never exceeds the subtotal", () => {
    const p = { code: "X", percentOff: 15, amountOffCents: null, minSubtotalCents: 0 };
    expect(discountCentsFor(p, 999)).toBe(149);
    expect(discountCentsFor({ ...p, percentOff: null, amountOffCents: 5_000 }, 3_000)).toBe(3_000);
    expect(discountCentsFor({ ...p, minSubtotalCents: 10_000 }, 9_999)).toBe(0);
    expect(discountCentsFor({ ...p, percentOff: 150 }, 1_000)).toBe(0);
  });

  it("computes totals for a multi-line bag", () => {
    const t = computeCardTotals({
      lines: [
        { unitPriceMicros: 55_000_000n, quantity: 2 },
        { unitPriceMicros: 139_000_000n, quantity: 1 },
      ],
      shippingMethod: "standard",
      promo: { code: "TEN", percentOff: 10, amountOffCents: null, minSubtotalCents: 0 },
    });
    expect(t).toEqual({ subtotalCents: 24_900, discountCents: 2_490, shippingCents: 0, totalCents: 22_410 });
    expect(() =>
      computeCardTotals({ lines: [{ unitPriceMicros: 1n, quantity: 1 }], shippingMethod: "standard", promo: null }),
    ).toThrow();
  });

  it("allocates an amount across orders so the parts sum exactly", () => {
    const parts = allocateProportionally(10_001, [3, 3, 3]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10_001);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
    expect(allocateProportionally(500, [0, 0])).toEqual([0, 0]);
  });
});

describe("apparel helpers", () => {
  it("orders sizes naturally", () => {
    expect(sortSizes(["XL", "S", "M", "XS", "L"])).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(sortSizes(["32", "28", "30", "One size"])).toEqual(["28", "30", "32", "One size"]);
  });

  it("ranks card payment states monotonically", () => {
    expect(CARD_PAYMENT_RANK.PAID).toBeGreaterThan(CARD_PAYMENT_RANK.EXPIRED);
    expect(CARD_PAYMENT_RANK.REFUNDED).toBeGreaterThan(CARD_PAYMENT_RANK.PARTIALLY_REFUNDED);
    expect(CARD_PAYMENT_RANK.PROCESSING).toBeGreaterThan(CARD_PAYMENT_RANK.OPEN);
  });
});
