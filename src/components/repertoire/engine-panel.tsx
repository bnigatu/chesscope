"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { cx } from "@/lib/utils";

const ENGINES = {
  "lite-single": {
    file: "/stockfish/stockfish-18-lite-single.js",
    label: "Stockfish 18 NNUE (lite)",
    description: "~7MB, single-threaded, full NNUE — best quality",
  },
  asm: {
    file: "/stockfish/stockfish-18-asm.js",
    label: "Stockfish 18 ASM",
    description: "Pure-JS fallback, slower, no WebAssembly required",
  },
} as const;

type EngineId = keyof typeof ENGINES;

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
  engineId: "lite-single",
  depth: 22,
  multiPv: 3,
  enabled: true,
};

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const engineId =
      parsed.engineId && parsed.engineId in ENGINES
        ? parsed.engineId
        : DEFAULTS.engineId;
    return {
      engineId,
      depth: clamp(parsed.depth ?? DEFAULTS.depth, 12, 30),
      multiPv: clamp(parsed.multiPv ?? DEFAULTS.multiPv, 1, 5),
      enabled: parsed.enabled ?? DEFAULTS.enabled,
    };
  } catch {
    return DEFAULTS;
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

  const workerRef = useRef<Worker | null>(null);
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
    setSettings((prev) => ({ ...prev, [k]: v }));
  }

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
      setErrorMsg(fullMsg);
      setStatus("error");

      // Auto-fallback: if the rich-NNUE engine failed (often a WASM
      // compile error in browsers without SAB), try the pure-JS asm
      // build before giving up.
      if (settings.engineId === "lite-single") {
        console.warn("[engine] falling back to ASM engine");
        update("engineId", "asm");
      }
    };

    w.onmessage = ({ data }) => {
      if (typeof data !== "string") return;

      if (data === "uciok") {
        w.postMessage(`setoption name MultiPV value ${settings.multiPv}`);
        w.postMessage("ucinewgame");
        w.postMessage("isready");
        return;
      }
      if (data === "readyok") {
        handshakeReadyRef.current = true;
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
  }, [settings.enabled, settings.engineId, settings.multiPv]);

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
    w.postMessage(`position fen ${targetFen}`);
    w.postMessage(`go depth ${settings.depth}`);
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
          {settings.engineId === "asm" ? "Stockfish 18 ASM" : "Stockfish 18 NNUE"}
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
        />
      )}

      {/* PV lines */}
      {settings.enabled ? (
        status === "error" && !errorMsg?.includes("Couldn't load") ? (
          <p className="px-3 py-3 text-sm text-oxblood-light italic">
            Engine error. Open settings (⚙) to switch engine.
          </p>
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
}: {
  settings: Settings;
  onChange: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  errorMsg: string | null;
}) {
  return (
    <div className="px-3 py-3 border-b border-parchment-50/8 bg-ink-700/30 space-y-3">
      {errorMsg && (
        <p className="text-[11px] text-oxblood-light font-mono break-words">
          {errorMsg}
        </p>
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
