import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { StatusChip } from "@/components/StatusChip";

export const metadata = { title: "Your bills" };

export default async function Bills() {
  const session = await getSession();
  if (!session) redirect("/login?callbackUrl=/bills");
  const userId = session.user.id;

  const bills = await db.bill.findMany({
    where: { OR: [{ ownerId: userId }, { participants: { some: { userId } } }] },
    orderBy: { createdAt: "desc" },
    include: {
      items: { select: { priceCents: true } },
      participants: { select: { emoji: true } },
    },
    take: 100,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-3xl font-extrabold">Your bills</h1>
        <Link href="/bills/new" className="btn btn-pink">
          + New
        </Link>
      </div>

      {bills.length === 0 ? (
        <div className="card text-center">
          <div className="mb-2 text-5xl">🍽️</div>
          <p className="font-bold">No bills yet.</p>
          <p className="text-muted">Go eat something, then come back.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {bills.map((b) => {
            const subtotal = b.items.reduce((a, i) => a + i.priceCents, 0);
            const href = b.ownerId === userId ? `/bills/${b.id}` : `/b/${b.shareToken}`;
            return (
              <li key={b.id}>
                <Link href={href} className="card flex items-center justify-between gap-3 !p-4 hover:-translate-y-0.5 transition-transform">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-extrabold">{b.title}</div>
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <span>{b.participants.map((p) => p.emoji).join("")}</span>
                      <StatusChip status={b.status} />
                    </div>
                  </div>
                  <div className="money shrink-0 text-right">
                    <div className="text-xs font-bold uppercase text-muted">items</div>
                    <div className="text-lg font-extrabold">{formatMoney(subtotal)}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
