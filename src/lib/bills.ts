import "server-only";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { splitBill } from "@/lib/split";
import { UserError } from "@/lib/action";

export const guestCookieName = (billId: string) => `wot_g_${billId}`;
export const groupCookieName = (groupId: string) => `wot_gm_${groupId}`;

/** Safe, serializable shape sent to the client. Never includes guest secrets. */
export type BillDTO = Awaited<ReturnType<typeof loadBill>>;

const memberSelect = { id: true, userId: true, guestSecret: true, displayName: true } as const;
const memberOrder = [{ createdAt: "asc" as const }, { id: "asc" as const }];

export const billInclude = {
  items: {
    orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }],
    include: { claims: { select: { participantId: true, weight: true } } },
  },
  participants: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      displayName: true,
      emoji: true,
      isPayer: true,
      paidAt: true,
      userId: true,
      guestSecret: true,
      memberId: true,
    },
  },
  group: {
    select: { id: true, name: true, shareToken: true, members: { orderBy: memberOrder, select: memberSelect } },
  },
};

type RawBill = NonNullable<Awaited<ReturnType<typeof fetchBill>>>;
type SplittableBill = Pick<
  RawBill,
  | "participants"
  | "items"
  | "taxMode"
  | "taxCents"
  | "taxPercent"
  | "tipMode"
  | "tipCents"
  | "tipPercent"
  | "feesCents"
  | "feeMode"
  | "discountCents"
  | "unclaimedPolicy"
>;

function fetchBill(where: { id: string } | { shareToken: string }) {
  return db.bill.findUnique({ where, include: billInclude });
}

/** Run the split engine on a bill as stored. */
export function computeSplit(bill: SplittableBill) {
  return splitBill({
    participants: bill.participants,
    items: bill.items.map((i) => ({ id: i.id, priceCents: i.priceCents, claims: i.claims })),
    taxMode: bill.taxMode,
    taxCents: bill.taxCents,
    taxPercent: bill.taxPercent,
    tipMode: bill.tipMode,
    tipCents: bill.tipCents,
    tipPercent: bill.tipPercent,
    feesCents: bill.feesCents,
    feeMode: bill.feeMode,
    discountCents: bill.discountCents,
    unclaimedPolicy: bill.unclaimedPolicy,
  });
}

/** Which group member is looking: by account, else by the group's guest cookie. */
export async function resolveGroupMember(
  groupId: string,
  members: { id: string; userId: string | null; guestSecret: string | null }[],
  userId: string | null,
) {
  const secret = (await cookies()).get(groupCookieName(groupId))?.value;
  return (
    members.find((m) => userId && m.userId === userId) ?? members.find((m) => secret && m.guestSecret === secret) ?? null
  );
}

/**
 * Figures out who is looking at this bill. On standalone bills only the creator can manage it; on
 * group bills any member of the group can.
 */
async function resolveViewer(bill: RawBill) {
  const session = await getSession();
  const userId = session?.user?.id ?? null;
  const secret = (await cookies()).get(guestCookieName(bill.id))?.value;

  const member = bill.group ? await resolveGroupMember(bill.group.id, bill.group.members, userId) : null;
  const me =
    bill.participants.find((p) => userId && p.userId === userId) ??
    bill.participants.find((p) => member && p.memberId === member.id) ??
    bill.participants.find((p) => secret && p.guestSecret === secret) ??
    null;
  // A guest recognised on this bill by its own cookie is still that group member here.
  const memberId = member?.id ?? (bill.group ? (me?.memberId ?? null) : null);

  return {
    userId,
    canManage: (bill.ownerId !== null && userId === bill.ownerId) || memberId !== null,
    meId: me?.id ?? null,
    memberId,
  };
}

function toDTO(bill: RawBill, viewer: Awaited<ReturnType<typeof resolveViewer>>) {
  const split = computeSplit(bill);
  const groupMembers = bill.group?.members ?? [];
  const memberIndex = new Map(groupMembers.map((m, i) => [m.id, i]));
  const memberById = new Map(groupMembers.map((m) => [m.id, m]));

  return {
    id: bill.id,
    title: bill.title,
    merchant: bill.merchant,
    date: bill.date.toISOString(),
    shareToken: bill.shareToken,
    status: bill.status,
    taxMode: bill.taxMode,
    taxCents: bill.taxCents,
    taxPercent: bill.taxPercent,
    tipMode: bill.tipMode,
    tipCents: bill.tipCents,
    tipPercent: bill.tipPercent,
    feesCents: bill.feesCents,
    feeMode: bill.feeMode,
    discountCents: bill.discountCents,
    unclaimedPolicy: bill.unclaimedPolicy,
    group: bill.group
      ? {
          id: bill.group.id,
          name: bill.group.name,
          shareToken: bill.group.shareToken,
          /** Group members not on this bill yet (for adding people). */
          others: groupMembers
            .filter((m) => !bill.participants.some((p) => p.memberId === m.id))
            .map((m) => ({ id: m.id, displayName: m.displayName, color: memberIndex.get(m.id)! })),
        }
      : null,
    items: bill.items.map((i) => ({
      id: i.id,
      name: i.name,
      priceCents: i.priceCents,
      claims: i.claims,
    })),
    participants: bill.participants.map((p, i) => {
      const member = p.memberId ? memberById.get(p.memberId) : undefined;
      return {
        id: p.id,
        /** Picks this person's color everywhere: their position in the group, or on the bill. */
        color: member ? memberIndex.get(member.id)! : i,
        displayName: p.displayName,
        emoji: p.emoji,
        isPayer: p.isPayer,
        paidAt: p.paidAt?.toISOString() ?? null,
        /** Placeholder = added by someone else; nobody has claimed this identity yet. */
        isPlaceholder: member ? !member.userId && !member.guestSecret : !p.userId && !p.guestSecret,
      };
    }),
    split,
    viewer,
  };
}

export async function loadBill(where: { id: string } | { shareToken: string }) {
  const bill = await fetchBill(where);
  if (!bill) return null;
  return toDTO(bill, await resolveViewer(bill));
}

/** For server actions: load the raw bill plus viewer, for authorization checks. */
export async function loadBillForAction(where: { id: string } | { shareToken: string }) {
  const bill = await fetchBill(where);
  if (!bill) throw new UserError("That bill no longer exists.");
  return { bill, viewer: await resolveViewer(bill) };
}
