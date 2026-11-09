const styles = {
  OPEN: { cls: "bg-accent-soft text-accent", label: "Open" },
  LOCKED: { cls: "bg-warn-soft text-warn-fg", label: "Locked" },
  SETTLED: { cls: "bg-surface-2 text-muted", label: "Settled" },
} as const;

export function StatusChip({ status }: { status: keyof typeof styles }) {
  const s = styles[status];
  return <span className={`chip ${s.cls}`}>{s.label}</span>;
}
