/**
 * Query helpers for the search routes.
 *
 * We bypass Drizzle for FTS5 calls because the virtual tables aren't in the
 * Drizzle schema (FTS5 syntax isn't expressible declaratively). Raw SQL via
 * libSQL is fine, these are simple, parameterized queries and we want full
 * control over the MATCH expression.
 */
import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { getDb, schema } from "./db";

export type PlayerHit = {
  slug: string;
  name: string;
  fideId: string | null;
  gameCount: number;
  peakElo: number | null;
};

export type GameHit = {
  id: string;
  white: string;
  black: string;
  event: string | null;
  date: string | null;
  result: string;
  eco: string | null;
  opening: string | null;
  broadcastUrl: string | null;
};

/**
 * Sanitize a user query for FTS5. FTS5's MATCH syntax has reserved chars
 * (-, *, AND, OR, NOT, NEAR) that throw if passed raw. We quote each term
 * and join with implicit AND, plus a final prefix-match on the last token
 * for "type-as-you-go" feel.
 */
function ftsQuery(raw: string): string {
  const terms = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/"/g, "")); // strip quotes; we re-add them
  if (terms.length === 0) return '""';
  const last = terms.pop()!;
  const head = terms.map((t) => `"${t}"`).join(" ");
  // prefix match the last token: matches "carl" → carlsen, carl, etc.
  return head ? `${head} "${last}"*` : `"${last}"*`;
}

/**
 * Player search, used by the typeahead and the homepage results.
 * Ranks by FTS5 BM25 then by activity (more games → more relevant).
 */
export async function searchPlayers(
  query: string,
  limit = 20,
): Promise<PlayerHit[]> {
  if (!query.trim()) return [];
  const db = getDb();
  const match = ftsQuery(query);
  const rows = await db.all<{
    slug: string;
    name: string;
    fide_id: string | null;
    game_count: number;
    peak_elo: number | null;
  }>(sql`
    SELECT
      p.slug, p.name, p.fide_id, p.game_count, p.peak_elo
    FROM players_fts f
    JOIN players p ON p.slug = f.slug
    WHERE players_fts MATCH ${match}
    ORDER BY bm25(players_fts) ASC, p.game_count DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    fideId: r.fide_id,
    gameCount: r.game_count,
    peakElo: r.peak_elo,
  }));
}

/**
 * Game search, used when the user wants games, not players.
 * E.g. "carlsen vs ding 2024" or "vienna game 2025".
 */
export async function searchGames(
  query: string,
  limit = 50,
): Promise<GameHit[]> {
  if (!query.trim()) return [];
  const db = getDb();
  const match = ftsQuery(query);
  const rows = await db.all<{
    id: string;
    white: string;
    black: string;
    event: string | null;
    date: string | null;
    result: string;
    eco: string | null;
    opening: string | null;
    broadcast_url: string | null;
  }>(sql`
    SELECT
      g.id, g.white, g.black, g.event, g.date, g.result,
      g.eco, g.opening, g.broadcast_url
    FROM games_fts f
    JOIN games g ON g.id = f.id
    WHERE games_fts MATCH ${match}
    ORDER BY bm25(games_fts) ASC, g.date DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    id: r.id,
    white: r.white,
    black: r.black,
    event: r.event,
    date: r.date,
    result: r.result,
    eco: r.eco,
    opening: r.opening,
    broadcastUrl: r.broadcast_url,
  }));
}

/**
 * Fetch the full player record by slug. Returns null if unknown.
 */
export async function getPlayer(slug: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.players)
    .where(sql`slug = ${slug}`)
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Fetch a player's games, most recent first.
 *
 * Performance note: the obvious shape (single SELECT with `g.white = p.name
 * OR g.black = p.name OR ... white_fide_id ... OR ... black_fide_id ...`)
 * is a query-plan trap. SQLite can't use any index for an OR'd predicate
 * across four different columns and falls back to a games-table scan —
 * fatal at million-row scale. Some popular players hung the request
 * entirely (>120s timeout in production probes).
 *
 * Two-step approach:
 *   1. Resolve the player by slug PK (fast).
 *   2. Fire 2-4 small per-column queries in parallel, each with its own
 *      ORDER BY date DESC LIMIT — every query becomes an indexed lookup
 *      with an early stop. SQLite walks at most `limit` rows per branch.
 *   3. Merge the results in JS, dedupe by game id, sort, slice.
 *
 * Tradeoff: 3-5 round-trips instead of 1. Each round-trip is ~100-500ms;
 * total budget ~0.5-2s even for very active players. Compares favorably
 * to the >120s timeouts of the OR-based version.
 */
