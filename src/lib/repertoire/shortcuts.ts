// Lightweight keyboard-shortcut hook for the Repertoire Explorer.
//
// Each shortcut is { test, hint, description, action }. The hook
// installs a single window keydown listener that walks the array and
// fires the first matching action. Inputs/textareas/contenteditable
// are ignored so users can type usernames/dates without triggering
// shortcuts mid-keystroke.
//
// Handlers are read from a ref so callers don't have to memoize their
// shortcut array — the listener stays mounted for the component's
// lifetime and reads the latest closures.

import { useEffect, useRef } from "react";

export type Shortcut = {
  /** Returns true if this shortcut should fire for the given event. */
  test: (e: KeyboardEvent) => boolean;
  /** Display label for the cheatsheet (e.g. "F", "Shift+F", "←"). */
  hint: string;
  /** One-line description for the cheatsheet. */
  description: string;
  /** What to run when the shortcut fires. */
  action: () => void;
};

export function useShortcuts(shortcuts: Shortcut[]): void {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (t.isContentEditable) return;
      }
      for (const s of ref.current) {
        if (s.test(e)) {
          e.preventDefault();
          s.action();
          return;
        }
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
