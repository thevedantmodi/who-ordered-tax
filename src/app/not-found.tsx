import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mt-10 text-center">
      <div className="wiggle mb-3 text-6xl">🕵️</div>
      <h1 className="text-2xl font-extrabold">Can&apos;t find that bill</h1>
      <p className="mt-2 text-muted">Maybe someone deleted it. Or ate it.</p>
      <Link href="/" className="btn btn-pink mt-4">
        Go home
      </Link>
    </div>
  );
}
