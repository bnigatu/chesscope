"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Board, type BoardArrow } from "./board";
import { ControlsBar } from "./controls-bar";
import { EnginePanel } from "./engine-panel";
import { EvalBar } from "./eval-bar";
import { ShortcutCheatsheet } from "./shortcut-cheatsheet";
import { useShortcuts, type Shortcut } from "@/lib/repertoire/shortcuts";
import {
  cacheKey,
  getCached,
  putCached,
  pruneExpired,
} from "@/lib/repertoire/cache";
import { MoveListPanel, type Move } from "./move-list-panel";
import { MovesPanel } from "./moves-panel";
import { BookPanel } from "./book-panel";
import { StatsCard, type MoveDetails } from "./stats-card";
import {
  ingestChesscom,
  ingestLichess,
  ingestPgnText,
  mergeIngest,
  shouldIngest,
  type IngestSource,
} from "@/lib/repertoire/ingest";
import {
  addGame,
  makeTree,
  nodeAt,
  positionFen,
  topMovesAt,
  type MoveOption,
  type Tree,
} from "@/lib/repertoire/tree";
import type { RepertoireFilters } from "@/lib/repertoire/filters";
import {
  deserializeTree,
  downloadTreeFile,
} from "@/lib/repertoire/save-load";
import { cx } from "@/lib/utils";

const PGN_SESSION_KEY = "chesscope.pgnSession";
const TREE_SESSION_KEY = "chesscope.treeSession";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type Counts = Record<IngestSource, number>;
type Status = "idle" | "loading" | "done" | "error" | "cancelled";

