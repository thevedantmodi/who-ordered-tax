import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { loadMyGroups } from "@/lib/groups";
import { StatusChip } from "@/components/StatusChip";
import { AvatarStack } from "@/components/Avatar";

export const metadata = { title: "Your bills" };

export default async function Bills({ searchParams }: PageProps<"/bills">) {
  const session = await getSession();
  if (!session) redirect("/login?callbackUrl=/bills");
  const userId = session.user.id;
  const tab = (await searchParams).tab === "groups" ? "groups" : "bills";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-semibold">{tab === "groups" ? "Your groups" : "Your bills"}</h1>
        <Link href={tab === "groups" ? "/groups/new" : "/bills/new"} className="btn btn-primary">
          {tab === "groups" ? "New group" : "New bill"}
        </Link>
      </div>

      <nav className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-medium">
        {(
          [
            ["bills", "Bills", "/bills"],
            ["groups", "Groups", "/bills?tab=groups"],
          ] as const
        ).map(([key, text, href]) => (
          <Link
            key={key}
            href={href}
            aria-current={tab === key ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-center transition-colors ${tab === key ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}
          >
            {text}
          </Link>
        ))}
      </nav>

      {tab === "groups" ? <GroupsList userId={userId} /> : <BillsList userId={userId} />}
    </div>
  );
}

async function BillsList({ userId }: { userId: string }) {
  const bills = await db.bill.findMany({
    where: { OR: [{ ownerId: userId }, { participants: { some: { userId } } }, { group: { members: { some: { userId } } } }] },
    orderBy: { createdAt: "desc" },
    include: {
      items: { select: { priceCents: true } },
      participants: { select: { id: true, displayName: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      group: { select: { name: true } },
    },
    take: 100,
  });

  if (bills.length === 0) {
    return (
      <div className="card text-center">
        <p className="font-medium">No bills yet</p>
        <p className="text-sm text-muted">Create one after your next meal out.</p>
      </div>
    );
  }
  return (
    <ul className="card divide-y divide-line !p-0">
      {bills.map((b) => {
        const subtotal = b.items.reduce((a, i) => a + i.priceCents, 0);
        return (
          <li key={b.id}>
            <Link href={`/b/${b.shareToken}`} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-surface-2">
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{b.title}</span>
                  {b.group ? <span className="chip shrink-0">{b.group.name}</span> : <StatusChip status={b.status} />}
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
  );
}

async function GroupsList({ userId }: { userId: string }) {
  const groups = await loadMyGroups(userId);
  if (groups.length === 0) {
    return (
      <div className="card space-y-1 text-center">
        <p className="font-medium">No groups yet</p>
        <p className="text-sm text-muted">
          Make one for a trip or your roommates: add bills as you go and settle up in as few payments as possible.
        </p>
      </div>
    );
  }
  return (
    <ul className="card divide-y divide-line !p-0">
      {groups.map((g) => (
        <li key={g.shareToken}>
          <Link href={`/g/${g.shareToken}`} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-surface-2">
            <div className="min-w-0 space-y-1.5">
              <span className="block truncate font-medium">{g.name}</span>
              <AvatarStack people={g.members} />
            </div>
            <div className="money shrink-0 text-right">
              <div className={`font-semibold ${g.yourBalanceCents > 0 ? "text-accent" : ""}`}>
                {g.yourBalanceCents === 0 ? "Settled" : formatMoney(Math.abs(g.yourBalanceCents))}
              </div>
              <div className="text-xs text-muted">
                {g.yourBalanceCents > 0 ? "you're owed" : g.yourBalanceCents < 0 ? "you owe" : "all square"}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
