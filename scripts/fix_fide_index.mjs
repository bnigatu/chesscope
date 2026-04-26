// Drops the UNIQUE constraint on players.fide_id and recreates it as a
// regular (non-unique) index. Real-world Lichess broadcast data has the
// same FIDE ID associated with slightly different name spellings, which
// produces multiple slug rows pointing at one FIDE id. Proper resolution
// is the V2 player_aliases table; this is the V1 unblock.
//
// Run with: node --env-file=.env scripts/fix_fide_index.mjs

import { createClient } from "@libsql/client";

const url = process.env.TURSO_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Missing TURSO_URL or TURSO_AUTH_TOKEN.");
  process.exit(1);
}

const client = createClient({ url, authToken });
await client.executeMultiple(`
  DROP INDEX IF EXISTS players_fide_idx;
  CREATE INDEX IF NOT EXISTS players_fide_idx ON players (fide_id);
`);
console.log("[chesscope] players_fide_idx is now non-unique.");
