import { NextResponse } from "next/server";
import { z } from "zod";
import { searchPlayers, searchGames } from "@/lib/queries";

// Node runtime, required for libSQL HTTP client + Drizzle on Cloudflare via
// the OpenNext adapter (the Edge runtime is more constrained).
export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).optional().default(8),
  type: z.enum(["players", "games", "all"]).optional().default("players"),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parse = querySchema.safeParse({
    q: searchParams.get("q") ?? "",
    limit: searchParams.get("limit") ?? undefined,
    type: searchParams.get("type") ?? undefined,
  });
  if (!parse.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parse.error.format() },
      { status: 400 },
    );
  }

  const { q, limit, type } = parse.data;

  try {
    const result: Record<string, unknown> = {};
    if (type === "players" || type === "all") {
      result.players = await searchPlayers(q, limit);
    }
    if (type === "games" || type === "all") {
      result.games = await searchGames(q, limit);
    }

    return NextResponse.json(result, {
      headers: {
        // Cache popular queries at the Cloudflare edge for 60s. Revalidates
        // in the background for fresh queries; bursts free.
        "Cache-Control":
          "public, max-age=10, s-maxage=60, stale-while-revalidate=300",
        "CDN-Cache-Control": "public, s-maxage=60",
      },
    });
  } catch (err) {
    console.error("[search] failure:", err);
    return NextResponse.json(
      { error: "Search temporarily unavailable" },
      { status: 503 },
    );
  }
}
