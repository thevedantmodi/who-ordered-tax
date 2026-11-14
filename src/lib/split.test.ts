import { describe, expect, it } from "vitest";
import { allocate, isEvenSplit, percentsToWeights, splitBill, weightsToPercents, type SplitInput } from "./split";

const base: Omit<SplitInput, "participants" | "items"> = {
  taxCents: 0,
  tipMode: "AMOUNT",
  tipCents: 0,
  tipPercent: 0,
  feesCents: 0,
  feeMode: "PROPORTIONAL",
  discountCents: 0,
  unclaimedPolicy: "EVEN",
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("allocate", () => {
  it("splits evenly with leftover pennies going to the earliest", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("is proportional", () => {
    expect(allocate(1000, [1, 3])).toEqual([250, 750]);
  });

  it("gives remainders to the largest fractional parts", () => {
    // 10 * [0.2, 0.35, 0.45] = [2, 3.5, 4.5] -> floor [2,3,4] remainder 1 to idx 1 (tie, earliest)
    expect(allocate(10, [20, 35, 45])).toEqual([2, 4, 4]);
  });

  it("splits evenly when all weights are zero", () => {
    expect(allocate(5, [0, 0])).toEqual([3, 2]);
  });

  it("never gives anything to zero-weight people", () => {
    expect(allocate(7, [0, 1, 0, 1])).toEqual([0, 4, 0, 3]);
  });

  it("handles negatives symmetrically", () => {
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it("always sums to the total", () => {
    for (let t = 0; t < 500; t += 7) {
      const w = [3, 1, 4, 1, 5, 9, 2, 6];
      expect(sum(allocate(t, w))).toBe(t);
    }
  });
});

describe("splitBill", () => {
  const people = [
    { id: "ana", isPayer: true },
    { id: "ben" },
    { id: "cy" },
  ];

  it("allocates tax and tip proportionally to what you ordered", () => {
    const r = splitBill({
      ...base,
      participants: people,
      items: [
        { id: "steak", priceCents: 4000, claims: [{ participantId: "ana", weight: 1 }] },
        { id: "salad", priceCents: 1000, claims: [{ participantId: "ben", weight: 1 }] },
        { id: "nachos", priceCents: 1500, claims: people.map((p) => ({ participantId: p.id, weight: 1 })) },
      ],
      taxCents: 650,
      tipMode: "PERCENT_PRE_TAX",
      tipPercent: 20,
    });

    expect(r.subtotalCents).toBe(6500);
    expect(r.tipCents).toBe(1300);
    expect(r.totalCents).toBe(6500 + 650 + 1300);

    const [ana, ben, cy] = r.shares;
    expect(ana.itemsCents).toBe(4500);
    expect(ben.itemsCents).toBe(1500);
    expect(cy.itemsCents).toBe(500);
    // Tax is 10% of subtotal, so everyone pays 10% of their own items.
    expect(ana.taxCents).toBe(450);
    expect(ben.taxCents).toBe(150);
    expect(cy.taxCents).toBe(50);
    expect(sum(r.shares.map((s) => s.totalCents))).toBe(r.totalCents);
  });

  it("supports post-tax tip", () => {
    const r = splitBill({
      ...base,
      participants: people,
      items: [{ id: "x", priceCents: 10000, claims: [{ participantId: "ana", weight: 1 }] }],
      taxCents: 1000,
      tipMode: "PERCENT_POST_TAX",
      tipPercent: 20,
    });
    expect(r.tipCents).toBe(2200);
  });

  it("computes tax from a percent rate on the post-discount subtotal", () => {
    const r = splitBill({
      ...base,
      participants: people,
      items: [
        { id: "a", priceCents: 6000, claims: [{ participantId: "ana", weight: 1 }] },
        { id: "b", priceCents: 4000, claims: [{ participantId: "ben", weight: 1 }] },
      ],
      discountCents: 1000,
      taxMode: "PERCENT",
      taxPercent: 8.875,
    });
    // (10000 - 1000) * 8.875% = 798.75 -> 799
    expect(r.taxCents).toBe(799);
    expect(r.shares.map((s) => s.taxCents)).toEqual([479, 320, 0]);
    expect(sum(r.shares.map((s) => s.totalCents))).toBe(r.totalCents);
  });

  it("uses computed percent tax as the base for post-tax tip", () => {
    const r = splitBill({
      ...base,
      participants: people,
      items: [{ id: "x", priceCents: 10000, claims: [{ participantId: "ana", weight: 1 }] }],
      taxMode: "PERCENT",
      taxPercent: 10,
      taxCents: 99999, // ignored in PERCENT mode
      tipMode: "PERCENT_POST_TAX",
      tipPercent: 20,
    });
    expect(r.taxCents).toBe(1000);
    expect(r.tipCents).toBe(2200);
  });

  it("splits shared items by weight", () => {
    const r = splitBill({
      ...base,
      participants: people,
      items: [
        {
          id: "beers",
          priceCents: 2100,
          claims: [
            { participantId: "ana", weight: 2 },
            { participantId: "ben", weight: 1 },
          ],
        },
      ],
    });
    expect(r.shares.map((s) => s.itemsCents)).toEqual([1400, 700, 0]);
  });

  it("splits unclaimed items evenly and flags them", () => {
    const r = splitBill({
      ...base,
      participants: people,
      items: [{ id: "mystery", priceCents: 1000, claims: [] }],
    });
    expect(r.unclaimedItemIds).toEqual(["mystery"]);
    expect(r.unclaimedCents).toBe(1000);
    expect(r.shares.map((s) => s.itemsCents)).toEqual([334, 333, 333]);
    expect(r.shares.map((s) => s.unclaimedCents)).toEqual([334, 333, 333]);
  });

  it("can dump unclaimed items on the payer", () => {
    const r = splitBill({
      ...base,
      unclaimedPolicy: "PAYER",
      participants: [{ id: "ben" }, { id: "ana", isPayer: true }],
      items: [{ id: "mystery", priceCents: 1000, claims: [] }],
    });
    expect(r.shares.map((s) => s.itemsCents)).toEqual([0, 1000]);
  });

  it("splits flat fees evenly when asked", () => {
    const r = splitBill({
      ...base,
      participants: people,
      items: [{ id: "x", priceCents: 9000, claims: [{ participantId: "ana", weight: 1 }] }],
      feesCents: 300,
      feeMode: "EVEN",
    });
    expect(r.shares.map((s) => s.feesCents)).toEqual([100, 100, 100]);
  });

  it("subtracts discounts proportionally and still sums exactly", () => {
    const r = splitBill({
      ...base,
      participants: people,
      items: [
        { id: "a", priceCents: 1001, claims: [{ participantId: "ana", weight: 1 }] },
        { id: "b", priceCents: 1001, claims: [{ participantId: "ben", weight: 1 }] },
        { id: "c", priceCents: 1001, claims: [{ participantId: "cy", weight: 1 }] },
      ],
      taxCents: 271,
      tipCents: 457,
      feesCents: 99,
      discountCents: 500,
    });
    expect(sum(r.shares.map((s) => s.totalCents))).toBe(r.totalCents);
    expect(sum(r.shares.map((s) => s.discountCents))).toBe(500);
  });

  it("ignores claims from people not on the bill", () => {
    const r = splitBill({
      ...base,
      participants: people,
      items: [{ id: "x", priceCents: 500, claims: [{ participantId: "ghost", weight: 1 }] }],
    });
    expect(r.unclaimedItemIds).toEqual(["x"]);
  });

  it("fuzz: totals always reconcile", () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let round = 0; round < 200; round++) {
      const ps = Array.from({ length: 1 + rand(6) }, (_, i) => ({ id: `p${i}`, isPayer: i === 0 }));
      const items = Array.from({ length: rand(8) }, (_, i) => ({
        id: `i${i}`,
        priceCents: rand(5000),
        claims: ps.filter(() => rand(3) === 0).map((p) => ({ participantId: p.id, weight: 1 + rand(3) })),
      }));
      const r = splitBill({
        participants: ps,
        items,
        taxMode: rand(2) ? "PERCENT" : "AMOUNT",
        taxCents: rand(1000),
        taxPercent: rand(1200) / 100,
        tipMode: (["AMOUNT", "PERCENT_PRE_TAX", "PERCENT_POST_TAX"] as const)[rand(3)],
        tipCents: rand(2000),
        tipPercent: rand(30),
        feesCents: rand(500),
        feeMode: rand(2) ? "EVEN" : "PROPORTIONAL",
        discountCents: rand(300),
        unclaimedPolicy: rand(2) ? "EVEN" : "PAYER",
      });
      expect(sum(r.shares.map((s) => s.totalCents))).toBe(r.totalCents);
    }
  });
});

describe("percentage splits", () => {
  it("converts percents to weights and back", () => {
    expect(percentsToWeights([20, 80])).toEqual([2000, 8000]);
    expect(percentsToWeights([12.5, 87.5])).toEqual([1250, 8750]);
    expect(weightsToPercents([2000, 8000])).toEqual([20, 80]);
    expect(weightsToPercents([1, 1, 2])).toEqual([25, 25, 50]);
  });

  it("shows thirds as percents that still add up to 100", () => {
    const pct = weightsToPercents([1, 1, 1]);
    expect(pct).toEqual([33.4, 33.3, 33.3]);
    expect(pct.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
  });

  it("detects even splits", () => {
    expect(isEvenSplit([1, 1, 1])).toBe(true);
    expect(isEvenSplit([2000, 8000])).toBe(false);
  });

  it("bills a 20/80 dish to the cent", () => {
    const r = splitBill({
      ...base,
      participants: [{ id: "me", isPayer: true }, { id: "john" }],
      items: [
        {
          id: "dish",
          priceCents: 2499,
          claims: [
            { participantId: "me", weight: 2000 },
            { participantId: "john", weight: 8000 },
          ],
        },
      ],
      taxMode: "PERCENT",
      taxPercent: 10,
    });
    // 2499 * 20% = 499.8 -> 500, 2499 * 80% = 1999.2 -> 1999
    expect(r.shares.map((s) => s.itemsCents)).toEqual([500, 1999]);
    expect(r.shares.map((s) => s.taxCents)).toEqual([50, 200]);
    expect(sum(r.shares.map((s) => s.totalCents))).toBe(r.totalCents);
  });
});
