"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * App Router segment-level error boundary. Catches anything thrown
 * during render or in a server action below the root layout. Sits
 * INSIDE the layout, so the header and footer still render — only
 * the page content is replaced with this fallback. global-error.tsx
 * handles errors in the layout itself.
 *
 * The brand voice mirrors the 404 ("Resignation 1–0"): chess-flavoured
 * status announcement, then the recovery options. Half-point, half-
 * point because the user got partway through the request before
 * something gave up.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in DevTools so we have something to grep for; Next
    // already reports the error to the server-side logger.
    console.error("[chesscope] page error:", error);
  }, [error]);

  return (
    <div className="container-narrow py-32 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[.3em] text-oxblood-light mb-6">
        ◆ Adjournment
      </p>
      <h1 className="font-display text-7xl sm:text-9xl font-light text-parchment-50 leading-none">
        ½<span className="text-parchment-300/60">–</span>½
      </h1>
      <p className="mt-8 font-display italic text-2xl text-parchment-100/80">
        Something went wrong loading this position.
      </p>
      <p className="mt-3 text-sm text-parchment-300/70 max-w-md mx-auto">
        It might be a transient hiccup. Try again — or reload the page if
        the error persists.
      </p>
      {error?.digest && (
        <p className="mt-4 text-[11px] font-mono text-parchment-300/40">
          ref: {error.digest}
        </p>
      )}
      <div className="mt-12 flex items-center justify-center gap-4 flex-wrap">
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 text-xs uppercase tracking-[.2em] font-mono border border-brass/50 text-brass-light rounded-sm hover:bg-brass/10 hover:border-brass transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="text-xs uppercase tracking-[.2em] font-mono text-parchment-300/70 hover:text-brass transition-colors"
        >
          ← Return home
        </Link>
      </div>
    </div>
  );
}
