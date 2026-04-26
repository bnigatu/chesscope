import { NextResponse } from "next/server";
import { getPlayer, getPlayerGames } from "@/lib/queries";
import { playerSlug } from "@/lib/slug";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const slug = playerSlug(decodeURIComponent(name));
  const player = await getPlayer(slug);
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  const games = await getPlayerGames(slug, 50);
  return NextResponse.json(
    { player, games },
    {
      headers: {
        "Cache-Control":
          "public, max-age=60, s-maxage=600, stale-while-revalidate=86400",
      },
    }
  );
}
