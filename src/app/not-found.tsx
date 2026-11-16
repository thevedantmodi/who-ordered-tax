import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mt-10 space-y-3 text-center">
      <h1 className="text-xl font-semibold">Link not found</h1>
      <p className="text-sm text-muted">The link may be mistyped, or the bill or group was deleted.</p>
      <Link href="/" className="btn btn-primary">
        Go home
      </Link>
    </div>
  );
}
