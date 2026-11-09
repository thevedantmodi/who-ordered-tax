import Link from "next/link";
import type { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { signOutAction } from "@/app/actions";

function Frame({ home, right }: { home: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b-[3px] border-ink bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
        <Link href={home} className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <span className="grid h-9 w-9 place-items-center rounded-xl border-[3px] border-ink bg-pink text-lg">🧾</span>
          <span>
            who ordered <span className="text-pink">tax?</span>
          </span>
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
            <button className="text-sm font-bold text-muted underline-offset-4 hover:underline">Sign out</button>
          </form>
        ) : (
          <Link href="/login" className="text-sm font-bold underline-offset-4 hover:underline">
            Sign in
          </Link>
        )
      }
    />
  );
}
