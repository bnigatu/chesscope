// Streams one month of a Chess.com user's PGN games.

import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const Query = z.object({
  user: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

const USER_AGENT =
  "chesscope.com/1.0 (+https://chesscope.com; contact: support@chesscope.com)";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const parsed = Query.safeParse({
    user: u.searchParams.get("user") ?? "",
    month: u.searchParams.get("month") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [year, month] = parsed.data.month.split("-");
  const upstream = `https://api.chess.com/pub/player/${parsed.data.user.toLowerCase()}/games/${year}/${month}/pgn`;

  const res = await fetch(upstream, {
    headers: { Accept: "application/x-chess-pgn", "User-Agent": USER_AGENT },
  });

  if (res.status === 404) {
    return NextResponse.json(
      { error: "User or month not found" },
      { status: 404 }
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: `Chess.com returned ${res.status}` },
      { status: 502 }
    );
  }

  return new Response(res.body, {
    headers: {
      "Content-Type": "application/x-chess-pgn; charset=utf-8",
      "Cache-Control":
        "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
