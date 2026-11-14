/**
 * Per-person colors. People get a color by their position on the bill (`color` index), so everyone
 * on a bill gets a distinct color up to palette length. Ordered so neighbours contrast.
 */
const palette = [
  "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/50 dark:text-fuchsia-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200",
];

/** Background + text classes for a person's color, shared by their avatar and name pills. */
export function personColor(color: number) {
  return palette[((color % palette.length) + palette.length) % palette.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, color, size = "md" }: { name: string; color: number; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-5 w-5 text-[10px]" : "h-9 w-9 text-xs";
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-full font-semibold ${cls} ${personColor(color)}`}
    >
      {initials(name)}
    </span>
  );
}

/** Overlapping avatars; `people` must be in bill order so colors match the rest of the bill. */
export function AvatarStack({ people }: { people: { id: string; displayName: string }[] }) {
  return (
    <span className="flex -space-x-2">
      {people.slice(0, 5).map((p, i) => (
        <span key={p.id} className="rounded-full ring-2 ring-surface">
          <Avatar name={p.displayName} color={i} />
        </span>
      ))}
      {people.length > 5 && (
        <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-xs font-semibold ring-2 ring-surface">
          +{people.length - 5}
        </span>
      )}
    </span>
  );
}
