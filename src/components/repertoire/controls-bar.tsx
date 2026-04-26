"use client";

import { cx } from "@/lib/utils";

export type ControlHandlers = {
  onFlip: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onJumpStart: () => void;
  onJumpEnd: () => void;
  onSwitchColor: () => void;
  onCopyFen: () => void;
  onCopyShare: () => void;
  onClear: () => void;
};

type Control = {
  id: keyof ControlHandlers;
  label: string;
  shortcut: string;
  glyph: string;
  destructive?: boolean;
};

const CONTROLS: Control[] = [
  { id: "onFlip", label: "Flip board", shortcut: "F", glyph: "⟲" },
  { id: "onUndo", label: "Undo move", shortcut: "←", glyph: "↶" },
  { id: "onRedo", label: "Redo move", shortcut: "→", glyph: "↷" },
  { id: "onJumpStart", label: "Jump to start", shortcut: "↑", glyph: "⇤" },
  { id: "onJumpEnd", label: "Jump to end", shortcut: "↓", glyph: "⇥" },
  { id: "onSwitchColor", label: "Switch color", shortcut: "C", glyph: "⇄" },
  { id: "onCopyFen", label: "Copy FEN", shortcut: "⇧F", glyph: "🗒" },
  { id: "onCopyShare", label: "Copy share link", shortcut: "⇧L", glyph: "🔗" },
  {
    id: "onClear",
    label: "Clear games",
    shortcut: "⌘⇧⌫",
    glyph: "✕",
    destructive: true,
  },
];

export function ControlsBar(handlers: Partial<ControlHandlers> = {}) {
  return (
    <div
      role="toolbar"
      aria-label="Board controls"
      className={cx(
        "flex items-stretch gap-0.5",
        "bg-ink-800/80 border border-parchment-50/8 rounded-sm",
        "p-1 mt-3"
      )}
    >
      {CONTROLS.map((c) => {
        const fn = handlers[c.id];
        const disabled = !fn;
        return (
          <button
            key={c.id}
            type="button"
            onClick={fn}
            disabled={disabled}
            aria-label={`${c.label} (${c.shortcut})`}
            title={`${c.label} · ${c.shortcut}`}
            className={cx(
              "flex-1 min-w-0 flex items-center justify-center",
              "px-1 py-1.5 text-base leading-none",
              "font-mono text-parchment-100/80",
              "border border-transparent rounded-sm transition-colors",
              !disabled &&
                "hover:border-brass/40 hover:text-parchment-50 hover:bg-ink-700/60",
              !disabled &&
                c.destructive &&
                "hover:border-oxblood/60 hover:text-oxblood-light",
              disabled && "opacity-30 cursor-default"
            )}
          >
            <span aria-hidden>{c.glyph}</span>
          </button>
        );
      })}
    </div>
  );
}
