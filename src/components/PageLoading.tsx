export function PageLoading() {
  return (
    <div className="grid place-items-center py-24" role="status" aria-label="Loading">
      <div className="wiggle text-5xl">🧮</div>
      <p className="mt-3 font-bold text-muted">Crunching numbers…</p>
    </div>
  );
}
