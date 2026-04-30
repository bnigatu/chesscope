import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  metadataBase: new URL("https://chesscope.com"),
  title: {
    default:
      "Chesscope — opening repertoire from Lichess and Chess.com in one tree",
    template: "%s · Chesscope",
  },
  description:
    "Build any player's full opening repertoire from Lichess and Chess.com in one interactive tree. Stockfish engine, transposition-aware, save positions, share lines. Plus broadcast game search. Free, no login.",
  keywords: [
    // repertoire (lead — this is now the primary product)
    "opening repertoire",
    "opening tree",
    "chess opening explorer",
    "lichess repertoire",
    "chess.com repertoire",
    "chess preparation",
    "stockfish opening analysis",
    "pgn analysis",
    "openingtree alternative",
    // search (secondary)
    "chess search",
    "chess database",
    "chess broadcasts",
    "lichess study search",
    "FIDE games",
    "tournament archive",
  ],
  openGraph: {
    title:
      "Chesscope — opening repertoire from Lichess and Chess.com in one tree",
    description:
      "Build any player's full opening repertoire from Lichess and Chess.com in one tree, with Stockfish engine and transposition awareness. Plus broadcast game search.",
    type: "website",
    url: "https://chesscope.com",
    siteName: "Chesscope",
    // Static brand image. 512x512 is below the ideal 1200x630 landscape
    // for OG cards but is brand-consistent and renders across Twitter,
    // Slack, Discord, LinkedIn. Replace with a 1200x630 PNG when one
    // exists — same path swap.
    images: [
      {
        url: "/android-chrome-512x512.png",
        width: 512,
        height: 512,
        alt: "Chesscope",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title:
      "Chesscope — opening repertoire from Lichess and Chess.com in one tree",
    description:
      "Build any player's full opening repertoire from Lichess and Chess.com in one tree, with Stockfish engine and transposition awareness. Plus broadcast game search.",
    images: ["/android-chrome-512x512.png"],
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#141414",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        {/* Site-wide structured data: WebSite (with SearchAction so
            Google can render the Sitelinks Search Box) + Organization.
            JSON-LD can live anywhere in the document; we keep it in
            <body> so Next's <head> manager doesn't collide. */}
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebSite",
                "@id": "https://chesscope.com/#website",
                url: "https://chesscope.com/",
                name: "Chesscope",
                description:
                  "Build any player's full opening repertoire from Lichess and Chess.com in one tree, with Stockfish engine and transposition awareness. Plus broadcast game search.",
                inLanguage: "en",
                potentialAction: {
                  "@type": "SearchAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate:
                      "https://chesscope.com/search?q={search_term_string}",
                  },
                  "query-input": "required name=search_term_string",
                },
                publisher: { "@id": "https://chesscope.com/#org" },
              },
              {
                "@type": "Organization",
                "@id": "https://chesscope.com/#org",
                name: "Chesscope",
                url: "https://chesscope.com/",
                logo: {
                  "@type": "ImageObject",
                  url: "https://chesscope.com/android-chrome-512x512.png",
                  width: 512,
                  height: 512,
                },
              },
            ],
          }}
        />
        <div className="relative z-10 flex flex-col min-h-screen">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
