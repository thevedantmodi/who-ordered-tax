import "server-only";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { billInclude, computeSplit, resolveGroupMember } from "@/lib/bills";
import { netBalances, pairwiseTransfers, simplifiedTransfers, type GroupBillShares } from "@/lib/settle";

export type GroupDTO = NonNullable<Awaited<ReturnType<typeof loadGroup>>>;

function fetchGroup(where: { id: string } | { shareToken: string }) {
  return db.group.findUnique({
    where,
    include: {
      members: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, userId: true, guestSecret: true, displayName: true },
      },
      bills: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], include: billInclude },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
}

type RawGroup = NonNullable<Awaited<ReturnType<typeof fetchGroup>>>;

/** Each group bill as "who paid, and what each member owes for it". */
function billShares(bill: RawGroup["bills"][number]) {
  const split = computeSplit(bill);
  const memberOf = new Map(bill.participants.map((p) => [p.id, p.memberId]));
  const payer = bill.participants.find((p) => p.isPayer);
  const shares = split.shares
    .map((s) => ({ memberId: memberOf.get(s.participantId) ?? null, cents: s.totalCents }))
    .filter((s): s is { memberId: string; cents: number } => s.memberId !== null);
  return { split, payerMemberId: payer?.memberId ?? null, shares };
}

function toDTO(group: RawGroup, viewer: { userId: string | null; memberId: string | null }) {
  const order = group.members.map((m) => m.id);
  const color = new Map(order.map((id, i) => [id, i]));

  const bills = group.bills.map((b) => ({ bill: b, ...billShares(b) }));
  const counted: GroupBillShares[] = bills
    .filter((b) => b.payerMemberId !== null)
    .map((b) => ({ payerMemberId: b.payerMemberId!, shares: b.shares }));
  const payments = group.payments.map((p) => ({
    fromMemberId: p.fromMemberId,
    toMemberId: p.toMemberId,
    amountCents: p.amountCents,
  }));

  const net = netBalances(order, counted, payments);
  const transfers = group.simplifyDebts
    ? simplifiedTransfers(net, order)
    : pairwiseTransfers(counted, payments, order);

  const activity = [
    ...bills.map((b) => ({
      kind: "bill" as const,
      id: b.bill.id,
      at: b.bill.date.toISOString(),
      title: b.bill.title,
      shareToken: b.bill.shareToken,
      payerMemberId: b.payerMemberId,
      totalCents: b.split.totalCents,
      yourShareCents: viewer.memberId ? (b.shares.find((s) => s.memberId === viewer.memberId)?.cents ?? 0) : null,
      people: b.shares.length,
    })),
    ...group.payments.map((p) => ({
      kind: "payment" as const,
      id: p.id,
      at: p.createdAt.toISOString(),
      fromMemberId: p.fromMemberId,
      toMemberId: p.toMemberId,
      amountCents: p.amountCents,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return {
    id: group.id,
    name: group.name,
    shareToken: group.shareToken,
    simplifyDebts: group.simplifyDebts,
    members: group.members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      color: color.get(m.id)!,
      isPlaceholder: !m.userId && !m.guestSecret,
      balanceCents: net.get(m.id) ?? 0,
    })),
    transfers,
    activity,
    viewer,
  };
}

export async function loadGroup(where: { id: string } | { shareToken: string }) {
  const group = await fetchGroup(where);
  if (!group) return null;
  const userId = (await getSession())?.user?.id ?? null;
  const member = await resolveGroupMember(group.id, group.members, userId);
  return toDTO(group, { userId, memberId: member?.id ?? null });
}

/** For server actions: the group (members only, no bills) plus who is acting. */
export async function loadGroupForAction(where: { id: string } | { shareToken: string }) {
  const group = await db.group.findUnique({
    where,
    include: {
      members: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, userId: true, guestSecret: true, displayName: true },
      },
    },
  });
  if (!group) throw new Error("Group not found");
  const userId = (await getSession())?.user?.id ?? null;
  const member = await resolveGroupMember(group.id, group.members, userId);
  return { group, userId, member };
}

/** Groups the signed-in user belongs to, with their own balance in each. */
export async function loadMyGroups(userId: string) {
  const groups = await db.group.findMany({
    where: { members: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
    select: { shareToken: true },
    take: 100,
  });
  const loaded = await Promise.all(groups.map((g) => loadGroup({ shareToken: g.shareToken })));
  return loaded
    .filter((g): g is GroupDTO => g !== null)
    .map((g) => ({
      name: g.name,
      shareToken: g.shareToken,
      members: g.members,
      yourBalanceCents: g.members.find((m) => m.id === g.viewer.memberId)?.balanceCents ?? 0,
    }));
}

/** For "Move to group": the user's groups and their members. */
export async function loadGroupsForMove(userId: string) {
  return db.group.findMany({
    where: { members: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      members: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, displayName: true, userId: true },
      },
    },
  });
}
