"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/lib/utils";
import {
  DEFAULT_FILTERS,
  filtersToParams,
  type RepertoireFilters,
  type TimeControlKey,
} from "@/lib/repertoire/filters";
import { deserializeTree } from "@/lib/repertoire/save-load";

const PGN_SESSION_KEY = "chesscope.pgnSession";
const TREE_SESSION_KEY = "chesscope.treeSession";

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
      window.sessionStorage.setItem(TREE_SESSION_KEY, text);
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
    <form onSubmit={build} className="space-y-6">
      {/* Sources */}
      <Section title="Sources">
        <div className="space-y-2">
          {SOURCES.map((s) => (
            <div
              key={s.id}
              className={cx(
                "flex items-center gap-3 px-3 py-2",
                "bg-ink-800/60 border border-parchment-50/8 rounded-sm"
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
              "bg-ink-800/60 border border-parchment-50/8 rounded-sm"
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
                    : "text-parchment-300/50 italic"
                )}
              >
                {pgnFile ? pgnFile.name : "Click to choose a .pgn file"}
                <input
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
                <span className="text-[10px] uppercase tracking-[.18em] text-parchment-300/50 w-16 shrink-0">
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
            "bg-ink-800/60 border border-parchment-50/8 rounded-sm"
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
                filters.color === c
                  ? c === "white"
                    ? "bg-parchment-50 text-ink-900"
                    : "bg-ink-900 text-parchment-50 border border-parchment-50/30"
                  : "text-parchment-300/60 hover:text-parchment-100"
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-parchment-300/50 italic mt-1">
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
                    "bg-ink-800/60 border border-parchment-50/8 rounded-sm",
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
              <span className="text-[11px] text-parchment-300/50 italic">
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
          : "bg-ink-800/60 text-parchment-100/70 border border-parchment-50/8 hover:text-parchment-100"
      )}
    >
      {children}
    </button>
  );
}

const inputClass = cx(
  "w-full bg-transparent outline-none",
  "text-sm font-mono text-parchment-100",
  "placeholder:text-parchment-300/40",
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
      <span className="block text-[10px] uppercase tracking-[.18em] text-parchment-300/50 mb-1">
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
