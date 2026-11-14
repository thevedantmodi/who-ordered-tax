import "server-only";
import { randomUUID } from "node:crypto";
import { customAlphabet } from "nanoid";
import { db } from "@/lib/db";

/**
 * Demo accounts: one-click, no email. Each visitor gets a fresh private user
 * seeded with sample bills. Demo users are recognised by this reserved
 * (never-deliverable) email domain and are deleted after DEMO_TTL_MS.
 */
export const DEMO_DOMAIN = "demo.whoorderedtax.invalid";
const DEMO_TTL_MS = 24 * 60 * 60 * 1000;
const shareId = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);

/** On unless explicitly turned off with DEMO_ENABLED=false. */
export function demoEnabled() {
  return process.env.DEMO_ENABLED !== "false";
}

export function isDemoEmail(email: string | null | undefined) {
  return Boolean(email?.endsWith(`@${DEMO_DOMAIN}`));
}

/** Delete demo users (and, via cascade, their bills and sessions) past their TTL. */
export async function cleanupDemoAccounts() {
  await db.user.deleteMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` }, createdAt: { lt: new Date(Date.now() - DEMO_TTL_MS) } },
  });
}

type SeedItem = { name: string; price: number; who: Record<string, number> };

async function seedBill(
  ownerId: string,
  data: {
    title: string;
    merchant: string;
    daysAgo: number;
    taxCents?: number;
    taxPercent?: number;
    tip: { mode: "AMOUNT" | "PERCENT_PRE_TAX" | "PERCENT_POST_TAX"; cents?: number; percent?: number };
    feesCents?: number;
    friends: string[];
    items: SeedItem[];
    paid?: string[];
    status?: "OPEN" | "LOCKED" | "SETTLED";
  },
) {
  const bill = await db.bill.create({
    data: {
      ownerId,
      title: data.title,
      merchant: data.merchant,
      date: new Date(Date.now() - data.daysAgo * 86_400_000),
      shareToken: shareId(),
      status: data.status ?? "OPEN",
      taxMode: data.taxPercent ? "PERCENT" : "AMOUNT",
      taxCents: data.taxCents ?? 0,
      taxPercent: data.taxPercent ?? 0,
      tipMode: data.tip.mode,
      tipCents: data.tip.cents ?? 0,
      tipPercent: data.tip.percent ?? 0,
      feesCents: data.feesCents ?? 0,
      participants: {
        create: [
          { userId: ownerId, displayName: "Alex", isPayer: true },
          ...data.friends.map((name) => ({
            displayName: name,
            paidAt: data.paid?.includes(name) ? new Date() : null,
          })),
        ],
      },
    },
    include: { participants: true },
  });

  const idFor = new Map(bill.participants.map((p) => [p.displayName, p.id]));
  for (const [position, item] of data.items.entries()) {
    await db.item.create({
      data: {
        billId: bill.id,
        name: item.name,
        priceCents: item.price,
        position,
        claims: {
          create: Object.entries(item.who).map(([name, weight]) => ({ participantId: idFor.get(name)!, weight })),
        },
      },
    });
  }
  return bill;
}

/** Create a demo user with sample data and a database session. Returns the session token and the bill to open. */
export async function createDemoAccount() {
  const user = await db.user.create({
    data: { name: "Alex", email: `demo-${randomUUID()}@${DEMO_DOMAIN}` },
  });

  const dinner = await seedBill(user.id, {
    title: "Taco Tuesday",
    merchant: "Los Hermanos",
    daysAgo: 0,
    taxPercent: 8.875,
    tip: { mode: "PERCENT_PRE_TAX", percent: 20 },
    friends: ["Sam", "Priya", "Jordan"],
    items: [
      { name: "Carne asada plate", price: 1800, who: { Alex: 1 } },
      { name: "Fish tacos", price: 1650, who: { Priya: 1 } },
      { name: "Veggie burrito", price: 1400, who: { Jordan: 1 } },
      { name: "Loaded nachos", price: 1400, who: { Alex: 2000, Jordan: 8000 } },
      { name: "Guacamole", price: 1200, who: { Alex: 1, Priya: 1, Sam: 2 } },
      { name: "Margarita", price: 1100, who: { Priya: 1 } },
      { name: "Margarita", price: 1100, who: { Sam: 1 } },
      { name: "Margarita", price: 1100, who: {} },
      { name: "Churros", price: 900, who: {} },
    ],
  });

  await seedBill(user.id, {
    title: "Groceries for the cabin",
    merchant: "Trader Joe's",
    daysAgo: 6,
    taxCents: 412,
    tip: { mode: "AMOUNT", cents: 0 },
    feesCents: 599,
    friends: ["Sam", "Jordan"],
    paid: ["Sam", "Jordan"],
    status: "SETTLED",
    items: [
      { name: "Coffee beans", price: 1099, who: { Alex: 1, Sam: 1, Jordan: 1 } },
      { name: "Oat milk", price: 449, who: { Alex: 1, Jordan: 1 } },
      { name: "Steaks", price: 2899, who: { Alex: 1, Sam: 1 } },
      { name: "Pancake mix", price: 399, who: { Alex: 1, Sam: 1, Jordan: 1 } },
      { name: "Kombucha", price: 799, who: { Jordan: 1 } },
    ],
  });

  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + DEMO_TTL_MS);
  await db.session.create({ data: { sessionToken, userId: user.id, expires } });

  return { sessionToken, expires, billId: dinner.id };
}
