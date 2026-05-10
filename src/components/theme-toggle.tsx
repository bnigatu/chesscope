"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "chesscope.theme";

/**
 * Sun/moon toggle. Reads the initial state from the `data-theme` attr the
 * inline bootstrap script in layout.tsx already set on <html>, so we never
 * paint the wrong icon. After mount, every click flips the attr, persists
 * to localStorage, and updates the <meta name="theme-color"> tag so mobile
 * browser chrome matches.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  // On mount: pick up whatever the bootstrap script set. Until then the
  // button renders empty so SSR markup matches first-paint markup (no
  // hydration mismatch warning).
  useEffect(() => {
    const current =
      (document.documentElement.getAttribute("data-theme") as Theme | null) ??
      "dark";
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage may be disabled (private mode); the in-memory toggle still works */
    }
    // Keep the mobile-browser chrome color in sync.
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    if (meta) {
      meta.setAttribute("content", next === "light" ? "#f7f3ea" : "#1f2024");
    }
    setTheme(next);
  }

  // Don't render anything until we know the theme — avoids a flash of the
  // wrong icon between SSR and the bootstrap script's effect.
  if (!theme) {
    return <div aria-hidden className="w-9 h-9" />;
  }

  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      title={isLight ? "Switch to dark theme" : "Switch to light theme"}
      className="w-9 h-9 inline-flex items-center justify-center rounded-sm text-parchment-100/70 hover:text-brass-light hover:bg-ink-800/60 transition-colors"
    >
      {isLight ? (
        // Moon
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      ) : (
        // Sun
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  );
}
