"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { cx } from "@/lib/utils";

const ENGINES = {
  "lite-multi": {
    file: "/stockfish/stockfish-18-lite.js",
    label: "Stockfish 18 NNUE (lite, MT)",
    description:
      "~7MB, multi-threaded NNUE — fastest. Needs SharedArrayBuffer.",
  },
  "lite-single": {
    file: "/stockfish/stockfish-18-lite-single.js",
    label: "Stockfish 18 NNUE (lite)",
    description: "~7MB, single-threaded NNUE — works everywhere",
  },
  asm: {
    file: "/stockfish/stockfish-18-asm.js",
    label: "Stockfish 18 ASM",
    description: "Pure-JS fallback, slower, no WebAssembly required",
  },
} as const;

type EngineId = keyof typeof ENGINES;

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

const STORAGE_KEY = "chesscope.engine";

type Settings = {
  engineId: EngineId;
  depth: number;
  multiPv: number;
  enabled: boolean;
};

const DEFAULTS: Settings = {
  engineId: "lite-multi",
  depth: 22,
  multiPv: 3,
  enabled: true,
};

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  // Pick a sensible default for whatever the user's browser actually
  // supports. If they have an older settings blob with "lite-multi"
  // saved but no SAB now, fall back transparently — otherwise the
  // worker would crash on construction.
  const fallbackDefault: EngineId = isMtSupported()
    ? "lite-multi"
    : "lite-single";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS, engineId: fallbackDefault };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    let engineId: EngineId =
      parsed.engineId && parsed.engineId in ENGINES
        ? (parsed.engineId as EngineId)
        : fallbackDefault;
    if (engineId === "lite-multi" && !isMtSupported()) {
      engineId = "lite-single";
    }
    return {
      engineId,
      depth: clamp(parsed.depth ?? DEFAULTS.depth, 12, 30),
      multiPv: clamp(parsed.multiPv ?? DEFAULTS.multiPv, 1, 5),
      enabled: parsed.enabled ?? DEFAULTS.enabled,
    };
  } catch {
    return { ...DEFAULTS, engineId: fallbackDefault };
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

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
}) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [showSettings, setShowSettings] = useState(false);
  const [pvData, setPvData] = useState<Line[]>([]);
  const [depthSeen, setDepthSeen] = useState(0);
  const [nps, setNps] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Bump to force the worker-lifecycle effect to tear down and rebuild
  // the worker. Used by the "Restart engine" button.
  const [engineNonce, setEngineNonce] = useState(0);

  const workerRef = useRef<Worker | null>(null);
  // How many times the current engine has crashed before reaching a
  // ready state. We'll silently restart up to MAX_AUTO_RETRIES; only
  // after that does the error surface to the user. Reset on successful
  // handshake or when the user explicitly switches engines.
  const errorAttemptsRef = useRef(0);
  const MAX_AUTO_RETRIES = 2;
  const handshakeReadyRef = useRef(false);
  const currentFenRef = useRef(fen);
  const whiteToMove = useMemo(() => fen.split(" ")[1] === "w", [fen]);

  // Load persisted settings on mount.
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // Persist whenever settings change (skip the initial DEFAULTS write).
  const settingsKey = JSON.stringify(settings);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, settingsKey);
    } catch {
      /* localStorage full or disabled — ignore */
    }
  }, [settingsKey]);

  function update<K extends keyof Settings>(k: K, v: Settings[K]) {
    // User-initiated change — fresh retry budget for whatever they
    // pick. The auto-retry path uses setEngineNonce directly, so it
    // doesn't go through here and the attempt counter survives.
    errorAttemptsRef.current = 0;
    setErrorMsg(null);
    setSettings((prev) => ({ ...prev, [k]: v }));
  }

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
      setSettings((prev) => ({ ...prev, enabled: !prev.enabled }));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

    const engineFile = ENGINES[settings.engineId].file;

    let w: Worker;
    try {
      w = new Worker(engineFile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[engine] failed to construct worker:", msg);
      setErrorMsg(`Couldn't load ${engineFile}: ${msg}`);
      setStatus("error");
      return;
    }
    workerRef.current = w;
    handshakeReadyRef.current = false;
    setStatus("loading");
    setErrorMsg(null);

    w.onerror = (e: ErrorEvent) => {
      // ErrorEvent often serializes to "{}" when logged directly. Pull
      // the actual fields so we know what went wrong.
      const detail =
        e.message ||
        e.filename ||
        e.error?.message ||
        "unknown worker error";
      const where = e.filename
        ? ` at ${e.filename}:${e.lineno}:${e.colno}`
        : "";
      const fullMsg = `${detail}${where}`;
      console.error("[engine] worker error:", fullMsg, e);

      // Silent auto-retry: many worker errors are transient (cold WASM
      // init race, GC stall, etc.) and recover after a fresh worker.
      // We retry up to MAX_AUTO_RETRIES before surfacing the error.
      // Don't auto-fallback to ASM — empirically that traded one
      // engine's hiccup for ASM's harder bugs, with the choice
      // persisting in localStorage. User can switch engines manually.
      if (errorAttemptsRef.current < MAX_AUTO_RETRIES) {
        errorAttemptsRef.current++;
        console.warn(
          `[engine] auto-restarting (attempt ${errorAttemptsRef.current}/${MAX_AUTO_RETRIES})`
        );
        // Brief delay so we don't tight-loop if the engine fails
        // synchronously during construction.
        setTimeout(() => setEngineNonce((n) => n + 1), 250);
        return;
      }
      setErrorMsg(fullMsg);
      setStatus("error");
    };

    w.onmessage = ({ data }) => {
      if (typeof data !== "string") return;

      if (data === "uciok") {
        // Engine options must be set after uciok and before any
        // position/go. Order chosen to match Lichess's stockfish.js
        // initialization.
        //
        // For the MT build, give it real cores: cap at 4 so we don't
        // saturate the user's CPU when they're also browsing, and
        // double the hash since multiple threads share it. For
        // single-threaded builds, keep Hash=8 (small, less chance of
        // WASM allocation traps) and Threads=1 (redundant but
        // explicit).
        const isMt = settings.engineId === "lite-multi";
        const hw =
          typeof navigator !== "undefined"
            ? navigator.hardwareConcurrency || 2
            : 2;
        const threads = isMt ? Math.max(1, Math.min(4, hw - 1)) : 1;
        const hash = isMt ? 16 : 8;
        w.postMessage(`setoption name Hash value ${hash}`);
        w.postMessage(`setoption name Threads value ${threads}`);
        w.postMessage(`setoption name MultiPV value ${settings.multiPv}`);
        w.postMessage("ucinewgame");
        w.postMessage("isready");
        return;
      }
      if (data === "readyok") {
        handshakeReadyRef.current = true;
        // Engine is healthy — reset the auto-retry budget so the next
        // unrelated transient error gets its own fresh allowance.
        errorAttemptsRef.current = 0;
        setStatus("ready");
        startAnalysis(currentFenRef.current);
        return;
      }
      if (data.startsWith("bestmove")) return;
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
      // Emit the score for the eval bar, but only on the top PV line so
      // it doesn't flicker through alternates.
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

    w.postMessage("uci");
    return teardown;
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
    handshakeReadyRef.current = false;
  }

  function startAnalysis(targetFen: string) {
    const w = workerRef.current;
    if (!w || !handshakeReadyRef.current) return;
    // `stop` halts any in-flight search before the new position lands.
    // Stockfish technically accepts a new `position` mid-search and
    // aborts internally, but in practice the ASM build is much more
    // reliable when commands aren't racing. Cheap defensive insurance.
    w.postMessage("stop");
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
          onClick={() => setShowSettings((v) => !v)}
          className={cx(
            "shrink-0 px-1.5 py-0.5 text-[10px] uppercase tracking-[.18em]",
            "border rounded-sm transition-colors",
            showSettings
              ? "border-brass/50 text-brass-light bg-brass/10"
              : "border-parchment-50/15 text-parchment-300/60 hover:border-parchment-50/30"
          )}
          title="Engine settings"
          aria-expanded={showSettings}
        >
          ⚙
        </button>
        <button
          type="button"
          onClick={() => update("enabled", !settings.enabled)}
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

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={update}
          errorMsg={errorMsg}
          onRestart={restartEngine}
        />
      )}

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

