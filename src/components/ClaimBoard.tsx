"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { BillDTO } from "@/lib/bills";
import { deleteItem, setClaim } from "@/app/actions";
import { formatMoney } from "@/lib/money";
import { Avatar } from "@/components/Avatar";

type Bill = NonNullable<BillDTO>;
type OptimisticClaim = { itemId: string; participantId: string; weight: number };

export function ClaimBoard({ bill, mode }: { bill: Bill; mode: "owner" | "guest" }) {
  const meId = bill.viewer.meId;
  const [actingId, setActingId] = useState<string | null>(meId);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [items, applyOptimistic] = useOptimistic(bill.items, (state, c: OptimisticClaim) =>
    state.map((it) => {
      if (it.id !== c.itemId) return it;
      const others = it.claims.filter((x) => x.participantId !== c.participantId);
      return { ...it, claims: c.weight > 0 ? [...others, { participantId: c.participantId, weight: c.weight }] : others };
    }),
  );

  const canEdit = mode === "owner" || (meId !== null && bill.status === "OPEN");
  const people = new Map(bill.participants.map((p) => [p.id, p]));

  function change(itemId: string, weight: number) {
    if (!actingId || !canEdit) return;
    setError(null);
    startTransition(async () => {
      applyOptimistic({ itemId, participantId: actingId, weight });
      try {
        await setClaim(itemId, actingId, weight);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function remove(itemId: string) {
    startTransition(async () => {
      try {
        await deleteItem(itemId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="card text-center">
        <p className="font-medium">No items yet</p>
        {mode === "guest" && <p className="text-sm text-muted">The payer hasn&apos;t entered the receipt yet.</p>}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="section-title">Items</h2>
          {canEdit && <p className="text-sm text-muted">Select everything {mode === "owner" && actingId !== meId ? "they" : "you"} had.</p>}
        </div>
        {mode === "owner" && (
          <button onClick={() => setEditing((e) => !e)} className="btn-quiet text-sm font-medium">
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {mode === "owner" && bill.participants.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Selecting for</span>
          {bill.participants.map((p) => (
            <button
              key={p.id}
              onClick={() => setActingId(p.id)}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                actingId === p.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-fg hover:bg-surface-2"
              }`}
            >
              {p.id === meId ? "Me" : p.displayName}
            </button>
          ))}
        </div>
      )}

      {error && <p className="notice">{error}</p>}

      <ul className="card divide-y divide-line !p-0 overflow-hidden">
        {items.map((item) => {
          const mine = item.claims.find((c) => c.participantId === actingId);
          const totalWeight = item.claims.reduce((a, c) => a + c.weight, 0);
          const myShare = mine && totalWeight ? Math.round((item.priceCents * mine.weight) / totalWeight) : 0;
          const unclaimed = item.claims.length === 0;
          const interactive = canEdit && !editing;
          return (
            <li key={item.id}>
              <div
                role={interactive ? "checkbox" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-checked={interactive ? Boolean(mine) : undefined}
                aria-label={interactive ? item.name : undefined}
                onClick={() => interactive && change(item.id, mine ? 0 : 1)}
                onKeyDown={(e) => {
                  if (interactive && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    change(item.id, mine ? 0 : 1);
                  }
                }}
                className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${
                  mine ? "bg-accent-soft" : ""
                } ${interactive ? "cursor-pointer select-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none" : ""} ${
                  mine && interactive ? "hover:!bg-accent-soft" : ""
                }`}
              >
                {canEdit && !editing && (
                  <span
                    aria-hidden
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] font-bold ${
                      mine ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface"
                    }`}
                  >
                    {mine ? "✓" : ""}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{item.name}</span>
                    <span className="money shrink-0 text-sm">{formatMoney(item.priceCents)}</span>
                  </div>
                  <div className="mt-1 flex min-h-5 flex-wrap items-center gap-1.5">
                    {unclaimed ? (
                      <span className="text-xs font-medium text-warn-fg">Unclaimed</span>
                    ) : (
                      item.claims.map((c) => {
                        const p = people.get(c.participantId);
                        if (!p) return null;
                        return (
                          <span key={c.participantId} title={p.displayName} className="inline-flex items-center gap-1 text-xs text-muted">
                            <Avatar id={p.id} name={p.displayName} size="sm" />
                            <span className="max-w-24 truncate">{p.displayName}</span>
                            {c.weight > 1 && <span>×{c.weight}</span>}
                          </span>
                        );
                      })
                    )}
                    {mine && item.claims.length > 1 && (
                      <span className="money ml-auto text-xs text-muted">share {formatMoney(myShare)}</span>
                    )}
                  </div>
                </div>

                {editing ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(item.id);
                    }}
                    className="text-sm font-medium text-danger"
                  >
                    Remove
                  </button>
                ) : (
                  mine &&
                  canEdit && (
                    <div className="flex items-center rounded-lg border border-line bg-surface" onClick={(e) => e.stopPropagation()}>
                      <Stepper label="Fewer shares" onClick={() => change(item.id, mine.weight - 1)}>
                        −
                      </Stepper>
                      <span className="money w-6 text-center text-sm font-medium">{mine.weight}</span>
                      <Stepper label="More shares" onClick={() => change(item.id, mine.weight + 1)}>
                        +
                      </Stepper>
                    </div>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {canEdit && <p className="text-xs text-muted">Use − / + if you had more than an even share of something you split.</p>}
    </section>
  );
}

function Stepper({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} className="grid h-8 w-8 place-items-center text-muted hover:text-fg">
      {children}
    </button>
  );
}
