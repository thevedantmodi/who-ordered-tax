import { describe, expect, it } from "vitest";
import { netBalances, pairwiseTransfers, simplifiedTransfers, type GroupBillShares, type GroupPayment } from "./settle";

const members = ["alex", "sam", "priya"];

// The worked example from the design: dinner $120 (Alex), Uber $30 (Sam), groceries $60 (Priya),
// each split three ways.
const trip: GroupBillShares[] = [
  { payerMemberId: "alex", shares: members.map((m) => ({ memberId: m, cents: 4000 })) },
  { payerMemberId: "sam", shares: members.map((m) => ({ memberId: m, cents: 1000 })) },
  { payerMemberId: "priya", shares: members.map((m) => ({ memberId: m, cents: 2000 })) },
];

const sumValues = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/** Apply transfers to balances; everyone should end at zero. */
function settle(net: Map<string, number>, transfers: { fromMemberId: string; toMemberId: string; amountCents: number }[]) {
  const after = new Map(net);
  for (const t of transfers) {
    after.set(t.fromMemberId, (after.get(t.fromMemberId) ?? 0) + t.amountCents);
    after.set(t.toMemberId, (after.get(t.toMemberId) ?? 0) - t.amountCents);
  }
  return after;
}

describe("netBalances", () => {
  it("matches the worked example", () => {
    const net = netBalances(members, trip, []);
    expect(Object.fromEntries(net)).toEqual({ alex: 5000, sam: -4000, priya: -1000 });
    expect(sumValues(net)).toBe(0);
  });

  it("counts recorded payments", () => {
    const net = netBalances(members, trip, [{ fromMemberId: "sam", toMemberId: "alex", amountCents: 1500 }]);
    expect(Object.fromEntries(net)).toEqual({ alex: 3500, sam: -2500, priya: -1000 });
  });

  it("ignores the payer's own share and members with nothing", () => {
    const net = netBalances(["a", "b", "c"], [{ payerMemberId: "a", shares: [{ memberId: "a", cents: 999 }] }], []);
    expect(Object.fromEntries(net)).toEqual({ a: 0, b: 0, c: 0 });
  });
});

describe("simplifiedTransfers", () => {
  it("settles the worked example in 2 payments", () => {
    const net = netBalances(members, trip, []);
    const t = simplifiedTransfers(net, members);
    expect(t).toEqual([
      { fromMemberId: "sam", toMemberId: "alex", amountCents: 4000 },
      { fromMemberId: "priya", toMemberId: "alex", amountCents: 1000 },
    ]);
  });

  it("routes around someone who is even (the design's Sam/Priya example)", () => {
    const bills: GroupBillShares[] = [
      { payerMemberId: "alex", shares: [{ memberId: "sam", cents: 3000 }] },
      { payerMemberId: "sam", shares: [{ memberId: "priya", cents: 3000 }] },
    ];
    const t = simplifiedTransfers(netBalances(members, bills, []), members);
    expect(t).toEqual([{ fromMemberId: "priya", toMemberId: "alex", amountCents: 3000 }]);
  });

  it("returns nothing when everyone is square", () => {
    expect(simplifiedTransfers(new Map([["a", 0], ["b", 0]]), ["a", "b"])).toEqual([]);
  });

  it("fuzz: always settles everyone exactly, in at most n-1 transfers", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let round = 0; round < 300; round++) {
      const ids = Array.from({ length: 2 + rand(7) }, (_, i) => `m${i}`);
      const bills: GroupBillShares[] = Array.from({ length: rand(10) }, () => ({
        payerMemberId: ids[rand(ids.length)],
        shares: ids.filter(() => rand(2)).map((id) => ({ memberId: id, cents: rand(9000) })),
      }));
      const payments: GroupPayment[] = Array.from({ length: rand(4) }, () => ({
        fromMemberId: ids[rand(ids.length)],
        toMemberId: ids[rand(ids.length)],
        amountCents: rand(3000),
      })).filter((p) => p.fromMemberId !== p.toMemberId);
      const net = netBalances(ids, bills, payments);
      expect(sumValues(net)).toBe(0);
      const t = simplifiedTransfers(net, ids);
      const nonZero = [...net.values()].filter((v) => v !== 0).length;
      expect(t.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
      expect([...settle(net, t).values()].every((v) => v === 0)).toBe(true);
      expect(t.every((x) => x.amountCents > 0)).toBe(true);
    }
  });
});

describe("pairwiseTransfers", () => {
  it("nets each pair (the worked example takes 3 payments)", () => {
    const t = pairwiseTransfers(trip, [], members);
    expect(t).toEqual([
      { fromMemberId: "sam", toMemberId: "alex", amountCents: 3000 },
      { fromMemberId: "priya", toMemberId: "alex", amountCents: 2000 },
      { fromMemberId: "sam", toMemberId: "priya", amountCents: 1000 },
    ]);
  });

  it("does not route around people (Priya pays Sam, Sam pays Alex)", () => {
    const bills: GroupBillShares[] = [
      { payerMemberId: "alex", shares: [{ memberId: "sam", cents: 3000 }] },
      { payerMemberId: "sam", shares: [{ memberId: "priya", cents: 3000 }] },
    ];
    expect(pairwiseTransfers(bills, [], members)).toEqual([
      { fromMemberId: "sam", toMemberId: "alex", amountCents: 3000 },
      { fromMemberId: "priya", toMemberId: "sam", amountCents: 3000 },
    ]);
  });

  it("applies recorded payments to the pair", () => {
    const t = pairwiseTransfers(trip, [{ fromMemberId: "sam", toMemberId: "alex", amountCents: 3000 }], members);
    expect(t.find((x) => x.fromMemberId === "sam" && x.toMemberId === "alex")).toBeUndefined();
  });

  it("settles everyone exactly too", () => {
    const net = netBalances(members, trip, []);
    expect([...settle(net, pairwiseTransfers(trip, [], members)).values()].every((v) => v === 0)).toBe(true);
  });
});
