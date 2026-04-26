import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  metadataBase: new URL("https://chesscope.com"),
  title: {
    default: "Chesscope, open chess data",
    template: "%s · Chesscope",
  },
  description:
    "Search broadcast games, player histories, and tournament archives across the chess world. An open alternative for finding what's hiding inside Lichess studies and beyond.",
  keywords: [
    "chess search",
    "chess database",
    "chess broadcasts",
    "lichess study search",
    "FIDE games",
    "chess scouting",
    "tournament archive",
  ],
  openGraph: {
    title: "Chesscope, open chess data",
    description:
      "Search broadcast games, player histories, and tournament archives across the chess world.",
    type: "website",
    url: "https://chesscope.com",
    siteName: "Chesscope",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chesscope, open chess data",
    description:
      "Search broadcast games, player histories, and tournament archives across the chess world.",
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
  themeColor: "#0d0e0c",
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
        <div className="relative z-10 flex flex-col min-h-screen">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
