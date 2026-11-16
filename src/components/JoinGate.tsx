"use client";

import { useState, useTransition } from "react";
import type { BillDTO } from "@/lib/bills";
import { claimPlaceholder, joinBill } from "@/app/actions";
import { formatMoney } from "@/lib/money";
import { Avatar } from "@/components/Avatar";
import { callAction } from "@/lib/use-action";

type Bill = NonNullable<BillDTO>;

export function JoinGate({ bill, defaultName }: { bill: Bill; defaultName?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const placeholders = bill.participants.filter((p) => p.isPlaceholder);
  const payer = bill.participants.find((p) => p.isPayer);

  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    startTransition(async () => {
      const message = await callAction(fn);
      if (message) setError(message);
    });
  };

  return (
    <div className="card space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted">{payer ? `${payer.displayName} paid for` : "Shared bill"}</p>
        <h1 className="text-2xl font-semibold">{bill.title}</h1>
        <p className="money text-sm text-muted">
          {bill.items.length} items · {formatMoney(bill.split.totalCents)} total
        </p>
      </div>

      <p className="text-sm">
        Join to select what you had. Your share of tax and tip is calculated automatically.
        {bill.group && ` You'll also join ${bill.group.name}, so you're recognized on its other bills.`}
      </p>

      {placeholders.length > 0 && (
        <div>
          <span className="label">Are you one of these people?</span>
          <div className="grid gap-2">
            {placeholders.map((p) => (
              <button
                key={p.id}
                disabled={pending}
                onClick={() => run(() => claimPlaceholder(bill.shareToken, p.id))}
                className="btn btn-secondary justify-start"
              >
                <Avatar name={p.displayName} color={p.color} size="sm" />
                I&apos;m {p.displayName}
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
        <label className="block">
          <span className="label">{placeholders.length ? "Or join with your name" : "Your name"}</span>
          <input name="name" required maxLength={60} defaultValue={defaultName} placeholder="Your name" className="input" />
        </label>
        <button disabled={pending} className="btn btn-primary w-full">
          Join bill
        </button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
