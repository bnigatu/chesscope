"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { cx } from "@/lib/utils";
import {
  ENGINES as SHARED_ENGINES,
  type EngineSettings,
  type EngineId,
} from "@/lib/repertoire/engine-config";

// Three engines, three different launch modes:
//
//   lite-single  — preferred. Parent worker booted through a Blob
//                  shim that monkey-patches self.fetch to return
//                  the pre-loaded WASM ArrayBuffer for any *.wasm
//                  request. No network race. Most reliable.
//
//   lite-multi   — opt-in MT. Booted DIRECTLY (no shim) because
//                  the parent's pthread spawner constructs child
//                  workers via `new Worker(self.location + '#...,worker')`,
//                  and a Blob URL for the parent breaks that. The
//                  parent and children fetch their own .wasm at
//                  real URLs; flakier than lite-single on cold
//                  starts but ~3-6× faster nps when stable.
//
//   asm          — opt-in pure-JS fallback. Booted through the
//                  Blob shim with no wasmBinary; the shim returns
//                  a deliberate 404 Response for any .wasm fetch
//                  so the Emscripten loader cleanly falls through
//                  to its ASM execution path instead of erroring
//                  on a missing companion file.
type EngineMode = "wasm-preload" | "wasm-direct" | "asm-shim";

// Re-export the shared engine map under the local name so the rest
// of this file (worker wiring, mode dispatch) doesn't need to be
// rewritten. The settings UI lives in SettingsModal now.
const ENGINES = SHARED_ENGINES;

// ──────────────────────────────────────────────────────────────────────
// WASM pre-loading
//
// Failure mode we're fixing: `new Worker(engineFile)` lets Stockfish
// fetch its own .wasm from inside the worker. That second-step fetch
// races with COEP isolation, network hiccups, GC, etc., and when it
// fails the parent only sees a content-less ErrorEvent ("unknown
// worker error"). Auto-retries don't help because the failure is
// stochastic and the next worker spawns a new equally-flaky fetch.
//
// Chess.com / Lichess pattern: fetch the .wasm in the main thread as
// an ArrayBuffer first, then hand it to the engine. The engine's
// internal load path uses fetch() with a URL produced by locateFile;
// we boot the worker through a Blob shim that monkey-patches
// self.fetch so any *.wasm request resolves instantly with the
// pre-loaded buffer wrapped in a Response. No network race, no
// silent failure — same Stockfish bytes, deterministically loaded.
// ──────────────────────────────────────────────────────────────────────

const wasmCache = new Map<string, ArrayBuffer>();

