import { cx } from "@/lib/utils";

/**
 * Brand mark: a pawn rising out of a scope lens — head breaking the
 * ring with a knocked-out halo where they cross — plus reticle stubs
 * on the sides and bottom (the top stays clean for the breakout).
 * True vector, currentColor-tinted, drawn for 16px legibility: no
 * stroke thinner than 1.7 units on the 24 grid, solid pawn silhouette.
 * Replaces the old 1.6MB raster-in-SVG "pawn under scope".
 */
function ScopePawn({
  variant,
}: {
  variant: "halo" | "fill";
}) {
  // Same geometry twice: the "halo" variant is drawn into the mask
  // (black + fat stroke) to knock the ring out around the pawn; the
  // "fill" variant is the visible piece.
  const paint =
    variant === "halo"
      ? { fill: "black", stroke: "black", strokeWidth: 2.4 }
      : { fill: "currentColor", stroke: "none" as const };
  const scale = variant === "halo" ? 0.86 : 0.72;
  return (
    <g
      transform={`translate(12 11.2) scale(${scale}) translate(-12 -12.6)`}
      {...paint}
    >
      <circle cx="12" cy="7.6" r="3.1" />
      <rect x="8.9" y="10.6" width="6.2" height="1.9" rx="0.95" />
      <path d="M10.1 12.5 h3.8 c.15 2.1 .75 3.4 1.7 4.9 h-7.2 c.95-1.5 1.55-2.8 1.7-4.9 z" />
      <rect x="7.6" y="17.6" width="8.8" height="2.5" rx="1.0" />
    </g>
  );
}

export function ScopeMark({ className }: { className?: string }) {
  // Fixed id on purpose: useId isn't available in Server Components
  // (this renders in the server-rendered header AND footer). Duplicate
  // ids resolve to the document's first <mask> — and every instance's
  // mask is geometrically identical, so the result is still correct.
  const maskId = "chesscope-scope-halo";
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("inline-block", className)}
      aria-hidden="true"
    >
      <mask id={maskId}>
        <rect width="24" height="24" fill="white" />
        <ScopePawn variant="halo" />
      </mask>
      <circle
        cx="12"
        cy="13.4"
        r="7.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        mask={`url(#${maskId})`}
      />
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <line x1="5.7" y1="13.4" x2="7.9" y2="13.4" />
        <line x1="16.1" y1="13.4" x2="18.3" y2="13.4" />
        <line x1="12" y1="17.8" x2="12" y2="19.6" />
      </g>
      <ScopePawn variant="fill" />
    </svg>
  );
}

/**
 * Knight glyph, geometric, slightly architectural. Drawn in CSS so it
 * inherits currentColor and scales without raster artifacts.
 */
export function KnightMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cx("inline-block", className)}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {/* Stylized knight silhouette, quill-stroke. */}
      <path d="M9 27h14v-2H9z" fill="currentColor" stroke="none" />
      <path d="M11 25c0-3 .5-5 2-7 1-1.4 1-2 .6-3.6L13 11l-2 1.5-1.6-1.6L11 8.5l1.4-2.4 4 .8c2.5.5 5 2.7 6.4 5.7.9 2 1.2 4 1.2 6.4 0 2.4-.4 4.5-1 6" />
      <circle cx="18.6" cy="11.4" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Wordmark({
  className,
  withGlyph = true,
}: {
  className?: string;
  withGlyph?: boolean;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 font-display text-parchment-50",
        className,
      )}
    >
      {withGlyph && (
        // Inline vector mark: crisp at any zoom/DPR and follows the
        // accent token per theme (the old raster PNG did neither).
        <ScopeMark className="w-5 h-5 shrink-0 text-brass" />
      )}
      <span className="tracking-tight">
        Ches<span className="text-brass">scope</span>
      </span>
    </span>
  );
}
