"use client";

import { useEffect, useState } from "react";
import { cx } from "@/lib/utils";
import {
  ENGINES,
  ENGINE_DEPTH_MIN,
  ENGINE_DEPTH_MAX,
  ENGINE_MULTIPV_MIN,
  ENGINE_MULTIPV_MAX,
  type EngineId,
  type EngineSettings,
} from "@/lib/repertoire/engine-config";
import type {
  ArrowMode,
  PieceAnimationSpeed,
  UiPrefs,
} from "@/lib/repertoire/ui-prefs";
import { BOARD_THEMES, type BoardThemeId } from "./board";

type TabId = "engine" | "interface" | "board";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "engine", label: "Engine", icon: "⚙" },
  { id: "interface", label: "Interface", icon: "▤" },
  { id: "board", label: "Board", icon: "▦" },
];

export function SettingsModal({
  open,
  onClose,
  // engine
  engineSettings,
  onEngineSettingsChange,
  onRestartEngine,
  // board
  boardTheme,
  onBoardThemeChange,
  boardSize,
  onBoardSizeChange,
  boardSizeMin,
  boardSizeMax,
  boardSizeStep,
  // interface
  uiPrefs,
  onUiPrefsChange,
  onShowShortcuts,
}: {
  open: boolean;
  onClose: () => void;
  engineSettings: EngineSettings;
  onEngineSettingsChange: (next: EngineSettings) => void;
  onRestartEngine: () => void;
  boardTheme: BoardThemeId;
  onBoardThemeChange: (next: BoardThemeId) => void;
  boardSize: number;
  onBoardSizeChange: (next: number) => void;
  boardSizeMin: number;
  boardSizeMax: number;
  boardSizeStep: number;
  uiPrefs: UiPrefs;
  onUiPrefsChange: (next: UiPrefs) => void;
  onShowShortcuts: () => void;
}) {
  const [tab, setTab] = useState<TabId>("engine");

  // Esc closes; matches ShortcutCheatsheet behaviour.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className={cx(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        "bg-ink-900/70 backdrop-blur-sm animate-fade"
      )}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cx(
          "w-full max-w-3xl max-h-[80vh] rounded-sm overflow-hidden",
          "bg-ink-800 border border-parchment-50/15 shadow-2xl",
          "animate-rise flex flex-col"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-parchment-50/8">
          <h2
            id="settings-modal-title"
            className="font-mono text-[11px] uppercase tracking-[.25em] text-brass"
          >
            ◆ Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-parchment-300/60 hover:text-parchment-50 transition-colors text-lg leading-none px-2"
            aria-label="Close settings"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Vertical tab rail (chess.com pattern). On narrow screens
              this stays vertical but trimmer; we don't try to flow it
              horizontally because the modal is already small there. */}
          <nav
            role="tablist"
            aria-label="Settings sections"
            className="w-32 sm:w-40 shrink-0 border-r border-parchment-50/8 bg-ink-900/40 py-2"
          >
            {TABS.map((t) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={cx(
                    "w-full flex items-center gap-2 px-3 py-2 text-left",
                    "text-xs font-mono uppercase tracking-[.18em]",
                    "border-l-2 transition-colors",
                    active
                      ? "border-brass text-brass-light bg-brass/5"
                      : "border-transparent text-parchment-300/70 hover:text-parchment-100 hover:bg-ink-700/40"
                  )}
                >
                  <span aria-hidden className="text-base leading-none">
                    {t.icon}
                  </span>
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Tab content */}
          <div className="flex-1 min-w-0 overflow-y-auto p-5">
            {tab === "engine" && (
              <EngineTab
                settings={engineSettings}
                onChange={onEngineSettingsChange}
                onRestart={onRestartEngine}
              />
            )}
            {tab === "interface" && (
              <InterfaceTab
                prefs={uiPrefs}
                onChange={onUiPrefsChange}
                onShowShortcuts={onShowShortcuts}
              />
            )}
            {tab === "board" && (
              <BoardTab
                theme={boardTheme}
                onThemeChange={onBoardThemeChange}
                size={boardSize}
                onSizeChange={onBoardSizeChange}
                sizeMin={boardSizeMin}
                sizeMax={boardSizeMax}
                sizeStep={boardSizeStep}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Engine tab

function EngineTab({
  settings,
  onChange,
  onRestart,
}: {
  settings: EngineSettings;
  onChange: (next: EngineSettings) => void;
  onRestart: () => void;
}) {
  function set<K extends keyof EngineSettings>(
    key: K,
    value: EngineSettings[K]
  ) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="space-y-5 max-w-md">
      <Section title="Analysis engine">
        <Field label="Engine">
          <select
            value={settings.engineId}
            onChange={(e) => set("engineId", e.target.value as EngineId)}
            className={cx(
              "w-full bg-ink-900/60 border border-parchment-50/10 rounded-sm",
              "px-2 py-1.5 text-sm font-mono text-parchment-100",
              "focus:border-brass/50 outline-none"
            )}
          >
            {(Object.keys(ENGINES) as EngineId[]).map((id) => (
              <option key={id} value={id}>
                {ENGINES[id].label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-parchment-300/55 italic">
            {ENGINES[settings.engineId].description}
          </p>
        </Field>

        <Slider
          label="Search depth"
          value={settings.depth}
          min={ENGINE_DEPTH_MIN}
          max={ENGINE_DEPTH_MAX}
          onChange={(v) => set("depth", v)}
          hint="Higher = stronger analysis, slower."
        />

        <Slider
          label="Lines (Multi-PV)"
          value={settings.multiPv}
          min={ENGINE_MULTIPV_MIN}
          max={ENGINE_MULTIPV_MAX}
          onChange={(v) => set("multiPv", v)}
          hint="Number of candidate lines shown at each position."
        />
      </Section>

      <Section title="Maintenance">
        <button
          type="button"
          onClick={onRestart}
          className={cx(
            "px-3 py-1.5 text-xs uppercase tracking-[.18em] font-mono",
            "border border-brass/50 text-brass-light rounded-sm",
            "hover:bg-brass/10 hover:border-brass transition-colors"
          )}
        >
          ↻ Restart engine
        </button>
        <p className="mt-2 text-[11px] text-parchment-300/55 italic">
          Tears down the worker and re-initialises with current settings. Use
          if the engine seems stuck.
        </p>
      </Section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Interface tab

function InterfaceTab({
  prefs,
  onChange,
  onShowShortcuts,
}: {
  prefs: UiPrefs;
  onChange: (next: UiPrefs) => void;
  onShowShortcuts: () => void;
}) {
  return (
    <div className="space-y-5 max-w-md">
      <Section title="Board overlays">
        <ToggleRow
          label="Suggestion arrows"
          hint="Green / amber arrows on the board showing the player's most-played continuations from this position."
          checked={prefs.showSuggestionArrows}
          onChange={(v) =>
            onChange({ ...prefs, showSuggestionArrows: v })
          }
        />
        <SelectRow
          label="Move-strength colouring"
          hint="Key Moves highlights the dominant continuation in green; All Moves uses one uniform colour for every arrow."
          value={prefs.arrowMode}
          options={[
            { value: "key", label: "Key Moves (default)" },
            { value: "all", label: "All Moves" },
          ]}
          disabled={!prefs.showSuggestionArrows}
          onChange={(v) =>
            onChange({ ...prefs, arrowMode: v as ArrowMode })
          }
        />
      </Section>

      <Section title="Animation">
        <SelectRow
          label="Piece animation speed"
          hint="Slide duration when a move is applied to the board."
          value={prefs.pieceAnimation}
          options={[
            { value: "none", label: "None (instant)" },
            { value: "fast", label: "Fast" },
            { value: "medium", label: "Medium (default)" },
            { value: "slow", label: "Slow" },
          ]}
          onChange={(v) =>
            onChange({ ...prefs, pieceAnimation: v as PieceAnimationSpeed })
          }
        />
      </Section>

      <Section title="Keyboard">
        <button
          type="button"
          onClick={onShowShortcuts}
          className={cx(
            "px-3 py-1.5 text-xs uppercase tracking-[.18em] font-mono",
            "border border-parchment-50/15 text-parchment-100 rounded-sm",
            "hover:border-parchment-50/30 hover:bg-ink-700/40 transition-colors"
          )}
        >
          Show keyboard shortcuts
        </button>
        <p className="mt-2 text-[11px] text-parchment-300/55 italic">
          Or press <kbd className="font-mono text-parchment-100">H</kbd> any
          time outside an input.
        </p>
      </Section>
    </div>
  );
}

/**
 * Labelled <select> row matching the modal's other field styling.
 * Accepts disabled state so dependent settings (move-strength
 * colouring depends on arrows being on) can grey out cleanly.
 */
function SelectRow({
  label,
  hint,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div
      className={cx(
        "space-y-1 mt-3",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      <label className="text-[10px] uppercase tracking-[.18em] text-parchment-300/60">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          "w-full bg-ink-900/60 border border-parchment-50/10 rounded-sm",
          "px-2 py-1.5 text-sm font-mono text-parchment-100",
          "focus:border-brass/50 outline-none"
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && (
        <p className="text-[11px] text-parchment-300/55 italic">{hint}</p>
      )}
    </div>
  );
}

/**
 * Switch-style toggle, brand-coloured. ARIA `role=switch` so screen
 * readers announce it correctly. We also accept a click on the label
 * row so the whole right-side hit area flips the state.
 */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <p className="text-sm text-parchment-100">{label}</p>
        {hint && (
          <p className="mt-1 text-[11px] text-parchment-300/55 italic leading-snug">
            {hint}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          "shrink-0 mt-0.5 relative inline-flex h-5 w-9 items-center rounded-full",
          "border transition-colors",
          checked
            ? "bg-brass/40 border-brass/60"
            : "bg-parchment-50/8 border-parchment-50/15"
        )}
      >
        <span
          className={cx(
            "inline-block h-3.5 w-3.5 rounded-full bg-parchment-50 transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Board tab

function BoardTab({
  theme,
  onThemeChange,
  size,
  onSizeChange,
  sizeMin,
  sizeMax,
  sizeStep,
}: {
  theme: BoardThemeId;
  onThemeChange: (t: BoardThemeId) => void;
  size: number;
  onSizeChange: (n: number) => void;
  sizeMin: number;
  sizeMax: number;
  sizeStep: number;
}) {
  return (
    <div className="space-y-5 max-w-md">
      <Section title="Theme">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(BOARD_THEMES) as BoardThemeId[]).map((id) => {
            const t = BOARD_THEMES[id];
            const active = id === theme;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onThemeChange(id)}
                className={cx(
                  "flex items-center gap-2 px-2 py-1.5 rounded-sm",
                  "border transition-colors text-left",
                  active
                    ? "border-brass/60 bg-brass/5"
                    : "border-parchment-50/10 hover:border-parchment-50/25"
                )}
                aria-pressed={active}
              >
                <ThemeSwatch dark={t.dark} light={t.light} />
                <span
                  className={cx(
                    "text-xs font-mono uppercase tracking-[.15em]",
                    active ? "text-brass-light" : "text-parchment-100/85"
                  )}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Board size">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSizeChange(size - sizeStep)}
            disabled={size <= sizeMin}
            className={cx(
              "w-8 h-8 rounded-sm border text-base leading-none",
              "border-parchment-50/15 text-parchment-100/85",
              "hover:border-parchment-50/30 hover:bg-ink-700/40",
              "disabled:opacity-30 disabled:hover:bg-transparent"
            )}
            aria-label="Smaller board"
          >
            −
          </button>
          <input
            type="range"
            min={sizeMin}
            max={sizeMax}
            step={sizeStep}
            value={size}
            onChange={(e) => onSizeChange(parseInt(e.target.value, 10))}
            className="flex-1 accent-brass"
            aria-label="Board size"
          />
          <button
            type="button"
            onClick={() => onSizeChange(size + sizeStep)}
            disabled={size >= sizeMax}
            className={cx(
              "w-8 h-8 rounded-sm border text-base leading-none",
              "border-parchment-50/15 text-parchment-100/85",
              "hover:border-parchment-50/30 hover:bg-ink-700/40",
              "disabled:opacity-30 disabled:hover:bg-transparent"
            )}
            aria-label="Larger board"
          >
            +
          </button>
          <span className="data-num text-xs text-parchment-300/70 w-16 text-right">
            {size}px
          </span>
        </div>
        <p className="mt-2 text-[11px] text-parchment-300/55 italic">
          You can also drag the handle on the right edge of the board.
        </p>
      </Section>
    </div>
  );
}

function ThemeSwatch({ dark, light }: { dark: string; light: string }) {
  return (
    <div className="grid grid-cols-2 grid-rows-2 w-7 h-7 rounded-sm overflow-hidden border border-parchment-50/15 shrink-0">
      <span style={{ background: light }} />
      <span style={{ background: dark }} />
      <span style={{ background: dark }} />
      <span style={{ background: light }} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Primitives

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-mono text-[10px] uppercase tracking-[.22em] text-parchment-300/55 mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-[.18em] text-parchment-300/60">
        {label}
      </label>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1 mt-3">
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
      {hint && (
        <p className="text-[11px] text-parchment-300/55 italic">{hint}</p>
      )}
    </div>
  );
}
