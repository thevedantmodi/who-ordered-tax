"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mt-10 text-center">
      <div className="mb-3 text-6xl">💥</div>
      <h1 className="text-2xl font-extrabold">Well, that broke</h1>
      <p className="mt-2 text-muted">Nobody ordered this error either.</p>
      <button onClick={reset} className="btn btn-pink mt-4">
        Try again
      </button>
    </div>
  );
}
