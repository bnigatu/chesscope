/**
 * Player slug = url-safe lowercase form of "Last, First" with diacritics
 * stripped. Stable across re-ingestions so URLs don't break.
 *
 *   "Carlsen, Magnus"  →  "carlsen-magnus"
 *   "Nepomniachtchi, Ian"  →  "nepomniachtchi-ian"
 *   "Ding, Liren"  →  "ding-liren"
 *   "MVL"  →  "mvl"  (rare; some PGNs use abbreviations)
 */
export function playerSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks
    .toLowerCase()
    .replace(/[,]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Reverse-ish: produce a display name from a slug. Used as a fallback when
 * we don't have the canonical row in the players table yet.
 */
export function slugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
