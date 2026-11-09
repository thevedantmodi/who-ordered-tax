"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Poor man's realtime: re-fetch server data every few seconds while the tab is visible. */
export function AutoRefresh({ ms = 4000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, ms]);
  return null;
}
