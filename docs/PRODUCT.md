# Who Ordered The Tax? — Product Spec

> Splitwise, but the bill splits itself. Everyone pays for what they ordered, plus their fair share of tax and tip.

**Platform:** PWA (mobile-first web, installable) · **Market:** US · **Vibe:** calm, clean, trustworthy (it handles money): neutral surfaces, one green accent, plain language

## The problem we're attacking

| Splitwise pain | Our answer |
| --- | --- |
| Itemized bills are tedious; tax/tip math is done by hand or fudged with an even split | Itemize once; tax, tip, fees and discounts are allocated proportionally and to the exact cent |
| Everyone needs an account to participate | Guests join a bill from a link with just a name — only the payer signs in |
| One person ends up as the group accountant | Everyone claims their own items from their own phone |
| Paywalls on daily expenses, receipt scanning, charts | Core flow is free, forever |
| Nagging friends is awkward | The app sends reminders (v2) |

## Core loop (MVP — this milestone)

1. **Payer signs in** (magic link or Google) and creates a bill.
2. **Itemize**: add line items with prices, then tax, tip (amount, % pre-tax or % post-tax), fees and discounts.
3. **Share link**: `/b/<token>` — anyone with it can join with just a name, no account.
4. **Select your items**: tap to claim; shared items (the nachos) split evenly between everyone who tapped. Anyone on the bill can split an item by percentage while it's open (I had 20% of the nachos, John had 80%); changing who shared an item resets it to even.
5. **Live breakdown**: each person sees items + their share of tax, tip, fees, discount = total owed, live.
6. **Settle**: payer marks people paid; bill auto-flips to settled when everyone is square.

### Split rules (the "who ordered the tax?" engine)

- All money is integer cents. Every allocation uses largest-remainder rounding, so **per-person totals always sum exactly to the receipt total** — no orphan pennies.
- Item cost is split among claimants by weight.
- Tax, tip, discount: proportional to each person's item subtotal.
- Fees: proportional (default) or split evenly (e.g. a flat delivery fee).
- Tip modes: fixed amount, % of pre-tax subtotal, % of post-tax total.
- Unclaimed items: split evenly among everyone (default) or left on the payer — the bill shows an "unclaimed" notice either way.

## Groups (shipped)

A group is a set of people sharing expenses over time (a trip, roommates). Bills go into the group and
everyone keeps a running balance; **Settle up** lists the payments that clear it.

- **Group link** `/g/<token>`: join once with a name (no account). Members are recognised on every
  group bill, by account or a per-group guest cookie.
- **Anyone in the group** can add bills (itemized or a quick "Uber $30, split evenly" expense), edit
  group bills, set **Paid by**, and record payments (partial amounts OK, with undo).
- **Balances**: each group bill's per-person totals (the same split engine as standalone bills) are
  owed to whoever paid; recorded payments move money back.
- **Simplify debts** (per-group setting, on by default): settle in the fewest payments (greedy
  largest-debtor/largest-creditor, at most n−1). Off: everyone pays back the people they shared bills
  with, netted per pair.
- **Move a bill into a group**: match each person to a group member (or add them). Anyone already
  marked paid on the bill becomes a recorded payment so nothing is counted twice.
- Group bills have no per-bill "mark as paid" or lock; standalone bills work as before.
- Creating a group needs an account; members can be guests.

### Later
- Recurring expenses (rent, utilities, subscriptions) with weighted splits (room size, nights stayed)
- Trip mode: budget, daily spend, multi-currency, end-of-trip summary
- Bills with more than one payer (enter as two expenses for now)
- Removing members, deleting groups

## v3 — The magic

- **Receipt scanning**: photo → LLM extracts items, tax, tip, fees → review & fix → share
- Forward a receipt email to create a bill
- Payment deep links (Venmo / Cash App / PayPal / Zelle) with amount + memo prefilled — deferred for now
- Auto-reminders sent *by the app*, so nobody has to be the one asking
- Push notifications (PWA, iOS 16.4+ when installed)

## Delight, in moderation

Kept subtle so the product reads as trustworthy:

- Optional per-bill fun stats (biggest spender, most shared plates), off by default
- Year-in-review summary
- Non-money IOUs ("you owe me a coffee")

## Explicit non-goals (for now)

- Moving money / holding funds
- Native apps
- Business expense management

## Tech

- Next.js (App Router) + TypeScript + Tailwind
- Postgres + Prisma
- Auth.js (email magic link + Google), database sessions
- Guests are identified per-bill by an httpOnly cookie holding a random secret
- Pure, unit-tested split engine in `src/lib/split.ts`
