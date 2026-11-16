"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { auth, signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { computeSplit, groupCookieName, guestCookieName, loadBillForAction } from "@/lib/bills";
import { loadGroupForAction } from "@/lib/groups";
import { parseMoney } from "@/lib/money";
import { guard, UserError } from "@/lib/action";
import { percentsToWeights } from "@/lib/split";
import { isEmoji, randomEmoji } from "@/lib/emoji";

const shareId = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);

function touch(bill: { shareToken: string; group?: { shareToken: string } | null }) {
  revalidatePath(`/b/${bill.shareToken}`);
  if (bill.group) revalidatePath(`/g/${bill.group.shareToken}`);
  revalidatePath("/bills");
}

function touchGroup(group: { shareToken: string }) {
  revalidatePath(`/g/${group.shareToken}`);
  revalidatePath("/bills");
}

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}

/** Standalone bills: only the creator. Group bills: any member of the group. */
async function requireManager(billId: string) {
  const ctx = await loadBillForAction({ id: billId });
  if (!ctx.viewer.canManage) {
    throw new UserError(ctx.bill.group ? "Join the group to edit this bill" : "Only the payer can do that");
  }
  return ctx;
}

async function setCookie(name: string, value: string) {
  (await cookies()).set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

const newSecret = () => randomBytes(24).toString("base64url");

const name = z.string().trim().min(1, "Needs a name").max(60);

// ---------- Auth ----------

export async function signInWithEmail(formData: FormData) {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) redirect("/login?error=email");
  const callbackUrl = z.string().startsWith("/").catch("/bills").parse(formData.get("callbackUrl") ?? "/bills");
  // With redirect: false, Auth.js reports failures (e.g. the email provider rejecting the send) by
  // returning a URL with ?error=… rather than throwing, so check before claiming the email went out.
  const result = await signIn("email", { email: email.data, redirectTo: callbackUrl, redirect: false });
  const failed = typeof result === "string" && new URL(result, "http://localhost").searchParams.has("error");
  if (failed) redirect(`/login?error=send&callbackUrl=${encodeURIComponent(callbackUrl)}`);
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
  redirect(`/b/${bill.shareToken}`);
}

export async function deleteBill(billId: string) {
  return guard(async () => {
    const { bill } = await requireManager(billId);
    await db.bill.delete({ where: { id: billId } });
    if (bill.group) {
      touchGroup(bill.group);
      redirect(`/g/${bill.group.shareToken}`);
    }
    revalidatePath("/bills");
    redirect("/bills");
  });
}

export async function addItem(billId: string, formData: FormData) {
  return guard(async () => {
    const { bill } = await requireManager(billId);
    const itemName = name.parse(formData.get("name"));
    const price = parseMoney(formData.get("price") as string | null);
    if (price == null || price < 0) throw new UserError("Invalid price");
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
  });
}

export async function updateItem(itemId: string, data: { name?: string; price?: string }) {
  return guard(async () => {
    const item = await db.item.findUniqueOrThrow({ where: { id: itemId } });
    const { bill } = await requireManager(item.billId);
    const priceCents = data.price !== undefined ? parseMoney(data.price) : undefined;
    if (priceCents === null || (priceCents !== undefined && priceCents < 0)) throw new UserError("Invalid price");
    await db.item.update({
      where: { id: itemId },
      data: {
        name: data.name !== undefined ? name.parse(data.name) : undefined,
        priceCents,
      },
    });
    touch(bill);
  });
}

