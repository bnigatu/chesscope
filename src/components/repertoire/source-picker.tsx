"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/lib/utils";
import {
  DEFAULT_FILTERS,
  filtersToParams,
  type RepertoireFilters,
  type TimeControlKey,
} from "@/lib/repertoire/filters";
import { deserializeTree } from "@/lib/repertoire/save-load";
import { putUploadedTree } from "@/lib/repertoire/cache";

const PGN_SESSION_KEY = "chesscope.pgnSession";
// Building navigates to /?built=1&…, which unmounts this form; coming back
// mounts a fresh one. Persist the choices in localStorage (not session —
// usernames are worth keeping across visits; not IDB — this is <1 KB) so
// "back → tweak one thing → rebuild" doesn't mean retyping everything.
// Versioned key: bump if the saved shape ever changes incompatibly.
const PREFS_KEY = "chesscope.sourcePicker.v1";

type SavedPrefs = {
  enabled?: { lichess?: boolean; chesscom?: boolean; pgn?: boolean };
  usernames?: { lichess?: string; chesscom?: string };
  pgnPlayer?: string;
  filters?: Partial<RepertoireFilters>;
};

/** True when any collapsed-by-default advanced filter deviates from the
 * defaults — used to auto-expand the section on restore so restored
 * values are never invisibly active. */
function advancedDiffers(f: RepertoireFilters): boolean {
  return (
    f.mode !== DEFAULT_FILTERS.mode ||
    Object.entries(f.timeControls).some(
      ([k, v]) => DEFAULT_FILTERS.timeControls[k as TimeControlKey] !== v
    ) ||
    f.fromDate !== DEFAULT_FILTERS.fromDate ||
    f.toDate !== DEFAULT_FILTERS.toDate ||
    f.minRating !== DEFAULT_FILTERS.minRating ||
    f.maxRating !== DEFAULT_FILTERS.maxRating ||
    f.opponent.trim() !== DEFAULT_FILTERS.opponent ||
    f.limit !== DEFAULT_FILTERS.limit
  );
}

const SOURCES = [
  { id: "lichess" as const, label: "Lichess" },
  { id: "chesscom" as const, label: "Chess.com" },
];

const TIME_CONTROLS: { id: TimeControlKey; label: string }[] = [
  { id: "bullet", label: "Bullet" },
  { id: "blitz", label: "Blitz" },
  { id: "rapid", label: "Rapid" },
  { id: "daily", label: "Daily" },
];

