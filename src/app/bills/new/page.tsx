import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createBill } from "@/app/actions";

export const metadata = { title: "New bill" };

const ideas = ["Taco Tuesday 🌮", "Sushi night 🍣", "Brunch damage 🥞", "Bar tab 🍻", "Pizza Friday 🍕"];

export default async function NewBill({ searchParams }: PageProps<"/bills/new">) {
  if (!(await getSession())) redirect("/login?callbackUrl=/bills/new");
  const { error } = await searchParams;
  const placeholder = ideas[new Date().getDate() % ideas.length];

  return (
    <form action={createBill} className="card mt-4 space-y-4">
      <h1 className="text-3xl font-extrabold">New bill 🧾</h1>
      <label className="block">
        <span className="label">What was it?</span>
        <input name="title" required maxLength={60} placeholder={placeholder} className="input" autoFocus />
        {error === "title" && <span className="text-sm font-bold text-pink">Give it a name!</span>}
      </label>
      <label className="block">
        <span className="label">Where? (optional)</span>
        <input name="merchant" maxLength={80} placeholder="Joe's Diner" className="input" />
      </label>
      <button className="btn btn-pink w-full text-lg">Let&apos;s itemize →</button>
    </form>
  );
}
