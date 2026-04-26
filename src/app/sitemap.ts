import type { MetadataRoute } from "next";
import { getTopPlayers } from "@/lib/queries";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://chesscope.com";
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${base}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  let playerEntries: MetadataRoute.Sitemap = [];
  try {
    // Top 5,000 players by activity. Keeping the sitemap finite keeps
    // crawlers happy and avoids leaking the long tail to Google as
    // priority-equivalent.
    const top = await getTopPlayers(5000);
    playerEntries = top.map((p) => ({
      url: `${base}/player/${p.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    // DB unreachable at build/runtime, emit static entries only.
  }

  return [...staticEntries, ...playerEntries];
}
