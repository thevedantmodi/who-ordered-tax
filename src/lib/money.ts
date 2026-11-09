const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(cents: number): string {
  return fmt.format(cents / 100);
}

/** Parses "$12.34", "12.3", "12" -> cents. Returns null if not a valid amount. */
export function parseMoney(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/[$,\s]/g, "");
  if (cleaned === "") return 0;
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === "." || cleaned === "-") return null;
  return Math.round(parseFloat(cleaned) * 100);
}
