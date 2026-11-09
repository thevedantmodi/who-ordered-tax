import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import type { EmailConfig } from "next-auth/providers/email";
import type { Provider } from "next-auth/providers";
import { db } from "@/lib/db";

/**
 * Magic-link email provider. Sends through Resend when RESEND_API_KEY is set,
 * otherwise prints the sign-in link to the server console (handy in dev).
 */
const magicLink: EmailConfig = {
  id: "email",
  type: "email",
  name: "Email",
  maxAge: 24 * 60 * 60,
  async sendVerificationRequest({ identifier, url }) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.log(`\n🔗 Magic link for ${identifier}:\n${url}\n`);
      return;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Who Ordered Tax <onboarding@resend.dev>",
        to: identifier,
        subject: "Your sign-in link 🧾",
        text: `Tap to sign in to Who Ordered Tax:\n\n${url}\n\nIf you didn't ask for this, ignore it.`,
        html: `<p>Tap to sign in to <b>Who Ordered Tax</b>:</p><p><a href="${url}">Sign in</a></p><p>If you didn't ask for this, ignore it.</p>`,
      }),
    });
    if (!res.ok) throw new Error(`Resend error: ${res.status} ${await res.text()}`);
  },
};

const providers: Provider[] = [magicLink];
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
if (googleEnabled) providers.push(Google);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers,
  session: { strategy: "database" },
  pages: { signIn: "/login", verifyRequest: "/login/check" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
