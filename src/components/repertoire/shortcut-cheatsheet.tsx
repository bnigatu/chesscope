"use client";

import { useEffect } from "react";
import { cx } from "@/lib/utils";
import type { Shortcut } from "@/lib/repertoire/shortcuts";

export function ShortcutCheatsheet({
  shortcuts,
  open,
  onClose,
}: {
  shortcuts: Shortcut[];
  open: boolean;
  onClose: () => void;
}) {
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
      aria-labelledby="shortcut-cheatsheet-title"
      className={cx(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        "bg-ink-900/70 backdrop-blur-sm animate-fade"
      )}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cx(
          "max-w-md w-full rounded-sm",
          "bg-ink-800 border border-parchment-50/15 shadow-2xl",
          "p-6 animate-rise"
        )}
      >
        <h2
          id="shortcut-cheatsheet-title"
          className="font-mono text-[11px] uppercase tracking-[.25em] text-brass mb-4"
        >
          ◆ Keyboard shortcuts
        </h2>
        <ul className="divide-y divide-parchment-50/8">
          {shortcuts.map((s, i) => (
            <li
              key={`${s.hint}-${i}`}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span className="text-parchment-100/85">{s.description}</span>
              <kbd
                className={cx(
                  "font-mono text-[11px] px-2 py-0.5 rounded-sm",
                  "border border-parchment-50/20 bg-ink-700/60",
                  "text-parchment-50 leading-none"
                )}
              >
                {s.hint}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[11px] text-parchment-300/55 italic text-center">
          Press <kbd className="font-mono text-parchment-100">Esc</kbd> or
          click outside to close.
        </p>
      </div>
    </div>
  );
}
