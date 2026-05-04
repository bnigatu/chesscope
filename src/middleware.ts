import { NextResponse, type NextRequest } from "next/server";

// chesscope.com had a prior owner whose site was a chess-content
// blog. Their URLs are still in Google's / Bing's index and showing
// up under `site:chesscope.com`. We can't make that go away with
// passive 404s — search engines treat 404 as "may come back later"
// and hold the URL for months. We return 410 Gone for the prior
// owner's known URL patterns so crawlers drop them on the next
// visit, plus an X-Robots-Tag: noindex header so the empty body
// doesn't accidentally get indexed.
//
// Patterns are scoped to paths the prior site used. Anything outside
// these patterns falls through to the normal app routing — so a
// future legitimate /blog or /category here would still be reachable
// once we removed the corresponding rule.
const LEGACY_GONE_PATTERNS: RegExp[] = [
  /^\/blog(\/.*)?$/i,
  /^\/category(\/.*)?$/i,
  // Slug-style article URL the previous owner published. Match the
  // exact slug rather than any "long hyphenated path" so we don't
  // accidentally evict future /chess-* content of our own.
  /^\/chess-ranking-system-how-it-works-and-what-it-means-for-players\/?$/i,
];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  for (const re of LEGACY_GONE_PATTERNS) {
    if (re.test(path)) {
      return new NextResponse(null, {
        status: 410,
        headers: {
          "X-Robots-Tag": "noindex, nofollow",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }
  }
  return NextResponse.next();
}

// Limit middleware execution to just the paths we care about — no
// point running it on every page request. The matcher is configured
// to match the regexes above conservatively; the middleware itself
// re-checks with the precise patterns.
export const config = {
  matcher: [
    "/blog/:path*",
    "/blog",
    "/category/:path*",
    "/category",
    "/chess-ranking-system-how-it-works-and-what-it-means-for-players",
  ],
};
