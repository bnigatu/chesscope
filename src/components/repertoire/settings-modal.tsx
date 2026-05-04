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
              <InterfaceTab onShowShortcuts={onShowShortcuts} />
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

function InterfaceTab({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  return (
    <div className="space-y-5 max-w-md">
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

      <Section title="More options coming">
        <p className="text-xs text-parchment-300/65 leading-relaxed">
          Move-strength colouring, suggestion-arrow toggle, animation speed —
          slated for a follow-up.
        </p>
      </Section>
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
