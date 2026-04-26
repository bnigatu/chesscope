/**
 * Format a PGN date for display. PGN dates can be partial:
 * "2024.??.??", "2024.06.??", "2024.06.15".
 */
export function formatPgnDate(date: string | null): string {
  if (!date) return "—";
  const [y, m, d] = date.split(".");
  if (y === "????" || !y) return "—";
  if (m === "??" || !m) return y;
  const monthName = MONTHS[parseInt(m, 10) - 1] ?? m;
  if (d === "??" || !d) return `${monthName} ${y}`;
  return `${monthName} ${parseInt(d, 10)}, ${y}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Pretty-print a chess result.
 *   "1-0"     → "1–0"   (en-dash, the typographic norm in chess notation)
 *   "1/2-1/2" → "½–½"
 */
export function formatResult(result: string): string {
  switch (result) {
    case "1-0":
      return "1\u20130";
    case "0-1":
      return "0\u20131";
    case "1/2-1/2":
      return "\u00bd\u2013\u00bd";
    default:
      return result;
  }
}

/**
 * Extract the last name from a "Last, First" PGN name. Falls back to the
 * full string if there's no comma.
 */
export function lastName(full: string): string {
  const i = full.indexOf(",");
  return i < 0 ? full : full.slice(0, i).trim();
}

/**
 * Compose the className utility, local replacement for `clsx` to avoid the
 * dep. Filters falsy values, joins with spaces.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
