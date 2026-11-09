import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createBill } from "@/app/actions";

export const metadata = { title: "New bill" };

export default async function NewBill({ searchParams }: PageProps<"/bills/new">) {
  if (!(await getSession())) redirect("/login?callbackUrl=/bills/new");
  const { error } = await searchParams;

  return (
    <form action={createBill} className="card mt-4 space-y-4">
      <h1 className="text-2xl font-semibold">New bill</h1>
      <label className="block">
        <span className="label">Name</span>
        <input name="title" required maxLength={60} placeholder="Dinner on Friday" className="input" autoFocus />
        {error === "title" && <span className="mt-1 block text-sm text-danger">Please give the bill a name.</span>}
      </label>
      <label className="block">
        <span className="label">Restaurant or store (optional)</span>
        <input name="merchant" maxLength={80} placeholder="Joe's Diner" className="input" />
      </label>
      <button className="btn btn-primary w-full">Continue</button>
    </form>
  );
}
