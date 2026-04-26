import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

// OpenNext Cloudflare config. The R2 incremental cache is optional but
// recommended for ISR. If you don't want R2, swap this for the kv override
// or remove the cache config entirely (defaults to in-memory per-isolate).
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
