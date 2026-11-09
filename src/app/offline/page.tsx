export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <div className="card mt-10 text-center">
      <div className="wiggle mb-3 text-6xl">📵</div>
      <h1 className="text-2xl font-extrabold">You&apos;re offline</h1>
      <p className="mt-2 text-muted">The math will still be fair when you&apos;re back. Promise.</p>
    </div>
  );
}
