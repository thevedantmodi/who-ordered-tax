"use client";

import { useState, useTransition } from "react";

const GENERIC = "Something went wrong. Please try again.";

/**
 * Next.js navigates by throwing special errors from server actions (redirect(), notFound()).
 * They reach client code that awaits the action, but they aren't failures: the router is already
 * handling them, so they must never be shown as an error message.
 */
function isNavigationSignal(e: unknown) {
  const err = e as { digest?: unknown; message?: unknown } | null;
  const tag = typeof err?.digest === "string" ? err.digest : typeof err?.message === "string" ? err.message : "";
  return tag.startsWith("NEXT_REDIRECT") || tag.startsWith("NEXT_HTTP_ERROR_FALLBACK") || tag === "NEXT_NOT_FOUND";
}

/**
 * Call a server action. Returns the message to show the user, or null if it worked.
 * Actions report expected problems by returning `{ error }` (see src/lib/action.ts).
 */
export async function callAction(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    const result = await fn();
    if (result && typeof result === "object" && "error" in result && typeof result.error === "string") {
      return result.error;
    }
    return null;
  } catch (e) {
    if (isNavigationSignal(e)) return null;
    console.error(e);
    return GENERIC;
  }
}

/** `run(action, onSuccess)` with pending state and a user-readable error message. */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const message = await callAction(fn);
      if (message) setError(message);
      else after?.();
    });
  };
  return { pending, error, setError, run };
}
