import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createGroup } from "@/app/actions";

export const metadata = { title: "New group" };

export default async function NewGroup({ searchParams }: PageProps<"/groups/new">) {
  if (!(await getSession())) redirect("/login?callbackUrl=/groups/new");
  const { error } = await searchParams;

  return (
    <form action={createGroup} className="card mt-4 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">New group</h1>
        <p className="text-sm text-muted">
          For a trip, roommates or a regular crew. Add bills over time and settle up at the end in as few payments as
          possible.
        </p>
      </div>
      <label className="block">
        <span className="label">Name</span>
        <input name="name" required maxLength={60} placeholder="Cabin weekend" className="input" autoFocus />
        {error === "name" && <span className="mt-1 block text-sm text-danger">Please give the group a name.</span>}
      </label>
      <button className="btn btn-primary w-full">Create group</button>
    </form>
  );
}
