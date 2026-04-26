"use client";

import { cx } from "@/lib/utils";

export type MoveDetails = {
  count: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  totalOpponentElo: number;
  totalElo: number;
  bestWin?: { elo: number; gameUrl?: string };
  worstLoss?: { elo: number; gameUrl?: string };
  longestPlies?: number;
  shortestPlies?: number;
  lastPlayed?: string;
};

/**
 * Per-position stats panel — mirrors openingtree's report card.
 * Pass null until the tree is built; renders an empty state.
 */
export function StatsCard({
  details,
  perspective = "white",
}: {
  details: MoveDetails | null;
  perspective?: "white" | "black";
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[.25em] text-brass">
        Position stats
      </h2>
      <div
        className={cx(
          "border border-parchment-50/8 rounded-sm",
          "bg-ink-800/60 px-4 py-3"
        )}
      >
        {details ? <Body details={details} perspective={perspective} /> : <Empty />}
      </div>
    </section>
  );
}

function Empty() {
  return (
    <p className="text-sm text-parchment-300/50 italic text-center py-3">
      Build a tree to see win-rate, performance, and game stats for this
      position.
    </p>
  );
}

function Body({
  details,
  perspective,
}: {
  details: MoveDetails;
  perspective: "white" | "black";
}) {
  const total = details.count;
  const wins =
    perspective === "white" ? details.whiteWins : details.blackWins;
  const losses =
    perspective === "white" ? details.blackWins : details.whiteWins;
  const draws = details.draws;
  const score = total ? (wins + draws / 2) / total : 0;
  const avgOpponentElo = total ? Math.round(details.totalOpponentElo / total) : 0;
  const avgElo = total ? Math.round(details.totalElo / total) : 0;
  const performance = avgOpponentElo
    ? performanceRating(avgOpponentElo, score)
    : null;

  const winPct = total ? (wins / total) * 100 : 0;
  const drawPct = total ? (draws / total) * 100 : 0;
  const lossPct = total ? (losses / total) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* W/D/L bar */}
      <div className="space-y-1.5">
        <div className="flex h-5 rounded-sm overflow-hidden border border-parchment-50/10">
          <Segment pct={winPct} className="bg-parchment-50 text-ink-900" />
          <Segment
            pct={drawPct}
            className="bg-parchment-300/40 text-ink-900"
          />
          <Segment pct={lossPct} className="bg-oxblood text-parchment-50" />
        </div>
        <div className="flex justify-between text-[11px] font-mono text-parchment-300/60">
          <span>{wins}W</span>
          <span>{draws}D</span>
          <span>{losses}L</span>
        </div>
      </div>

      <ul className="text-sm space-y-1.5">
        <Row label="Games" value={total.toLocaleString()} />
        <Row label="Score" value={`${(score * 100).toFixed(1)}%`} />
        {performance != null && (
          <Row label="Performance" value={String(performance)} />
        )}
        {avgOpponentElo > 0 && (
          <Row label="Avg opponent" value={String(avgOpponentElo)} />
        )}
        {avgElo > 0 && <Row label="Avg rating" value={String(avgElo)} />}
        {details.bestWin && (
          <Row
            label="Best win"
            value={String(details.bestWin.elo)}
            href={details.bestWin.gameUrl}
          />
        )}
        {details.worstLoss && (
          <Row
            label="Worst loss"
            value={String(details.worstLoss.elo)}
            href={details.worstLoss.gameUrl}
          />
        )}
        {details.longestPlies != null && (
          <Row label="Longest" value={`${details.longestPlies} plies`} />
        )}
        {details.shortestPlies != null && (
          <Row label="Shortest" value={`${details.shortestPlies} plies`} />
        )}
        {details.lastPlayed && (
          <Row label="Last played" value={details.lastPlayed} />
        )}
      </ul>
    </div>
  );
}

function Row({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <li className="flex justify-between items-baseline gap-3 border-b border-parchment-50/6 pb-1 last:border-b-0 last:pb-0">
      <span className="text-[11px] uppercase tracking-[.18em] text-parchment-300/60">
        {label}
      </span>
      <span className="data-num text-parchment-100/90 truncate">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brass-light transition-colors"
          >
            {value} ↗
          </a>
        ) : (
          value
        )}
      </span>
    </li>
  );
}

function Segment({ pct, className }: { pct: number; className: string }) {
  if (pct <= 0) return null;
  return (
    <div
      className={cx(
        "flex items-center justify-center text-[10px] font-mono font-bold",
        className
      )}
      style={{ width: `${pct}%` }}
    >
      {pct >= 12 ? `${pct.toFixed(0)}%` : ""}
    </div>
  );
}

// Standard chess performance rating from average opponent + score.
// score in [0, 1]. Approximation table from FIDE.
function performanceRating(avgOpponent: number, score: number): number {
  const dp = scoreToDP(score);
  return Math.round(avgOpponent + dp);
}

function scoreToDP(score: number): number {
  // Clamp.
  const s = Math.max(0.005, Math.min(0.995, score));
  // FIDE difference table is symmetric; closed-form approximation:
  // dp ≈ -400 * log10(1/score - 1)
  return -400 * Math.log10(1 / s - 1);
}
