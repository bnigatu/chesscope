/**
 * Format a PGN date for display. PGN dates can be partial:
 * "2024.??.??", "2024.06.??", "2024.06.15". Some non-Lichess sources use
 * "-" instead of ".", and a few have garbage in individual components.
 * Defensive against all of those — never emits "NaN" or partial junk.
 */
export function formatPgnDate(date: string | null): string {
  if (!date) return "—";
  const parts = date.split(/[.\-/]/);
  const [y, m, d] = parts;
  if (!isDigits(y, 4)) return "—";
  if (!isDigits(m, 2)) return y;
  const monthIdx = parseInt(m, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return y;
  if (!isDigits(d, 2)) return `${MONTHS[monthIdx]} ${y}`;
  const day = parseInt(d, 10);
  if (day < 1 || day > 31) return `${MONTHS[monthIdx]} ${y}`;
  return `${MONTHS[monthIdx]} ${day}, ${y}`;
}

function isDigits(s: string | undefined, len: number): boolean {
  return !!s && s.length === len && /^[0-9]+$/.test(s);
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
