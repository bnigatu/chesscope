#!/usr/bin/env node
// Copies Stockfish 18 engine binaries from the `stockfish` npm package
// into public/stockfish/ so Next.js serves them as static assets at
// /stockfish/*. The browser loads them via `new Worker('/stockfish/...')`.
//
// We ship single-threaded variants only so we don't need
// COOP/COEP headers (those break cross-origin assets and aren't worth
// the integration cost). The lite-single is ~7MB, full NNUE strength,
// recommended by the package author for browser apps.
//
// Re-runs automatically on `npm run dev` and `npm run build` via pre-script
// hooks. public/stockfish/ is gitignored — this script repopulates it.

import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const sourceDir = join(repoRoot, "node_modules", "stockfish", "bin");
const targetDir = join(repoRoot, "public", "stockfish");

const FILES_TO_COPY = [
  "stockfish-18-lite-single.js",
  "stockfish-18-lite-single.wasm",
  "stockfish-18-asm.js",
];

if (!existsSync(sourceDir)) {
  console.error(
    `[sync-stockfish] stockfish package not installed at ${sourceDir}.\n` +
      `Run 'npm install' first.`
  );
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

// Wipe stale stockfish-* files so old engine versions don't linger.
for (const entry of readdirSync(targetDir)) {
  if (entry.startsWith("stockfish")) {
    const p = join(targetDir, entry);
    if (statSync(p).isFile()) unlinkSync(p);
  }
}

for (const file of FILES_TO_COPY) {
  const src = join(sourceDir, file);
  const dst = join(targetDir, file);
  if (!existsSync(src)) {
    console.error(`[sync-stockfish] missing ${src}`);
    process.exit(1);
  }
  copyFileSync(src, dst);
}

console.log(
  `[sync-stockfish] copied ${FILES_TO_COPY.length} engine files to public/stockfish/`
);