export async function deleteItem(itemId: string) {
  return guard(async () => {
    const item = await db.item.findUniqueOrThrow({ where: { id: itemId } });
    const { bill } = await requireManager(item.billId);
    await db.item.delete({ where: { id: itemId } });
    touch(bill);
  });
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
  return guard(async () => {
    const { bill } = await requireManager(billId);
    const c = chargesSchema.parse(Object.fromEntries(formData));
    const money = (s: string) => {
      const v = parseMoney(s);
      if (v == null || v < 0) throw new UserError("Invalid amount");
      return v;
    };
    const percent = (s: string, what: string) => {
      const v = Number(s.replace(/[%\s]/g, "") || 0);
      if (!Number.isFinite(v) || v < 0 || v > 100) throw new UserError(`Invalid ${what} %`);
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
  });
}

export async function addPlaceholder(billId: string, formData: FormData) {
  return guard(async () => {
    const { bill } = await requireManager(billId);
    if (!bill.group) {
      await db.participant.create({
        data: { billId, displayName: name.parse(formData.get("name")), emoji: randomEmoji() },
      });
      touch(bill);
      return;
    }
    // Group bill: add someone already in the group, or add a new person to the group and the bill.
    const memberId = formData.get("memberId");
    let member = typeof memberId === "string" && memberId ? bill.group.members.find((m) => m.id === memberId) : undefined;
    if (typeof memberId === "string" && memberId && !member) throw new UserError("Not in this group");
    if (!member) {
      member = await db.groupMember.create({
        data: { groupId: bill.group.id, displayName: name.parse(formData.get("name")) },
        select: { id: true, userId: true, guestSecret: true, displayName: true },
      });
    }
    if (bill.participants.some((p) => p.memberId === member.id)) return;
    await db.participant.create({ data: { billId, memberId: member.id, displayName: member.displayName } });
    touch(bill);
  });
}

export async function removeParticipant(participantId: string) {
  return guard(async () => {
    const p = await db.participant.findUniqueOrThrow({ where: { id: participantId } });
    const { bill } = await requireManager(p.billId);
    if (p.isPayer) throw new UserError("The payer can't leave their own bill");
    await db.participant.delete({ where: { id: participantId } });
    touch(bill);
  });
}

export async function setPaid(participantId: string, paid: boolean) {
  return guard(async () => {
    const p = await db.participant.findUniqueOrThrow({ where: { id: participantId } });
    const { bill } = await requireManager(p.billId);
    if (bill.group) throw new UserError("Group bills are settled up in the group");
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
  });
}

export async function setStatus(billId: string, status: "OPEN" | "LOCKED") {
  return guard(async () => {
    const { bill } = await requireManager(billId);
    await db.bill.update({ where: { id: billId }, data: { status } });
    touch(bill);
  });
}

// ---------- Guests & claiming (anyone with the link) ----------

const setGuestCookie = (billId: string, secret: string) => setCookie(guestCookieName(billId), secret);
const setGroupCookie = (groupId: string, secret: string) => setCookie(groupCookieName(groupId), secret);

export async function joinBill(shareToken: string, formData: FormData) {
  return guard(async () => {
    const { bill, viewer } = await loadBillForAction({ shareToken });
    if (viewer.meId) return;
    if (bill.status !== "OPEN") throw new UserError("This bill is locked");

    const emojiRaw = formData.get("emoji");
    const emoji = isEmoji(emojiRaw) ? emojiRaw : randomEmoji();

    if (bill.group) {
      // Already in the group: just add them to this bill.
      let member = viewer.memberId ? bill.group.members.find((m) => m.id === viewer.memberId) : undefined;
      if (!member) {
        const displayName = name.parse(formData.get("name"));
        const secret = viewer.userId ? null : newSecret();
        member = await db.groupMember.create({
          data: { groupId: bill.group.id, displayName, userId: viewer.userId, guestSecret: secret },
          select: { id: true, userId: true, guestSecret: true, displayName: true },
        });
        if (secret) await setGroupCookie(bill.group.id, secret);
      }
      await db.participant.create({
        data: { billId: bill.id, memberId: member.id, userId: viewer.userId, displayName: member.displayName, emoji },
      });
      touch(bill);
      return;
    }

    const displayName = name.parse(formData.get("name"));
    if (viewer.userId) {
      await db.participant.create({ data: { billId: bill.id, userId: viewer.userId, displayName, emoji } });
    } else {
      const secret = newSecret();
      await db.participant.create({ data: { billId: bill.id, guestSecret: secret, displayName, emoji } });
      await setGuestCookie(bill.id, secret);
    }
    touch(bill);
  });
}

/** "That's me!" — take over a placeholder the payer added. */
export async function claimPlaceholder(shareToken: string, participantId: string) {
  return guard(async () => {
    const { bill, viewer } = await loadBillForAction({ shareToken });
    if (viewer.meId) return;
    const p = bill.participants.find((x) => x.id === participantId);
    if (p?.memberId && bill.group) {
      await claimMember(bill.group.id, p.memberId, viewer.userId);
      touch(bill);
      return;
    }
    if (!p || p.userId || p.guestSecret) throw new UserError("Someone already took that spot");

    if (viewer.userId) {
      await db.participant.update({ where: { id: p.id }, data: { userId: viewer.userId } });
    } else {
      const secret = newSecret();
      // updateMany with the null guard makes this race-safe.
      const res = await db.participant.updateMany({
        where: { id: p.id, userId: null, guestSecret: null },
        data: { guestSecret: secret },
      });
      if (res.count === 0) throw new UserError("Someone already took that spot");
      await setGuestCookie(bill.id, secret);
    }
    touch(bill);
  });
}

/**
 * Claim or unclaim an item for a participant. Guests may only change their own claims while the
 * bill is open; the payer can change anyone's. A custom split (e.g. 20/80) only makes sense for the
 * people it was set for, so whenever the group on an item changes, it resets to an even split.
 */
export async function setClaim(itemId: string, participantId: string, claimed: boolean) {
  return guard(async () => {
    const item = await db.item.findUniqueOrThrow({ where: { id: itemId }, include: { claims: true } });
    const { bill, viewer } = await loadBillForAction({ id: item.billId });

    if (!bill.participants.some((p) => p.id === participantId)) throw new UserError("Not on this bill");
    const allowed = viewer.canManage || (viewer.meId === participantId && bill.status === "OPEN");
    if (!allowed) throw new UserError("You can only claim your own items");

    const has = item.claims.some((c) => c.participantId === participantId);
    if (has === claimed) return;

    await db.$transaction([
      claimed
        ? db.claim.create({ data: { itemId, participantId, weight: 1 } })
        : db.claim.delete({ where: { itemId_participantId: { itemId, participantId } } }),
      db.claim.updateMany({ where: { itemId }, data: { weight: 1 } }),
    ]);
    touch(bill);
  });
}

const itemSplitSchema = z
  .array(z.object({ participantId: z.string().min(1), percent: z.number().positive().max(100) }))
  .min(1)
  .max(100);

/**
 * Split an item between specific people by percentage, e.g. 20% / 80%. The payer can do this any
 * time; anyone who has joined the bill can do it while it's open (same rule as claiming).
 */
export async function setItemSplit(itemId: string, shares: { participantId: string; percent: number }[]) {
  return guard(async () => {
    const item = await db.item.findUniqueOrThrow({ where: { id: itemId } });
    const { bill, viewer } = await loadBillForAction({ id: item.billId });
    const allowed = viewer.canManage || (viewer.meId !== null && bill.status === "OPEN");
    if (!allowed) throw new UserError(bill.status === "OPEN" ? "Join the bill to split items" : "This bill is locked");
    const parsed = itemSplitSchema.parse(shares);

    const onBill = new Set(bill.participants.map((p) => p.id));
    if (parsed.some((s) => !onBill.has(s.participantId))) throw new UserError("Not on this bill");
    if (new Set(parsed.map((s) => s.participantId)).size !== parsed.length) throw new UserError("Someone is listed twice");
    const total = parsed.reduce((a, s) => a + s.percent, 0);
    if (Math.abs(total - 100) > 0.01) throw new UserError("Shares must add up to 100%");
    const weights = percentsToWeights(parsed.map((s) => s.percent));
    if (weights.some((w) => w < 1)) throw new UserError("Each share must be at least 0.01%");

    await db.$transaction([
      db.claim.deleteMany({ where: { itemId } }),
      db.claim.createMany({
        data: parsed.map((s, i) => ({ itemId, participantId: s.participantId, weight: weights[i] })),
      }),
    ]);
    touch(bill);
  });
}

// ---------- Groups ----------

/** "That's me": take over a group member nobody has claimed yet (race-safe). */
async function claimMember(groupId: string, memberId: string, userId: string | null) {
  if (userId) {
    const taken = await db.groupMember.findFirst({ where: { groupId, userId } });
    if (taken) throw new UserError("You're already in this group");
    const res = await db.groupMember.updateMany({
      where: { id: memberId, groupId, userId: null, guestSecret: null },
      data: { userId },
    });
    if (res.count === 0) throw new UserError("Someone already took that spot");
  } else {
    const secret = newSecret();
    const res = await db.groupMember.updateMany({
      where: { id: memberId, groupId, userId: null, guestSecret: null },
      data: { guestSecret: secret },
    });
    if (res.count === 0) throw new UserError("Someone already took that spot");
    await setGroupCookie(groupId, secret);
  }
}

async function requireMember(groupToken: string) {
  const ctx = await loadGroupForAction({ shareToken: groupToken });
  if (!ctx.member) throw new UserError("Join the group first");
  return { ...ctx, member: ctx.member };
}

async function displayNameFor(userId: string) {
  const me = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return me.name ?? me.email?.split("@")[0] ?? "Me";
}

export async function createGroup(formData: FormData) {
  const user = await requireUser();
  const groupName = name.safeParse(formData.get("name"));
  if (!groupName.success) redirect("/groups/new?error=name");
  const group = await db.group.create({
    data: {
      name: groupName.data,
      shareToken: shareId(),
      createdById: user.id,
      members: { create: { userId: user.id, displayName: await displayNameFor(user.id) } },
    },
  });
  redirect(`/g/${group.shareToken}`);
}

export async function joinGroup(groupToken: string, formData: FormData) {
  return guard(async () => {
    const { group, userId, member } = await loadGroupForAction({ shareToken: groupToken });
    if (member) return;
    const displayName = name.parse(formData.get("name"));
    const secret = userId ? null : newSecret();
    await db.groupMember.create({ data: { groupId: group.id, displayName, userId, guestSecret: secret } });
    if (secret) await setGroupCookie(group.id, secret);
    touchGroup(group);
  });
}

export async function claimGroupMember(groupToken: string, memberId: string) {
  return guard(async () => {
    const { group, userId, member } = await loadGroupForAction({ shareToken: groupToken });
    if (member) return;
    await claimMember(group.id, memberId, userId);
    touchGroup(group);
  });
}

export async function addGroupMember(groupToken: string, formData: FormData) {
  return guard(async () => {
    const { group } = await requireMember(groupToken);
    await db.groupMember.create({ data: { groupId: group.id, displayName: name.parse(formData.get("name")) } });
    touchGroup(group);
  });
}

export async function setSimplifyDebts(groupToken: string, simplify: boolean) {
  return guard(async () => {
    const { group } = await requireMember(groupToken);
    await db.group.update({ where: { id: group.id }, data: { simplifyDebts: simplify } });
    touchGroup(group);
  });
}

/** An itemized bill in the group: everyone in the group is on it, and whoever adds it paid. */
export async function createGroupBill(groupToken: string, formData: FormData) {
  return guard(async () => {
    const { group, userId, member } = await requireMember(groupToken);
    const title = name.parse(formData.get("title"));
    const merchant = z.string().trim().max(80).optional().parse(formData.get("merchant") || undefined);
    const bill = await db.bill.create({
      data: {
        ownerId: userId,
        groupId: group.id,
        title,
        merchant,
        shareToken: shareId(),
        participants: {
          create: group.members.map((m) => ({
            memberId: m.id,
            userId: m.userId,
            displayName: m.displayName,
            isPayer: m.id === member.id,
          })),
        },
      },
    });
    touchGroup(group);
    redirect(`/b/${bill.shareToken}`);
  });
}

const quickExpenseSchema = z.object({
  title: name,
  amount: z.string(),
  paidBy: z.string().min(1),
  split: z.array(z.string().min(1)).min(1, "Pick who it's split between"),
});

/** A no-receipt expense ("Uber $30, paid by Sam, split between all of us"): a one-line bill. */
export async function createQuickExpense(groupToken: string, formData: FormData) {
  return guard(async () => {
    const { group, userId } = await requireMember(groupToken);
    const q = quickExpenseSchema.parse({
      title: formData.get("title"),
      amount: formData.get("amount"),
      paidBy: formData.get("paidBy"),
      split: formData.getAll("split"),
    });
    const amount = parseMoney(q.amount);
    if (amount == null || amount <= 0) throw new UserError("Enter an amount");
    const ids = new Set(group.members.map((m) => m.id));
    if (!ids.has(q.paidBy) || q.split.some((id) => !ids.has(id))) throw new UserError("Not in this group");

    const people = group.members.filter((m) => m.id === q.paidBy || q.split.includes(m.id));
    const bill = await db.bill.create({
      data: {
        ownerId: userId,
        groupId: group.id,
        title: q.title,
        shareToken: shareId(),
        participants: {
          create: people.map((m) => ({
            memberId: m.id,
            userId: m.userId,
            displayName: m.displayName,
            isPayer: m.id === q.paidBy,
          })),
        },
      },
      include: { participants: true },
    });
    await db.item.create({
      data: {
        billId: bill.id,
        name: q.title,
        priceCents: amount,
        claims: {
          create: bill.participants
            .filter((p) => p.memberId && q.split.includes(p.memberId))
            .map((p) => ({ participantId: p.id, weight: 1 })),
        },
      },
    });
    touchGroup(group);
  });
}

/** Group bills: who actually paid at the register. */
export async function setPayer(billId: string, participantId: string) {
  return guard(async () => {
    const { bill } = await requireManager(billId);
    if (!bill.group) throw new UserError("Only group bills can change who paid");
    if (!bill.participants.some((p) => p.id === participantId)) throw new UserError("Not on this bill");
    await db.$transaction([
      db.participant.updateMany({ where: { billId }, data: { isPayer: false } }),
      db.participant.update({ where: { id: participantId }, data: { isPayer: true } }),
    ]);
    touch(bill);
  });
}

export async function recordPayment(
  groupToken: string,
  payment: { fromMemberId: string; toMemberId: string; amount: string },
) {
  return guard(async () => {
    const { group } = await requireMember(groupToken);
    const ids = new Set(group.members.map((m) => m.id));
    if (!ids.has(payment.fromMemberId) || !ids.has(payment.toMemberId)) throw new UserError("Not in this group");
    if (payment.fromMemberId === payment.toMemberId) throw new UserError("Pick two different people");
    const amountCents = parseMoney(payment.amount);
    if (amountCents == null || amountCents <= 0) throw new UserError("Enter an amount");
    await db.payment.create({
      data: { groupId: group.id, fromMemberId: payment.fromMemberId, toMemberId: payment.toMemberId, amountCents },
    });
    touchGroup(group);
  });
}

export async function deletePayment(paymentId: string) {
  return guard(async () => {
    const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { group: true } });
    const { group } = await requireMember(payment.group.shareToken);
    await db.payment.delete({ where: { id: paymentId } });
    touchGroup(group);
  });
}

