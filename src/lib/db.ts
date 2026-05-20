import { createClient, type Client } from "@libsql/client/web";
// Use the /web entry of drizzle's libsql adapter — it imports
// `@libsql/client/web` directly. The bare `drizzle-orm/libsql`
// imports `@libsql/client` (no /web), which resolves to the
// Node-native entry under workerd and pulls in `@neon-rs/load`.
// That loader throws "Neon: unsupported Linux architecture:" on
// cold isolate startup, causing intermittent 500s on first hit.
import { drizzle } from "drizzle-orm/libsql/web";
// Type only — pulled from the parent path. `import type` is erased
// at build, so this does not pull the native node entry into the
// Worker bundle.
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * libSQL client for Cloudflare Workers.
 *
 * We use `@libsql/client/web` (not the default export) because the Node-only
 * native bits won't bundle into a Worker. The /web entry is pure HTTP and
 * works in any fetch environment.
 *
 * One client per isolate; libSQL multiplexes requests internally and Workers
 * isolates are short-lived enough that connection pooling isn't a concern.
 */

let _client: Client | null = null;
let _db: LibSQLDatabase<typeof schema> | null = null;

export function getDb(): LibSQLDatabase<typeof schema> {
  if (_db) return _db;

  const url = process.env.TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error(
      "TURSO_URL is not set. Add it via `wrangler secret put TURSO_URL`."
    );
  }

  _client = createClient({ url, authToken });
  _db = drizzle(_client, { schema });
  return _db;
}

export { schema };
