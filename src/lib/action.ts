import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";

/** An error whose message is meant for the person using the app ("Enter an amount"). */
export class UserError extends Error {}

/** What actions return when something expected goes wrong. Shown to the user as-is. */
export type ActionError = { error: string };

/**
 * Run a server action body and turn expected failures into a returned `{ error }` value.
 *
 * Next.js hides the message of anything a server action *throws* in production, so throwing
 * "Enter an amount" would reach the browser as an unreadable "Minified React error". Returning the
 * message keeps it readable. Redirects and notFound() are rethrown so navigation still works, and
 * anything unexpected is logged and reported generically (no internals leak to the page).
 */
export async function guard<T>(fn: () => Promise<T>): Promise<T | ActionError> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Please check what you entered." };
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }
}
