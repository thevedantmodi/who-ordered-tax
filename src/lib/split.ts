/**
 * The "who ordered tax" engine.
 *
 * Pure functions, integer cents only. Every allocation uses largest-remainder
 * rounding so per-person totals always sum exactly to the bill total.
 */

export type TipMode = "AMOUNT" | "PERCENT_PRE_TAX" | "PERCENT_POST_TAX";
export type FeeMode = "PROPORTIONAL" | "EVEN";
export type UnclaimedPolicy = "EVEN" | "PAYER";

export interface SplitItem {
  id: string;
  priceCents: number;
  claims: { participantId: string; weight: number }[];
}

export interface SplitInput {
  participants: { id: string; isPayer?: boolean }[];
  items: SplitItem[];
  taxCents: number;
  tipMode: TipMode;
  tipCents: number;
  tipPercent: number;
  feesCents: number;
  feeMode: FeeMode;
  discountCents: number;
  unclaimedPolicy: UnclaimedPolicy;
}

export interface PersonShare {
  participantId: string;
  itemsCents: number;
  /** Portion of itemsCents that came from unclaimed items dumped on this person. */
  unclaimedCents: number;
  taxCents: number;
  tipCents: number;
  feesCents: number;
  /** Positive number; subtracted from the total. */
  discountCents: number;
  totalCents: number;
  /** itemId -> cents this person pays for that item */
  itemBreakdown: Record<string, number>;
}

export interface SplitResult {
  subtotalCents: number;
  tipCents: number;
  totalCents: number;
  unclaimedItemIds: string[];
  unclaimedCents: number;
  shares: PersonShare[];
}

/**
 * Split `total` into integer parts proportional to `weights` using the
 * largest-remainder method. Ties go to the earliest index. If every weight is
 * zero, splits evenly. Works for negative totals too.
 */
export function allocate(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (!Number.isInteger(total)) throw new Error("allocate: total must be an integer");
  if (weights.some((w) => w < 0 || !Number.isFinite(w))) {
    throw new Error("allocate: weights must be non-negative finite numbers");
  }
  if (total < 0) return allocate(-total, weights).map((x) => (x === 0 ? 0 : -x));

  const sum = weights.reduce((a, b) => a + b, 0);
  const effective = sum === 0 ? weights.map(() => 1) : weights;
  const effSum = sum === 0 ? n : sum;

  const raw = effective.map((w) => (total * w) / effSum);
  const out = raw.map(Math.floor);
  let remaining = total - out.reduce((a, b) => a + b, 0);

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: effective[i] }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; remaining > 0; k = (k + 1) % order.length) {
    out[order[k].i] += 1;
    remaining -= 1;
  }
  return out;
}

export function computeTip(
  mode: TipMode,
  tipCents: number,
  tipPercent: number,
  subtotalCents: number,
  taxCents: number,
): number {
  switch (mode) {
    case "AMOUNT":
      return tipCents;
    case "PERCENT_PRE_TAX":
      return Math.round((subtotalCents * tipPercent) / 100);
    case "PERCENT_POST_TAX":
      return Math.round(((subtotalCents + taxCents) * tipPercent) / 100);
  }
}

export function splitBill(input: SplitInput): SplitResult {
  const { participants } = input;
  const ids = participants.map((p) => p.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;

  const items = new Array<number>(n).fill(0);
  const unclaimed = new Array<number>(n).fill(0);
  const breakdown: Record<string, number>[] = ids.map(() => ({}));
  const unclaimedItemIds: string[] = [];
  let unclaimedCents = 0;

  const payerIndex = Math.max(
    0,
    participants.findIndex((p) => p.isPayer),
  );

  for (const item of input.items) {
    const claims = item.claims.filter((c) => idx.has(c.participantId) && c.weight > 0);
    if (claims.length > 0) {
      const parts = allocate(
        item.priceCents,
        claims.map((c) => c.weight),
      );
      claims.forEach((c, k) => {
        const i = idx.get(c.participantId)!;
        items[i] += parts[k];
        breakdown[i][item.id] = (breakdown[i][item.id] ?? 0) + parts[k];
      });
      continue;
    }

    unclaimedItemIds.push(item.id);
    unclaimedCents += item.priceCents;
    if (n === 0) continue;
    const parts =
      input.unclaimedPolicy === "PAYER"
        ? ids.map((_, i) => (i === payerIndex ? item.priceCents : 0))
        : allocate(item.priceCents, ids.map(() => 1));
    parts.forEach((cents, i) => {
      if (cents === 0) return;
      items[i] += cents;
      unclaimed[i] += cents;
      breakdown[i][item.id] = (breakdown[i][item.id] ?? 0) + cents;
    });
  }

  const subtotalCents = input.items.reduce((a, it) => a + it.priceCents, 0);
  const tipCents = computeTip(
    input.tipMode,
    input.tipCents,
    input.tipPercent,
    subtotalCents,
    input.taxCents,
  );

  const tax = allocate(input.taxCents, items);
  const tip = allocate(tipCents, items);
  const fees =
    input.feeMode === "EVEN"
      ? allocate(input.feesCents, ids.map(() => 1))
      : allocate(input.feesCents, items);
  const discount = allocate(input.discountCents, items);

  const shares: PersonShare[] = ids.map((id, i) => ({
    participantId: id,
    itemsCents: items[i],
    unclaimedCents: unclaimed[i],
    taxCents: tax[i] ?? 0,
    tipCents: tip[i] ?? 0,
    feesCents: fees[i] ?? 0,
    discountCents: discount[i] ?? 0,
    totalCents: items[i] + (tax[i] ?? 0) + (tip[i] ?? 0) + (fees[i] ?? 0) - (discount[i] ?? 0),
    itemBreakdown: breakdown[i],
  }));

  return {
    subtotalCents,
    tipCents,
    totalCents:
      subtotalCents + input.taxCents + tipCents + input.feesCents - input.discountCents,
    unclaimedItemIds,
    unclaimedCents,
    shares,
  };
}
