import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadBill } from "@/lib/bills";
import { BillHeader } from "@/components/BillHeader";
import { ClaimBoard } from "@/components/ClaimBoard";
import { Breakdown } from "@/components/Breakdown";
import { AddItemForm, BillActions, ChargesForm, PeoplePanel, ShareCard } from "@/components/OwnerPanels";
import { AutoRefresh } from "@/components/AutoRefresh";

export const metadata = { title: "Bill" };

export default async function OwnerBillPage({ params }: PageProps<"/bills/[id]">) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?callbackUrl=/bills/${id}`);

  const bill = await loadBill({ id });
  if (!bill) notFound();
  if (!bill.viewer.isOwner) redirect(`/b/${bill.shareToken}`);

  return (
    <div className="space-y-6">
      <AutoRefresh />
      <BillHeader bill={bill} />
      <ShareCard bill={bill} />
      <AddItemForm billId={bill.id} />
      <ClaimBoard bill={bill} mode="owner" />
      <ChargesForm bill={bill} />
      <PeoplePanel bill={bill} />
      <Breakdown bill={bill} mode="owner" />
      <BillActions bill={bill} />
    </div>
  );
}
