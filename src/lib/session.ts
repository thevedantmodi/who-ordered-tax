import "server-only";
import { connection } from "next/server";
import { auth } from "@/auth";

/**
 * Read the session at request time. `connection()` tells Next this is dynamic,
 * so Auth.js's crypto calls don't trip Cache Components' prerender checks.
 */
export async function getSession() {
  await connection();
  return auth();
}
