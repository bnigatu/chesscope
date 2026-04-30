"use client";

import type { MouseEvent } from "react";
import { cx } from "@/lib/utils";
import type { GameRef, MoveOption } from "@/lib/repertoire/tree";

const RESULT_TEXT: Record<GameRef["result"], string> = {
  "1-0": "1–0",
  "0-1": "0–1",
  "1/2-1/2": "½–½",
  "*": "*",
};

type TranspositionLevel = "none" | "info" | "warning";

/**
 * Compare path-specific edge count to FEN-aggregated total. When the
 * total is much higher than the edge, this exact move order is
 * underexposed to theory that gets reached via other orders.
 *
 * Mirrors openingtree.com's getTranspositionWarningLevel:
 *   - move played once but the position has more games elsewhere → warning
 *   - difference > 10 AND > 10% of total → warning
 *   - otherwise difference > 0 → info
 */
function transpositionLevel(
  edgeCount: number,
  totalCount: number
): TranspositionLevel {
  const diff = totalCount - edgeCount;
  if (diff <= 0) return "none";
  if (edgeCount === 1) return "warning";
  if (diff > 10 && diff / totalCount > 0.1) return "warning";
  return "info";
}

function transpositionTooltip(
  san: string,
  edgeCount: number,
  totalCount: number
): string {
  const playedTimes =
    edgeCount === 1 ? "once" : `${edgeCount.toLocaleString()} times`;
  const totalTimes = totalCount.toLocaleString();
  return (
    `${san} has been played ${playedTimes} via this exact move order, ` +
    `but the resulting position has appeared ${totalTimes} times through ` +
    `other move orders. This move transposes — there's more theory than ` +
    `the count alone suggests.`
  );
}

function TranspositionMark({ level, tooltip }: { level: TranspositionLevel; tooltip: string }) {
  if (level === "none") return null;
  const isWarning = level === "warning";
  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      className={cx(
        "ml-1 align-middle text-[11px] leading-none cursor-help",
        isWarning ? "text-oxblood-light" : "text-parchment-300/55"
      )}
    >
      {isWarning ? "⚠" : "ⓘ"}
    </span>
  );
}

