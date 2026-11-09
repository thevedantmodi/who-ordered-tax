import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

const steps = [
  { emoji: "🧾", color: "bg-tangerine", title: "Punch in the receipt", body: "Items, tax, tip, fees. Takes a minute." },
  { emoji: "🔗", color: "bg-sky", title: "Drop the link in the group chat", body: "Friends join with a name. No app, no signup." },
  { emoji: "👆", color: "bg-lime", title: "Everyone taps what they ate", body: "Shared the nachos? Tap it too, we'll split it." },
  { emoji: "🎯", color: "bg-pink", title: "Exact-cent totals", body: "Tax & tip split by what you ordered. Zero orphan pennies." },
];

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/bills");

  return (
    <div className="space-y-8 pt-6">
      <section className="space-y-4">
        <p className="chip bg-lime">🚫 nobody ordered tax</p>
        <h1 className="text-5xl font-extrabold leading-[0.95] tracking-tight">
          Split the bill like a <span className="inline-block -rotate-2 rounded-xl bg-pink px-2">genius</span>, not a
          calculator.
        </h1>
        <p className="text-lg text-muted">
          The $187 dinner, split to the cent. Everyone pays for what they actually ordered, plus their fair slice of
          tax and tip.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/login?callbackUrl=/bills/new" className="btn btn-pink text-lg">
            Split a bill →
          </Link>
          <Link href="/login" className="btn btn-ghost">
            Sign in
          </Link>
        </div>
      </section>

      <section className="grid gap-4">
        {steps.map((s, i) => (
          <div key={s.title} className="card flex items-start gap-4" style={{ rotate: `${i % 2 ? 0.6 : -0.6}deg` }}>
            <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border-[3px] border-ink text-2xl ${s.color}`}>
              {s.emoji}
            </div>
            <div>
              <h2 className="text-lg font-extrabold">{s.title}</h2>
              <p className="text-muted">{s.body}</p>
            </div>
          </div>
        ))}
      </section>

      <p className="text-center text-sm text-muted">Free. No daily expense limits. We&apos;re not like the other apps. 💅</p>
    </div>
  );
}
