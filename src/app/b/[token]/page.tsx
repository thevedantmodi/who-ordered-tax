import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadBill } from "@/lib/bills";
import { BillHeader } from "@/components/BillHeader";
import { ClaimBoard } from "@/components/ClaimBoard";
import { Breakdown } from "@/components/Breakdown";
import { JoinGate } from "@/components/JoinGate";
import { AutoRefresh } from "@/components/AutoRefresh";
import { AddItemForm, BillActions, ChargesForm, PeoplePanel, ShareCard } from "@/components/OwnerPanels";

export const metadata = { title: "Bill", robots: { index: false } };

/**
 * The one link for a bill. The payer sees the editing tools here; everyone else sees the guest view.
 * (Old /bills/<id> editor links forward here.)
 */
export default async function BillPage({ params }: PageProps<"/b/[token]">) {
  const { token } = await params;
  const bill = await loadBill({ shareToken: token });
  if (!bill) notFound();

  if (bill.viewer.isOwner) {
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

  const session = await getSession();
  const joined = bill.viewer.meId !== null;

  return (
    <div className="space-y-6">
      <AutoRefresh />
      {!joined && bill.status === "OPEN" ? (
        <JoinGate bill={bill} defaultName={session?.user?.name ?? undefined} />
      ) : (
        <>
          <BillHeader bill={bill} />
          {!joined && <p className="notice">This bill is locked. Selections can no longer be changed.</p>}
          <ClaimBoard bill={bill} mode="guest" />
          <Breakdown bill={bill} mode="guest" />
          {joined && !session && (
            <div className="card flex items-center justify-between gap-3 text-sm">
              <p className="text-muted">Paying next time? Create an account to start your own bills.</p>
              <Link href="/login" className="btn btn-secondary shrink-0">
                Sign up
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