async function fetchWasm(url: string): Promise<ArrayBuffer> {
  const cached = wasmCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`wasm fetch failed: ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  wasmCache.set(url, buf);
  return buf;
}

/** Builds the worker shim source. Kept as a function so we can fold
 *  the engine URL in at construction time without runtime concat.
 *  When `bin` is null (ASM engine), the shim returns a deliberate
 *  404 for *.wasm requests so the engine cleanly falls through to
 *  its pure-JS execution path instead of throwing on a missing
 *  companion .wasm file. */
function buildShim(engineUrl: string): string {
  return (
    `self.addEventListener('message', function boot(e) {` +
    `if (!e.data || e.data.__init !== true) return;` +
    `self.removeEventListener('message', boot);` +
    `var bin = e.data.wasmBinary;` +
    `var origFetch = self.fetch ? self.fetch.bind(self) : null;` +
    `self.fetch = function(url, opts) {` +
    `var u = (typeof url === 'string') ? url : (url && url.url) || '';` +
    `if (u.indexOf('.wasm') !== -1 && u.indexOf('.wasm.map') === -1) {` +
    `if (bin) {` +
    // WASM engine with pre-loaded binary: serve it.
    `return Promise.resolve(new Response(bin, { status: 200, headers: { 'Content-Type': 'application/wasm' } }));` +
    `}` +
    // ASM engine: deliberate 404 so the engine's catch path falls
    // through to JS execution rather than retrying the network.
    `return Promise.resolve(new Response(null, { status: 404, statusText: 'wasm intentionally unavailable (asm engine)' }));` +
    `}` +
    `return origFetch ? origFetch(url, opts) : Promise.reject(new Error('fetch unavailable'));` +
    `};` +
    `try { importScripts(${JSON.stringify(engineUrl)}); }` +
    `catch (err) { self.postMessage({ __engineLoadError: String(err && err.message || err) }); }` +
    `});`
  );
}

/**
 * Multi-threaded Stockfish needs SharedArrayBuffer, which is gated
 * behind cross-origin isolation. We set COOP=same-origin and
 * COEP=credentialless globally (next.config.ts), but a browser may
 * still refuse — old version, isolation downgraded by an extension,
 * etc. `crossOriginIsolated` is the canonical runtime flag.
 *
 * Anything else falls back to lite-single, which is identical
 * weights, just sequential.
 */
function isMtSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    window.crossOriginIsolated === true
  );
}

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type Line = {
  evalCp: number;
  evalStr: string;
  movesSAN: string[];
};

type Status = "idle" | "loading" | "ready" | "error";

export function EnginePanel({
  fen = STARTING_FEN,
  onContinuationClick,
  onEval,
  settings,
  onSettingsChange,
  onOpenSettings,
  restartSignal,
}: {
  fen?: string;
  onContinuationClick?: (movesSan: string[]) => void;
  /**
   * Fires whenever the top PV's score updates. cp is centipawns (White
   * positive) for normal positions; mate is a signed integer for mate
   * scores (positive = white mates in N, negative = black). The other
   * value is null. The eval bar listens to this.
   */
  onEval?: (info: { cp: number | null; mate: number | null }) => void;
  /** Engine settings (controlled). Owned by RepertoireExplorer so
   *  the SettingsModal can read/write the same source of truth. */
  settings: EngineSettings;
  onSettingsChange: (next: EngineSettings) => void;
  /** Open the settings modal — bound to the ⚙ button in the header. */
  onOpenSettings: () => void;
  /** Externally-bumpable counter that triggers a worker teardown +
   *  re-init. The settings modal's "Restart engine" button bumps it. */
  restartSignal?: number;
}) {
  const [pvData, setPvData] = useState<Line[]>([]);
  const [depthSeen, setDepthSeen] = useState(0);
  const [nps, setNps] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Bump to force the worker-lifecycle effect to tear down and rebuild
  // the worker. Used by the "Restart engine" button.
  const [engineNonce, setEngineNonce] = useState(0);

  const workerRef = useRef<Worker | null>(null);
  // Blob URL for the worker shim script — revoked on teardown so
  // we don't leak per-restart entries in the document URL store.
  const shimUrlRef = useRef<string | null>(null);
  // Proper UCI flow: only one search active at a time. Sending
  // `position` while a search is in flight is undefined behaviour
  // for Stockfish and is a known cause of `RuntimeError: unreachable`
  // mid-search. We send `stop`, wait for the engine to emit
  // `bestmove` (the canonical "search ended" signal), then send the
  // queued position.
  const searchActiveRef = useRef(false);
  const pendingFenRef = useRef<string | null>(null);
  // How many times the current engine has crashed before reaching a
  // ready state. We'll silently restart up to MAX_AUTO_RETRIES; only
  // after that does the error surface to the user. Reset on successful
  // handshake or when the user explicitly switches engines.
  const errorAttemptsRef = useRef(0);
  const MAX_AUTO_RETRIES = 2;
  const handshakeReadyRef = useRef(false);
  const currentFenRef = useRef(fen);
  const whiteToMove = useMemo(() => fen.split(" ")[1] === "w", [fen]);

  // External restart trigger: when the parent (e.g. the settings
  // modal) bumps `restartSignal`, run our internal restart.
  useEffect(() => {
    if (restartSignal === undefined || restartSignal === 0) return;
    errorAttemptsRef.current = 0;
    setErrorMsg(null);
    setEngineNonce((n) => n + 1);
  }, [restartSignal]);

  // Global "e" toggles engine on/off. Lives here (not in the
  // explorer's shortcut registry) because the engine's enabled state
  // is local to this component.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "e") return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (t.isContentEditable) return;
      }
      e.preventDefault();
      onSettingsChange({ ...settings, enabled: !settings.enabled });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSettingsChange, settings]);

  // Worker lifecycle. Re-runs when toggled, or when the user picks a
  // different engine, or when MultiPV changes (which requires re-handshake).
  useEffect(() => {
    if (!settings.enabled) {
      teardown();
      setPvData([]);
      setDepthSeen(0);
      setNps(0);
      setStatus("idle");
      return;
    }

    const def = ENGINES[settings.engineId];
    const engineFile = def.file;
    const wasmFile = def.wasm;

    // Track this effect's instance so an in-flight wasm fetch
    // doesn't install a stale worker if the user toggled the engine
    // off (or switched engines) while the fetch was running.
    let cancelled = false;
    let w: Worker | null = null;

    setStatus("loading");
    setErrorMsg(null);
    handshakeReadyRef.current = false;

    function reportInitError(msg: string) {
      if (cancelled) return;
      console.error("[engine] init failed:", msg);
      if (errorAttemptsRef.current < MAX_AUTO_RETRIES) {
        errorAttemptsRef.current++;
        console.warn(
          `[engine] auto-restarting (attempt ${errorAttemptsRef.current}/${MAX_AUTO_RETRIES})`
        );
        setTimeout(() => setEngineNonce((n) => n + 1), 250);
        return;
      }
      setErrorMsg(msg);
      setStatus("error");
    }

    (async () => {
      try {
        if (def.mode === "wasm-direct") {
          // Multi-threaded engine: the parent's pthread spawner
          // builds child-worker URLs from `self.location` and a
          // hash, which only works if the parent is loaded from a
          // real URL (not a Blob). Skip the shim; accept that the
          // parent fetches its own wasm. Slightly less reliable on
          // cold starts but the only way MT child workers function.
          w = new Worker(engineFile);
        } else {
          // wasm-preload: pre-fetch the binary and serve from shim.
          // asm-shim:    no binary — shim returns 404 for *.wasm
          //              so engine falls through to ASM execution.
          const wasmBinary =
            def.mode === "wasm-preload" && wasmFile
              ? await fetchWasm(wasmFile)
              : null;
          if (cancelled) return;
          // Resolve to absolute URLs — inside a blob: worker, the
          // base URL is the blob, not the page origin, so a
          // root-relative path like "/stockfish/..." fails
          // importScripts with "invalid URL".
          const absEngineUrl = new URL(engineFile, location.href).href;
          const shim = new Blob([buildShim(absEngineUrl)], {
            type: "application/javascript",
          });
          const shimUrl = URL.createObjectURL(shim);
          shimUrlRef.current = shimUrl;
          // For preload mode, pass the wasm URL via location.hash —
          // the engine's locateFile() reads it and uses it as the
          // wasm URL. Without this, the engine's default fallback
          // computes a URL from the blob's pathname (no .js
          // extension), producing a URL that doesn't contain
          // ".wasm" so our fetch interceptor misses it.
          if (wasmFile) {
            const absWasmUrl = new URL(wasmFile, location.href).href;
            w = new Worker(
              `${shimUrl}#${encodeURIComponent(absWasmUrl)}`
            );
          } else {
            w = new Worker(shimUrl);
          }
          w.postMessage({ __init: true, wasmBinary });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        reportInitError(`Couldn't load ${engineFile}: ${msg}`);
        return;
      }
      if (cancelled || !w) {
        if (w) w.terminate();
        return;
      }
      workerRef.current = w;
      attachHandlers(w);
      w.postMessage("uci");
    })();

    function attachHandlers(worker: Worker) {
      worker.onerror = (e: ErrorEvent) => {
        const detail =
          e.message ||
          e.filename ||
          e.error?.message ||
          "unknown worker error";
        const where = e.filename
          ? ` at ${e.filename}:${e.lineno}:${e.colno}`
          : "";
        reportInitError(`${detail}${where}`);
      };

      worker.onmessage = ({ data }) => {
        // Sentinel from the shim if importScripts(engineUrl) threw.
        if (data && typeof data === "object" && "__engineLoadError" in data) {
          reportInitError(
            String((data as { __engineLoadError: unknown }).__engineLoadError)
          );
          return;
        }
        if (typeof data !== "string") return;

        if (data === "uciok") {
          // Engine options must be set after uciok and before any
          // position/go. For MT, give it real cores (capped at 4)
          // and a larger shared Hash. For single-threaded, Hash=32
          // is the sweet spot — large enough that deep searches
          // don't thrash the table and trigger WASM `unreachable`
          // traps from hash collisions, small enough to avoid
          // browser memory pressure.
          const isMt = settings.engineId === "lite-multi";
          const hw =
            typeof navigator !== "undefined"
              ? navigator.hardwareConcurrency || 2
              : 2;
          const threads = isMt ? Math.max(1, Math.min(4, hw - 1)) : 1;
          const hash = isMt ? 64 : 32;
          worker.postMessage(`setoption name Hash value ${hash}`);
          worker.postMessage(`setoption name Threads value ${threads}`);
          worker.postMessage(`setoption name MultiPV value ${settings.multiPv}`);
          worker.postMessage("ucinewgame");
          worker.postMessage("isready");
          return;
        }
        if (data === "readyok") {
          handshakeReadyRef.current = true;
          errorAttemptsRef.current = 0;
          setStatus("ready");
          startAnalysis(currentFenRef.current);
          return;
        }
        if (data.startsWith("bestmove")) {
          // Search has ended — either because we stopped it or it
          // ran to completion. Drain the pending fen if there is
          // one, otherwise the engine sits idle until the next move.
          searchActiveRef.current = false;
          const next = pendingFenRef.current;
          pendingFenRef.current = null;
          if (next) startAnalysis(next);
          return;
        }
        if (!data.startsWith("info depth")) return;

        const parts = data.split(" ");
        const pvIdx = parts.indexOf("pv");
        if (pvIdx === -1) return;

        const multipvIdx = parts.indexOf("multipv");
        const lineIndex =
          multipvIdx !== -1 ? parseInt(parts[multipvIdx + 1], 10) - 1 : 0;

        const depthIdx = parts.indexOf("depth");
        if (depthIdx !== -1) {
          const d = parseInt(parts[depthIdx + 1], 10);
          if (Number.isFinite(d)) setDepthSeen(d);
        }

        const npsIdx = parts.indexOf("nps");
        if (npsIdx !== -1) {
          const n = parseInt(parts[npsIdx + 1], 10);
          if (Number.isFinite(n)) setNps(n);
        }

        let evalStr = "0.00";
        let evalCp = 0;
        let signedMate: number | null = null;
        const scoreIdx = parts.indexOf("score");
        if (scoreIdx !== -1) {
          const type = parts[scoreIdx + 1] as "cp" | "mate";
          const raw = parseInt(parts[scoreIdx + 2], 10);
          const stmFen = currentFenRef.current;
          const mult = stmFen.split(" ")[1] === "b" ? -1 : 1;
          if (type === "cp") {
            evalCp = raw * mult;
            const v = evalCp / 100;
            evalStr = (v >= 0 ? "+" : "") + v.toFixed(2);
          } else {
            signedMate = raw * mult;
            evalCp = signedMate > 0 ? 100000 : -100000;
            evalStr = `M${signedMate}`;
          }
        }
        if (lineIndex === 0 && onEval) {
          onEval(
            signedMate != null
              ? { cp: null, mate: signedMate }
              : { cp: evalCp, mate: null }
          );
        }

        const uciMoves = parts
          .slice(pvIdx + 1)
          .filter((u) => /^[a-h][1-8][a-h][1-8]/.test(u));
        if (!uciMoves.length) return;

        const tmp = new Chess(currentFenRef.current);
        const san: string[] = [];
        for (const u of uciMoves) {
          try {
            const m = tmp.move({
              from: u.slice(0, 2),
              to: u.slice(2, 4),
              promotion: u[4] || "q",
            });
            if (m) san.push(m.san);
          } catch {
            break;
          }
        }

        setPvData((prev) => {
          const c = [...prev];
          c[lineIndex] = { evalCp, evalStr, movesSAN: san };
          c.sort((a, b) => (b?.evalCp ?? -Infinity) - (a?.evalCp ?? -Infinity));
          return c;
        });
      };
    }

    return () => {
      cancelled = true;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.enabled, settings.engineId, settings.multiPv, engineNonce]);

  // Re-analyze on fen or depth changes (worker stays alive across these).
  useEffect(() => {
    if (!settings.enabled) return;
    currentFenRef.current = fen;
    if (!handshakeReadyRef.current) return;
    setPvData([]);
    setDepthSeen(0);
    startAnalysis(fen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, settings.depth, settings.enabled]);

  function teardown() {
    if (workerRef.current) {
      try {
        workerRef.current.postMessage("quit");
      } catch {
        /* worker may have errored already */
      }
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (shimUrlRef.current) {
      URL.revokeObjectURL(shimUrlRef.current);
      shimUrlRef.current = null;
    }
    handshakeReadyRef.current = false;
    searchActiveRef.current = false;
    pendingFenRef.current = null;
  }

  function startAnalysis(targetFen: string) {
    const w = workerRef.current;
    if (!w || !handshakeReadyRef.current) return;
    // If a search is already running, queue the new fen and ask
    // the engine to stop. The bestmove handler in onmessage will
    // pick up the queued fen and start the next search cleanly.
    if (searchActiveRef.current) {
      pendingFenRef.current = targetFen;
      w.postMessage("stop");
      return;
    }
    searchActiveRef.current = true;
    pendingFenRef.current = null;
    w.postMessage(`position fen ${targetFen}`);
    w.postMessage(`go depth ${settings.depth}`);
  }

  /**
   * Full worker teardown + re-init for the current engine. Used by the
   * "Restart" button to recover from worker errors without changing
   * engines. The worker-lifecycle useEffect re-runs when `engineNonce`
   * bumps so we get a fresh worker, fresh handshake, fresh state.
   */
  function restartEngine() {
    errorAttemptsRef.current = 0;
    setErrorMsg(null);
    setEngineNonce((n) => n + 1);
  }

  return (
    <div
      className={cx(
        "border border-parchment-50/8 rounded-sm overflow-hidden",
        "bg-ink-800/80"
      )}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-parchment-50/8">
        <span
          className="font-mono text-[10px] uppercase tracking-[.18em] text-brass shrink-0"
          title={ENGINES[settings.engineId].label}
        >
          {settings.engineId === "asm"
            ? "SF 18 ASM"
            : settings.engineId === "lite-multi"
            ? "SF 18 NNUE · MT"
            : "SF 18 NNUE"}
        </span>
        <span className="text-[11px] font-mono text-parchment-300/70 truncate flex-1 min-w-0">
          <span className="text-parchment-100">{depthSeen || "—"}</span>
          {nps ? (
            <>
              <span className="text-parchment-300/30 mx-1">·</span>
              {(nps / 1000).toFixed(0)}k/s
            </>
          ) : status === "loading" ? (
            <span className="text-parchment-300/40 italic"> loading…</span>
          ) : status === "error" ? (
            <span className="text-oxblood-light italic"> error</span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onOpenSettings}
          className={cx(
            "shrink-0 px-1.5 py-0.5 text-[10px] uppercase tracking-[.18em]",
            "border rounded-sm transition-colors",
            "border-parchment-50/15 text-parchment-300/60 hover:border-parchment-50/30"
          )}
          title="Open settings"
        >
          ⚙
        </button>
        <button
          type="button"
          onClick={() =>
            onSettingsChange({ ...settings, enabled: !settings.enabled })
          }
          className={cx(
            "shrink-0 text-[10px] uppercase tracking-[.18em] px-2 py-0.5",
            "border rounded-sm transition-colors",
            settings.enabled
              ? "border-brass/50 text-brass-light hover:bg-brass/10"
              : "border-parchment-50/15 text-parchment-300/60 hover:border-parchment-50/30"
          )}
          aria-pressed={settings.enabled}
          title="Toggle engine (e)"
        >
          {settings.enabled ? "On" : "Off"}
        </button>
      </div>

      {/* PV lines */}
      {settings.enabled ? (
        status === "error" && !errorMsg?.includes("Couldn't load") ? (
          <div className="px-3 py-3 space-y-2">
            <p className="text-sm text-oxblood-light italic">
              Engine error. Try restarting it, or pick a different engine in
              settings (⚙).
            </p>
            <button
              type="button"
              onClick={restartEngine}
              className={cx(
                "px-2 py-1 text-[11px] uppercase tracking-[.18em] font-mono",
                "border border-brass/50 text-brass-light rounded-sm",
                "hover:bg-brass/10 hover:border-brass transition-colors"
              )}
            >
              Restart engine
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-parchment-50/6">
            {Array.from({ length: settings.multiPv }).map((_, i) => {
              const line = pvData[i];
              return (
                <li
                  key={i}
                  className={cx(
                    "flex items-baseline gap-2 px-2 py-2 text-sm",
                    i === 0 ? "bg-ink-700/40" : ""
                  )}
                >
                  <span
                    className={cx(
                      "data-num text-xs font-bold shrink-0",
                      "inline-block text-right",
                      "px-1.5 py-0.5 rounded-sm",
                      // chess.com pattern: white bg + dark text when
                      // White is winning, black bg + white text when
                      // Black is winning. Reads as a score badge.
                      line
                        ? line.evalCp >= 0
                          ? "bg-parchment-50 text-ink-900"
                          : "bg-ink-900 text-parchment-50 border border-parchment-50/15"
                        : "text-parchment-300/40 bg-transparent"
                    )}
                  >
                    {line ? line.evalStr : "·"}
                  </span>
                  <span className="text-parchment-100/85 font-mono text-[13px] truncate">
                    {line?.movesSAN.length ? (
                      <PvLine
                        moves={line.movesSAN}
                        whiteToMove={whiteToMove}
                        onMoveClick={(idx) =>
                          onContinuationClick?.(line.movesSAN.slice(0, idx + 1))
                        }
                      />
                    ) : (
                      <span className="text-parchment-300/40 italic">
                        {status === "ready" ? "calculating…" : "loading…"}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <div className="px-3 py-3 text-sm text-parchment-300/50 italic">
          Engine off. Click On (or press <kbd>e</kbd>) to analyze.
        </div>
      )}
    </div>
  );
}

function PvLine({
  moves,
  whiteToMove,
  onMoveClick,
}: {
  moves: string[];
  whiteToMove: boolean;
  onMoveClick: (idx: number) => void;
}) {
  return (
    <span>
      {moves.slice(0, 14).map((san, idx) => {
        const isBlack = whiteToMove ? idx % 2 === 1 : idx % 2 === 0;
        const moveNum = whiteToMove
          ? idx % 2 === 0
            ? Math.floor(idx / 2) + 1
            : null
          : idx % 2 === 1
          ? Math.floor(idx / 2) + 1
          : null;
        const showBlackEllipsis = idx === 0 && isBlack;
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onMoveClick(idx)}
            className="hover:text-brass-light hover:underline mr-1"
          >
            {moveNum && `${moveNum}.`}
            {showBlackEllipsis ? "…" : ""}
            {san}
          </button>
        );
      })}
      {moves.length > 14 && (
        <span className="text-parchment-300/40">…</span>
      )}
    </span>
  );
}
