"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import type { BillDTO } from "@/lib/bills";
import { joinBill, moveBillToGroup, setPayer } from "@/app/actions";
import { personColor } from "@/components/Avatar";

type Bill = NonNullable<BillDTO>;

function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        after?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };
  return { pending, error, run };
}

/** Link back to the group, shown at the top of group bills. */
export function GroupCrumb({ group }: { group: NonNullable<Bill["group"]> }) {
  return (
    <Link href={`/g/${group.shareToken}`} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-fg">
      ‹ {group.name}
    </Link>
  );
}

/** Group bills: pick who actually paid. */
export function PaidByCard({ bill }: { bill: Bill }) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Move the checkmark immediately; the server confirms in the background.
  const [payerId, setPayerId] = useOptimistic(bill.participants.find((p) => p.isPayer)?.id ?? null);
  const choose = (id: string) => {
    if (id === payerId) return;
    setError(null);
    startTransition(async () => {
      setPayerId(id);
      try {
        await setPayer(bill.id, id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };
  return (
    <div className="card space-y-3">
      <div>
        <h2 className="section-title">Paid by</h2>
        <p className="text-sm text-muted">Whoever paid is owed everyone else&apos;s share in the group balance.</p>
      </div>
      <div className="flex flex-wrap gap-2 p-1">
        {bill.participants.map((p) => (
          <button
            key={p.id}
            aria-pressed={payerId === p.id}
            onClick={() => choose(p.id)}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium transition ${personColor(p.color)} ${
              payerId === p.id ? "ring-2 ring-current ring-offset-2 ring-offset-bg" : "opacity-60 hover:opacity-100"
            }`}
          >
            {payerId === p.id && <span aria-hidden>✓</span>}
            {p.id === bill.viewer.meId ? "Me" : p.displayName}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

/** A group member looking at a group bill they're not on yet. */
export function AddMeBanner({ bill }: { bill: Bill }) {
  const { pending, error, run } = useAction();
  return (
    <div className="card flex items-center justify-between gap-3">
      <p className="text-sm">You&apos;re in {bill.group?.name} but not on this bill.</p>
      <button disabled={pending} onClick={() => run(() => joinBill(bill.shareToken, new FormData()))} className="btn btn-primary shrink-0">
        Add me
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

type MoveGroup = { id: string; name: string; members: { id: string; displayName: string; isYou: boolean }[] };

/** Standalone bills: move into one of your groups, matching each person to a group member. */
export function MoveToGroupCard({ bill, groups }: { bill: Bill; groups: MoveGroup[] }) {
  const { pending, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const group = groups.find((g) => g.id === groupId);

  // Best guess: the payer is you; everyone else matches a member with the same name, or is new.
  const guess = (g: MoveGroup | undefined) =>
    Object.fromEntries(
      bill.participants.map((p) => {
        const you = p.isPayer ? g?.members.find((m) => m.isYou) : undefined;
        const byName = g?.members.find((m) => m.displayName.trim().toLowerCase() === p.displayName.trim().toLowerCase());
        return [p.id, (you ?? byName)?.id ?? "new"];
      }),
    );
  const [mapping, setMapping] = useState<Record<string, string>>(() => guess(group));

  if (groups.length === 0) return null;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-secondary w-full">
        Move to a group…
      </button>
    );
  }

  const used = Object.values(mapping).filter((v) => v !== "new");
  const duplicate = used.length !== new Set(used).size;

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="section-title">Move to a group</h2>
        <p className="text-sm text-muted">
          The bill joins the group&apos;s balance. Anyone already marked as paid is recorded as a payment.
        </p>
      </div>
      <label className="block">
        <span className="label">Group</span>
        <select
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value);
            setMapping(guess(groups.find((g) => g.id === e.target.value)));
          }}
          className="input"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-2">
        <span className="label">Who is who in the group</span>
        {bill.participants.map((p) => (
          <div key={p.id} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.displayName}</span>
            <select
              value={mapping[p.id] ?? "new"}
              onChange={(e) => setMapping({ ...mapping, [p.id]: e.target.value })}
              aria-label={`Group member for ${p.displayName}`}
              className="input !w-48 !py-1.5 text-sm"
            >
              <option value="new">Add as new member</option>
              {group?.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                  {m.isYou ? " (you)" : ""}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {duplicate && <p className="text-sm text-warn-fg">Two people are matched to the same group member.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="btn btn-secondary flex-1">
          Cancel
        </button>
        <button
          disabled={pending || duplicate || !group}
          onClick={() => run(() => moveBillToGroup(bill.id, groupId, mapping))}
          className="btn btn-primary flex-1"
        >
          {pending ? "Moving…" : `Move to ${group?.name ?? "group"}`}
        </button>
      </div>
    </div>
  );
}