export function SourcePickerForm() {
  const router = useRouter();
  const [enabled, setEnabled] = useState({
    lichess: true,
    chesscom: true,
    pgn: false,
  });
  const [usernames, setUsernames] = useState({
    lichess: "",
    chesscom: "",
  });
  const [pgnFile, setPgnFile] = useState<File | null>(null);
  const [pgnPlayer, setPgnPlayer] = useState("");
  const [filters, setFilters] = useState<RepertoireFilters>(DEFAULT_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const treeFileRef = useRef<HTMLInputElement | null>(null);
  const pgnFileRef = useRef<HTMLInputElement | null>(null);
  // Persist only after the restore effect has run. This MUST be state,
  // not a ref: both effects run in the same mount commit, and the persist
  // effect's first pass closes over the pre-restore default values. A ref
  // flipped synchronously inside the restore effect reads true in that
  // same pass, so the defaults would overwrite the saved prefs on every
  // remount (e.g. navigating back from the built tree) — with state, the
  // first pass still sees false and skips, and the write happens on the
  // next render when the restored values are actually in `enabled`/etc.
  const [hydrated, setHydrated] = useState(false);

  // Restore saved choices on mount. Deliberately NOT in the useState
  // initializers: this component is server-rendered, and reading
  // localStorage during the initial render makes the client render
  // differ from the server HTML (hydration mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) {
        const saved: SavedPrefs = JSON.parse(raw);
        setEnabled((p) => ({ ...p, ...saved.enabled }));
        setUsernames((p) => ({ ...p, ...saved.usernames }));
        if (typeof saved.pgnPlayer === "string") setPgnPlayer(saved.pgnPlayer);
        // Merge over the defaults so prefs saved before a future filter
        // field is added still load (missing keys fall back to default).
        const restored: RepertoireFilters = {
          ...DEFAULT_FILTERS,
          ...saved.filters,
          timeControls: {
            ...DEFAULT_FILTERS.timeControls,
            ...saved.filters?.timeControls,
          },
        };
        setFilters(restored);
        if (advancedDiffers(restored)) setAdvancedOpen(true);
      }
    } catch {
      // Corrupt JSON or storage unavailable (private browsing) — start
      // from defaults; the next successful save overwrites the bad blob.
    }
    setHydrated(true);
  }, []);

  // Save on every change. The payload is <1 KB, so no debounce needed.
  // The pgn File handle itself can't be persisted (not serializable);
  // we keep the checkbox + player name and the user re-picks the file.
  useEffect(() => {
    if (!hydrated) return;
    try {
      const prefs: SavedPrefs = { enabled, usernames, pgnPlayer, filters };
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Storage full or blocked — the form still works, it just won't
      // remember. Not worth surfacing to the user.
    }
  }, [hydrated, enabled, usernames, pgnPlayer, filters]);

  function resetAll() {
    setEnabled({ lichess: true, chesscom: true, pgn: false });
    setUsernames({ lichess: "", chesscom: "" });
    setPgnFile(null);
    setPgnPlayer("");
    setFilters(DEFAULT_FILTERS);
    setAdvancedOpen(false);
    setErr(null);
    // Clear the native input too, so re-picking the same file after a
    // reset still fires onChange.
    if (pgnFileRef.current) pgnFileRef.current.value = "";
    try {
      window.localStorage.removeItem(PREFS_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }

  function setFilter<K extends keyof RepertoireFilters>(
    k: K,
    v: RepertoireFilters[K]
  ) {
    setFilters((f) => ({ ...f, [k]: v }));
  }

  async function build(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const params = new URLSearchParams({ built: "1" });
      filtersToParams(params, filters);

      // Online sources go in the URL.
      if (enabled.lichess && usernames.lichess.trim()) {
        params.set("lichess", usernames.lichess.trim());
      }
      if (enabled.chesscom && usernames.chesscom.trim()) {
        params.set("chesscom", usernames.chesscom.trim());
      }

      // PGN file → stash text in sessionStorage, signal via ?pgn=1.
      if (enabled.pgn && pgnFile && pgnPlayer.trim()) {
        const text = await pgnFile.text();
        const payload = JSON.stringify({
          filename: pgnFile.name,
          playerName: pgnPlayer.trim(),
          text,
        });
        try {
          window.sessionStorage.setItem(PGN_SESSION_KEY, payload);
        } catch {
          throw new Error(
            "PGN too large for this browser session. Use a smaller file."
          );
        }
        params.set("pgn", "1");
      } else if (enabled.pgn && (!pgnFile || !pgnPlayer.trim())) {
        throw new Error(
          "PGN source enabled but file or player name is missing."
        );
      }

      if (
        !params.get("lichess") &&
        !params.get("chesscom") &&
        !params.get("pgn")
      ) {
        throw new Error("Pick at least one source.");
      }

      router.push(`/?${params.toString()}`);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }

  async function loadTreeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const text = await file.text();
      const saved = deserializeTree(text);
      // Hand off the file body via IDB instead of sessionStorage — full
      // broadcast trees regularly exceed sessionStorage's ~5 MB cap and
      // throw QuotaExceededError on setItem. IDB has no meaningful cap
      // for this payload size.
      const ok = await putUploadedTree(text);
      if (!ok) {
        throw new Error(
          "Couldn't stage the uploaded tree (IndexedDB unavailable). " +
          "Try a different browser or disable private browsing."
        );
      }
      const params = new URLSearchParams({ built: "1", tree: "1" });
      filtersToParams(params, saved.filters);
      router.push(`/?${params.toString()}`);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
      // Reset the file input so picking the same file again still fires.
      if (treeFileRef.current) treeFileRef.current.value = "";
    }
  }

  const canBuild =
    (enabled.lichess && usernames.lichess.trim()) ||
    (enabled.chesscom && usernames.chesscom.trim()) ||
    (enabled.pgn && pgnFile && pgnPlayer.trim());

  return (
    <form onSubmit={build} className="card p-5 sm:p-6 space-y-6">
      {/* The form remembers its last state (localStorage); this is the
          escape hatch for starting clean. */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={resetAll}
          className="text-xs text-brass-light hover:underline font-mono uppercase tracking-[.18em]"
        >
          ↺ Reset form
        </button>
      </div>

      {/* Sources */}
      <Section title="Sources">
        <div className="space-y-2">
          {SOURCES.map((s) => (
            <div
              key={s.id}
              className={cx(
                "flex items-center gap-3 px-3 py-2",
                "bg-ink-700/60 border border-parchment-50/15 rounded-sm"
              )}
            >
              <input
                type="checkbox"
                checked={enabled[s.id]}
                onChange={(e) =>
                  setEnabled((p) => ({ ...p, [s.id]: e.target.checked }))
                }
                aria-label={`Use ${s.label}`}
                className="accent-brass shrink-0"
              />
              <span className="font-display text-sm text-parchment-50 w-20 shrink-0">
                {s.label}
              </span>
              <input
                type="text"
                value={usernames[s.id]}
                onChange={(e) =>
                  setUsernames((p) => ({ ...p, [s.id]: e.target.value }))
                }
                placeholder="username"
                className={inputClass}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          ))}

          {/* PGN file row */}
          <div
            className={cx(
              "flex flex-col gap-2 px-3 py-2",
              "bg-ink-700/60 border border-parchment-50/15 rounded-sm"
            )}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={enabled.pgn}
                onChange={(e) =>
                  setEnabled((p) => ({ ...p, pgn: e.target.checked }))
                }
                aria-label="Use PGN file"
                className="accent-brass shrink-0"
              />
              <span className="font-display text-sm text-parchment-50 w-20 shrink-0">
                PGN file
              </span>
              <label
                className={cx(
                  "flex-1 min-w-0 text-xs cursor-pointer truncate",
                  pgnFile
                    ? "text-parchment-100/85 font-mono"
                    : "text-parchment-300 italic"
                )}
              >
                {pgnFile ? pgnFile.name : "Click to choose a .pgn file"}
                <input
                  ref={pgnFileRef}
                  type="file"
                  accept=".pgn,application/x-chess-pgn,text/plain"
                  className="hidden"
                  onChange={(e) =>
                    setPgnFile(e.target.files?.[0] ?? null)
                  }
                />
              </label>
            </div>
            {enabled.pgn && (
              <div className="flex items-center gap-3 pl-7">
                <span className="text-[10px] uppercase tracking-[.18em] text-parchment-300 w-16 shrink-0">
                  Player
                </span>
                <input
                  type="text"
                  value={pgnPlayer}
                  onChange={(e) => setPgnPlayer(e.target.value)}
                  placeholder="Name to match in PGN tags"
                  className={inputClass}
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
            )}
          </div>
        </div>

        {/* Load saved tree */}
        <button
          type="button"
          onClick={() => treeFileRef.current?.click()}
          className={cx(
            "mt-3 text-xs text-brass-light hover:underline",
            "font-mono uppercase tracking-[.18em]"
          )}
        >
          ↑ Load saved .tree file
        </button>
        <input
          ref={treeFileRef}
          type="file"
          accept=".tree,application/json,text/plain"
          className="hidden"
          onChange={loadTreeFile}
        />
      </Section>

      {/* Color (single pick) */}
      <Section title="Color">
        <div
          className={cx(
            "grid grid-cols-2 gap-2 p-1",
            "bg-ink-700/60 border border-parchment-50/15 rounded-sm"
          )}
        >
          {(["white", "black"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter("color", c)}
              className={cx(
                "px-3 py-2 text-sm capitalize rounded-sm transition-colors",
                "font-mono uppercase tracking-[.18em]",
                // Selected chips use ABSOLUTE chess colors, not theme
                // tokens: "White" must look white and "Black" black in
                // BOTH site themes (tokens invert in light mode, which
                // rendered the White pick as a black chip — same class
                // of bug as the old eval bar).
                filters.color === c
                  ? c === "white"
                    ? "bg-[#f5efe2] text-[#1f2024] border border-[#1f2024]/25"
                    : "bg-[#1f2024] text-[#f5efe2] border border-[#f5efe2]/30"
                  : "text-parchment-300 hover:text-parchment-100"
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-parchment-300 italic mt-1">
          Only games where the player had this color are walked into the tree.
        </p>
      </Section>

      {/* Advanced */}
      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="text-xs text-brass-light hover:underline font-mono uppercase tracking-[.18em]"
        >
          {advancedOpen ? "− Hide advanced filters" : "+ Advanced filters"}
        </button>
      </div>

      {advancedOpen && (
        <>
          {/* Mode */}
          <Section title="Mode">
            <div className="grid grid-cols-3 gap-2">
              {(["all", "rated", "casual"] as const).map((m) => (
                <Pill
                  key={m}
                  active={filters.mode === m}
                  onClick={() => setFilter("mode", m)}
                >
                  {m === "all" ? "Any" : m}
                </Pill>
              ))}
            </div>
          </Section>

          {/* Time controls */}
          <Section title="Time control">
            <div className="grid grid-cols-2 gap-2">
              {TIME_CONTROLS.map((t) => (
                <label
                  key={t.id}
                  className={cx(
                    "flex items-center gap-2 px-2 py-1.5",
                    "bg-ink-700/60 border border-parchment-50/15 rounded-sm",
                    "text-sm text-parchment-100/85"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={filters.timeControls[t.id]}
                    onChange={(e) =>
                      setFilter("timeControls", {
                        ...filters.timeControls,
                        [t.id]: e.target.checked,
                      })
                    }
                    className="accent-brass"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </Section>

          {/* Date range */}
          <Section title="Date range">
            <div className="grid grid-cols-2 gap-2">
              <DateInput
                value={filters.fromDate}
                onChange={(v) => setFilter("fromDate", v)}
                label="From"
              />
              <DateInput
                value={filters.toDate}
                onChange={(v) => setFilter("toDate", v)}
                label="To"
              />
            </div>
          </Section>

          {/* Opponent rating */}
          <Section title="Opponent rating">
            <div className="grid grid-cols-2 gap-2">
              <NumberInput
                value={filters.minRating}
                onChange={(n) => setFilter("minRating", n)}
                placeholder="min"
              />
              <NumberInput
                value={filters.maxRating}
                onChange={(n) => setFilter("maxRating", n)}
                placeholder="max"
              />
            </div>
          </Section>

          {/* Opponent name */}
          <Section title="Opponent name">
            <input
              type="text"
              value={filters.opponent}
              onChange={(e) => setFilter("opponent", e.target.value)}
              placeholder="Anyone"
              className={inputClass}
              spellCheck={false}
            />
          </Section>

          {/* Download limit */}
          <Section title="Download limit">
            <div className="flex items-center gap-2">
              <NumberInput
                value={filters.limit}
                onChange={(n) => setFilter("limit", n)}
                placeholder="No limit"
              />
              <span className="text-[11px] text-parchment-300 italic">
                games (0 = unlimited)
              </span>
            </div>
          </Section>
        </>
      )}

      {err && (
        <p className="text-xs text-oxblood-light font-mono">{err}</p>
      )}

      <button
        type="submit"
        disabled={!canBuild || busy}
        className={cx(
          "w-full px-4 py-3",
          "border border-brass/50 text-brass-light",
          "font-mono text-xs uppercase tracking-[.25em]",
          "hover:bg-brass/10 hover:border-brass transition-colors",
          "disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent"
        )}
      >
        {busy ? "Loading…" : "Build tree"}
      </button>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-mono text-[11px] uppercase tracking-[.25em] text-brass">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "px-3 py-2 text-sm rounded-sm transition-colors capitalize",
        active
          ? "bg-brass/20 text-parchment-50 border border-brass/50"
          : "bg-ink-700/60 text-parchment-100/90 border border-parchment-50/15 hover:text-parchment-100"
      )}
    >
      {children}
    </button>
  );
}

const inputClass = cx(
  "w-full bg-transparent outline-none",
  "text-sm font-mono text-parchment-100",
  "placeholder:text-parchment-300",
  "border-b border-parchment-50/10 focus:border-brass/70 transition-colors",
  "px-1 py-1"
);

function DateInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[.18em] text-parchment-300 mb-1">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value === 0 ? "" : value}
      onChange={(e) => {
        const s = e.target.value;
        onChange(s === "" ? 0 : Math.max(0, parseInt(s, 10) || 0));
      }}
      placeholder={placeholder}
      className={inputClass}
    />
  );
}
