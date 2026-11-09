export const EMOJIS = [
  "🦝", "🐸", "🦊", "🐼", "🐙", "🦄", "🐝", "🐢", "🦖", "🐧",
  "🍕", "🌮", "🍣", "🍩", "🥑", "🌶️", "🍟", "🧋", "🍔", "🥟",
] as const;

export function randomEmoji(): string {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

export function isEmoji(s: unknown): s is string {
  return typeof s === "string" && (EMOJIS as readonly string[]).includes(s);
}
