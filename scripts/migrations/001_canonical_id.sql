-- Chesscope migration 001: cross-source canonical game id
--
-- Adds `canonical_id` to `games` for cross-source dedup. Source-specific
-- `id` stays the primary key; multiple source rows can share a
-- `canonical_id` (e.g. a Tata Steel round relayed by both Lichess and
-- TWIC will have two different `id`s but the same `canonical_id`).
--
-- The canonical_id itself is SHA1(UCI_move_list + "|" + Result) and is
-- only set for games with >= 30 plies (15 full moves). Below that the
-- move list is too short to be reliably unique. See
-- canonical_game_id() in scripts/ingest_broadcasts.py.
--
-- Apply with:
--   turso db shell chesscope < scripts/migrations/001_canonical_id.sql
--
-- This migration is idempotent against itself: re-running on a database
-- that already has the column / index will fail at the CREATE INDEX or
-- ALTER TABLE step depending on order. Wrapping in a guard so the second
-- run is a no-op:

-- The column. SQLite has no IF NOT EXISTS for ADD COLUMN, but
-- attempting to add a duplicate column produces a "duplicate column
-- name" error that we can tolerate manually if re-running.
ALTER TABLE games ADD COLUMN canonical_id TEXT;

-- Index. IF NOT EXISTS makes this safely re-runnable.
CREATE INDEX IF NOT EXISTS games_canonical_id_idx ON games (canonical_id);
