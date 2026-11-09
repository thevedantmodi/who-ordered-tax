import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

const steps = [
  { title: "Enter the receipt", body: "Add items, tax, tip and any fees." },
  { title: "Share a link", body: "Friends open it and join with their name. No account needed." },
  { title: "Everyone picks their items", body: "Shared dishes are split between whoever had them." },
  { title: "Get exact totals", body: "Tax and tip are split in proportion to what each person ordered." },
];

export default async function Home() {
  if (await getSession()) redirect("/bills");

  return (
    <div className="space-y-10 pt-8">
      <section className="space-y-4">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">
          Split itemized bills, down to the cent.
        </h1>
        <p className="text-lg text-muted">
          Everyone pays for what they ordered, plus their fair share of tax and tip. No spreadsheets, no rounding
          arguments.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/login?callbackUrl=/bills/new" className="btn btn-primary px-5 py-3 text-base">
            Split a bill
          </Link>
          <Link href="/login" className="btn btn-secondary px-5 py-3 text-base">
            Sign in
          </Link>
        </div>
      </section>

      <ol className="card divide-y divide-line !p-0">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4 p-5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
              {i + 1}
            </span>
            <div>
              <h2 className="font-semibold">{s.title}</h2>
              <p className="text-sm text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-center text-sm text-muted">Free to use. No limits on how many bills you split.</p>
    </div>
  );
}
