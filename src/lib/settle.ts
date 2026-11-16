/**
 * Group settle-up math. Pure functions, integer cents only.
 *
 * Every group bill says who paid and how much each member owes for it (from splitBill), and every
 * recorded payment moves money from one member to another. From that we get:
 *  - each member's net balance (positive = the group owes them, negative = they owe the group)
 *  - the payments needed to settle: either simplified (fewest transfers) or pairwise (people pay
 *    back the specific people they shared bills with).
 */

export interface GroupBillShares {
  payerMemberId: string;
  /** What each member owes for this bill, including the payer's own share. */
  shares: { memberId: string; cents: number }[];
}

export interface GroupPayment {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

/** Net balance per member. Sums to zero across the group. */
export function netBalances(
  memberIds: string[],
  bills: GroupBillShares[],
  payments: GroupPayment[],
): Map<string, number> {
  const net = new Map(memberIds.map((id) => [id, 0]));
  const add = (id: string, cents: number) => net.set(id, (net.get(id) ?? 0) + cents);

  for (const bill of bills) {
    for (const { memberId, cents } of bill.shares) {
      if (memberId === bill.payerMemberId || cents === 0) continue;
      add(bill.payerMemberId, cents); // the payer fronted this member's share
      add(memberId, -cents);
    }
  }
  for (const p of payments) {
    add(p.fromMemberId, p.amountCents); // paying back reduces what you owe
    add(p.toMemberId, -p.amountCents);
  }
  return net;
}

/**
 * Fewest payments that settle everyone: repeatedly match whoever owes the most with whoever is
 * owed the most. At most (people with a non-zero balance − 1) transfers. Ties break by member order
 * so results are stable.
 */
export function simplifiedTransfers(net: Map<string, number>, memberOrder: string[]): Transfer[] {
  const rank = new Map(memberOrder.map((id, i) => [id, i]));
  const byOrder = (a: { id: string }, b: { id: string }) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);
  const debtors = [...net].filter(([, c]) => c < 0).map(([id, c]) => ({ id, left: -c })).sort(byOrder);
  const creditors = [...net].filter(([, c]) => c > 0).map(([id, c]) => ({ id, left: c })).sort(byOrder);

  const out: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort((a, b) => b.left - a.left || byOrder(a, b));
    creditors.sort((a, b) => b.left - a.left || byOrder(a, b));
    const d = debtors[0];
    const c = creditors[0];
    const amount = Math.min(d.left, c.left);
    out.push({ fromMemberId: d.id, toMemberId: c.id, amountCents: amount });
    d.left -= amount;
    c.left -= amount;
    if (d.left === 0) debtors.shift();
    if (c.left === 0) creditors.shift();
  }
  return out;
}

/**
 * Without simplifying: each member pays back the specific people who fronted their shares, netted
 * per pair (if A owes B $40 and B owes A $10, A pays B $30). Recorded payments reduce the debt
 * between the two people involved.
 */
export function pairwiseTransfers(
  bills: GroupBillShares[],
  payments: GroupPayment[],
  memberOrder: string[],
): Transfer[] {
  const rank = new Map(memberOrder.map((id, i) => [id, i]));
  // owed[a][b] = how much a owes b (before netting the pair)
  const owed = new Map<string, Map<string, number>>();
  const add = (from: string, to: string, cents: number) => {
    if (!owed.has(from)) owed.set(from, new Map());
    owed.get(from)!.set(to, (owed.get(from)!.get(to) ?? 0) + cents);
  };
  for (const bill of bills) {
    for (const { memberId, cents } of bill.shares) {
      if (memberId !== bill.payerMemberId && cents !== 0) add(memberId, bill.payerMemberId, cents);
    }
  }
  // A payment from X to Y cancels debt X owes Y (and can flip the pair the other way).
  for (const p of payments) add(p.toMemberId, p.fromMemberId, p.amountCents);

  const out: Transfer[] = [];
  const ids = [...new Set([...owed.keys(), ...[...owed.values()].flatMap((m) => [...m.keys()])])].sort(
    (a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0),
  );
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const diff = (owed.get(a)?.get(b) ?? 0) - (owed.get(b)?.get(a) ?? 0);
      if (diff > 0) out.push({ fromMemberId: a, toMemberId: b, amountCents: diff });
      else if (diff < 0) out.push({ fromMemberId: b, toMemberId: a, amountCents: -diff });
    }
  }
  return out.sort((x, y) => y.amountCents - x.amountCents);
}
