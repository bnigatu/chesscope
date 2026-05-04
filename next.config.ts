import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Image optimization off, we don't host images, and CF Workers don't run the
  // default Next image optimizer well. Saves Worker size.
  images: { unoptimized: true },
  // Default is 60s. Player and About pages issue aggregate Turso queries
  // (COUNT/COUNT-DISTINCT) at build time; the free Turso tier sometimes
  // takes >60s on cold connections, which fails the deploy.
  staticPageGenerationTimeout: 180,
  experimental: {
    // Tighter bundle for Cloudflare Workers (3 MiB free / 10 MiB paid limit).
    optimizePackageImports: ["drizzle-orm", "@libsql/client"],
  },
  // Cross-origin isolation for SharedArrayBuffer, which the
  // multi-threaded Stockfish build requires. COOP=same-origin makes
  // the page its own browsing-context group; COEP=credentialless is
  // the gentler isolation mode (vs require-corp): cross-origin GETs
  // without credentials are allowed without CORP headers, so we
  // don't need to coordinate with third-party assets. Chrome 96+ /
  // Firefox 119+ / Safari 17+ all support it.
  //
  // Browsers that don't support SAB or this isolation mode get the
  // single-threaded engine via runtime fallback (see engine-panel).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

// Cloudflare bindings during `next dev`. This is opt-in via OPEN_NEXT_DEV=1
// to avoid loading the wrangler runtime when you don't need it.
if (process.env.OPEN_NEXT_DEV) {
  // Lazy import, keeps prod bundle clean.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");
  initOpenNextCloudflareForDev();
}
