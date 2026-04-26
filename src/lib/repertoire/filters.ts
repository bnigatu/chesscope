// Shared filter shape for the Repertoire Explorer.

export type TimeControlKey = "bullet" | "blitz" | "rapid" | "daily";

export type RepertoireFilters = {
  color: "white" | "black";
  mode: "all" | "rated" | "casual";
  timeControls: Record<TimeControlKey, boolean>;
  fromDate: string;
  toDate: string;
  minRating: number;
  maxRating: number;
  opponent: string;
  limit: number;
};

export const DEFAULT_FILTERS: RepertoireFilters = {
  color: "white",
  mode: "all",
  timeControls: { bullet: true, blitz: true, rapid: true, daily: true },
  fromDate: "",
  toDate: "",
  minRating: 0,
  maxRating: 3000,
  opponent: "",
  limit: 0,
};

const TC_KEYS: TimeControlKey[] = ["bullet", "blitz", "rapid", "daily"];

export function filtersToParams(
  base: URLSearchParams,
  filters: RepertoireFilters
): URLSearchParams {
  base.set("color", filters.color);
  if (filters.mode !== "all") base.set("mode", filters.mode);
  const enabledTcs = TC_KEYS.filter((k) => filters.timeControls[k]);
  if (enabledTcs.length !== TC_KEYS.length) {
    base.set("tc", enabledTcs.join(","));
  }
  if (filters.fromDate) base.set("from", filters.fromDate);
  if (filters.toDate) base.set("to", filters.toDate);
  if (filters.minRating > 0) base.set("minR", String(filters.minRating));
  if (filters.maxRating < 3000) base.set("maxR", String(filters.maxRating));
  if (filters.opponent.trim()) base.set("opp", filters.opponent.trim());
  if (filters.limit > 0) base.set("limit", String(filters.limit));
  return base;
}

export function filtersFromParams(
  sp: Record<string, string | undefined>
): RepertoireFilters {
  const f = { ...DEFAULT_FILTERS };
  if (sp.color === "black") f.color = "black";
  if (sp.mode === "rated" || sp.mode === "casual") f.mode = sp.mode;
  if (sp.tc) {
    const allowed = new Set(sp.tc.split(",") as TimeControlKey[]);
    f.timeControls = {
      bullet: allowed.has("bullet"),
      blitz: allowed.has("blitz"),
      rapid: allowed.has("rapid"),
      daily: allowed.has("daily"),
    };
  }
  if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) f.fromDate = sp.from;
  if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) f.toDate = sp.to;
  if (sp.minR && /^\d+$/.test(sp.minR)) f.minRating = parseInt(sp.minR, 10);
  if (sp.maxR && /^\d+$/.test(sp.maxR)) f.maxRating = parseInt(sp.maxR, 10);
  if (sp.opp) f.opponent = sp.opp;
  if (sp.limit && /^\d+$/.test(sp.limit)) f.limit = parseInt(sp.limit, 10);
  return f;
}

/**
 * Approximate Lichess perfType from a chess.com TimeControl tag.
 * TimeControl format: "S+I" (S base seconds, I increment) or "1/N" for
 * daily / correspondence (N seconds per move).
 *
 * Lichess buckets, base + 40*inc:
 *   < 30s         ultraBullet
 *   < 180s        bullet
 *   < 480s        blitz
 *   < 1500s       rapid
 *   >= 1500s      classical
 *   "1/N"         correspondence (= daily)
 */
export function classifyTimeControl(
  tc: string | undefined
): TimeControlKey | null {
  if (!tc) return null;
  if (tc.startsWith("1/")) return "daily";
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return null;
  const base = parseInt(m[1], 10);
  const inc = parseInt(m[2] ?? "0", 10);
  const total = base + 40 * inc;
  if (total < 180) return "bullet";
  if (total < 480) return "blitz";
  if (total < 1500) return "rapid";
  return "rapid";
}
