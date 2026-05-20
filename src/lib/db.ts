import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

// D1Database type. drizzle-orm/d1 doesn't re-export it, and the worker
// runtime types live behind @cloudflare/workers-types — we use a minimal
// structural type here to avoid a new dev dep just for this one symbol.
type D1Binding = {
  prepare: (query: string) => unknown;
  // Other methods exist on D1Database; we don't enumerate them, drizzle
  // adapts whatever it needs from this duck-type.
};

/**
 * Cloudflare D1 database for chesscope (migrated from Turso 2026-05-20).
 *
 * D1 is bundled inside the Cloudflare Workers runtime — no separate auth
 * token, no cross-region HTTP round-trip. The binding name `DB` lines up
 * with `wrangler.jsonc` → d1_databases[0].binding.
 *
 * `getCloudflareContext()` is async (it dereferences the worker's
 * per-request env), so this function is async too. All callers were
 * already inside `async function` blocks — `await getDb()` is the
 * mechanical change at each call site.
 *
 * No connection pooling concerns: D1 connections are an in-process
 * binding, not an HTTP client, so there's nothing to multiplex.
 */
let _db: DrizzleD1Database<typeof schema> | null = null;

export async function getDb(): Promise<DrizzleD1Database<typeof schema>> {
  if (_db) return _db;
  const { env } = await getCloudflareContext({ async: true });
  const binding = (env as unknown as { DB?: D1Binding }).DB;
  if (!binding) {
    throw new Error(
      "D1 binding 'DB' is not set. Check wrangler.jsonc d1_databases entry."
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _db = drizzle(binding as any, { schema });
  return _db;
}

export { schema };
