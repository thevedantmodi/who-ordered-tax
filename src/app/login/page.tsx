import { redirect } from "next/navigation";
import { googleEnabled } from "@/auth";
import { getSession } from "@/lib/session";
import { signInWithEmail, signInWithGoogle } from "@/app/actions";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { callbackUrl, error } = await searchParams;
  const cb = typeof callbackUrl === "string" && callbackUrl.startsWith("/") ? callbackUrl : "/bills";
  if (await getSession()) redirect(cb);

  return (
    <div className="card mt-8 space-y-5">
      <div>
        <div className="mb-2 text-5xl">👋</div>
        <h1 className="text-3xl font-extrabold">Sign in</h1>
        <p className="text-muted">Only whoever paid needs an account. Everyone else just needs the link.</p>
      </div>

      {error && (
        <p className="rounded-2xl border-[3px] border-ink bg-tangerine p-3 font-bold text-[#1b1a1f]">
          {error === "email" ? "That email looks off. Try again?" : "Sign-in hiccup. Try again?"}
        </p>
      )}

      <form action={signInWithEmail} className="space-y-3">
        <input type="hidden" name="callbackUrl" value={cb} />
        <label className="block">
          <span className="label">Email</span>
          <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="input" />
        </label>
        <button className="btn btn-pink w-full">Email me a magic link ✨</button>
      </form>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs font-bold uppercase text-muted">
            <div className="h-[3px] flex-1 rounded bg-ink/20" /> or <div className="h-[3px] flex-1 rounded bg-ink/20" />
          </div>
          <form action={signInWithGoogle}>
            <input type="hidden" name="callbackUrl" value={cb} />
            <button className="btn btn-ghost w-full">Continue with Google</button>
          </form>
        </>
      )}
    </div>
  );
}
