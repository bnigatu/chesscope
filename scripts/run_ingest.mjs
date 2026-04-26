// Wrapper that runs the Python ingestion script with env vars loaded
// from .env (via node --env-file). Lets us avoid teaching every shell
// (PowerShell, bash, fish) how to source a .env file.
//
// Pass any extra flags through after `--`:
//   npm run ingest -- --limit 1000
//   npm run ingest -- --store-pgn

import { spawn } from "node:child_process";

const pythonCmd = process.platform === "win32" ? "python" : "python3";
const child = spawn(
  pythonCmd,
  ["scripts/ingest_broadcasts.py", ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env }
);
child.on("exit", (code) => process.exit(code ?? 1));
