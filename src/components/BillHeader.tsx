import type { BillDTO } from "@/lib/bills";
import { formatMoney } from "@/lib/money";
import { StatusChip } from "@/components/StatusChip";
import { AvatarStack } from "@/components/Avatar";

export function BillHeader({ bill }: { bill: NonNullable<BillDTO> }) {
  const me = bill.split.shares.find((s) => s.participantId === bill.viewer.meId);
  const meP = bill.participants.find((p) => p.id === bill.viewer.meId);
  const date = new Date(bill.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const showMine = me && meP && !meP.isPayer;

  return (
    <div className="card space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold">{bill.title}</h1>
          <p className="text-sm text-muted">
            {bill.merchant ? `${bill.merchant} · ` : ""}
            {date}
          </p>
        </div>
        <StatusChip status={bill.status} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted">{showMine ? "Your share" : "Bill total"}</div>
          <div className="money text-3xl font-semibold tracking-tight">
            {formatMoney(showMine ? me.totalCents : bill.split.totalCents)}
          </div>
          {showMine && <div className="money text-xs text-muted">of {formatMoney(bill.split.totalCents)} total</div>}
        </div>
        <AvatarStack people={bill.participants} />
      </div>
    </div>
  );
}
