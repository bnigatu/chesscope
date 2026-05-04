// Engine configuration that's shared between EnginePanel (which
// runs the worker) and SettingsModal (which lets the user tweak
// settings). Lifted out so the two can both read/write the same
// localStorage-backed source of truth without circular imports.

export type EngineMode = "wasm-preload" | "wasm-direct" | "asm-shim";

export type EngineDef = {
  file: string;
  wasm: string | null;
  mode: EngineMode;
  label: string;
  description: string;
};

// Three engines, three different launch modes:
//
//   lite-single  — preferred. Parent worker booted through a Blob
//                  shim that monkey-patches self.fetch to return
//                  the pre-loaded WASM ArrayBuffer for any *.wasm
//                  request. No network race.
//
//   lite-multi   — opt-in MT. Booted directly (no shim) because
//                  the parent's pthread spawner constructs child
//                  workers from `self.location`; a Blob URL for
//                  the parent breaks that. The static engine .js
//                  / .wasm responses carry COOP/COEP via
//                  public/_headers so the worker is cross-origin
//                  isolated and SharedArrayBuffer is available.
//
//   asm          — opt-in pure-JS fallback. Booted through the
//                  Blob shim with no wasmBinary; the shim returns
//                  a deliberate 404 Response for any .wasm fetch
//                  so the Emscripten loader cleanly falls through
//                  to ASM execution.
export const ENGINES: Record<string, EngineDef> = {
  "lite-single": {
    file: "/stockfish/stockfish-18-lite-single.js",
    wasm: "/stockfish/stockfish-18-lite-single.wasm",
    mode: "wasm-preload",
    label: "Stockfish 18 NNUE (lite)",
    description: "~7MB, single-threaded NNUE — most reliable",
  },
  "lite-multi": {
    file: "/stockfish/stockfish-18-lite.js",
    wasm: "/stockfish/stockfish-18-lite.wasm",
    mode: "wasm-direct",
    label: "Stockfish 18 NNUE (lite, MT)",
    description:
      "~7MB, multi-threaded — fastest. Needs SharedArrayBuffer.",
  },
  asm: {
    file: "/stockfish/stockfish-18-asm.js",
    wasm: null,
    mode: "asm-shim",
    label: "Stockfish 18 ASM",
    description:
      "~11MB pure-JS fallback. Slower; works without WebAssembly.",
  },
};

export type EngineId = "lite-single" | "lite-multi" | "asm";

export type EngineSettings = {
  engineId: EngineId;
  depth: number;
  multiPv: number;
  enabled: boolean;
};

export const ENGINE_DEFAULTS: EngineSettings = {
  engineId: "lite-single",
  depth: 22,
  multiPv: 3,
  enabled: true,
};

export const ENGINE_STORAGE_KEY = "chesscope.engine";

export const ENGINE_DEPTH_MIN = 12;
export const ENGINE_DEPTH_MAX = 30;
export const ENGINE_MULTIPV_MIN = 1;
export const ENGINE_MULTIPV_MAX = 5;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function loadEngineSettings(): EngineSettings {
  if (typeof window === "undefined") return ENGINE_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(ENGINE_STORAGE_KEY);
    if (!raw) return ENGINE_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<EngineSettings>;
    const engineId: EngineId =
      parsed.engineId && parsed.engineId in ENGINES
        ? (parsed.engineId as EngineId)
        : ENGINE_DEFAULTS.engineId;
    return {
      engineId,
      depth: clamp(
        parsed.depth ?? ENGINE_DEFAULTS.depth,
        ENGINE_DEPTH_MIN,
        ENGINE_DEPTH_MAX
      ),
      multiPv: clamp(
        parsed.multiPv ?? ENGINE_DEFAULTS.multiPv,
        ENGINE_MULTIPV_MIN,
        ENGINE_MULTIPV_MAX
      ),
      enabled: parsed.enabled ?? ENGINE_DEFAULTS.enabled,
    };
  } catch {
    return ENGINE_DEFAULTS;
  }
}

export function saveEngineSettings(s: EngineSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ENGINE_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* localStorage full or disabled — ignore */
  }
}
