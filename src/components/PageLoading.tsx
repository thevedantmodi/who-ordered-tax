export function PageLoading() {
  return (
    <div className="space-y-4 pt-2" role="status" aria-label="Loading">
      <div className="h-28 animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-16 animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-16 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  );
}
