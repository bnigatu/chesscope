// Proxy to Lichess's Opening Explorer (lichess.ovh).
//
// Lichess began requiring auth on the explorer in 2026 after DDoS
// attacks. Each user signs in with their own Lichess account via the
// OAuth flow at /api/lichess/oauth/login; the resulting access token
// lives in an HttpOnly cookie and is forwarded here. The browser never
// sees the token; the backend just relays it.
//
// If no token is present the response is 401 with `needsAuth: true` so
// the BookPanel can render a "Connect Lichess" button.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getLichessToken } from "@/lib/lichess-oauth";

export const runtime = "nodejs";

const Query = z.object({
  fen: z.string().min(10).max(120),
  book: z.enum(["lichess", "masters"]).default("lichess"),
  speeds: z.string().max(120).optional(),
  ratings: z.string().max(120).optional(),
});

const USER_AGENT =
  "chesscope.com/1.0 (+https://chesscope.com; contact: support@chesscope.com)";

const UPSTREAM_BASES: Record<"lichess" | "masters", string> = {
  lichess: "https://explorer.lichess.ovh/lichess",
  masters: "https://explorer.lichess.ovh/masters",
};

export async function GET(req: Request) {
  const u = new URL(req.url);
  const parsed = Query.safeParse({
    fen: u.searchParams.get("fen") ?? "",
    book: u.searchParams.get("book") ?? "lichess",
    speeds: u.searchParams.get("speeds") ?? undefined,
    ratings: u.searchParams.get("ratings") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const token = await getLichessToken();
  if (!token) {
    return NextResponse.json(
      { error: "Connect Lichess to view book moves.", needsAuth: true },
      { status: 401 }
    );
  }

  const upstream = new URL(UPSTREAM_BASES[parsed.data.book]);
  upstream.searchParams.set("fen", parsed.data.fen);
  upstream.searchParams.set("variant", "standard");
  // Ask for up to 4 representative games at this position. Two effects:
  //   1. When a position has only 1 game, it shows up as a clickable
  //      link to lichess.org (mirrors openingtree's single-game row).
  //   2. For deeper positions where 4 games exist, gives the user
  //      direct access to representative games.
  upstream.searchParams.set("topGames", "4");
  upstream.searchParams.set("recentGames", "0");
  upstream.searchParams.set("moves", "12");
  if (parsed.data.speeds) upstream.searchParams.set("speeds", parsed.data.speeds);
  if (parsed.data.ratings)
    upstream.searchParams.set("ratings", parsed.data.ratings);

  const res = await fetch(upstream, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(15_000),
  });

  // Treat upstream 401 as "token rejected" — likely expired/revoked, so
  // surface it to the panel as needsAuth so the user is re-prompted.
  if (res.status === 401) {
    return NextResponse.json(
      {
        error: "Lichess rejected the saved token. Reconnect Lichess.",
        needsAuth: true,
      },
      { status: 401 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `Lichess explorer returned ${res.status}` },
      { status: 502 }
    );
  }

  const json = await res.json();
  return NextResponse.json(json, {
    headers: {
      // Edge cache is keyed on the Authorization header (per RFC) so
      // each user gets their own cached responses; a 24h TTL still
      // collapses repeat hits on the same FEN per user.
      "Cache-Control":
        "private, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
