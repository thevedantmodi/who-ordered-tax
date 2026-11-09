import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mt-10 space-y-3 text-center">
      <h1 className="text-xl font-semibold">Bill not found</h1>
      <p className="text-sm text-muted">The link may be wrong, or the bill was deleted.</p>
      <Link href="/" className="btn btn-primary">
        Go home
      </Link>
    </div>
  );
}
