"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { auth, signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { guestCookieName, loadBillForAction } from "@/lib/bills";
import { parseMoney } from "@/lib/money";
import { isEmoji, randomEmoji } from "@/lib/emoji";

const shareId = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);

function touch(bill: { id: string; shareToken: string }) {
  revalidatePath(`/bills/${bill.id}`);
  revalidatePath(`/b/${bill.shareToken}`);
  revalidatePath("/bills");
}

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}

async function requireOwner(billId: string) {
  const user = await requireUser();
  const ctx = await loadBillForAction({ id: billId });
  if (ctx.bill.ownerId !== user.id) throw new Error("Only the payer can do that");
  return ctx;
}

const name = z.string().trim().min(1, "Needs a name").max(60);

// ---------- Auth ----------

export async function signInWithEmail(formData: FormData) {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) redirect("/login?error=email");
  const callbackUrl = z.string().startsWith("/").catch("/bills").parse(formData.get("callbackUrl") ?? "/bills");
  await signIn("email", { email: email.data, redirectTo: callbackUrl, redirect: false });
  redirect("/login/check");
}

export async function signInWithGoogle(formData: FormData) {
  const callbackUrl = z.string().startsWith("/").catch("/bills").parse(formData.get("callbackUrl") ?? "/bills");
  await signIn("google", { redirectTo: callbackUrl });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

// ---------- Bills (payer only) ----------

export async function createBill(formData: FormData) {
  const user = await requireUser();
  const title = name.safeParse(formData.get("title"));
  if (!title.success) redirect("/bills/new?error=title");
  const merchant = z.string().trim().max(80).optional().parse(formData.get("merchant") || undefined);

  const me = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  const bill = await db.bill.create({
    data: {
      ownerId: user.id,
      title: title.data,
      merchant,
      shareToken: shareId(),
      participants: {
        create: {
          userId: user.id,
          displayName: me.name ?? me.email?.split("@")[0] ?? "Me",
          emoji: me.emoji,
          isPayer: true,
        },
      },
    },
  });
  redirect(`/bills/${bill.id}`);
}

export async function deleteBill(billId: string) {
  await requireOwner(billId);
  await db.bill.delete({ where: { id: billId } });
  revalidatePath("/bills");
  redirect("/bills");
}

export async function addItem(billId: string, formData: FormData) {
  const { bill } = await requireOwner(billId);
  const itemName = name.parse(formData.get("name"));
  const price = parseMoney(formData.get("price") as string | null);
  if (price == null || price < 0) throw new Error("Invalid price");
  const qty = Math.min(50, Math.max(1, Number(formData.get("qty")) || 1));

  const last = await db.item.aggregate({ where: { billId }, _max: { position: true } });
  const start = (last._max.position ?? -1) + 1;
  await db.item.createMany({
    data: Array.from({ length: qty }, (_, i) => ({
      billId,
      name: itemName,
      priceCents: price,
      position: start + i,
    })),
  });
  touch(bill);
}

export async function updateItem(itemId: string, data: { name?: string; price?: string }) {
  const item = await db.item.findUniqueOrThrow({ where: { id: itemId } });
  const { bill } = await requireOwner(item.billId);
  const priceCents = data.price !== undefined ? parseMoney(data.price) : undefined;
  if (priceCents === null || (priceCents !== undefined && priceCents < 0)) throw new Error("Invalid price");
  await db.item.update({
    where: { id: itemId },
    data: {
      name: data.name !== undefined ? name.parse(data.name) : undefined,
      priceCents,
    },
  });
  touch(bill);
}

export async function deleteItem(itemId: string) {
  const item = await db.item.findUniqueOrThrow({ where: { id: itemId } });
  const { bill } = await requireOwner(item.billId);
  await db.item.delete({ where: { id: itemId } });
  touch(bill);
}

const chargesSchema = z.object({
  tax: z.string(),
  tipMode: z.enum(["AMOUNT", "PERCENT_PRE_TAX", "PERCENT_POST_TAX"]),
  tip: z.string(),
  fees: z.string(),
  feeMode: z.enum(["PROPORTIONAL", "EVEN"]),
  discount: z.string(),
  unclaimedPolicy: z.enum(["EVEN", "PAYER"]),
});

export async function updateCharges(billId: string, formData: FormData) {
  const { bill } = await requireOwner(billId);
  const c = chargesSchema.parse(Object.fromEntries(formData));
  const money = (s: string) => {
    const v = parseMoney(s);
    if (v == null || v < 0) throw new Error("Invalid amount");
    return v;
  };
  const isPercent = c.tipMode !== "AMOUNT";
  const pct = Number(c.tip.replace(/[%\s]/g, "") || 0);
  if (isPercent && (!Number.isFinite(pct) || pct < 0 || pct > 100)) throw new Error("Invalid tip %");

  await db.bill.update({
    where: { id: billId },
    data: {
      taxCents: money(c.tax),
      tipMode: c.tipMode,
      tipCents: isPercent ? 0 : money(c.tip),
      tipPercent: isPercent ? pct : 0,
      feesCents: money(c.fees),
      feeMode: c.feeMode,
      discountCents: money(c.discount),
      unclaimedPolicy: c.unclaimedPolicy,
    },
  });
  touch(bill);
}

export async function addPlaceholder(billId: string, formData: FormData) {
  const { bill } = await requireOwner(billId);
  await db.participant.create({
    data: { billId, displayName: name.parse(formData.get("name")), emoji: randomEmoji() },
  });
  touch(bill);
}

export async function removeParticipant(participantId: string) {
  const p = await db.participant.findUniqueOrThrow({ where: { id: participantId } });
  const { bill } = await requireOwner(p.billId);
  if (p.isPayer) throw new Error("The payer can't leave their own bill");
  await db.participant.delete({ where: { id: participantId } });
  touch(bill);
}

export async function setPaid(participantId: string, paid: boolean) {
  const p = await db.participant.findUniqueOrThrow({ where: { id: participantId } });
  const { bill } = await requireOwner(p.billId);
  await db.participant.update({ where: { id: participantId }, data: { paidAt: paid ? new Date() : null } });

  const outstanding = await db.participant.count({
    where: { billId: bill.id, isPayer: false, paidAt: null },
  });
  const total = await db.participant.count({ where: { billId: bill.id, isPayer: false } });
  if (total > 0 && outstanding === 0) {
    await db.bill.update({ where: { id: bill.id }, data: { status: "SETTLED" } });
  } else if (bill.status === "SETTLED") {
    await db.bill.update({ where: { id: bill.id }, data: { status: "LOCKED" } });
  }
  touch(bill);
}

export async function setStatus(billId: string, status: "OPEN" | "LOCKED") {
  const { bill } = await requireOwner(billId);
  await db.bill.update({ where: { id: billId }, data: { status } });
  touch(bill);
}

// ---------- Guests & claiming (anyone with the link) ----------

async function setGuestCookie(billId: string, secret: string) {
  const jar = await cookies();
  jar.set(guestCookieName(billId), secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function joinBill(shareToken: string, formData: FormData) {
  const { bill, viewer } = await loadBillForAction({ shareToken });
  if (viewer.meId) return;
  if (bill.status !== "OPEN") throw new Error("This bill is locked");

  const emojiRaw = formData.get("emoji");
  const emoji = isEmoji(emojiRaw) ? emojiRaw : randomEmoji();
  const displayName = name.parse(formData.get("name"));

  if (viewer.userId) {
    await db.participant.create({ data: { billId: bill.id, userId: viewer.userId, displayName, emoji } });
  } else {
    const secret = randomBytes(24).toString("base64url");
    await db.participant.create({ data: { billId: bill.id, guestSecret: secret, displayName, emoji } });
    await setGuestCookie(bill.id, secret);
  }
  touch(bill);
}

/** "That's me!" — take over a placeholder the payer added. */
export async function claimPlaceholder(shareToken: string, participantId: string) {
  const { bill, viewer } = await loadBillForAction({ shareToken });
  if (viewer.meId) return;
  const p = bill.participants.find((x) => x.id === participantId);
  if (!p || p.userId || p.guestSecret) throw new Error("Someone already took that spot");

  if (viewer.userId) {
    await db.participant.update({ where: { id: p.id }, data: { userId: viewer.userId } });
  } else {
    const secret = randomBytes(24).toString("base64url");
    // updateMany with the null guard makes this race-safe.
    const res = await db.participant.updateMany({
      where: { id: p.id, userId: null, guestSecret: null },
      data: { guestSecret: secret },
    });
    if (res.count === 0) throw new Error("Someone already took that spot");
    await setGuestCookie(bill.id, secret);
  }
  touch(bill);
}

/**
 * Set how many shares of an item a participant has (0 removes the claim).
 * Guests may only change their own claims while the bill is open; the payer can change anyone's.
 */
export async function setClaim(itemId: string, participantId: string, weight: number) {
  const item = await db.item.findUniqueOrThrow({ where: { id: itemId } });
  const { bill, viewer } = await loadBillForAction({ id: item.billId });

  if (!bill.participants.some((p) => p.id === participantId)) throw new Error("Not on this bill");
  const allowed = viewer.isOwner || (viewer.meId === participantId && bill.status === "OPEN");
  if (!allowed) throw new Error("You can only claim your own items");

  const w = Math.max(0, Math.min(20, Math.floor(weight)));
  if (w === 0) {
    await db.claim.deleteMany({ where: { itemId, participantId } });
  } else {
    await db.claim.upsert({
      where: { itemId_participantId: { itemId, participantId } },
      create: { itemId, participantId, weight: w },
      update: { weight: w },
    });
  }
  touch(bill);
}