export function RepertoireExplorer({
  lichessUser,
  chesscomUser,
  pgnEnabled = false,
  treeEnabled = false,
  filters,
  initialSanLine = [],
}: {
  lichessUser: string | null;
  chesscomUser: string | null;
  pgnEnabled?: boolean;
  treeEnabled?: boolean;
  filters: RepertoireFilters;
  initialSanLine?: string[];
}) {
  // ── Move-history state ───────────────────────────────────────────────
  // Seeded from the URL's `moves=` param so share links land you on the
  // same board position the link author had. We validate via chess.js —
  // anything that doesn't make a legal move from the running position is
  // dropped (junk input fails closed at the first illegal SAN, cursor
  // ends up wherever the legal prefix took us).
  const initialMoves = useMemo<Move[]>(() => {
    if (!initialSanLine.length) return [];
    const game = new Chess();
    const result: Move[] = [];
    for (const san of initialSanLine) {
      try {
        const m = game.move(san);
        if (!m) break;
        result.push({ san: m.san, alternates: [] });
      } catch {
        break;
      }
    }
    return result;
  }, [initialSanLine]);

  const [moves, setMoves] = useState<Move[]>(initialMoves);
  const [cursor, setCursor] = useState(initialMoves.length);
  const [hoveredMoveSan, setHoveredMoveSan] = useState<string | null>(null);
  // Latest top-PV eval from the engine. Reset to null on FEN change so
  // the bar doesn't show stale data while the engine recomputes.
  const [evalInfo, setEvalInfo] = useState<{
    cp: number | null;
    mate: number | null;
  }>({ cp: null, mate: null });
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [orientation, setOrientation] = useState<"white" | "black">(
    filters.color
  );

  const sanLine = useMemo(
    () => moves.slice(0, cursor).map((m) => m.san),
    [moves, cursor]
  );
  const fen = useMemo(() => fenAt(sanLine), [sanLine]);

  // Reset eval bar to "no data yet" when the position changes — engine
  // will repopulate within a tick.
  useEffect(() => {
    setEvalInfo({ cp: null, mate: null });
  }, [fen]);

  // ── Tree state ───────────────────────────────────────────────────────
  const treeRef = useRef<Tree>(makeTree());
  const [treeTick, setTreeTick] = useState(0);
  const [counts, setCounts] = useState<Counts>({
    lichess: 0,
    chesscom: 0,
    pgn: 0,
  });
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pgnFilenameRef = useRef<string | null>(null);
  const pgnPlayerRef = useRef<string | null>(null);

  // Snapshot the user/filters so the effect deps are stable. Stringify
  // the filters once for cheap deep-equality.
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    treeRef.current = makeTree();
    setCounts({ lichess: 0, chesscom: 0, pgn: 0 });
    setError(null);
    setTreeTick(0);
    pgnFilenameRef.current = null;
    pgnPlayerRef.current = null;
    abortRef.current?.abort();

    // Path 1: hydrate a saved tree directly. No ingest at all.
    if (treeEnabled) {
      try {
        const blob = window.sessionStorage.getItem(TREE_SESSION_KEY);
        if (!blob) throw new Error("No saved tree in session.");
        const saved = deserializeTree(blob);
        treeRef.current = saved.tree;
        pgnFilenameRef.current = saved.sources.pgnFilename ?? null;
        pgnPlayerRef.current = saved.sources.playerName ?? null;
        setCounts({
          lichess: 0,
          chesscom: 0,
          pgn:
            nodeAt(saved.tree, positionFen(STARTING_FEN))?.count ?? 0,
        });
        setTreeTick((t) => t + 1);
        setStatus("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
      return;
    }

    // Pull PGN session payload, if any.
    let pgnText: string | null = null;
    if (pgnEnabled) {
      try {
        const blob = window.sessionStorage.getItem(PGN_SESSION_KEY);
        if (blob) {
          const parsed = JSON.parse(blob) as {
            filename: string;
            playerName: string;
            text: string;
          };
          pgnText = parsed.text;
          pgnFilenameRef.current = parsed.filename;
          pgnPlayerRef.current = parsed.playerName;
        }
      } catch {
        /* ignore — fall through to nothing-to-ingest */
      }
    }

    if (!lichessUser && !chesscomUser && !pgnText) {
      setStatus("idle");
      return;
    }

    const ctl = new AbortController();
    abortRef.current = ctl;
    setStatus("loading");

    // IndexedDB cache key for this (sources × filters) tuple. Hit
    // before any network calls — instant load on repeat visits.
    const idbKey = cacheKey({
      lichessUser,
      chesscomUser,
      pgnFilename: pgnFilenameRef.current,
      filters,
    });

    (async () => {
      // Path 1a: try the IDB cache first.
      try {
        const cached = await getCached(idbKey);
        if (cached && !ctl.signal.aborted) {
          treeRef.current = cached.tree;
          // Approximate per-source counts from the cached tree's start
          // node — total games visited equals the start-position count.
          const total =
            cached.tree.byFen[positionFen(STARTING_FEN)]?.count ?? 0;
          setCounts({
            lichess: lichessUser ? total : 0,
            chesscom: chesscomUser ? total : 0,
            pgn: pgnText ? total : 0,
          });
          setTreeTick((t) => t + 1);
          setStatus("done");
          // Best-effort housekeeping: prune anything past TTL.
          void pruneExpired();
          return;
        }
      } catch {
        /* cache miss / IDB unavailable — fall through to ingest */
      }

      const sources: AsyncIterable<{
        ref: { source: IngestSource };
      }>[] = [];
      if (lichessUser)
        sources.push(ingestLichess(lichessUser, filters, ctl.signal));
      if (chesscomUser)
        sources.push(ingestChesscom(chesscomUser, filters, ctl.signal));
      if (pgnText) sources.push(ingestPgnText(pgnText, ctl.signal));

      let processed = 0;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const game of mergeIngest(sources as any) as any) {
          if (ctl.signal.aborted) return;
          const playerName =
            game.ref.source === "lichess"
              ? lichessUser?.toLowerCase()
              : game.ref.source === "chesscom"
              ? chesscomUser?.toLowerCase()
              : pgnPlayerRef.current?.toLowerCase();
          if (!playerName) continue;
          if (!shouldIngest(game, filters, playerName)) continue;

          addGame(treeRef.current, game);
          processed++;
          setCounts((c) => ({
            ...c,
            [game.ref.source as IngestSource]:
              c[game.ref.source as IngestSource] + 1,
          }));

          // Respect download limit.
          if (filters.limit > 0 && processed >= filters.limit) {
            setTreeTick((t) => t + 1);
            ctl.abort();
            setStatus("done");
            // Save partial tree too — limit-truncated trees are
            // legitimate cache material on subsequent visits.
            void putCached({
              key: idbKey,
              tree: treeRef.current,
              savedAt: Date.now(),
              sources: {
                lichess: lichessUser ?? undefined,
                chesscom: chesscomUser ?? undefined,
                pgnFilename: pgnFilenameRef.current ?? undefined,
              },
              filters,
            });
            return;
          }
          if (processed % 25 === 0) setTreeTick((t) => t + 1);
        }
        setTreeTick((t) => t + 1);
        setStatus("done");
        // Persist completed tree for next visit.
        void putCached({
          key: idbKey,
          tree: treeRef.current,
          savedAt: Date.now(),
          sources: {
            lichess: lichessUser ?? undefined,
            chesscom: chesscomUser ?? undefined,
            pgnFilename: pgnFilenameRef.current ?? undefined,
          },
          filters,
        });
      } catch (err) {
        if (ctl.signal.aborted) {
          setStatus((s) => (s === "loading" ? "cancelled" : s));
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setStatus("error");
      }
    })();

    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lichessUser, chesscomUser, pgnEnabled, treeEnabled, filterKey]);

  // ── Save tree → local file ───────────────────────────────────────────
  const saveTree = () => {
    downloadTreeFile({
      sources: {
        lichess: lichessUser ?? undefined,
        chesscom: chesscomUser ?? undefined,
        pgnFilename: pgnFilenameRef.current ?? undefined,
        playerName: pgnPlayerRef.current ?? undefined,
      },
      filters,
      tree: treeRef.current,
    });
  };

  const cancel = () => {
    abortRef.current?.abort();
    setStatus("cancelled");
  };

  // ── Tree-derived data ─────────────────────────────────────────────────
  const currentFenKey = useMemo(() => positionFen(fen), [fen]);
  const playedMoves: MoveOption[] = useMemo(
    () => topMovesAt(treeRef.current, currentFenKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentFenKey, treeTick]
  );

  // Auto-shape arrows for the top 4 played moves at this position. Brand
  // brass with opacity scaling by frequency rank; the hovered move (if
  // any) lights up to brass-light. Mirrors openingtree's behaviour where
  // the board itself becomes a heatmap of "where this player goes."
  const boardArrows = useMemo<BoardArrow[]>(() => {
    if (playedMoves.length === 0) return [];
    const result: BoardArrow[] = [];
    for (let i = 0; i < Math.min(4, playedMoves.length); i++) {
      const m = playedMoves[i];
      const game = new Chess(fen);
      let parsed;
      try {
        parsed = game.move(m.san);
      } catch {
        continue;
      }
      if (!parsed) continue;
      const isHovered = hoveredMoveSan === m.san;
      // Frequency-rank opacity: top move 0.85, second 0.65, third 0.45,
      // fourth 0.30. Hovered always full strength in brand-light.
      const opacity = [0.85, 0.65, 0.45, 0.3][i];
      result.push({
        startSquare: parsed.from,
        endSquare: parsed.to,
        color: isHovered
          ? "rgba(212, 174, 94, 0.95)" // brass-light
          : `rgba(184, 146, 74, ${opacity})`, // brass with rank-scaled opacity
      });
    }
    return result;
  }, [playedMoves, fen, hoveredMoveSan]);

  const positionStats: MoveDetails | null = useMemo(() => {
    const node = nodeAt(treeRef.current, currentFenKey);
    if (!node || node.count === 0) return null;
    return {
      count: node.count,
      whiteWins: node.whiteWins,
      blackWins: node.blackWins,
      draws: node.draws,
      totalOpponentElo:
        filters.color === "white" ? node.totalBlackElo : node.totalWhiteElo,
      totalElo:
        filters.color === "white" ? node.totalWhiteElo : node.totalBlackElo,
      longestPlies: node.longestPlies,
      shortestPlies: node.shortestPlies,
      lastPlayed: node.lastDate,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFenKey, treeTick, filters.color]);

  // ── Move-history mutation handlers ───────────────────────────────────
  const applyOne = useCallback(
    (san: string): boolean => {
      const game = new Chess(fen);
      let canonical: string;
      try {
        const m = game.move(san);
        if (!m) return false;
        canonical = m.san;
      } catch {
        return false;
      }
      setMoves((prev) => {
        const head = prev.slice(0, cursor);
        const here = prev[cursor];
        if (!here) return [...head, { san: canonical, alternates: [] }];
        if (here.san === canonical) return prev;
        if (here.alternates.includes(canonical)) {
          const swapped = [
            here.san,
            ...here.alternates.filter((a) => a !== canonical),
          ];
          return [...head, { san: canonical, alternates: swapped }];
        }
        return [
          ...head,
          { san: canonical, alternates: [here.san, ...here.alternates] },
        ];
      });
      setCursor((c) => c + 1);
      return true;
    },
    [fen, cursor]
  );

  const playLine = useCallback(
    (sanLineToPlay: string[]) => {
      const sim = new Chess(fen);
      const canonicalSans: string[] = [];
      for (const san of sanLineToPlay) {
        try {
          const m = sim.move(san);
          if (!m) break;
          canonicalSans.push(m.san);
        } catch {
          break;
        }
      }
      if (!canonicalSans.length) return;
      setMoves((prev) => {
        let working = prev;
        let workingCursor = cursor;
        for (const san of canonicalSans) {
          const head = working.slice(0, workingCursor);
          const here = working[workingCursor];
          if (!here) {
            working = [...head, { san, alternates: [] }];
          } else if (here.san === san) {
            // no array change
          } else if (here.alternates.includes(san)) {
            const swapped = [
              here.san,
              ...here.alternates.filter((a) => a !== san),
            ];
            working = [...head, { san, alternates: swapped }];
          } else {
            working = [
              ...head,
              { san, alternates: [here.san, ...here.alternates] },
            ];
          }
          workingCursor += 1;
        }
        return working;
      });
      setCursor((c) => c + canonicalSans.length);
    },
    [fen, cursor]
  );

  const switchAlternate = useCallback(
    (plyIdx: number, altSan: string) => {
      setMoves((prev) => {
        const target = prev[plyIdx];
        if (!target || !target.alternates.includes(altSan)) return prev;
        const newAlts = [
          target.san,
          ...target.alternates.filter((a) => a !== altSan),
        ];
        return [
          ...prev.slice(0, plyIdx),
          { san: altSan, alternates: newAlts },
        ];
      });
      setCursor(plyIdx + 1);
    },
    []
  );

  const onPieceDrop = useCallback(
    (from: string, to: string, promotion?: string) => {
      const game = new Chess(fen);
      let m;
      try {
        m = game.move({ from, to, promotion: promotion ?? "q" });
      } catch {
        return false;
      }
      if (!m) return false;
      return applyOne(m.san);
    },
    [fen, applyOne]
  );

  const flip = () =>
    setOrientation((o) => (o === "white" ? "black" : "white"));
  const undo = () => setCursor((c) => Math.max(0, c - 1));
  const redo = () => setCursor((c) => Math.min(moves.length, c + 1));
  const jumpStart = () => setCursor(0);
  const jumpEnd = () => setCursor(moves.length);
  const switchColor = flip;
  const copyFen = () => {
    void navigator.clipboard?.writeText(fen).catch(() => undefined);
  };
  const copyShare = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("moves", sanLine.join(","));
    void navigator.clipboard?.writeText(url.toString()).catch(() => undefined);
  };
  const clear = () => {
    setMoves([]);
    setCursor(0);
  };

  // Keyboard shortcuts. Bindings are matched against `e.key` directly.
  // Single chars (f, c) match lowercase; "Shift+F" matches the
  // uppercase F that comes through with shift held. Arrow keys carry
  // their full name. The hook reads from a ref so we don't need to
  // memoize this array — it's safe to recreate on every render.
  const shortcuts: Shortcut[] = [
    {
      test: (e) => e.key === "f",
      hint: "F",
      description: "Flip board",
      action: flip,
    },
    {
      test: (e) => e.key === "ArrowLeft",
      hint: "←",
      description: "Previous move",
      action: undo,
    },
    {
      test: (e) => e.key === "ArrowRight",
      hint: "→",
      description: "Next move",
      action: redo,
    },
    {
      test: (e) => e.key === "ArrowUp",
      hint: "↑",
      description: "Jump to start",
      action: jumpStart,
    },
    {
      test: (e) => e.key === "ArrowDown",
      hint: "↓",
      description: "Jump to end",
      action: jumpEnd,
    },
    {
      test: (e) => e.key === "c",
      hint: "C",
      description: "Switch color",
      action: switchColor,
    },
    {
      test: (e) => e.key === "F",
      hint: "Shift+F",
      description: "Copy FEN",
      action: copyFen,
    },
    {
      test: (e) => e.key === "L",
      hint: "Shift+L",
      description: "Copy share link",
      action: copyShare,
    },
    {
      // H for help (no shift required, single key). Also accept ?
      // for users on layouts where it's a single-press key, and the
      // physical Shift+/ combo as a fallback for the conventional ?
      // help shortcut on US/UK keyboards.
      test: (e) =>
        e.key === "h" ||
        e.key === "?" ||
        (e.shiftKey && e.code === "Slash"),
      hint: "H",
      description: "Show this cheatsheet",
      action: () => setCheatsheetOpen(true),
    },
  ];
  useShortcuts(shortcuts);

  return (
    <div className="space-y-4">
      <ShortcutCheatsheet
        shortcuts={shortcuts}
        open={cheatsheetOpen}
        onClose={() => setCheatsheetOpen(false)}
      />
      <Progress
        status={status}
        counts={counts}
        error={error}
        color={filters.color}
        limit={filters.limit}
        lichessUser={lichessUser}
        chesscomUser={chesscomUser}
        pgnFilename={pgnFilenameRef.current}
        onCancel={cancel}
        onSave={saveTree}
      />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-6">
        {/* MIDDLE column · Controls + Board */}
        <div className="lg:col-span-6 lg:order-2 space-y-3">
          <ControlsBar
            onFlip={flip}
            onUndo={undo}
            onRedo={redo}
            onJumpStart={jumpStart}
            onJumpEnd={jumpEnd}
            onSwitchColor={switchColor}
            onCopyFen={copyFen}
            onCopyShare={copyShare}
            onClear={clear}
            onShortcuts={() => setCheatsheetOpen(true)}
          />
          <div className="flex gap-2 max-w-[680px] mx-auto">
            <EvalBar
              cp={evalInfo.cp}
              mate={evalInfo.mate}
              orientation={orientation}
            />
            <div className="flex-1 min-w-0">
              <Board
                fen={fen}
                orientation={orientation}
                onPieceDrop={onPieceDrop}
                arrows={boardArrows}
              />
            </div>
          </div>
        </div>

        {/* RIGHT column · Engine + Continuation + Stats (desktop only).
            On mobile, the Stats card here is hidden and the duplicate
            below (after Book) takes over so Stats lands last. */}
        <aside className="lg:col-span-3 lg:order-3 space-y-6">
          <EnginePanel
            fen={fen}
            onContinuationClick={playLine}
            onEval={setEvalInfo}
          />
          <MoveListPanel
            moves={moves}
            cursor={cursor}
            onJump={setCursor}
            onSwitchAlternate={switchAlternate}
          />
          <div className="hidden lg:block">
            <StatsCard details={positionStats} perspective={filters.color} />
          </div>
        </aside>

        {/* LEFT column · Played + Book on desktop. On mobile, the
            Stats duplicate below shows up after Book so it's the last
            panel in the stacked flow; it's hidden on desktop where the
            right-column copy is the visible one. */}
        <aside className="lg:col-span-3 lg:order-1 space-y-6">
          <MovesPanel
            moves={playedMoves}
            onPick={(san) => applyOne(san)}
            onHover={setHoveredMoveSan}
          />
          <BookPanel fen={fen} onPick={(san) => applyOne(san)} />
          <div className="lg:hidden">
            <StatsCard details={positionStats} perspective={filters.color} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function fenAt(sanLine: string[]): string {
  if (sanLine.length === 0) return STARTING_FEN;
  const game = new Chess();
  for (const san of sanLine) {
    try {
      game.move(san);
    } catch {
      break;
    }
  }
  return game.fen();
}

function Progress({
  status,
  counts,
  error,
  color,
  limit,
  lichessUser,
  chesscomUser,
  pgnFilename,
  onCancel,
  onSave,
}: {
  status: Status;
  counts: Counts;
  error: string | null;
  color: "white" | "black";
  limit: number;
  lichessUser: string | null;
  chesscomUser: string | null;
  pgnFilename: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (status === "idle") return null;
  const total = counts.lichess + counts.chesscom;
  const limitTxt = limit > 0 ? ` / ${limit.toLocaleString()}` : "";
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-3 px-3 py-2",
        "border border-parchment-50/8 rounded-sm bg-ink-800/60",
        "text-xs font-mono flex-wrap"
      )}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <ColorBadge color={color} />
        <span className="text-parchment-300/70">
          {status === "loading" && (
            <>
              <span className="animate-pulse text-brass-light">●</span>{" "}
              Walking · {total.toLocaleString()}
              {limitTxt} games
            </>
          )}
          {status === "done" && (
            <>
              <span className="text-brass-light">✓</span> Tree built ·{" "}
              {total.toLocaleString()} games
            </>
          )}
          {status === "cancelled" && (
            <>
              <span className="text-parchment-300/70">⏸</span> Cancelled at{" "}
              {total.toLocaleString()}
            </>
          )}
          {status === "error" && (
            <span className="text-oxblood-light">
              ⚠ {error ?? "ingest failed"}
            </span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-parchment-300/55">
          {lichessUser && (
            <>
              lichess{" "}
              <span className="text-parchment-100">{lichessUser}</span>{" "}
              <span className="text-parchment-50">
                {counts.lichess.toLocaleString()}
              </span>
            </>
          )}
          {lichessUser && (chesscomUser || pgnFilename) && (
            <span className="text-parchment-300/30 mx-2">·</span>
          )}
          {chesscomUser && (
            <>
              chess.com{" "}
              <span className="text-parchment-100">{chesscomUser}</span>{" "}
              <span className="text-parchment-50">
                {counts.chesscom.toLocaleString()}
              </span>
            </>
          )}
          {chesscomUser && pgnFilename && (
            <span className="text-parchment-300/30 mx-2">·</span>
          )}
          {pgnFilename && (
            <>
              pgn{" "}
              <span className="text-parchment-100 truncate inline-block max-w-[10rem] align-bottom">
                {pgnFilename}
              </span>{" "}
              <span className="text-parchment-50">
                {counts.pgn.toLocaleString()}
              </span>
            </>
          )}
        </span>
        {status === "loading" && (
          <button
            type="button"
            onClick={onCancel}
            className={cx(
              "px-3 py-1.5 text-xs uppercase tracking-[.2em] font-bold",
              "border border-oxblood text-parchment-50 bg-oxblood/40",
              "rounded-sm",
              "hover:bg-oxblood/70 hover:border-oxblood-light transition-colors"
            )}
          >
            ✕ Stop import
          </button>
        )}
        {(status === "done" || status === "cancelled") && (
          <button
            type="button"
            onClick={onSave}
            className={cx(
              "px-3 py-1.5 text-xs uppercase tracking-[.2em]",
              "border border-brass/50 text-brass-light rounded-sm",
              "hover:bg-brass/10 hover:border-brass transition-colors"
            )}
            title="Save tree to .tree file"
          >
            Save tree
          </button>
        )}
      </div>
    </div>
  );
}

function ColorBadge({ color }: { color: "white" | "black" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm",
        "text-[10px] font-mono uppercase tracking-[.18em] border",
        color === "white"
          ? "bg-parchment-50 text-ink-900 border-parchment-50"
          : "bg-ink-900 text-parchment-50 border-parchment-50/40"
      )}
    >
      <span aria-hidden>{color === "white" ? "♔" : "♚"}</span>
      {color}
    </span>
  );
}
