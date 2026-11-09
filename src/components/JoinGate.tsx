"use client";

import { useState, useTransition } from "react";
import type { BillDTO } from "@/lib/bills";
import { claimPlaceholder, joinBill } from "@/app/actions";
import { EMOJIS } from "@/lib/emoji";

type Bill = NonNullable<BillDTO>;

export function JoinGate({ bill, defaultName }: { bill: Bill; defaultName?: string }) {
  const [emoji, setEmoji] = useState<string>(EMOJIS[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const placeholders = bill.participants.filter((p) => p.isPlaceholder);
  const payer = bill.participants.find((p) => p.isPayer);

  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };

  return (
    <div className="card space-y-5">
      <div>
        <div className="wiggle mb-2 inline-block text-5xl">🧾</div>
        <h1 className="text-3xl font-extrabold leading-tight">
          {payer ? `${payer.emoji} ${payer.displayName} picked up the check` : "Someone picked up the check"}
        </h1>
        <p className="text-muted">
          for <b className="text-ink">{bill.title}</b>. Tap what you had and we&apos;ll do the math, tax and all.
        </p>
      </div>

      {placeholders.length > 0 && (
        <div>
          <span className="label">Are you one of these?</span>
          <div className="flex flex-wrap gap-2">
            {placeholders.map((p) => (
              <button
                key={p.id}
                disabled={pending}
                onClick={() => run(() => claimPlaceholder(bill.shareToken, p.id))}
                className="btn btn-sky"
              >
                {p.emoji} That&apos;s me, {p.displayName}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => joinBill(bill.shareToken, fd));
        }}
        className="space-y-3"
      >
        <span className="label">{placeholders.length ? "…or join as someone new" : "Who are you?"}</span>
        <input name="name" required maxLength={60} defaultValue={defaultName} placeholder="Your name" className="input" />
        <input type="hidden" name="emoji" value={emoji} />
        <div className="grid grid-cols-10 gap-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              aria-label={`Pick ${e}`}
              aria-pressed={emoji === e}
              className={`aspect-square rounded-xl text-xl ${emoji === e ? "border-[3px] border-ink bg-lime" : ""}`}
            >
              {e}
            </button>
          ))}
        </div>
        <button disabled={pending} className="btn btn-pink w-full text-lg">
          {emoji} Join the bill
        </button>
      </form>
      {error && <p className="text-sm font-bold text-pink">{error}</p>}
    </div>
  );
}
