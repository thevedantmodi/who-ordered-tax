import Link from "next/link";
import type { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { signOutAction } from "@/app/actions";
import { isDemoEmail } from "@/lib/demo";

function Frame({ home, right, banner }: { home: string; right?: ReactNode; banner?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
        <Link href={home} className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-xs font-bold text-accent-fg">%</span>
          Who Ordered Tax
        </Link>
        {right}
      </div>
      {banner}
    </header>
  );
}

export function HeaderShell() {
  return <Frame home="/" />;
}

export async function Header() {
  const session = await getSession();
  const demo = isDemoEmail(session?.user?.email);
  return (
    <Frame
      home={session ? "/bills" : "/"}
      banner={
        demo && (
          <div className="border-t border-line bg-accent-soft px-4 py-2 text-center text-xs text-accent">
            You&apos;re using a demo account. It&apos;s deleted after 24 hours. Open a bill&apos;s share link in a private window to see the guest view.
          </div>
        )
      }
      right={
        session ? (
          <form action={signOutAction}>
            <button className="btn-quiet text-sm font-medium">{demo ? "Exit demo" : "Sign out"}</button>
          </form>
        ) : (
          <Link href="/login" className="btn-quiet text-sm font-medium">
            Sign in
          </Link>
        )
      }
    />
  );
}
