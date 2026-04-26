// Drops FTS5 virtual tables (and their shadow tables, transparently).
// Use when the FTS bootstrap left orphans that confuse drizzle-kit push.
//
// Run with: node --env-file=.env scripts/reset_fts.mjs

import { createClient } from "@libsql/client";

const url = process.env.TURSO_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Missing TURSO_URL or TURSO_AUTH_TOKEN in environment.");
  process.exit(1);
}

const client = createClient({ url, authToken });
await client.executeMultiple(`
  DROP TABLE IF EXISTS players_fts;
  DROP TABLE IF EXISTS games_fts;
`);
console.log("[chesscope] FTS5 virtual tables dropped (if present).");
