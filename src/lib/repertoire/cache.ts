// IndexedDB cache for built repertoire trees. Keyed by a hash of the
// (sources × filters) configuration so the same Build click hits the
// cache on subsequent visits without re-ingesting from upstream.
//
// Storage budget: IndexedDB is generally allowed up to a fraction of
// the disk free space (browser-dependent — 60% on Chrome, 50% on
// Firefox). We don't need much — a typical built tree is 1-10 MB.
//
// The cache is best-effort: any error (quota exceeded, IDB disabled,
// the user is in private browsing, etc.) silently falls back to a
// fresh ingest. Cache misses are still functional, just slower.

import type { Tree } from "./tree";
import type { RepertoireFilters } from "./filters";

const DB_NAME = "chesscope.repertoire";
const STORE = "trees";
const DB_VERSION = 1;

// One-week TTL: stale enough to give Lichess/Chess.com new games time
// to register, fresh enough that a returning user gets fast load.
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CacheEntry = {
  key: string;
  tree: Tree;
  savedAt: number; // ms since epoch
  // Surface the original sources/filters so the entry self-describes
  // when inspected (e.g. via DevTools).
  sources: {
    lichess?: string;
    chesscom?: string;
    pgnFilename?: string;
  };
  filters: RepertoireFilters;
};

/**
 * Stable key for a (sources, filters) tuple. Sorted JSON keeps the
 * key insensitive to object-property order. PGN files have unique
 * content so they're cached by filename.
 */
export function cacheKey(input: {
  lichessUser: string | null;
  chesscomUser: string | null;
  pgnFilename: string | null;
  filters: RepertoireFilters;
}): string {
  const norm = {
    lichess: input.lichessUser?.toLowerCase() ?? null,
    chesscom: input.chesscomUser?.toLowerCase() ?? null,
    pgn: input.pgnFilename ?? null,
    filters: sortObj(input.filters),
  };
  return JSON.stringify(norm);
}

function sortObj<T>(o: T): unknown {
  if (Array.isArray(o)) return o.map(sortObj);
  if (o && typeof o === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) {
      out[k] = sortObj((o as Record<string, unknown>)[k]);
    }
    return out;
  }
  return o;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb();
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function getCached(key: string): Promise<CacheEntry | null> {
  try {
    const store = await getStore("readonly");
    const entry = (await reqAsPromise(store.get(key))) as
      | CacheEntry
      | undefined;
    if (!entry) return null;
    if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
      void deleteCached(key);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export async function putCached(entry: CacheEntry): Promise<boolean> {
  try {
    const store = await getStore("readwrite");
    await reqAsPromise(store.put(entry));
    return true;
  } catch {
    // Quota exceeded, IDB disabled, private mode, etc.
    return false;
  }
}

export async function deleteCached(key: string): Promise<void> {
  try {
    const store = await getStore("readwrite");
    await reqAsPromise(store.delete(key));
  } catch {
    /* ignore */
  }
}

/**
 * Sweep entries past the TTL. Cheap to call on each Build to keep the
 * IDB store from growing forever.
 */
export async function pruneExpired(): Promise<void> {
  try {
    const store = await getStore("readwrite");
    const cutoff = Date.now() - CACHE_TTL_MS;
    await new Promise<void>((resolve, reject) => {
      const req = store.openCursor();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        const entry = cursor.value as CacheEntry;
        if (entry.savedAt < cutoff) cursor.delete();
        cursor.continue();
      };
    });
  } catch {
    /* ignore */
  }
}
