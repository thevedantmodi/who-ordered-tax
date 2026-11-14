"use client";

import { useState, useTransition } from "react";
import { setItemSplit } from "@/app/actions";
import { formatMoney } from "@/lib/money";
import { isEvenSplit, weightsToPercents } from "@/lib/split";
import { Avatar } from "@/components/Avatar";

type Person = { id: string; displayName: string };
type Claim = { participantId: string; weight: number };

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => String(round2(n));

/** Even percentages for `n` people, as display strings that sum to 100 (e.g. 33.34, 33.33, 33.33). */
function evenStrings(n: number): string[] {
  if (n === 0) return [];
  const base = Math.floor(10000 / n);
  return Array.from({ length: n }, (_, i) => fmt((base + (i < 10000 - base * n ? 1 : 0)) / 100));
}

export function SplitEditor({
  itemId,
  priceCents,
  people,
  claims,
  onClose,
}: {
  itemId: string;
  priceCents: number;
  people: Person[];
  claims: Claim[];
  onClose: () => void;
}) {
  // Show claimants in bill order so percents line up with the people list.
  const initial = people.flatMap((p) => claims.filter((c) => c.participantId === p.id));
  const weights = initial.map((c) => c.weight);
  const initialPct = isEvenSplit(weights) ? evenStrings(weights.length) : weightsToPercents(weights).map(fmt);
  const [included, setIncluded] = useState<string[]>(initial.map((c) => c.participantId));
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map((c, i) => [c.participantId, initialPct[i]])),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const ordered = people.filter((p) => included.includes(p.id));
  const num = (id: string) => Number((values[id] ?? "").replace(/[%\s]/g, "")) || 0;
  const total = round2(ordered.reduce((a, p) => a + num(p.id), 0));
  const remaining = round2(100 - total);
  const valid = ordered.length > 0 && Math.abs(remaining) <= 0.01 && ordered.every((p) => num(p.id) > 0);

  function spreadEvenly(ids: string[]) {
    const even = evenStrings(ids.length);
    setValues(Object.fromEntries(ids.map((id, i) => [id, even[i]])));
  }

  function toggle(id: string) {
    const next = included.includes(id) ? included.filter((x) => x !== id) : [...included, id];
    const ids = people.filter((p) => next.includes(p.id)).map((p) => p.id);
    setIncluded(ids);
    spreadEvenly(ids);
  }

  function edit(id: string, raw: string) {
    const next = { ...values, [id]: raw };
    // With two people, typing one share fills in the other.
    if (ordered.length === 2) {
      const other = ordered.find((p) => p.id !== id)!;
      const v = Number(raw.replace(/[%\s]/g, ""));
      if (raw.trim() !== "" && Number.isFinite(v) && v >= 0 && v <= 100) next[other.id] = fmt(100 - v);
    }
    setValues(next);
  }

  function save() {
    setError(null);
    // Even splits are saved as exact equal shares rather than rounded display values.
    const allEqual = ordered.every((p) => values[p.id] === evenStrings(ordered.length)[ordered.indexOf(p)]);
    const shares = ordered.map((p) => ({
      participantId: p.id,
      percent: allEqual ? 100 / ordered.length : num(p.id),
    }));
    startTransition(async () => {
      try {
        await setItemSplit(itemId, shares);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="space-y-3 bg-surface-2/60 px-4 pb-4 pt-3" onClick={(e) => e.stopPropagation()}>
      <ul className="space-y-1.5">
        {people.map((p) => {
          const on = included.includes(p.id);
          return (
            <li key={p.id} className="flex items-center gap-2.5">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(p.id)}
                  className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <Avatar id={p.id} name={p.displayName} size="sm" />
                <span className={`truncate text-sm ${on ? "" : "text-muted"}`}>{p.displayName}</span>
              </label>
              {on && (
                <>
                  <span className="money w-16 text-right text-xs text-muted">
                    {formatMoney(Math.round((priceCents * num(p.id)) / 100))}
                  </span>
                  <div className="relative w-20 shrink-0">
                    <input
                      inputMode="decimal"
                      value={values[p.id] ?? ""}
                      onChange={(e) => edit(p.id, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      aria-label={`${p.displayName}'s share in percent`}
                      className="input money !py-1.5 pr-6 text-right text-sm"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-xs text-muted">
                      %
                    </span>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={`money font-medium ${valid || ordered.length === 0 ? "text-muted" : "text-warn-fg"}`}>
          {ordered.length === 0
            ? "Pick who shared it"
            : Math.abs(remaining) <= 0.01
              ? "Adds up to 100%"
              : remaining > 0
                ? `${fmt(remaining)}% left to assign`
                : `${fmt(-remaining)}% over`}
        </span>
        {ordered.length > 1 && (
          <button type="button" onClick={() => spreadEvenly(ordered.map((p) => p.id))} className="btn-quiet font-medium">
            Even
          </button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!valid || pending} className="btn btn-primary flex-1">
          {pending ? "Saving…" : "Save split"}
        </button>
      </div>
    </div>
  );
}
