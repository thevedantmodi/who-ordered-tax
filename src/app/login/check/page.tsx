export const metadata = { title: "Check your email" };

export default function Check() {
  return (
    <div className="card mt-8 space-y-2 text-center">
      <h1 className="text-2xl font-semibold">Check your email</h1>
      <p className="text-sm text-muted">We sent you a sign-in link. Open it on this device to continue.</p>
      {process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY && (
        <p className="notice mt-4">Development mode: the link is printed in the server console.</p>
      )}
    </div>
  );
}
