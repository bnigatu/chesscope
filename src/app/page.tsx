import type { Metadata } from "next";
import { SearchForm } from "@/components/search-form";
import { GameResults, PlayerResults } from "@/components/results-list";
import { searchGames, searchPlayers } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Chesscope, Open chess data, indexed for the rest of us.",
  description:
    "Search the full Lichess broadcast archive by player, event, or opening.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const [players, games] = query
    ? await Promise.all([
        searchPlayers(query, 20).catch(() => []),
        searchGames(query, 25).catch(() => []),
      ])
    : [[], []];

  const hasResults = query && (players.length > 0 || games.length > 0);

  return (
    <div
      className={
        query
          ? "container-narrow py-8 sm:py-10"
          : "container-narrow py-16 sm:py-24"
      }
    >
      <section className={query ? "" : "space-y-10"}>
        {!query && (
          <div className="space-y-5">
            <p className="font-mono text-[11px] uppercase tracking-[.3em] text-brass">
              ◆ Open chess data
            </p>
            <h1 className="font-display text-5xl sm:text-7xl font-light text-parchment-50 leading-[1.05]">
              The full record,{" "}
              <em className="font-display italic text-brass-light">
                searchable
              </em>
              .
            </h1>
            <p className="text-parchment-100/75 max-w-xl text-lg leading-relaxed">
              Every game from the Lichess broadcast archive, coaches preparing
              for tournaments, journalists tracking players, parents looking up
              their kids&rsquo; games. No login, no rate limits, no tracking.
            </p>
          </div>
        )}

        <SearchForm initialQuery={query} size="lg" />
      </section>

      {query && (
        <section className="mt-10 space-y-12">
          {hasResults ? (
            <>
              {players.length > 0 && <PlayerResults players={players} />}
              {games.length > 0 && (
                <GameResults
                  games={games}
                  caption={`Games matching "${query}"`}
                />
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <p className="font-display text-2xl text-parchment-100/70">
                No matches for{" "}
                <em className="text-brass-light">&ldquo;{query}&rdquo;</em>
              </p>
              <p className="mt-3 text-sm text-parchment-300/60">
                Try a partial name (e.g. &ldquo;carl&rdquo; instead of
                &ldquo;Carlsen, Magnus&rdquo;).
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
