"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { BillDTO } from "@/lib/bills";
import {
  addItem,
  addPlaceholder,
  deleteBill,
  removeParticipant,
  setStatus,
  updateCharges,
} from "@/app/actions";
import { formatMoney } from "@/lib/money";
import { Avatar } from "@/components/Avatar";

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

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="text-sm text-danger">{error}</p>;
}

export function ShareCard({ bill }: { bill: Bill }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    // Both are only known in the browser.
    /* eslint-disable react-hooks/set-state-in-effect */
    setOrigin(window.location.origin);
    setCanShare(typeof navigator.share === "function");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const url = `${origin}/b/${bill.shareToken}`;

  async function copy() {
    await navigator.clipboard.writeText(`${window.location.origin}/b/${bill.shareToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function share() {
    const shareUrl = `${window.location.origin}/b/${bill.shareToken}`;
    try {
      await navigator.share({ title: bill.title, text: `Select what you had from ${bill.title}`, url: shareUrl });
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="section-title">Share with the group</h2>
        <p className="text-sm text-muted">This page&apos;s link works for everyone: friends can join and pick their items, and only you see the editing tools.</p>
      </div>
      <div className="flex gap-2">
        <input readOnly value={url} aria-label="Share link" className="input money min-w-0 flex-1 bg-surface-2 text-sm" onFocus={(e) => e.target.select()} />
        <button onClick={copy} className="btn btn-secondary shrink-0">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {canShare && (
        <button onClick={share} className="btn btn-primary w-full">
          Share…
        </button>
      )}
    </div>
  );
}

export function AddItemForm({ billId }: { billId: string }) {
  const form = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const { pending, error, run } = useAction();

  return (
    <form
      ref={form}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          () => addItem(billId, fd),
          () => {
            form.current?.reset();
            nameRef.current?.focus();
          },
        );
      }}
      className="card space-y-3"
    >
      <h2 className="section-title">Add an item</h2>
      <div className="grid grid-cols-[1fr_7rem_4.5rem] gap-2">
        <label>
          <span className="label">Item</span>
          <input ref={nameRef} name="name" required maxLength={60} placeholder="Margarita" className="input" />
        </label>
        <label>
          <span className="label">Price each</span>
          <input name="price" required inputMode="decimal" placeholder="0.00" className="input money" />
        </label>
        <label>
          <span className="label">Qty</span>
          <input name="qty" type="number" min={1} max={50} defaultValue={1} className="input money" />
        </label>
      </div>
      <button disabled={pending} className="btn btn-secondary w-full">
        Add item
      </button>
      <ErrorNote error={error} />
    </form>
  );
}

const tipPresets = [15, 18, 20, 22];

export function ChargesForm({ bill }: { bill: Bill }) {
  const { pending, error, run } = useAction();
  const [tipMode, setTipMode] = useState(bill.tipMode);
  const [tip, setTip] = useState(
    bill.tipMode === "AMOUNT" ? (bill.tipCents ? (bill.tipCents / 100).toFixed(2) : "") : String(bill.tipPercent || ""),
  );
  const [dirty, setDirty] = useState(false);
  const cents = (c: number) => (c ? (c / 100).toFixed(2) : "");

  // Tax: entered either as the receipt amount or as a rate. Switching converts the value.
  const taxBase = Math.max(0, bill.split.subtotalCents - bill.discountCents);
  const [taxMode, setTaxMode] = useState(bill.taxMode);
  const [tax, setTax] = useState(
    bill.taxMode === "PERCENT" ? (bill.taxPercent ? String(bill.taxPercent) : "") : cents(bill.taxCents),
  );
  const taxNumber = Number(tax.replace(/[$%,\s]/g, "")) || 0;
  const taxPreviewCents = taxMode === "PERCENT" ? Math.round((taxBase * taxNumber) / 100) : Math.round(taxNumber * 100);
  const impliedRate = taxBase > 0 ? (taxPreviewCents / taxBase) * 100 : 0;
  const trim = (n: number, digits: number) => String(Number(n.toFixed(digits)));

  // Remember what was typed before converting, so toggling back without edits restores it exactly
  // (8.875% → $9.10 → 8.878% would otherwise lose precision).
  const [taxMemo, setTaxMemo] = useState<{ mode: typeof taxMode; value: string; converted: string } | null>(null);

  function switchTaxMode(next: typeof taxMode) {
    if (next === taxMode) return;
    let value = tax;
    if (taxMemo && taxMemo.mode === next && taxMemo.converted === tax) {
      value = taxMemo.value;
    } else if (taxNumber > 0 && taxBase > 0) {
      value = next === "PERCENT" ? trim(impliedRate, 3) : (taxPreviewCents / 100).toFixed(2);
    }
    setTaxMemo({ mode: taxMode, value: tax, converted: value });
    setTax(value);
    setTaxMode(next);
    setDirty(true);
  }

  return (
    <form
      onChange={() => setDirty(true)}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => updateCharges(bill.id, fd), () => setDirty(false));
      }}
      className="card space-y-4"
    >
      <h2 className="section-title">Tax, fees and tip</h2>

      <div>
        <span className="label">Tax</span>
        <input type="hidden" name="taxMode" value={taxMode} />
        <div className="flex gap-2">
          <div className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-medium">
            {(
              [
                ["AMOUNT", "Amount"],
                ["PERCENT", "% Rate"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={taxMode === m}
                onClick={() => switchTaxMode(m)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors ${taxMode === m ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            {taxMode === "AMOUNT" && (
              <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-muted">$</span>
            )}
            <input
              name="tax"
              inputMode="decimal"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              placeholder={taxMode === "PERCENT" ? "8.875" : "0.00"}
              aria-label={taxMode === "PERCENT" ? "Tax rate percent" : "Tax amount"}
              className={`input money ${taxMode === "AMOUNT" ? "pl-7" : "pr-8"}`}
            />
            {taxMode === "PERCENT" && (
              <span className="pointer-events-none absolute inset-y-0 right-3.5 grid place-items-center text-muted">%</span>
            )}
          </div>
        </div>
        {taxNumber > 0 && taxBase > 0 && (
          <p className="money mt-1.5 text-xs text-muted">
            {taxMode === "PERCENT"
              ? `= ${formatMoney(taxPreviewCents)} on ${formatMoney(taxBase)}`
              : `≈ ${trim(impliedRate, 2)}% of ${formatMoney(taxBase)}`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Fees</span>
          <input name="fees" inputMode="decimal" defaultValue={cents(bill.feesCents)} placeholder="0.00" className="input money" />
        </label>
        <label className="block">
          <span className="label">Split fees</span>
          <select name="feeMode" defaultValue={bill.feeMode} className="input">
            <option value="PROPORTIONAL">Proportionally</option>
            <option value="EVEN">Evenly</option>
          </select>
        </label>
      </div>

      <div>
        <span className="label">Tip</span>
        <input type="hidden" name="tipMode" value={tipMode} />
        <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-medium">
          {(
            [
              ["AMOUNT", "Amount"],
              ["PERCENT_PRE_TAX", "% pre-tax"],
              ["PERCENT_POST_TAX", "% post-tax"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setTipMode(m);
                setTip("");
                setDirty(true);
              }}
              className={`whitespace-nowrap rounded-lg px-2 py-1.5 transition-colors ${tipMode === m ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            name="tip"
            inputMode="decimal"
            value={tip}
            onChange={(e) => setTip(e.target.value)}
            placeholder={tipMode === "AMOUNT" ? "0.00" : "20"}
            aria-label={tipMode === "AMOUNT" ? "Tip amount" : "Tip percent"}
            className="input money"
          />
          {tipMode !== "AMOUNT" &&
            tipPresets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setTip(String(p));
                  setDirty(true);
                }}
                className={`shrink-0 rounded-xl border px-2.5 text-sm font-medium transition-colors ${
                  tip === String(p) ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-surface-2"
                }`}
              >
                {p}%
              </button>
            ))}
        </div>
      </div>

      <label className="block">
        <span className="label">Discount</span>
        <input name="discount" inputMode="decimal" defaultValue={cents(bill.discountCents)} placeholder="0.00" className="input money" />
      </label>

      <label className="block">
        <span className="label">Unclaimed items</span>
        <select name="unclaimedPolicy" defaultValue={bill.unclaimedPolicy} className="input">
          <option value="EVEN">Split evenly between everyone</option>
          <option value="PAYER">Assign to me</option>
        </select>
      </label>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="money text-sm text-muted">
          Tip: <span className="font-medium text-fg">{formatMoney(bill.split.tipCents)}</span>
        </span>
        <button disabled={pending || !dirty} className="btn btn-primary">
          {pending ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>
      <ErrorNote error={error} />
    </form>
  );
}

