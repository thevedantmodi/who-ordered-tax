import { redirect } from "next/navigation";
import { googleEnabled } from "@/auth";
import { getSession } from "@/lib/session";
import { signInWithEmail, signInWithGoogle } from "@/app/actions";
import { DemoButton } from "@/components/DemoButton";
import { demoEnabled } from "@/lib/demo";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { callbackUrl, error } = await searchParams;
  const cb = typeof callbackUrl === "string" && callbackUrl.startsWith("/") ? callbackUrl : "/bills";
  if (await getSession()) redirect(cb);

  return (
    <div className="card mt-8 space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted">Only the person who paid needs an account. Everyone else just uses the link.</p>
      </div>

      {error && (
        <p className="notice">{error === "email" ? "That email address doesn't look right." : "Something went wrong. Please try again."}</p>
      )}

      <form action={signInWithEmail} className="space-y-3">
        <input type="hidden" name="callbackUrl" value={cb} />
        <label className="block">
          <span className="label">Email</span>
          <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="input" />
        </label>
        <button className="btn btn-primary w-full">Email me a sign-in link</button>
      </form>

      {(googleEnabled || demoEnabled()) && (
        <div className="flex items-center gap-3 text-xs text-muted">
          <div className="h-px flex-1 bg-line" /> or <div className="h-px flex-1 bg-line" />
        </div>
      )}
      {googleEnabled && (
        <form action={signInWithGoogle}>
          <input type="hidden" name="callbackUrl" value={cb} />
          <button className="btn btn-secondary w-full">Continue with Google</button>
        </form>
      )}
      <DemoButton />
    </div>
  );
}
