import type { BillDTO } from "@/lib/bills";

export type Badge = { label: string; hint: string };

/** Silly, harmless superlatives. Only awarded when there's something to compare. */
export function badgesFor(bill: NonNullable<BillDTO>): Map<string, Badge[]> {
  const out = new Map<string, Badge[]>();
  const add = (id: string, b: Badge) => out.set(id, [...(out.get(id) ?? []), b]);
  const people = bill.participants;
  if (people.length < 2 || bill.items.length === 0) return out;

  const shares = bill.split.shares;
  const claimed = new Set(bill.items.flatMap((i) => i.claims.map((c) => c.participantId)));

  // Biggest appetite: strictly highest claimed item spend.
  const byItems = [...shares].sort((a, b) => b.itemsCents - b.unclaimedCents - (a.itemsCents - a.unclaimedCents));
  if (byItems.length > 1 && byItems[0].itemsCents - byItems[0].unclaimedCents > byItems[1].itemsCents - byItems[1].unclaimedCents) {
    add(byItems[0].participantId, { label: "🍖 biggest appetite", hint: "Claimed the most food" });
  }

  // Nacho diplomat: in the most shared items (min 2).
  const sharedCount = new Map<string, number>();
  for (const item of bill.items) {
    if (item.claims.length < 2) continue;
    for (const c of item.claims) sharedCount.set(c.participantId, (sharedCount.get(c.participantId) ?? 0) + 1);
  }
  const sharers = [...sharedCount.entries()].sort((a, b) => b[1] - a[1]);
  if (sharers.length && sharers[0][1] >= 2 && (sharers.length === 1 || sharers[0][1] > sharers[1][1])) {
    add(sharers[0][0], { label: "🧀 nacho diplomat", hint: "In on the most shared plates" });
  }

  // Ghost: hasn't claimed anything.
  for (const p of people) {
    if (!claimed.has(p.id)) add(p.id, { label: "👻 ghost", hint: "Hasn't claimed anything… yet" });
  }

  return out;
}