export function PeoplePanel({ bill }: { bill: Bill }) {
  const form = useRef<HTMLFormElement>(null);
  const { pending, error, run } = useAction();

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="section-title">People</h2>
        <p className="text-sm text-muted">People can join from the link, or you can add them here and select items for them.</p>
      </div>
      <ul className="divide-y divide-line">
        {bill.participants.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <Avatar name={p.displayName} color={p.color} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{p.displayName}</span>
              <span className="text-xs text-muted">{p.isPayer ? "Payer" : p.isPlaceholder ? "Hasn't opened the link" : "Joined"}</span>
            </span>
            {!p.isPayer && (
              <button onClick={() => run(() => removeParticipant(p.id))} className="btn-quiet text-sm">
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => addPlaceholder(bill.id, fd), () => form.current?.reset());
        }}
        className="flex gap-2"
      >
        <input name="name" required maxLength={60} placeholder="Name" aria-label="Person's name" className="input" />
        <button disabled={pending} className="btn btn-secondary shrink-0">
          Add person
        </button>
      </form>
      <ErrorNote error={error} />
    </div>
  );
}

export function BillActions({ bill }: { bill: Bill }) {
  const { pending, error, run } = useAction();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="card space-y-3">
      <h2 className="section-title">Settings</h2>
      {bill.status === "OPEN" ? (
        <div className="space-y-1">
          <button disabled={pending} onClick={() => run(() => setStatus(bill.id, "LOCKED"))} className="btn btn-secondary w-full">
            Lock bill
          </button>
          <p className="text-xs text-muted">Stops guests from changing their selections.</p>
        </div>
      ) : (
        <button disabled={pending} onClick={() => run(() => setStatus(bill.id, "OPEN"))} className="btn btn-secondary w-full">
          Reopen bill
        </button>
      )}
      {confirming ? (
        <div className="flex gap-2">
          <button
            disabled={pending}
            onClick={() => run(() => deleteBill(bill.id))}
            className="btn flex-1 bg-danger text-white hover:opacity-90"
          >
            Delete permanently
          </button>
          <button onClick={() => setConfirming(false)} className="btn btn-secondary flex-1">
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} className="w-full text-sm font-medium text-danger">
          Delete bill
        </button>
      )}
      <ErrorNote error={error} />
    </div>
  );
}
