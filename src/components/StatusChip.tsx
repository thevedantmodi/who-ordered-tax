const styles = {
  OPEN: { cls: "bg-lime", label: "🟢 open" },
  LOCKED: { cls: "bg-tangerine", label: "🔒 locked" },
  SETTLED: { cls: "bg-sky", label: "✅ settled" },
} as const;

export function StatusChip({ status }: { status: keyof typeof styles }) {
  const s = styles[status];
  return <span className={`chip !py-0 text-xs text-[#1b1a1f] ${s.cls}`}>{s.label}</span>;
}
