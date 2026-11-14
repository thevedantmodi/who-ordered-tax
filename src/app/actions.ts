"use server";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { auth, signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { guestCookieName, loadBillForAction } from "@/lib/bills";
import { parseMoney } from "@/lib/money";
import { percentsToWeights } from "@/lib/split";
import { isEmoji, randomEmoji } from "@/lib/emoji";
import { cleanupDemoAccounts, createDemoAccount, demoEnabled } from "@/lib/demo";

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

/** One-click demo: fresh private account with sample bills, signed in without email. */
export async function startDemo() {
  if (!demoEnabled()) redirect("/login");
  await cleanupDemoAccounts();
  const { sessionToken, expires, billId } = await createDemoAccount();

  // Match Auth.js's cookie naming: "__Secure-" prefix whenever the request is HTTPS.
  const h = await headers();
  const secure = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https";
  const jar = await cookies();
  jar.set(`${secure ? "__Secure-" : ""}authjs.session-token`, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires,
  });
  redirect(`/bills/${billId}`);
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
  // Most people pay the same local sales tax every time, so start from their last rate.
  const lastRate = await db.bill.findFirst({
    where: { ownerId: user.id, taxMode: "PERCENT", taxPercent: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    select: { taxPercent: true },
  });
  const bill = await db.bill.create({
    data: {
      ownerId: user.id,
      ...(lastRate ? { taxMode: "PERCENT" as const, taxPercent: lastRate.taxPercent } : {}),
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
  taxMode: z.enum(["AMOUNT", "PERCENT"]),
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
  const percent = (s: string, what: string) => {
    const v = Number(s.replace(/[%\s]/g, "") || 0);
    if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error(`Invalid ${what} %`);
    return v;
  };
  const isPercent = c.tipMode !== "AMOUNT";
  const pct = isPercent ? percent(c.tip, "tip") : 0;
  const taxIsPercent = c.taxMode === "PERCENT";

  await db.bill.update({
    where: { id: billId },
    data: {
      taxMode: c.taxMode,
      taxCents: taxIsPercent ? 0 : money(c.tax),
      taxPercent: taxIsPercent ? percent(c.tax, "tax") : 0,
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
 * Claim or unclaim an item for a participant. Guests may only change their own claims while the
 * bill is open; the payer can change anyone's. A custom split (e.g. 20/80) only makes sense for the
 * people it was set for, so whenever the group on an item changes, it resets to an even split.
 */
export async function setClaim(itemId: string, participantId: string, claimed: boolean) {
  const item = await db.item.findUniqueOrThrow({ where: { id: itemId }, include: { claims: true } });
  const { bill, viewer } = await loadBillForAction({ id: item.billId });

  if (!bill.participants.some((p) => p.id === participantId)) throw new Error("Not on this bill");
  const allowed = viewer.isOwner || (viewer.meId === participantId && bill.status === "OPEN");
  if (!allowed) throw new Error("You can only claim your own items");

  const has = item.claims.some((c) => c.participantId === participantId);
  if (has === claimed) return;

  await db.$transaction([
    claimed
      ? db.claim.create({ data: { itemId, participantId, weight: 1 } })
      : db.claim.delete({ where: { itemId_participantId: { itemId, participantId } } }),
    db.claim.updateMany({ where: { itemId }, data: { weight: 1 } }),
  ]);
  touch(bill);
}

const itemSplitSchema = z
  .array(z.object({ participantId: z.string().min(1), percent: z.number().positive().max(100) }))
  .min(1)
  .max(100);

/** Payer only: split an item between specific people by percentage, e.g. 20% / 80%. */
export async function setItemSplit(itemId: string, shares: { participantId: string; percent: number }[]) {
  const item = await db.item.findUniqueOrThrow({ where: { id: itemId } });
  const { bill } = await requireOwner(item.billId);
  const parsed = itemSplitSchema.parse(shares);

  const onBill = new Set(bill.participants.map((p) => p.id));
  if (parsed.some((s) => !onBill.has(s.participantId))) throw new Error("Not on this bill");
  if (new Set(parsed.map((s) => s.participantId)).size !== parsed.length) throw new Error("Someone is listed twice");
  const total = parsed.reduce((a, s) => a + s.percent, 0);
  if (Math.abs(total - 100) > 0.01) throw new Error("Shares must add up to 100%");
  const weights = percentsToWeights(parsed.map((s) => s.percent));
  if (weights.some((w) => w < 1)) throw new Error("Each share must be at least 0.01%");

  await db.$transaction([
    db.claim.deleteMany({ where: { itemId } }),
    db.claim.createMany({
      data: parsed.map((s, i) => ({ itemId, participantId: s.participantId, weight: weights[i] })),
    }),
  ]);
  touch(bill);
}
