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
 */
export async function getPlayerGames(slug: string, limit = 100) {
  const db = getDb();
  const rows = await db.all<
    GameHit & { white_elo: number | null; black_elo: number | null }
  >(sql`
    SELECT
      g.id, g.white, g.black, g.event, g.date, g.result,
      g.eco, g.opening, g.broadcast_url, g.white_elo, g.black_elo
    FROM games g
    JOIN players p ON p.slug = ${slug}
    WHERE g.white = p.name OR g.black = p.name
       OR (p.fide_id IS NOT NULL AND (g.white_fide_id = p.fide_id OR g.black_fide_id = p.fide_id))
    ORDER BY g.date DESC, g.timestamp DESC
    LIMIT ${limit}
  `);
  return rows;
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
        (SELECT COUNT(*) FROM games) AS games,
        (SELECT COUNT(*) FROM players) AS players,
        (SELECT COUNT(DISTINCT event) FROM games WHERE event IS NOT NULL) AS events,
        (SELECT MIN(date) FROM games
           WHERE date IS NOT NULL AND date NOT LIKE '%?%') AS earliest,
        (SELECT MAX(date) FROM games
           WHERE date IS NOT NULL AND date NOT LIKE '%?%') AS latest
    `);
    return r;
  },
  ["coverage-stats:v2"],
  { revalidate: 3600, tags: ["coverage"] }
);
