# Who Ordered Tax? — Product Spec

> Splitwise, but the bill splits itself. Nobody ordered tax, so everybody pays their fair share of it.

**Platform:** PWA (mobile-first web, installable) · **Market:** US · **Vibe:** playful, loud, a little cheeky

## The problem we're attacking

| Splitwise pain | Our answer |
| --- | --- |
| Itemized bills are tedious; tax/tip math is done by hand or fudged with an even split | Itemize once; tax, tip, fees and discounts are allocated proportionally and to the exact cent |
| Everyone needs an account to participate | Guests join a bill from a link with just a name — only the payer signs in |
| One person ends up as the group accountant | Everyone claims their own items from their own phone |
| Paywalls on daily expenses, receipt scanning, charts | Core flow is free, forever |
| Nagging friends is awkward | The app does the nagging (v2) |

## Core loop (MVP — this milestone)

1. **Payer signs in** (magic link or Google) and creates a bill.
2. **Itemize**: add line items with prices, then tax, tip (amount, % pre-tax or % post-tax), fees and discounts.
3. **Share link**: `/b/<token>` — anyone with it can join with a name and an emoji, no account.
4. **Tap your items**: tap to claim; shared items (the nachos) split evenly between everyone who tapped. Claims support weights (I had 2 of the 3 beers).
5. **Live breakdown**: each person sees items + their share of tax, tip, fees, discount = total owed, live.
6. **Settle**: payer marks people paid; bill auto-flips to settled when everyone is square.

### Split rules (the "who ordered tax" engine)

- All money is integer cents. Every allocation uses largest-remainder rounding, so **per-person totals always sum exactly to the receipt total** — no orphan pennies.
- Item cost is split among claimants by weight.
- Tax, tip, discount: proportional to each person's item subtotal.
- Fees: proportional (default) or split evenly (e.g. a flat delivery fee).
- Tip modes: fixed amount, % of pre-tax subtotal, % of post-tax total.
- Unclaimed items: split evenly among everyone (default) or left on the payer — the bill shows a loud "🚨 unclaimed" banner either way.

## v2 — Groups & balances

- Groups (roommates, trips) with running balances across bills
- Debt simplification (opt-in; some people prefer pairwise)
- Recurring expenses (rent, utilities, subscriptions) with weighted splits (room size, income ratio, nights stayed)
- Trip mode: budget, daily spend, multi-currency at the date-of-expense rate, end-of-trip settle-up
- Non-receipt expenses: "Uber 34 split with Sam and Priya" natural-language entry

## v3 — The magic

- **Receipt scanning**: photo → LLM extracts items, tax, tip, fees → review & fix → share
- Forward a receipt email to create a bill
- Payment deep links (Venmo / Cash App / PayPal / Zelle) with amount + memo prefilled — deferred for now
- Auto-reminders sent *by the app*, with an opt-in escalating sass level
- Push notifications (PWA, iOS 16.4+ when installed)

## Playful layer (sprinkled throughout)

- Emoji avatars, bold colors, chunky cards, cheeky copy
- Badges: "Ordered Zero Tax" (paid exactly their share), "Biggest Appetite", "Nacho Diplomat" (most shared items), "Ghost" (never claimed anything)
- Trip/year wrap-up à la Spotify Wrapped
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