/**
 * Move a standalone bill into a group. Each person on the bill is matched to a group member (or added
 * as a new one). Anyone already marked as paid on the bill becomes a recorded payment, so the group
 * balance doesn't count their share twice.
 */
export async function moveBillToGroup(billId: string, groupId: string, mapping: Record<string, string>) {
  return guard(async () => {
    const user = await requireUser();
    const { bill } = await loadBillForAction({ id: billId });
    if (bill.ownerId !== user.id) throw new UserError("Only the payer can move this bill");
    if (bill.group) throw new UserError("This bill is already in a group");
    const { group } = await loadGroupForAction({ id: groupId });
    if (!group.members.some((m) => m.userId === user.id)) throw new UserError("You're not in that group");

    const memberIds = new Set(group.members.map((m) => m.id));
    const chosen = new Set<string>();
    for (const p of bill.participants) {
      const target = mapping[p.id];
      if (!target) throw new UserError(`Pick who ${p.displayName} is in the group`);
      if (target === "new") continue;
      if (!memberIds.has(target)) throw new UserError("Not in this group");
      if (chosen.has(target)) throw new UserError("Two people can't be the same group member");
      chosen.add(target);
      // Someone with an account must map to their own member if they're already in the group.
      const own = p.userId ? group.members.find((m) => m.userId === p.userId) : undefined;
      if (own && own.id !== target) throw new UserError(`${p.displayName} is already in the group as ${own.displayName}`);
    }

    const split = computeSplit(bill);
    const totalFor = new Map(split.shares.map((s) => [s.participantId, s.totalCents]));

    await db.$transaction(async (tx) => {
      const memberFor = new Map<string, string>();
      for (const p of bill.participants) {
        let target = mapping[p.id];
        if (target === "new") {
          const own = p.userId ? group.members.find((m) => m.userId === p.userId) : undefined;
          target =
            own?.id ??
            (await tx.groupMember.create({ data: { groupId: group.id, displayName: p.displayName, userId: p.userId } })).id;
        }
        memberFor.set(p.id, target);
        await tx.participant.update({ where: { id: p.id }, data: { memberId: target, paidAt: null } });
      }
      const payer = bill.participants.find((p) => p.isPayer);
      if (payer) {
        for (const p of bill.participants) {
          const cents = totalFor.get(p.id) ?? 0;
          if (p.isPayer || !p.paidAt || cents <= 0) continue;
          await tx.payment.create({
            data: {
              groupId: group.id,
              fromMemberId: memberFor.get(p.id)!,
              toMemberId: memberFor.get(payer.id)!,
              amountCents: cents,
              note: `Paid back for ${bill.title}`,
            },
          });
        }
      }
      await tx.bill.update({
        where: { id: bill.id },
        data: { groupId: group.id, status: bill.status === "SETTLED" ? "LOCKED" : bill.status },
      });
    });
    touch({ shareToken: bill.shareToken, group: { shareToken: group.shareToken } });
  });
}
