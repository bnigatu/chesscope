import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPlayer, getPlayerGames, getTopPlayers } from "@/lib/queries";
import { GameResults } from "@/components/results-list";
import { SearchForm } from "@/components/search-form";
import { formatPgnDate } from "@/lib/utils";

type Params = Promise<{ slug: string }>;

// Pre-rendering disabled for now. Originally we statically generated the
// top N players at build time per memory §5, but the free Turso tier
// times out under the parallel query pressure of even 100 queries (each
// >180s during deploy). Until we either upgrade Turso or run static
// generation on a separate longer-lived job, every player page is ISR:
// renders on first hit, caches at the edge for 1h via `revalidate`
// below. Cold first-hit latency is the tradeoff.
export async function generateStaticParams() {
  return [];
}

// On-demand render for slugs not in `generateStaticParams`. Cached for 1h
// at the edge, so even uncached slugs only hit the DB once an hour.
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const player = await getPlayer(slug);
  if (!player) return { title: "Player not found" };
  return {
    title: player.name,
    description: `Broadcast games and tournament history for ${player.name}. ${player.gameCount} games indexed across the Lichess broadcast archive.`,
    openGraph: {
      title: `${player.name}, Chesscope`,
      description: `${player.gameCount} games indexed`,
    },
  };
}

export default async function PlayerPage({ params }: { params: Params }) {
  const { slug } = await params;
  const player = await getPlayer(slug);
  if (!player) notFound();
  const games = await getPlayerGames(slug, 100);

  const winRate =
    player.gameCount > 0
      ? Math.round(((player.wins + player.draws / 2) / player.gameCount) * 100)
      : 0;

  return (
    <>
      <div className="container-narrow pt-12 pb-8">
        <SearchForm size="md" />
      </div>

      <article className="container-narrow mt-8 animate-rise">
        <header className="space-y-4 pb-8 border-b border-parchment-50/8">
          {player.title && (
            <p className="font-mono text-[11px] uppercase tracking-[.3em] text-brass">
              {expandTitle(player.title)}
            </p>
          )}
          <h1 className="font-display text-4xl sm:text-6xl font-light text-parchment-50">
            {player.name}
          </h1>
          {player.fideId && (
            <p className="data-num text-sm text-parchment-300/70">
              FIDE ID {player.fideId}
            </p>
          )}
        </header>

        <section className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-8 mt-10">
          <Statistic label="Games" value={player.gameCount.toLocaleString()} />
          <Statistic
            label="Wins"
            value={player.wins.toLocaleString()}
            tone="brass"
          />
          <Statistic label="Draws" value={player.draws.toLocaleString()} />
          <Statistic
            label="Losses"
            value={player.losses.toLocaleString()}
            tone="oxblood"
          />
          <Statistic label="Score" value={`${winRate}%`} mono />
        </section>

        <section className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-6 mt-10 text-sm">
          <Meta label="Peak rating" value={player.peakElo?.toString() ?? "—"} />
          <Meta
            label="Latest rating"
            value={player.latestElo?.toString() ?? "—"}
          />
          <Meta label="First seen" value={formatPgnDate(player.firstSeen)} />
          <Meta label="Last seen" value={formatPgnDate(player.lastSeen)} />
        </section>

        <hr className="rule my-12" />

        <GameResults games={games} caption="Recent games" />
      </article>
    </>
  );
}

function Statistic({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: "brass" | "oxblood";
  mono?: boolean;
}) {
  const valueClass =
    tone === "brass"
      ? "text-brass-light"
      : tone === "oxblood"
        ? "text-oxblood-light"
        : "text-parchment-50";
  return (
    <div>
      <div
        className={`${
          mono ? "data-num" : "font-display"
        } text-3xl ${valueClass}`}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[.22em] text-parchment-300/60">
        {label}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline border-b border-parchment-50/6 pb-2">
      <span className="text-[11px] uppercase tracking-[.2em] text-parchment-300/60">
        {label}
      </span>
      <span className="data-num text-parchment-100/90">{value}</span>
    </div>
  );
}

function expandTitle(t: string): string {
  const map: Record<string, string> = {
    GM: "Grandmaster",
    IM: "International Master",
    FM: "FIDE Master",
    CM: "Candidate Master",
    WGM: "Woman Grandmaster",
    WIM: "Woman International Master",
    WFM: "Woman FIDE Master",
    NM: "National Master",
  };
  return map[t] ?? t;
}
