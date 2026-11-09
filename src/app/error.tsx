"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mt-10 space-y-3 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">Please try again.</p>
      <button onClick={reset} className="btn btn-primary">
        Try again
      </button>
    </div>
  );
}