function SettingsPanel({
  settings,
  onChange,
  errorMsg,
  onRestart,
}: {
  settings: Settings;
  onChange: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  errorMsg: string | null;
  onRestart: () => void;
}) {
  return (
    <div className="px-3 py-3 border-b border-parchment-50/8 bg-ink-700/30 space-y-3">
      {errorMsg && (
        <div className="space-y-2">
          <p className="text-[11px] text-oxblood-light font-mono break-words">
            {errorMsg}
          </p>
          <button
            type="button"
            onClick={onRestart}
            className={cx(
              "px-2 py-1 text-[10px] uppercase tracking-[.18em] font-mono",
              "border border-brass/50 text-brass-light rounded-sm",
              "hover:bg-brass/10 hover:border-brass transition-colors"
            )}
          >
            Restart engine
          </button>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-[.18em] text-parchment-300/60">
          Engine
        </label>
        <select
          value={settings.engineId}
          onChange={(e) =>
            onChange("engineId", e.target.value as EngineId)
          }
          className={cx(
            "w-full bg-ink-900/60 border border-parchment-50/10 rounded-sm",
            "px-2 py-1 text-xs font-mono text-parchment-100",
            "focus:border-brass/50 outline-none"
          )}
        >
          {(Object.keys(ENGINES) as EngineId[]).map((id) => (
            <option key={id} value={id}>
              {ENGINES[id].label}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-parchment-300/50 italic">
          {ENGINES[settings.engineId].description}
        </p>
      </div>

      <Slider
        label="Depth"
        value={settings.depth}
        min={12}
        max={30}
        onChange={(v) => onChange("depth", v)}
      />

      <Slider
        label="Multi-PV"
        value={settings.multiPv}
        min={1}
        max={5}
        onChange={(v) => onChange("multiPv", v)}
      />

      <div className="pt-1 border-t border-parchment-50/8 flex justify-end">
        <button
          type="button"
          onClick={onRestart}
          className={cx(
            "px-2 py-1 text-[10px] uppercase tracking-[.18em] font-mono",
            "text-parchment-300/70 hover:text-parchment-50 transition-colors"
          )}
          title="Tear down and re-init the worker"
        >
          ↻ Restart engine
        </button>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] uppercase tracking-[.18em]">
        <span className="text-parchment-300/60">{label}</span>
        <span className="text-parchment-100 font-mono">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-brass"
      />
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
