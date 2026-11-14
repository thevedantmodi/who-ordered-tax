import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * Legacy editor links. Every bill now has one link (/b/<shareToken>) that shows the payer the
 * editing tools, so forward there. Logged-out visitors sign in first, so an old internal link
 * never hands the share code to a stranger.
 */
export default async function LegacyBillRedirect({ params }: PageProps<"/bills/[id]">) {
  const { id } = await params;
  if (!(await getSession())) redirect(`/login?callbackUrl=/bills/${id}`);
  const bill = await db.bill.findUnique({ where: { id }, select: { shareToken: true } });
  if (!bill) notFound();
  redirect(`/b/${bill.shareToken}`);
}
