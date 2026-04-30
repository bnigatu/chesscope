"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { cx } from "@/lib/utils";

type Suggestion = {
  slug: string;
  name: string;
  fideId: string | null;
  gameCount: number;
  peakElo: number | null;
};

export function SearchForm({
  initialQuery = "",
  size = "lg",
}: {
  initialQuery?: string;
  size?: "lg" | "md";
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch, 180ms after the user stops typing.
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&limit=8`,
          { signal: ctl.signal },
        );
        const data = (await res.json()) as { players: Suggestion[] };
        setSuggestions(data.players ?? []);
        setOpen(true);
        setHighlight(-1);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // network errors: silently degrade, the form still submits
          setSuggestions([]);
        }
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(handle);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const submit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const trimmed = q.trim();
      if (!trimmed) return;
      // If a suggestion is highlighted, navigate directly to that player.
      if (highlight >= 0 && suggestions[highlight]) {
        router.push(`/player/${suggestions[highlight].slug}`);
        setOpen(false);
        return;
      }
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      setOpen(false);
    },
    [q, highlight, suggestions, router],
  );

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={submit} role="search" autoComplete="off">
        <label htmlFor="search-input" className="sr-only">
          Search players, events, openings
        </label>
        <div
          className={cx(
            "group relative flex items-center",
            "border-b transition-colors",
            open && suggestions.length
              ? "border-brass"
              : "border-parchment-50/20 focus-within:border-brass/70",
          )}
        >
          <span className="pl-1 text-parchment-300/60" aria-hidden>
            <SearchIcon size={size === "lg" ? 22 : 18} />
          </span>
          <input
            ref={inputRef}
            id="search-input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => suggestions.length && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(suggestions.length - 1, h + 1));
                setOpen(true);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(-1, h - 1));
              } else if (e.key === "Escape") {
                setOpen(false);
                setHighlight(-1);
              }
            }}
            placeholder={
              size === "lg"
                ? "Carlsen, Vienna Game, Tata Steel 2024…"
                : "Search a player or event"
            }
            className={cx(
              "flex-1 bg-transparent px-3 py-3 outline-none text-parchment-50 placeholder:text-parchment-300/40",
              size === "lg"
                ? "text-2xl sm:text-3xl font-display font-light"
                : "text-base font-body",
            )}
            spellCheck={false}
          />
          {loading && (
            <span className="text-parchment-300/60 pr-2 animate-pulse text-sm font-mono">
              ⋯
            </span>
          )}
          <button
            type="submit"
            disabled={!q.trim()}
            className={cx(
              "ml-2 mr-1 px-3 py-1.5 text-xs uppercase tracking-[.2em] font-mono",
              "border border-brass/40 text-brass-light",
              "hover:bg-brass/10 hover:border-brass transition-all",
              "disabled:opacity-30 disabled:hover:bg-transparent",
            )}
          >
            Search
          </button>
        </div>
      </form>

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className={cx(
            "absolute left-0 right-0 top-full mt-2 z-30",
            "bg-ink-800 border border-parchment-50/10 rounded-sm",
            "shadow-2xl shadow-black/60 overflow-hidden",
            "animate-fade",
          )}
        >
          {suggestions.map((s, i) => (
            <li key={s.slug}>
              <Link
                href={`/player/${s.slug}`}
                className={cx(
                  "flex items-baseline justify-between px-4 py-2.5 transition-colors",
                  i === highlight
                    ? "bg-ink-700 text-parchment-50"
                    : "text-parchment-100/90 hover:bg-ink-700/70",
                )}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => setOpen(false)}
              >
                <span className="font-display text-base">{s.name}</span>
                <span className="data-num text-xs text-parchment-300/70 ml-4 shrink-0">
                  {s.peakElo ? `${s.peakElo}` : "—"}{" "}
                  <span className="text-parchment-300/40">
                    · {s.gameCount} games
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.5-4.5" />
    </svg>
  );
}
