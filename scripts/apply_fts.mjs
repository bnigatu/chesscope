// Applies scripts/bootstrap_schema.sql to the Turso database.
// Replaces `turso db shell chesscope < scripts/bootstrap_schema.sql` for
// environments without the Turso CLI (e.g. Windows).
//
// Run with: node --env-file=.env scripts/apply_fts.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@libsql/client";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "bootstrap_schema.sql"), "utf8");

const url = process.env.TURSO_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Missing TURSO_URL or TURSO_AUTH_TOKEN in environment.");
  process.exit(1);
}

const client = createClient({ url, authToken });
await client.executeMultiple(sql);
console.log("[chesscope] FTS5 virtual tables and triggers applied.");
