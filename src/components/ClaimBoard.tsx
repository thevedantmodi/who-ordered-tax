"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { BillDTO } from "@/lib/bills";
import { deleteItem, setClaim } from "@/app/actions";
import { formatMoney } from "@/lib/money";
import { isEvenSplit, weightsToPercents } from "@/lib/split";
import { personColor } from "@/components/Avatar";
import { SplitEditor } from "@/components/SplitEditor";

type Bill = NonNullable<BillDTO>;
type OptimisticClaim = { itemId: string; participantId: string; claimed: boolean };

export function ClaimBoard({ bill, mode }: { bill: Bill; mode: "owner" | "guest" }) {
  const meId = bill.viewer.meId;
  const [actingId, setActingId] = useState<string | null>(meId);
  const [editing, setEditing] = useState(false);
  const [splitting, setSplitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Mirrors setClaim on the server: joining or leaving an item resets it to an even split.
  const [items, applyOptimistic] = useOptimistic(bill.items, (state, c: OptimisticClaim) =>
    state.map((it) => {
      if (it.id !== c.itemId) return it;
      const others = it.claims.filter((x) => x.participantId !== c.participantId);
      const next = c.claimed ? [...others, { participantId: c.participantId, weight: 1 }] : others;
      return { ...it, claims: next.map((x) => ({ ...x, weight: 1 })) };
    }),
  );

  const canEdit = mode === "owner" || (meId !== null && bill.status === "OPEN");
  const people = new Map(bill.participants.map((p) => [p.id, p]));

  function toggle(itemId: string, claimed: boolean) {
    if (!actingId || !canEdit) return;
    setError(null);
    startTransition(async () => {
      applyOptimistic({ itemId, participantId: actingId, claimed });
      try {
        await setClaim(itemId, actingId, claimed);
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
          const weights = item.claims.map((c) => c.weight);
          const totalWeight = weights.reduce((a, w) => a + w, 0);
          const uneven = item.claims.length > 1 && !isEvenSplit(weights);
          const percents = uneven ? weightsToPercents(weights) : [];
          const myShare = mine && totalWeight ? Math.round((item.priceCents * mine.weight) / totalWeight) : 0;
          const unclaimed = item.claims.length === 0;
          const interactive = canEdit && !editing && splitting !== item.id;
          return (
            <li key={item.id}>
              <div
                role={interactive ? "checkbox" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-checked={interactive ? Boolean(mine) : undefined}
                aria-label={interactive ? item.name : undefined}
                onClick={() => interactive && toggle(item.id, !mine)}
                onKeyDown={(e) => {
                  if (interactive && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    toggle(item.id, !mine);
                  }
                }}
                className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${mine ? "bg-accent-soft" : ""} ${
                  interactive ? "cursor-pointer select-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none" : ""
                } ${mine && interactive ? "hover:!bg-accent-soft" : ""}`}
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
                  <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-1">
                    {unclaimed ? (
                      <span className="text-xs font-medium text-warn-fg">Unclaimed</span>
                    ) : (
                      item.claims.map((c, i) => {
                        const p = people.get(c.participantId);
                        if (!p) return null;
                        return (
                          <span
                            key={c.participantId}
                            title={p.displayName}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${personColor(p.color)}`}
                          >
                            <span className="max-w-24 truncate">{p.displayName}</span>
                            {uneven && <span className="money font-semibold">{percents[i]}%</span>}
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
                  canEdit && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSplitting(splitting === item.id ? null : item.id);
                      }}
                      aria-expanded={splitting === item.id}
                      className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                        splitting === item.id || uneven ? "border-accent text-accent" : "border-line text-muted hover:text-fg"
                      }`}
                    >
                      Split
                    </button>
                  )
                )}
              </div>

              {splitting === item.id && (
                <SplitEditor
                  key={item.claims.map((c) => `${c.participantId}:${c.weight}`).join(",")}
                  itemId={item.id}
                  priceCents={item.priceCents}
                  people={bill.participants}
                  claims={item.claims}
                  onClose={() => setSplitting(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <p className="text-xs text-muted">
          Use Split when people shared something unevenly, e.g. 20% / 80%. Adding or removing someone from an item resets
          it to an even split.
        </p>
      )}
    </section>
  );
}
