"use client";

import { cx } from "@/lib/utils";

/**
 * Evaluation bar shown to the left of the chessboard. White fills from
 * the bottom (or top, if flipped), proportional to a sigmoid-mapped
 * win-chance from the engine's centipawn score.
 *
 * Formula: whitePct = 50 + 50 * tanh(cp / 440). Empirically matches
 * chess.com's bar (their +0.60cp → 56.75% point lands within ~0.05% of
 * this curve at cp=60). For mate, the bar pins to 100% / 0%.
 */
export function EvalBar({
  cp,
  mate,
  orientation = "white",
}: {
  cp: number | null;
  mate: number | null;
  orientation?: "white" | "black";
}) {
  if (cp == null && mate == null) {
    // No engine data yet — empty bar.
    return (
      <div className="w-8 self-stretch shrink-0 rounded-sm border border-parchment-50/15 bg-ink-700/60" />
    );
  }

  let whitePct: number;
  let evalText: string;

  if (mate != null) {
    whitePct = mate > 0 ? 100 : 0;
    evalText = `M${Math.abs(mate)}`;
  } else if (cp != null) {
    whitePct = 50 + 50 * Math.tanh(cp / 440);
    const v = cp / 100;
    evalText = (v >= 0 ? "+" : "") + v.toFixed(1);
  } else {
    whitePct = 50;
    evalText = "0.0";
  }

  const whiteAtBottom = orientation === "white";
  const whiteIsWinning = whitePct >= 50;

  return (
    <div
      className={cx(
        "relative w-8 self-stretch shrink-0",
        "rounded-sm overflow-hidden border border-parchment-50/15",
        "bg-ink-900"
      )}
    >
      {/* White fill — slides from one end of the bar based on winPct.
          Smooth transition so the bar animates as the engine refines. */}
      <div
        className="absolute left-0 right-0 bg-parchment-50 transition-all duration-300 ease-out"
        style={
          whiteAtBottom
            ? { bottom: 0, height: `${whitePct}%` }
            : { top: 0, height: `${whitePct}%` }
        }
      />

      {/* Eval text — sits in the leading color's region with contrast.
          Bottom of bar in white-at-bottom mode; top when black-winning. */}
      <span
        className={cx(
          "absolute left-1/2 -translate-x-1/2 leading-none",
          "text-[11px] font-mono font-bold pointer-events-none select-none",
          whiteIsWinning
            ? whiteAtBottom
              ? "bottom-0.5 text-ink-900"
              : "top-0.5 text-ink-900"
            : whiteAtBottom
            ? "top-0.5 text-parchment-50"
            : "bottom-0.5 text-parchment-50"
        )}
      >
        {evalText}
      </span>
    </div>
  );
}
