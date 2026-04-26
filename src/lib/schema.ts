/**
 * Chesscope database schema.
 *
 * Source of truth: the Lichess broadcast PGN dump
 * (https://database.lichess.org/#broadcasts). PGN tag names map directly to
 * column names where possible, keeping the mapping obvious helps when
 * extending to other sources (chess.com PGN export, TWIC, etc.).
 *
 * The actual FTS5 virtual table is created in scripts/bootstrap_schema.sql
 *, Drizzle doesn't model FTS5 declaratively, so we keep that DDL alongside
 * the migration files instead of trying to express it here.
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * One row per game. `id` is a hash of (event, round, white, black, date) so
 * re-ingesting the same dump is idempotent (no duplicates).
 */
export const games = sqliteTable(
  "games",
  {
    id: text("id").primaryKey(), // SHA1 of the PGN tag tuple, hex-encoded
    source: text("source").notNull().default("lichess_broadcast"),
    // Player metadata, mirrors PGN tag names.
    white: text("white").notNull(),
    black: text("black").notNull(),
    whiteFideId: text("white_fide_id"),
    blackFideId: text("black_fide_id"),
    whiteElo: integer("white_elo"),
    blackElo: integer("black_elo"),
    whiteTitle: text("white_title"),
    blackTitle: text("black_title"),
    // Event metadata.
    event: text("event"),
    round: text("round"),
    board: text("board"),
    date: text("date"), // ISO YYYY-MM-DD; some PGNs use ?? for unknown parts
    timestamp: integer("timestamp"), // unix seconds, derived from UTCDate+UTCTime
    timeControl: text("time_control"),
    eco: text("eco"),
    opening: text("opening"),
    result: text("result").notNull(), // "1-0" / "0-1" / "1/2-1/2" / "*"
    plyCount: integer("ply_count"),
    // Lichess-specific (nullable for other sources).
    broadcastName: text("broadcast_name"),
    broadcastUrl: text("broadcast_url"),
    studyName: text("study_name"),
    chapterName: text("chapter_name"),
    // Full PGN body (moves + comments). Optional, set to null and store
    // only at the source URL if you want to keep the row tiny.
    pgn: text("pgn"),
    // Bookkeeping.
    ingestedAt: integer("ingested_at").notNull(),
  },
  (t) => ({
    whiteIdx: index("games_white_idx").on(t.white),
    blackIdx: index("games_black_idx").on(t.black),
    fideWhiteIdx: index("games_white_fide_idx").on(t.whiteFideId),
    fideBlackIdx: index("games_black_fide_idx").on(t.blackFideId),
    eventIdx: index("games_event_idx").on(t.event),
    dateIdx: index("games_date_idx").on(t.date),
  }),
);

/**
 * Aggregated player view. Populated by the ingestion script; lets us
 * pre-render top-N pages at build time without an aggregate query per render.
 */
export const players = sqliteTable(
  "players",
  {
    slug: text("slug").primaryKey(), // url-safe; see lib/slug.ts
    name: text("name").notNull(), // canonical display form: "Last, First"
    fideId: text("fide_id"),
    title: text("title"),
    peakElo: integer("peak_elo"),
    latestElo: integer("latest_elo"),
    gameCount: integer("game_count").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    firstSeen: text("first_seen"),
    lastSeen: text("last_seen"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    nameIdx: index("players_name_idx").on(t.name),
    fideIdx: index("players_fide_idx").on(t.fideId),
    activityIdx: index("players_activity_idx").on(t.gameCount),
  }),
);

/**
 * Bookkeeping for the ingestion job, tracks which monthly dumps and
 * timestamps we've already processed so reruns are cheap.
 */
export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type Game = typeof games.$inferSelect;
export type Player = typeof players.$inferSelect;
