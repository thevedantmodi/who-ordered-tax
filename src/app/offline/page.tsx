export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <div className="card mt-10 space-y-2 text-center">
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="text-sm text-muted">Reconnect to see the latest version of your bills.</p>
    </div>
  );
}
