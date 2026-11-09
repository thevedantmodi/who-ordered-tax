import Link from "next/link";
import type { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { signOutAction } from "@/app/actions";

function Frame({ home, right }: { home: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
        <Link href={home} className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-xs font-bold text-accent-fg">%</span>
          Who Ordered Tax
        </Link>
        {right}
      </div>
    </header>
  );
}

export function HeaderShell() {
  return <Frame home="/" />;
}

export async function Header() {
  const session = await getSession();
  return (
    <Frame
      home={session ? "/bills" : "/"}
      right={
        session ? (
          <form action={signOutAction}>
            <button className="btn-quiet text-sm font-medium">Sign out</button>
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
