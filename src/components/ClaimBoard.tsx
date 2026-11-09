"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { BillDTO } from "@/lib/bills";
import { deleteItem, setClaim } from "@/app/actions";
import { formatMoney } from "@/lib/money";

type Bill = NonNullable<BillDTO>;
type Claim = { participantId: string; weight: number };
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
  const acting = actingId ? people.get(actingId) : undefined;

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
        <div className="mb-2 text-4xl">🫙</div>
        <p className="font-bold">No items yet.</p>
        {mode === "guest" && <p className="text-muted">Waiting on the payer to type in the receipt…</p>}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-extrabold">
          {canEdit ? "Tap what you had 👆" : "Items"}
        </h2>
        {mode === "owner" && (
          <button onClick={() => setEditing((e) => !e)} className="text-sm font-bold text-muted underline underline-offset-4">
            {editing ? "Done" : "Edit items"}
          </button>
        )}
      </div>

      {mode === "owner" && bill.participants.length > 1 && (
        <div className="card !p-3">
          <span className="label">Tapping for</span>
          <div className="flex flex-wrap gap-2">
            {bill.participants.map((p) => (
              <button
                key={p.id}
                onClick={() => setActingId(p.id)}
                className={`chip ${actingId === p.id ? "bg-pink text-[#1b1a1f]" : "bg-card"}`}
              >
                {p.emoji} {p.id === meId ? "me" : p.displayName}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="rounded-2xl border-[3px] border-ink bg-tangerine p-3 font-bold text-[#1b1a1f]">{error}</p>}

      <ul className="space-y-2.5">
        {items.map((item) => {
          const mine = item.claims.find((c) => c.participantId === actingId);
          const totalWeight = item.claims.reduce((a, c) => a + c.weight, 0);
          const myShare = mine && totalWeight ? Math.round((item.priceCents * mine.weight) / totalWeight) : 0;
          const unclaimed = item.claims.length === 0;
          return (
            <li key={item.id}>
              <div
                role={canEdit ? "button" : undefined}
                tabIndex={canEdit ? 0 : undefined}
                aria-pressed={canEdit ? Boolean(mine) : undefined}
                onClick={() => !editing && change(item.id, mine ? 0 : 1)}
                onKeyDown={(e) => {
                  if (!editing && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    change(item.id, mine ? 0 : 1);
                  }
                }}
                className={`flex items-center gap-3 rounded-2xl border-[3px] border-ink p-3 transition-colors ${
                  mine ? "pop bg-lime text-[#1b1a1f]" : "bg-card"
                } ${canEdit && !editing ? "cursor-pointer select-none" : ""}`}
                style={{ boxShadow: "3px 3px 0 0 var(--shadow)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-extrabold">{item.name}</span>
                    <span className="money shrink-0 font-bold">{formatMoney(item.priceCents)}</span>
                  </div>
                  <div className="mt-1 flex min-h-6 flex-wrap items-center gap-1">
                    {unclaimed ? (
                      <span className="text-xs font-bold uppercase tracking-wide text-pink">🚨 unclaimed</span>
                    ) : (
                      item.claims.map((c) => <ClaimChip key={c.participantId} claim={c} person={people.get(c.participantId)} />)
                    )}
                    {mine && item.claims.length > 1 && (
                      <span className="ml-auto text-xs font-bold">your cut ≈ {formatMoney(myShare)}</span>
                    )}
                  </div>
                </div>

                {editing ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(item.id);
                    }}
                    aria-label={`Delete ${item.name}`}
                    className="grid h-9 w-9 place-items-center rounded-xl border-[3px] border-ink bg-pink font-extrabold text-[#1b1a1f]"
                  >
                    ✕
                  </button>
                ) : (
                  mine &&
                  canEdit && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Stepper label="fewer shares" onClick={() => change(item.id, mine.weight - 1)}>
                        −
                      </Stepper>
                      <span className="money w-5 text-center font-extrabold">{mine.weight}</span>
                      <Stepper label="more shares" onClick={() => change(item.id, mine.weight + 1)}>
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
      {acting && canEdit && mode === "owner" && actingId !== meId && (
        <p className="text-center text-sm text-muted">
          Assigning items to {acting.emoji} {acting.displayName}
        </p>
      )}
    </section>
  );
}

function ClaimChip({ claim, person }: { claim: Claim; person?: { emoji: string; displayName: string } }) {
  if (!person) return null;
  return (
    <span title={person.displayName} className="chip !border-[1.5px] !px-1.5 bg-paper text-xs text-ink">
      {person.emoji}
      <span className="max-w-20 truncate">{person.displayName}</span>
      {claim.weight > 1 && <span>×{claim.weight}</span>}
    </span>
  );
}

function Stepper({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-lg border-2 border-[#1b1a1f] bg-white text-lg font-extrabold text-[#1b1a1f]"
    >
      {children}
    </button>
  );
}
