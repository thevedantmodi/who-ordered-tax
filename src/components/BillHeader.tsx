import type { BillDTO } from "@/lib/bills";
import { formatMoney } from "@/lib/money";
import { StatusChip } from "@/components/StatusChip";

export function BillHeader({ bill }: { bill: NonNullable<BillDTO> }) {
  const me = bill.split.shares.find((s) => s.participantId === bill.viewer.meId);
  const meP = bill.participants.find((p) => p.id === bill.viewer.meId);
  const date = new Date(bill.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="card !bg-pink space-y-3 text-[#1b1a1f]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold leading-tight break-words">{bill.title}</h1>
          <p className="text-sm font-bold opacity-80">
            {bill.merchant ? `${bill.merchant} · ` : ""}
            {date}
          </p>
        </div>
        <StatusChip status={bill.status} />
      </div>
      <div className="flex items-end justify-between gap-3">
        {me && meP && !meP.isPayer ? (
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider">Your damage</div>
            <div className="money text-4xl font-extrabold">{formatMoney(me.totalCents)}</div>
          </div>
        ) : (
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider">Bill total</div>
            <div className="money text-4xl font-extrabold">{formatMoney(bill.split.totalCents)}</div>
          </div>
        )}
        <div className="text-right text-2xl" aria-label="People on this bill">
          {bill.participants.map((p) => p.emoji).join("")}
        </div>
      </div>
    </div>
  );
}
