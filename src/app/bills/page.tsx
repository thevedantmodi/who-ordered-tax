import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { StatusChip } from "@/components/StatusChip";
import { AvatarStack } from "@/components/Avatar";

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
      participants: { select: { id: true, displayName: true }, orderBy: { createdAt: "asc" } },
    },
    take: 100,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-semibold">Your bills</h1>
        <Link href="/bills/new" className="btn btn-primary">
          New bill
        </Link>
      </div>

      {bills.length === 0 ? (
        <div className="card text-center">
          <p className="font-medium">No bills yet</p>
          <p className="text-sm text-muted">Create one after your next meal out.</p>
        </div>
      ) : (
        <ul className="card divide-y divide-line !p-0">
          {bills.map((b) => {
            const subtotal = b.items.reduce((a, i) => a + i.priceCents, 0);
            const href = b.ownerId === userId ? `/bills/${b.id}` : `/b/${b.shareToken}`;
            return (
              <li key={b.id}>
                <Link href={href} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-surface-2">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{b.title}</span>
                      <StatusChip status={b.status} />
                    </div>
                    <AvatarStack people={b.participants} />
                  </div>
                  <div className="money shrink-0 text-right">
                    <div className="font-semibold">{formatMoney(subtotal)}</div>
                    <div className="text-xs text-muted">before tax</div>
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
