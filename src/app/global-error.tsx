"use client";

import { useEffect } from "react";

/**
 * Top-level error boundary. Fires when error.tsx itself can't render —
 * which means the root layout, the JSON-LD component, or the Header /
 * Footer threw. At that point we have no Tailwind, no fonts, no
 * layout: this file owns its own <html> and <body>, and uses inline
 * styles so it works even if the global stylesheet is the source of
 * the problem.
 *
 * Should be vanishingly rare in practice. Still cheap to ship: it's
 * the difference between a "blank white page" and a recognisable
 * "something went wrong, try again" the user can recover from.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[chesscope] global error:", error);
  }, [error]);

  // Hex values mirror the Tailwind palette so the page still feels
  // like chesscope even with stylesheets unavailable:
  //   ink-900     #141414  bg
  //   parchment-50 #f5efe7 fg
  //   brass-light #d4ae5e
  //   oxblood-light #b85c5c
  const styles = {
    body: {
      background: "#141414",
      color: "#f5efe7",
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      margin: 0,
      padding: "8rem 1.5rem",
      textAlign: "center" as const,
      minHeight: "100vh",
      boxSizing: "border-box" as const,
    },
    eyebrow: {
      fontSize: "11px",
      letterSpacing: ".3em",
      textTransform: "uppercase" as const,
      color: "#b85c5c",
      marginBottom: "1.5rem",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    },
    headline: {
      fontSize: "clamp(4rem, 12vw, 8rem)",
      fontWeight: 300,
      lineHeight: 1,
      margin: 0,
    },
    body1: {
      fontStyle: "italic" as const,
      fontSize: "1.5rem",
      marginTop: "2rem",
      color: "rgba(245, 239, 231, 0.85)",
    },
    body2: {
      fontSize: "0.875rem",
      color: "rgba(245, 239, 231, 0.6)",
      marginTop: "0.75rem",
      maxWidth: "36rem",
      marginLeft: "auto",
      marginRight: "auto",
      lineHeight: 1.5,
    },
    digest: {
      fontSize: "11px",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      color: "rgba(245, 239, 231, 0.3)",
      marginTop: "1rem",
    },
    button: {
      padding: "0.5rem 1rem",
      fontSize: "0.75rem",
      letterSpacing: ".2em",
      textTransform: "uppercase" as const,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      border: "1px solid rgba(212, 174, 94, 0.5)",
      color: "#d4ae5e",
      background: "transparent",
      borderRadius: "2px",
      cursor: "pointer",
      marginTop: "3rem",
    },
  };

  return (
    <html lang="en">
      <body style={styles.body}>
        <p style={styles.eyebrow}>◆ Critical error</p>
        <h1 style={styles.headline}>0–0</h1>
        <p style={styles.body1}>The site couldn&rsquo;t finish setting up.</p>
        <p style={styles.body2}>
          This is rarer than a missed mate-in-one — usually a deploy that
          half-landed, or a transient browser issue. Try again, or reload.
          If it keeps happening, drop a line to support@chesscope.com.
        </p>
        {error?.digest && <p style={styles.digest}>ref: {error.digest}</p>}
        <button type="button" onClick={reset} style={styles.button}>
          Try again
        </button>
      </body>
    </html>
  );
}
