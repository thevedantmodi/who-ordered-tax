"use client";

import { useState, useTransition } from "react";
import type { BillDTO } from "@/lib/bills";
import { setPaid } from "@/app/actions";
import { formatMoney } from "@/lib/money";
import { badgesFor } from "@/lib/badges";

type Bill = NonNullable<BillDTO>;

export function Breakdown({ bill, mode }: { bill: Bill; mode: "owner" | "guest" }) {
  const { split } = bill;
  const [open, setOpen] = useState<string | null>(bill.viewer.meId);
  const [, startTransition] = useTransition();
  const payer = bill.participants.find((p) => p.isPayer);
  const shareById = new Map(split.shares.map((s) => [s.participantId, s]));
  const itemName = new Map(bill.items.map((i) => [i.id, i.name]));
  const badges = badgesFor(bill);

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-extrabold">Who owes what 💸</h2>

      {split.unclaimedItemIds.length > 0 && (
        <div className="rounded-2xl border-[3px] border-ink bg-tangerine p-3 font-bold text-[#1b1a1f]">
          🚨 {formatMoney(split.unclaimedCents)} in unclaimed items is being{" "}
          {bill.unclaimedPolicy === "EVEN" ? "split evenly between everyone" : `put on ${payer?.displayName ?? "the payer"}`}.
          Somebody ate that!
        </div>
      )}

      <ul className="space-y-2.5">
        {bill.participants.map((p) => {
          const s = shareById.get(p.id)!;
          const isMe = p.id === bill.viewer.meId;
          const expanded = open === p.id;
          return (
            <li key={p.id} className={`card !p-0 overflow-hidden ${isMe ? "ring-4 ring-pink/50" : ""}`}>
              <button
                onClick={() => setOpen(expanded ? null : p.id)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border-[3px] border-ink bg-paper text-2xl">
                  {p.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold">
                    {p.displayName} {isMe && <span className="text-pink">(you)</span>}
                  </span>
                  <span className="flex flex-wrap gap-1 text-xs">
                    {p.isPayer && <span className="chip !py-0 bg-sky text-[#1b1a1f]">💳 paid the bill</span>}
                    {!p.isPayer && p.paidAt && <span className="chip !py-0 bg-lime text-[#1b1a1f]">✅ paid up</span>}
                    {badges.get(p.id)?.map((b) => (
                      <span key={b.label} title={b.hint} className="chip !py-0 bg-paper text-ink">
                        {b.label}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="money text-right">
                  <span className="block text-xl font-extrabold">{formatMoney(s.totalCents)}</span>
                  <span className="block text-xs text-muted">{expanded ? "hide" : "details"}</span>
                </span>
              </button>

              {expanded && (
                <div className="border-t-[3px] border-dashed border-ink/30 px-4 pb-4 pt-3 text-sm">
                  <dl className="money space-y-1">
                    {Object.entries(s.itemBreakdown).map(([itemId, cents]) => (
                      <Row key={itemId} label={itemName.get(itemId) ?? "Item"} value={cents} />
                    ))}
                    {Object.keys(s.itemBreakdown).length === 0 && <p className="text-muted">Didn&apos;t claim anything 👻</p>}
                    <hr className="my-2 border-ink/20" />
                    <Row label="Items" value={s.itemsCents} bold />
                    {s.taxCents !== 0 && <Row label="Tax you 'ordered' 🙄" value={s.taxCents} />}
                    {s.tipCents !== 0 && <Row label="Tip" value={s.tipCents} />}
                    {s.feesCents !== 0 && <Row label="Fees" value={s.feesCents} />}
                    {s.discountCents !== 0 && <Row label="Discount 🎉" value={-s.discountCents} />}
                    <Row label="Total" value={s.totalCents} bold />
                  </dl>
                  {!p.isPayer && payer && (
                    <p className="mt-3 font-bold">
                      {isMe ? "You owe" : `${p.displayName} owes`} {payer.emoji} {payer.id === bill.viewer.meId ? "you" : payer.displayName}{" "}
                      {formatMoney(s.totalCents)}
                    </p>
                  )}
                  {mode === "owner" && !p.isPayer && (
                    <button
                      onClick={() => startTransition(() => setPaid(p.id, !p.paidAt))}
                      className={`btn mt-3 w-full ${p.paidAt ? "btn-ghost" : "btn-lime"}`}
                    >
                      {p.paidAt ? "Undo paid" : "Mark as paid ✅"}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="card money space-y-1 text-sm">
        <Row label="Subtotal" value={split.subtotalCents} />
        {bill.taxCents !== 0 && <Row label="Tax" value={bill.taxCents} />}
        {split.tipCents !== 0 && (
          <Row label={bill.tipMode === "AMOUNT" ? "Tip" : `Tip (${bill.tipPercent}%${bill.tipMode === "PERCENT_POST_TAX" ? " after tax" : ""})`} value={split.tipCents} />
        )}
        {bill.feesCents !== 0 && <Row label="Fees" value={bill.feesCents} />}
        {bill.discountCents !== 0 && <Row label="Discount" value={-bill.discountCents} />}
        <hr className="my-2 border-ink/20" />
        <Row label="Bill total" value={split.totalCents} bold />
      </div>
    </section>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-extrabold" : ""}`}>
      <dt className="truncate">{label}</dt>
      <dd>{formatMoney(value)}</dd>
    </div>
  );
}