export function MovesPanel({
  moves,
  onPick,
  onHover,
}: {
  moves: MoveOption[];
  onPick: (san: string) => void;
  /** Fires with the row's SAN on mouse-enter, null on mouse-leave. The
      explorer uses this to brighten the matching arrow on the board. */
  onHover?: (san: string | null) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[.25em] text-brass">
        Played moves
      </h2>
      <div
        className={cx(
          "border border-parchment-50/8 rounded-sm overflow-hidden",
          "bg-ink-800/60"
        )}
      >
        {moves.length === 0 ? (
          <p className="px-4 py-8 text-center text-parchment-300/50 font-display italic text-sm">
            No moves recorded at this position.
          </p>
        ) : (
          <table className="w-full text-sm table-fixed">
            {/* table-fixed + colgroup so the SingleGameRow's colspan=2
                cell has a bounded width; flex+truncate inside ellipsizes
                long player names. */}
            <colgroup>
              <col className="w-[4.5rem]" />
              <col className="w-[4rem]" />
              <col />
            </colgroup>
            <thead className="text-left text-[11px] uppercase tracking-[.18em] text-parchment-300/50 border-b border-parchment-50/8">
              <tr>
                <th className="px-3 py-2 font-normal">Move</th>
                <th className="px-3 py-2 font-normal text-right">Games</th>
                <th className="px-3 py-2 font-normal">W / D / L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-parchment-50/6">
              {moves.map((m) =>
                m.count === 1 && m.lastPlayedGame ? (
                  <SingleGameRow
                    key={m.san}
                    move={m}
                    game={m.lastPlayedGame}
                    onPick={onPick}
                    onHover={onHover}
                  />
                ) : (
                  <MultiGameRow
                    key={m.san}
                    move={m}
                    onPick={onPick}
                    onHover={onHover}
                  />
                )
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function MultiGameRow({
  move,
  onPick,
  onHover,
}: {
  move: MoveOption;
  onPick: (san: string) => void;
  onHover?: (san: string | null) => void;
}) {
  const total = move.count;
  const w = pct(move.whiteWins, total);
  const d = pct(move.draws, total);
  const l = pct(move.blackWins, total);
  const tLevel = transpositionLevel(move.edgeCount, total);
  return (
    <tr
      className="hover:bg-ink-700/40 transition-colors cursor-pointer"
      onClick={() => onPick(move.san)}
      onMouseEnter={() => onHover?.(move.san)}
      onMouseLeave={() => onHover?.(null)}
    >
      <td className="px-3 py-2 font-mono text-parchment-50 font-bold">
        {move.san}
        <TranspositionMark
          level={tLevel}
          tooltip={transpositionTooltip(move.san, move.edgeCount, total)}
        />
      </td>
      <td className="px-3 py-2 data-num text-right text-parchment-100/85">
        {move.count.toLocaleString()}
      </td>
      <td className="px-3 py-2 w-1/2">
        <div className="flex h-3 rounded-sm overflow-hidden border border-parchment-50/10">
          {w > 0 && (
            <div className="bg-parchment-50" style={{ width: `${w}%` }} />
          )}
          {d > 0 && (
            <div className="bg-parchment-300/40" style={{ width: `${d}%` }} />
          )}
          {l > 0 && <div className="bg-oxblood" style={{ width: `${l}%` }} />}
        </div>
      </td>
    </tr>
  );
}

function SingleGameRow({
  move,
  game,
  onPick,
  onHover,
}: {
  move: MoveOption;
  game: GameRef;
  onPick: (san: string) => void;
  onHover?: (san: string | null) => void;
}) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <tr
      className="hover:bg-ink-700/40 transition-colors cursor-pointer"
      onClick={() => onPick(move.san)}
      onMouseEnter={() => onHover?.(move.san)}
      onMouseLeave={() => onHover?.(null)}
    >
      <td className="px-3 py-2 font-mono text-parchment-50 font-bold align-top">
        {move.san}
        <TranspositionMark
          level={transpositionLevel(move.edgeCount, move.count)}
          tooltip={transpositionTooltip(
            move.san,
            move.edgeCount,
            move.count
          )}
        />
      </td>
      <td colSpan={2} className="px-3 py-2 text-xs text-parchment-100/85">
        {/* Mirrors the Book panel "Top games" layout: flex + truncate
            on each player name so long handles ellipsize cleanly, and
            the result + ↗ stay anchored on either side via shrink-0. */}
        <div className="flex items-baseline gap-1 min-w-0">
          <span
            className={cx(
              "font-display truncate",
              game.result === "1-0" && "font-bold text-parchment-50"
            )}
          >
            {game.white}
            {game.whiteElo ? (
              <span className="data-num text-parchment-300/55">
                {" "}
                ({game.whiteElo})
              </span>
            ) : null}
          </span>
          <span className="data-num text-parchment-300/70 mx-1 shrink-0">
            {RESULT_TEXT[game.result]}
          </span>
          <span
            className={cx(
              "font-display truncate flex-1",
              game.result === "0-1" && "font-bold text-parchment-50"
            )}
          >
            {game.black}
            {game.blackElo ? (
              <span className="data-num text-parchment-300/55">
                {" "}
                ({game.blackElo})
              </span>
            ) : null}
          </span>
          {game.url && (
            <a
              href={game.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={stop}
              className="shrink-0 text-parchment-300/60 hover:text-brass-light transition-colors"
              aria-label={`Open game on ${game.source}`}
              title={`Open on ${game.source}`}
            >
              ↗
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

function pct(n: number, total: number): number {
  if (!total) return 0;
  return (n / total) * 100;
}
