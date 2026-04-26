// Lists a Chess.com user's monthly archive URLs. The browser then fetches
// each archive in parallel via /api/chesscom/games?month=YYYY-MM.

import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const Query = z.object({
  user: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
});

const USER_AGENT =
  "chesscope.com/1.0 (+https://chesscope.com; contact: support@chesscope.com)";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const parsed = Query.safeParse({ user: u.searchParams.get("user") ?? "" });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const upstream = `https://api.chess.com/pub/player/${parsed.data.user.toLowerCase()}/games/archives`;
  const res = await fetch(upstream, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });

  if (res.status === 404) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: `Chess.com returned ${res.status}` },
      { status: 502 }
    );
  }

  const json = (await res.json()) as { archives?: string[] };
  // Convert chess.com URLs to chesscope-relative ones so the browser hits
  // our proxy. We extract YYYY-MM from each and return that list.
  const months = (json.archives ?? [])
    .map((url) => {
      const m = url.match(/(\d{4})\/(\d{2})$/);
      return m ? `${m[1]}-${m[2]}` : null;
    })
    .filter((x): x is string => !!x)
    .sort()
    .reverse(); // newest first

  return NextResponse.json(
    { user: parsed.data.user, months },
    {
      headers: {
        "Cache-Control":
          "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
