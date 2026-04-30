// One-off: find any player slug containing the given substring, plus
// any games where the white/black tag matches the given name fragment.
// Helps diagnose slug-vs-PGN-tag drift.
//
// node --env-file=.env scripts/debug_player.mjs "Smith"

import { createClient } from "@libsql/client";

const fragment = process.argv[2] ?? "Smith";
const client = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

console.log(`Searching for "${fragment}"...\n`);

const players = await client.execute({
  sql: `SELECT slug, name, fide_id, game_count
          FROM players
         WHERE LOWER(name) LIKE LOWER(?)
         ORDER BY game_count DESC
         LIMIT 10`,
  args: [`%${fragment}%`],
});
console.log(`players matching name (${players.rows.length}):`);
for (const r of players.rows) {
  console.log(`  ${r[0]}  →  "${r[1]}"  fide=${r[2] ?? "—"}  games=${r[3]}`);
}

const games = await client.execute({
  sql: `SELECT DISTINCT white, white_fide_id
          FROM games
         WHERE LOWER(white) LIKE LOWER(?)
         LIMIT 10`,
  args: [`%${fragment}%`],
});
console.log(`\ndistinct white-tag values matching name (${games.rows.length}):`);
for (const r of games.rows) {
  console.log(`  "${r[0]}"  fide=${r[1] ?? "—"}`);
}

const sync = await client.execute(
  "SELECT key, value, updated_at FROM sync_state ORDER BY key"
);
console.log(`\nsync_state:`);
for (const r of sync.rows) {
  const ts = new Date((r[2] ?? 0) * 1000).toISOString();
  console.log(`  ${r[0]} = ${r[1]}  (${ts})`);
}
