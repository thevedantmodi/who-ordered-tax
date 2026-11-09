export const metadata = { title: "Check your email" };

export default function Check() {
  return (
    <div className="card mt-8 text-center">
      <div className="wiggle mb-3 text-6xl">📬</div>
      <h1 className="text-3xl font-extrabold">Check your inbox</h1>
      <p className="mt-2 text-muted">We sent you a magic link. Tap it and you&apos;re in.</p>
      {process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY && (
        <p className="mt-4 rounded-2xl bg-lime/40 p-3 text-sm">
          Dev mode: the link is printed in the server console.
        </p>
      )}
    </div>
  );
}
