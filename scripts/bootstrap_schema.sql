-- Chesscope FTS5 bootstrap
--
-- Run AFTER `npm run db:push` to apply Drizzle's schema. This adds the
-- search virtual tables and triggers that keep them in sync with the base
-- tables. SQLite/libSQL FTS5 isn't expressible in Drizzle, so it lives here.
--
-- Apply with:
--   turso db shell chesscope < scripts/bootstrap_schema.sql

-- ---------------------------------------------------------------------------
-- Players FTS, used by the homepage typeahead. trigram tokenizer gives us
-- substring + fuzzy match for messy chess names (Shtivelband / Schtivelband).
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS players_fts USING fts5(
  slug UNINDEXED,
  name,
  fide_id UNINDEXED,
  tokenize = "trigram"
);

-- Sync triggers
CREATE TRIGGER IF NOT EXISTS players_ai AFTER INSERT ON players BEGIN
  INSERT INTO players_fts(rowid, slug, name, fide_id)
  VALUES (new.rowid, new.slug, new.name, new.fide_id);
END;

CREATE TRIGGER IF NOT EXISTS players_ad AFTER DELETE ON players BEGIN
  DELETE FROM players_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS players_au AFTER UPDATE ON players BEGIN
  DELETE FROM players_fts WHERE rowid = old.rowid;
  INSERT INTO players_fts(rowid, slug, name, fide_id)
  VALUES (new.rowid, new.slug, new.name, new.fide_id);
END;

-- ---------------------------------------------------------------------------
-- Games FTS, over event/opening/players/round so the global search bar can
-- match "carlsen tata steel 2024" or "vienna game 2025".
-- Uses the porter tokenizer for stemming on the prose-y fields.
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS games_fts USING fts5(
  id UNINDEXED,
  white,
  black,
  event,
  opening,
  eco UNINDEXED,
  date UNINDEXED,
  tokenize = "porter unicode61 remove_diacritics 2"
);

CREATE TRIGGER IF NOT EXISTS games_ai AFTER INSERT ON games BEGIN
  INSERT INTO games_fts(rowid, id, white, black, event, opening, eco, date)
  VALUES (new.rowid, new.id, new.white, new.black,
          coalesce(new.event,''), coalesce(new.opening,''),
          coalesce(new.eco,''), coalesce(new.date,''));
END;

CREATE TRIGGER IF NOT EXISTS games_ad AFTER DELETE ON games BEGIN
  DELETE FROM games_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS games_au AFTER UPDATE ON games BEGIN
  DELETE FROM games_fts WHERE rowid = old.rowid;
  INSERT INTO games_fts(rowid, id, white, black, event, opening, eco, date)
  VALUES (new.rowid, new.id, new.white, new.black,
          coalesce(new.event,''), coalesce(new.opening,''),
          coalesce(new.eco,''), coalesce(new.date,''));
END;
