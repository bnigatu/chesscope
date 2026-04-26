// Streams a Lichess user's full game history as PGN. Client-side ingest
// drives the opening tree builder; this proxy sits between the browser
// and lichess.org so we get caching at the edge, can identify ourselves
// politely, and can later add rate limiting without changing callers.

import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const Query = z.object({
  user: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  color: z.enum(["white", "black"]).optional(),
  perfType: z.string().max(64).optional(),
  rated: z.enum(["true", "false"]).optional(),
  since: z.string().regex(/^\d+$/).optional(),
  until: z.string().regex(/^\d+$/).optional(),
  max: z.string().regex(/^\d+$/).optional(),
});

const USER_AGENT =
  "chesscope.com/1.0 (+https://chesscope.com; contact: support@chesscope.com)";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const parsed = Query.safeParse({
    user: u.searchParams.get("user") ?? "",
    color: u.searchParams.get("color") ?? undefined,
    perfType: u.searchParams.get("perfType") ?? undefined,
    rated: u.searchParams.get("rated") ?? undefined,
    since: u.searchParams.get("since") ?? undefined,
    until: u.searchParams.get("until") ?? undefined,
    max: u.searchParams.get("max") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { user, ...rest } = parsed.data;

  const upstream = new URL(`https://lichess.org/api/games/user/${user}`);
  for (const [k, v] of Object.entries(rest)) {
    if (v) upstream.searchParams.set(k, v);
  }
  // Lichess flags that improve our payload.
  upstream.searchParams.set("opening", "true");
  upstream.searchParams.set("evals", "false");
  upstream.searchParams.set("clocks", "false");
  upstream.searchParams.set("literate", "false");

  const upstreamRes = await fetch(upstream, {
    headers: {
      Accept: "application/x-chess-pgn",
      "User-Agent": USER_AGENT,
    },
  });

  if (upstreamRes.status === 404) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!upstreamRes.ok) {
    return NextResponse.json(
      { error: `Lichess returned ${upstreamRes.status}` },
      { status: 502 }
    );
  }

  return new Response(upstreamRes.body, {
    headers: {
      "Content-Type": "application/x-chess-pgn; charset=utf-8",
      "Cache-Control":
        "public, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}
