// Lists the top players currently in the database, by game count.
// Useful for sanity-checking the search UI against names that
// definitely exist in the index.
//
// Run with: node --env-file=.env scripts/top_players.mjs

import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const games = await client.execute("SELECT COUNT(*) AS n FROM games");
const players = await client.execute("SELECT COUNT(*) AS n FROM players");
console.log(
  `games: ${games.rows[0][0]}    players: ${players.rows[0][0]}\n`
);

const top = await client.execute(
  `SELECT name, slug, game_count, peak_elo
     FROM players
    ORDER BY game_count DESC
    LIMIT 20`
);
console.log("top 20 by game count:");
for (const r of top.rows) {
  console.log(
    `  ${String(r[2]).padStart(4)}  ${String(r[3] ?? "").padStart(4)}  ` +
      `${r[0]}  (/player/${r[1]})`
  );
}
