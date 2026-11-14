# 🧾 Who Ordered Tax?

Splitwise, but the bill splits itself. Itemize a receipt, drop a link in the group chat, and everyone taps what they had. Tax, tip, fees and discounts get split by what each person ordered, to the exact cent.

See [`docs/PRODUCT.md`](docs/PRODUCT.md) for the product spec and roadmap.

## What works today

- Magic-link email sign-in (plus Google, if configured). Only the payer needs an account.
- Create a bill, add items (with quantity), and set tax, tip ($ / % pre-tax / % post-tax), fees (proportional or even), discount, and an unclaimed-items policy.
- Share link `/b/<token>`: guests join with just a name, no account, or pick a placeholder the payer added ("I'm Sam").
- Tap to claim items. Shared items split evenly, or the payer can set an uneven split by percentage (e.g. 20% / 80%). Live updates via polling.
- Per-person breakdown. The payer marks people paid, and the bill auto-settles when everyone has paid.
- Installable PWA (manifest, icons, service worker with offline page).

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind v4 · Prisma 6 + Postgres · Auth.js v5 · Vitest

## Getting started

```bash
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET (openssl rand -base64 32)
npm install
npx prisma migrate dev
npm run dev
```

Without `RESEND_API_KEY`, magic links are printed to the server console.

## Scripts

| | |
| --- | --- |
| `npm run dev` | dev server |
| `npm test` | split-engine unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint |
| `npm run build` | production build |

## Code map

- `src/lib/split.ts`: the pure split engine (largest-remainder rounding, so totals always reconcile). Tests live in `split.test.ts`.
- `src/lib/bills.ts`: loads bills, works out who's viewing (owner / participant / stranger), builds the client-safe DTO.
- `src/app/actions.ts`: every mutation as a Server Action, each with its own authorization check.
- `src/app/bills/[id]`: payer editor. `src/app/b/[token]`: guest claim page.
