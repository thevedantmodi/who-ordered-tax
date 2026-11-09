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
  return <p className="mt-2 text-sm font-bold text-pink">{error}</p>;
}

export function ShareCard({ bill }: { bill: Bill }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- origin is only known in the browser
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/b/${bill.shareToken}`;

  async function share() {
    const shareUrl = `${window.location.origin}/b/${bill.shareToken}`;
    const text = `Tap what you had from ${bill.title} 🧾`;
    if (navigator.share) {
      try {
        await navigator.share({ title: bill.title, text, url: shareUrl });
        return;
      } catch {
        /* user cancelled; fall through to copy */
      }
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card !bg-sky space-y-2 text-[#1b1a1f]">
      <div className="font-extrabold">Send this to the group chat 📲</div>
      <div className="truncate rounded-xl border-2 border-[#1b1a1f] bg-white px-3 py-2 font-mono text-sm">
        {url}
      </div>
      <button onClick={share} className="btn btn-pink w-full">
        {copied ? "Copied! 🎉" : "Share link"}
      </button>
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
      <h2 className="text-xl font-extrabold">Add items</h2>
      <div className="flex gap-2">
        <input ref={nameRef} name="name" required maxLength={60} placeholder="Spicy marg" className="input flex-[3]" aria-label="Item name" />
        <input name="price" required inputMode="decimal" placeholder="$12.00" className="input money flex-[2]" aria-label="Price" />
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-bold">
          Qty
          <input name="qty" type="number" min={1} max={50} defaultValue={1} className="input !w-20 !py-1.5" />
        </label>
        <span className="text-xs text-muted">price is each</span>
        <button disabled={pending} className="btn btn-lime ml-auto shrink-0 whitespace-nowrap">
          + Add
        </button>
      </div>
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
      <h2 className="text-xl font-extrabold">Tax, tip &amp; the rest</h2>

      <label className="block">
        <span className="label">Tax (from receipt)</span>
        <input name="tax" inputMode="decimal" defaultValue={cents(bill.taxCents)} placeholder="$0.00" className="input money" />
      </label>

      <div>
        <span className="label">Tip</span>
        <input type="hidden" name="tipMode" value={tipMode} />
        <div className="mb-2 grid grid-cols-3 gap-1 rounded-2xl border-[3px] border-ink p-1 text-sm font-bold">
          {(
            [
              ["AMOUNT", "$ amount"],
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
              className={`rounded-xl px-2 py-1.5 ${tipMode === m ? "bg-pink text-[#1b1a1f]" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          name="tip"
          inputMode="decimal"
          value={tip}
          onChange={(e) => setTip(e.target.value)}
          placeholder={tipMode === "AMOUNT" ? "$0.00" : "20"}
          className="input money"
        />
        {tipMode !== "AMOUNT" && (
          <div className="mt-2 flex gap-2">
            {tipPresets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setTip(String(p));
                  setDirty(true);
                }}
                className={`chip ${tip === String(p) ? "bg-lime text-[#1b1a1f]" : "bg-card"}`}
              >
                {p}%
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Fees</span>
          <input name="fees" inputMode="decimal" defaultValue={cents(bill.feesCents)} placeholder="$0.00" className="input money" />
        </label>
        <label className="block">
          <span className="label">Split fees</span>
          <select name="feeMode" defaultValue={bill.feeMode} className="input">
            <option value="PROPORTIONAL">By what you ordered</option>
            <option value="EVEN">Evenly</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className="label">Discount / promo</span>
        <input name="discount" inputMode="decimal" defaultValue={cents(bill.discountCents)} placeholder="$0.00" className="input money" />
      </label>

      <label className="block">
        <span className="label">Unclaimed items</span>
        <select name="unclaimedPolicy" defaultValue={bill.unclaimedPolicy} className="input">
          <option value="EVEN">Split evenly between everyone</option>
          <option value="PAYER">I&apos;ll eat the cost (put it on me)</option>
        </select>
      </label>

      <div className="flex items-center justify-between gap-3">
        <span className="money text-sm text-muted">
          Tip right now: <b className="text-ink">{formatMoney(bill.split.tipCents)}</b>
        </span>
        <button disabled={pending || !dirty} className="btn btn-pink">
          {pending ? "Saving…" : dirty ? "Save" : "Saved ✓"}
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
    <div className="card space-y-3">
      <div>
        <h2 className="text-xl font-extrabold">The crew</h2>
        <p className="text-sm text-muted">
          Friends can join from the link themselves. You can also add them here and tap items on their behalf.
        </p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {bill.participants.map((p) => (
          <li key={p.id} className="chip bg-paper">
            {p.emoji} {p.displayName}
            {p.isPlaceholder && <span className="text-xs text-muted">(not joined)</span>}
            {!p.isPayer && (
              <button
                onClick={() => run(() => removeParticipant(p.id))}
                aria-label={`Remove ${p.displayName}`}
                className="ml-1 text-muted hover:text-pink"
              >
                ✕
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
        <input name="name" required maxLength={60} placeholder="Add a friend's name" className="input" />
        <button disabled={pending} className="btn btn-tangerine shrink-0">
          + Add
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
      <h2 className="text-xl font-extrabold">Bill controls</h2>
      {bill.status === "OPEN" ? (
        <button disabled={pending} onClick={() => run(() => setStatus(bill.id, "LOCKED"))} className="btn btn-tangerine w-full">
          🔒 Lock claims (everyone&apos;s done)
        </button>
      ) : (
        <button disabled={pending} onClick={() => run(() => setStatus(bill.id, "OPEN"))} className="btn btn-ghost w-full">
          🔓 Reopen for claims
        </button>
      )}
      {confirming ? (
        <div className="flex gap-2">
          <button disabled={pending} onClick={() => run(() => deleteBill(bill.id))} className="btn btn-pink flex-1">
            Yes, delete it
          </button>
          <button onClick={() => setConfirming(false)} className="btn btn-ghost flex-1">
            Nevermind
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} className="w-full text-sm font-bold text-muted underline underline-offset-4">
          Delete bill
        </button>
      )}
      <ErrorNote error={error} />
    </div>
  );
}
