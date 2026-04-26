import { cx } from "@/lib/utils";

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
        // Brand favicon. The 32x32 variant covers sharp rendering on
        // retina at the 20px display size used in header/footer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/favicon-32x32.png"
          alt=""
          aria-hidden="true"
          className="w-5 h-5"
          width={32}
          height={32}
        />
      )}
      <span className="tracking-tight">
        Ches<span className="text-brass">scope</span>
      </span>
    </span>
  );
}