export async function getPlayerGames(slug: string, limit = 100) {
  const player = await getPlayer(slug);
  if (!player) return [];

  const db = getDb();
  type Row = GameHit & {
    white_elo: number | null;
    black_elo: number | null;
    timestamp: number | null;
  };
  const cols = sql`g.id, g.white, g.black, g.event, g.date, g.result,
                   g.eco, g.opening, g.broadcast_url,
                   g.white_elo, g.black_elo, g.timestamp`;

  // Each branch is an indexed equality + ORDER BY + LIMIT — SQLite can
  // walk the index in date order and stop early. white/black columns
  // are indexed via games_white_idx / games_black_idx, fide columns via
  // games_white_fide_idx / games_black_fide_idx.
  const branches: Promise<Row[]>[] = [
    db.all<Row>(sql`SELECT ${cols} FROM games g
                     WHERE g.white = ${player.name}
                     ORDER BY g.date DESC, g.timestamp DESC
                     LIMIT ${limit}`),
    db.all<Row>(sql`SELECT ${cols} FROM games g
                     WHERE g.black = ${player.name}
                     ORDER BY g.date DESC, g.timestamp DESC
                     LIMIT ${limit}`),
  ];
  if (player.fideId) {
    branches.push(
      db.all<Row>(sql`SELECT ${cols} FROM games g
                       WHERE g.white_fide_id = ${player.fideId}
                       ORDER BY g.date DESC, g.timestamp DESC
                       LIMIT ${limit}`),
      db.all<Row>(sql`SELECT ${cols} FROM games g
                       WHERE g.black_fide_id = ${player.fideId}
                       ORDER BY g.date DESC, g.timestamp DESC
                       LIMIT ${limit}`),
    );
  }

  const results = await Promise.all(branches);
  const merged = new Map<string, Row>();
  for (const rows of results) {
    for (const r of rows) merged.set(r.id, r);
  }
  const sorted = [...merged.values()].sort((a, b) => {
    const d = (b.date ?? "").localeCompare(a.date ?? "");
    if (d !== 0) return d;
    return (b.timestamp ?? 0) - (a.timestamp ?? 0);
  });
  // Strip the timestamp scratch column before returning — callers only
  // expect the GameHit + elo shape.
  return sorted.slice(0, limit).map(({ timestamp: _t, ...rest }) => rest);
}

/**
 * Fetch the top N most active players. Used by `generateStaticParams` to
 * pre-render the most-trafficked pages at build time.
 */
export async function getTopPlayers(limit = 5000) {
  const db = getDb();
  return db
    .select({
      slug: schema.players.slug,
      name: schema.players.name,
      gameCount: schema.players.gameCount,
    })
    .from(schema.players)
    .orderBy(sql`game_count DESC`)
    .limit(limit);
}

/**
 * Fetch a single game by ID.
 */
export async function getGame(id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.games)
    .where(sql`id = ${id}`)
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Coverage stats for the homepage / about page.
 *
 * Wrapped in `unstable_cache` so the heavy aggregate (5 sub-queries
 * including a COUNT(DISTINCT) over games.event) is computed once per
 * hour across all requests, even in dev. Without this the about page
 * pays a full round-trip to Turso on every load. The underlying ingest
 * only runs weekly so a 1-hour TTL is generous enough to be invisible
 * to users and tight enough to reflect new data soon after sync.
 */
export const getCoverageStats = unstable_cache(
  async () => {
    const db = getDb();
    const [r] = await db.all<{
      games: number;
      players: number;
      events: number;
      earliest: string | null;
      latest: string | null;
    }>(sql`
      SELECT
        -- Distinct canonical games (deduped across sources) PLUS
        -- short games that don't have a canonical_id (sub-30-ply
        -- aborts/repetitions). For Lichess-only ingest the two
        -- branches sum to about COUNT(*) since cross-source overlap
        -- is zero, but the math is correct for any source mix.
        ((SELECT COUNT(DISTINCT canonical_id) FROM games WHERE canonical_id IS NOT NULL)
         + (SELECT COUNT(*) FROM games WHERE canonical_id IS NULL)) AS games,
        (SELECT COUNT(*) FROM players) AS players,
        (SELECT COUNT(DISTINCT event) FROM games WHERE event IS NOT NULL) AS events,
        (SELECT MIN(date) FROM games
           WHERE date IS NOT NULL AND date NOT LIKE '%?%') AS earliest,
        (SELECT MAX(date) FROM games
           WHERE date IS NOT NULL AND date NOT LIKE '%?%') AS latest
    `);
    return r;
  },
  // Cache key bumped to v3 so the change in semantics doesn't serve
  // a stale v2 entry.
  ["coverage-stats:v3"],
  { revalidate: 3600, tags: ["coverage"] }
);
