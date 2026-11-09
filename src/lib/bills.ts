import "server-only";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { splitBill } from "@/lib/split";

export const guestCookieName = (billId: string) => `wot_g_${billId}`;

/** Safe, serializable shape sent to the client. Never includes guest secrets. */
export type BillDTO = Awaited<ReturnType<typeof loadBill>>;

const billInclude = {
  items: {
    orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }],
    include: { claims: { select: { participantId: true, weight: true } } },
  },
  participants: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      displayName: true,
      emoji: true,
      isPayer: true,
      paidAt: true,
      userId: true,
      guestSecret: true,
    },
  },
};

type RawBill = NonNullable<Awaited<ReturnType<typeof fetchBill>>>;

function fetchBill(where: { id: string } | { shareToken: string }) {
  return db.bill.findUnique({ where, include: billInclude });
}

/** Figures out who is looking at this bill: the owner, a participant, or a stranger. */
async function resolveViewer(bill: RawBill) {
  const session = await getSession();
  const userId = session?.user?.id ?? null;
  const jar = await cookies();
  const secret = jar.get(guestCookieName(bill.id))?.value;

  const me =
    bill.participants.find((p) => userId && p.userId === userId) ??
    bill.participants.find((p) => secret && p.guestSecret === secret) ??
    null;

  return { userId, isOwner: userId === bill.ownerId, meId: me?.id ?? null };
}

function toDTO(bill: RawBill, viewer: Awaited<ReturnType<typeof resolveViewer>>) {
  const split = splitBill({
    participants: bill.participants,
    items: bill.items.map((i) => ({ id: i.id, priceCents: i.priceCents, claims: i.claims })),
    taxCents: bill.taxCents,
    tipMode: bill.tipMode,
    tipCents: bill.tipCents,
    tipPercent: bill.tipPercent,
    feesCents: bill.feesCents,
    feeMode: bill.feeMode,
    discountCents: bill.discountCents,
    unclaimedPolicy: bill.unclaimedPolicy,
  });

  return {
    id: bill.id,
    title: bill.title,
    merchant: bill.merchant,
    date: bill.date.toISOString(),
    shareToken: bill.shareToken,
    status: bill.status,
    taxCents: bill.taxCents,
    tipMode: bill.tipMode,
    tipCents: bill.tipCents,
    tipPercent: bill.tipPercent,
    feesCents: bill.feesCents,
    feeMode: bill.feeMode,
    discountCents: bill.discountCents,
    unclaimedPolicy: bill.unclaimedPolicy,
    items: bill.items.map((i) => ({
      id: i.id,
      name: i.name,
      priceCents: i.priceCents,
      claims: i.claims,
    })),
    participants: bill.participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      emoji: p.emoji,
      isPayer: p.isPayer,
      paidAt: p.paidAt?.toISOString() ?? null,
      /** Placeholder = added by the payer, nobody has claimed this identity yet. */
      isPlaceholder: !p.userId && !p.guestSecret,
    })),
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
  if (!bill) throw new Error("Bill not found");
  return { bill, viewer: await resolveViewer(bill) };
}
