import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadBill } from "@/lib/bills";
import { BillHeader } from "@/components/BillHeader";
import { ClaimBoard } from "@/components/ClaimBoard";
import { Breakdown } from "@/components/Breakdown";
import { JoinGate } from "@/components/JoinGate";
import { AutoRefresh } from "@/components/AutoRefresh";

export const metadata = { title: "Split the bill", robots: { index: false } };

export default async function GuestBillPage({ params }: PageProps<"/b/[token]">) {
  const { token } = await params;
  const bill = await loadBill({ shareToken: token });
  if (!bill) notFound();

  const session = await getSession();
  const joined = bill.viewer.meId !== null;

  return (
    <div className="space-y-6">
      <AutoRefresh />
      {bill.viewer.isOwner && (
        <Link href={`/bills/${bill.id}`} className="btn btn-tangerine w-full">
          ✏️ You&apos;re the payer, open the editor
        </Link>
      )}
      {!joined && bill.status === "OPEN" ? (
        <JoinGate bill={bill} defaultName={session?.user?.name ?? undefined} />
      ) : (
        <>
          <BillHeader bill={bill} />
          {!joined && (
            <p className="rounded-2xl border-[3px] border-ink bg-tangerine p-3 font-bold text-[#1b1a1f]">
              🔒 Claims are locked. Here&apos;s how it shook out.
            </p>
          )}
          <ClaimBoard bill={bill} mode="guest" />
          <Breakdown bill={bill} mode="guest" />
          {joined && !session && (
            <div className="card text-center text-sm">
              <p className="font-bold">Pay for the next one? 😏</p>
              <p className="text-muted">Grab an account to start your own bills.</p>
              <Link href="/login" className="btn btn-lime mt-3">
                Make an account
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
