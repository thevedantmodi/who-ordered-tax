"use client";

import { useState, useTransition } from "react";
import type { BillDTO } from "@/lib/bills";
import { setPaid } from "@/app/actions";
import { formatMoney } from "@/lib/money";
import { Avatar } from "@/components/Avatar";

type Bill = NonNullable<BillDTO>;

export function Breakdown({ bill, mode }: { bill: Bill; mode: "owner" | "guest" }) {
  const { split } = bill;
  const [open, setOpen] = useState<string | null>(bill.viewer.meId);
  const [, startTransition] = useTransition();
  const payer = bill.participants.find((p) => p.isPayer);
  const shareById = new Map(split.shares.map((s) => [s.participantId, s]));
  const itemName = new Map(bill.items.map((i) => [i.id, i.name]));

  return (
    <section className="space-y-3">
      <h2 className="section-title">Breakdown</h2>

      {split.unclaimedItemIds.length > 0 && (
        <p className="notice">
          {formatMoney(split.unclaimedCents)} of items haven&apos;t been claimed yet. For now they&apos;re{" "}
          {bill.unclaimedPolicy === "EVEN" ? "split evenly between everyone" : `assigned to ${payer?.displayName ?? "the payer"}`}.
        </p>
      )}

      <ul className="card divide-y divide-line !p-0 overflow-hidden">
        {bill.participants.map((p) => {
          const s = shareById.get(p.id)!;
          const isMe = p.id === bill.viewer.meId;
          const expanded = open === p.id;
          return (
            <li key={p.id}>
              <button
                onClick={() => setOpen(expanded ? null : p.id)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
              >
                <Avatar id={p.id} name={p.displayName} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {p.displayName}
                    {isMe && <span className="font-normal text-muted"> (you)</span>}
                  </span>
                  <span className="text-xs text-muted">
                    {p.isPayer ? "Paid the bill" : p.paidAt ? <span className="text-accent">Paid back</span> : "Owes"}
                  </span>
                </span>
                <span className="money font-semibold">{formatMoney(s.totalCents)}</span>
                <span aria-hidden className={`text-muted transition-transform ${expanded ? "rotate-90" : ""}`}>
                  ›
                </span>
              </button>

              {expanded && (
                <div className="bg-surface-2/50 px-4 pb-4 pt-1 text-sm">
                  <dl className="money space-y-1.5">
                    {Object.entries(s.itemBreakdown).map(([itemId, cents]) => (
                      <Row key={itemId} label={itemName.get(itemId) ?? "Item"} value={cents} muted />
                    ))}
                    {Object.keys(s.itemBreakdown).length === 0 && <p className="text-muted">No items claimed.</p>}
                    <div className="my-2 h-px bg-line" />
                    <Row label="Items" value={s.itemsCents} />
                    {s.taxCents !== 0 && <Row label="Tax" value={s.taxCents} />}
                    {s.tipCents !== 0 && <Row label="Tip" value={s.tipCents} />}
                    {s.feesCents !== 0 && <Row label="Fees" value={s.feesCents} />}
                    {s.discountCents !== 0 && <Row label="Discount" value={-s.discountCents} />}
                    <Row label="Total" value={s.totalCents} bold />
                  </dl>
                  {!p.isPayer && payer && (
                    <p className="mt-3 text-muted">
                      {isMe ? "You owe" : `${p.displayName} owes`} {payer.id === bill.viewer.meId ? "you" : payer.displayName}{" "}
                      <span className="money font-medium text-fg">{formatMoney(s.totalCents)}</span>.
                    </p>
                  )}
                  {mode === "owner" && !p.isPayer && (
                    <button
                      onClick={() => startTransition(() => setPaid(p.id, !p.paidAt))}
                      className={`btn mt-3 w-full ${p.paidAt ? "btn-secondary" : "btn-primary"}`}
                    >
                      {p.paidAt ? "Mark as unpaid" : "Mark as paid"}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <dl className="card money space-y-1.5 text-sm">
        <Row label="Subtotal" value={split.subtotalCents} />
        {split.taxCents !== 0 && (
          <Row label={bill.taxMode === "PERCENT" ? `Tax (${bill.taxPercent}%)` : "Tax"} value={split.taxCents} />
        )}
        {split.tipCents !== 0 && (
          <Row
            label={bill.tipMode === "AMOUNT" ? "Tip" : `Tip (${bill.tipPercent}%${bill.tipMode === "PERCENT_POST_TAX" ? " of total with tax" : ""})`}
            value={split.tipCents}
          />
        )}
        {bill.feesCents !== 0 && <Row label="Fees" value={bill.feesCents} />}
        {bill.discountCents !== 0 && <Row label="Discount" value={-bill.discountCents} />}
        <div className="my-2 h-px bg-line" />
        <Row label="Total" value={split.totalCents} bold />
      </dl>
    </section>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: number; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-semibold" : ""} ${muted ? "text-muted" : ""}`}>
      <dt className="truncate">{label}</dt>
      <dd>{formatMoney(value)}</dd>
    </div>
  );
}
