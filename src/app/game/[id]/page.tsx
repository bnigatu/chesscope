import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getGame } from "@/lib/queries";
import { playerSlug } from "@/lib/slug";
import { formatPgnDate, formatResult } from "@/lib/utils";
import { SearchForm } from "@/components/search-form";
import { JsonLd } from "@/components/json-ld";

type Params = Promise<{ id: string }>;

export const revalidate = 86400; // games are immutable; cache aggressively

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) return { title: "Game not found" };
  const eventTxt = game.event ?? "Broadcast game";
  const dateTxt = formatPgnDate(game.date);
  const titleBase = `${game.white} vs ${game.black}`;
  const titleFull = dateTxt
    ? `${titleBase} · ${eventTxt} ${dateTxt}`
    : `${titleBase} · ${eventTxt}`;
  const description =
    `${eventTxt}, ${dateTxt}. ${game.white} vs ${game.black}, result ${formatResult(
      game.result,
    )}` +
    (game.opening ? `. Opening: ${game.opening}` : "") +
    (game.eco ? ` (${game.eco})` : "") +
    ".";
  return {
    title: titleFull,
    description,
    alternates: { canonical: `/game/${id}` },
    openGraph: {
      title: titleFull,
      description,
      url: `/game/${id}`,
      type: "article",
    },
    twitter: { title: titleFull, description },
  };
}

export default async function GamePage({ params }: { params: Params }) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) notFound();

  const gameUrl = `https://chesscope.com/game/${id}`;
  const whiteSlug = playerSlug(game.white);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: "https://chesscope.com/",
            },
            {
              "@type": "ListItem",
              position: 2,
              name: game.white,
              item: `https://chesscope.com/player/${whiteSlug}`,
            },
            {
              "@type": "ListItem",
              position: 3,
              name: `${game.white} vs ${game.black}`,
              item: gameUrl,
            },
          ],
        }}
      />
      <div className="container-narrow pt-12 pb-8">
        <SearchForm size="md" />
      </div>

      <article className="container-narrow mt-8 animate-rise">
        <header className="space-y-3 pb-8 border-b border-parchment-50/8">
          {game.event && (
            <p className="font-mono text-[11px] uppercase tracking-[.3em] text-brass">
              {game.event}
              {game.round && (
                <span className="text-parchment-300/60">
                  {" · Round "}
                  {game.round}
                </span>
              )}
            </p>
          )}
          <h1 className="font-display text-3xl sm:text-5xl font-light text-parchment-50 leading-tight">
            <Link
              href={`/player/${playerSlug(game.white)}`}
              className="hover:text-brass-light transition-colors"
            >
              {game.white}
            </Link>{" "}
            <span className="text-parchment-300/60">·</span>{" "}
            <span className="data-num">{formatResult(game.result)}</span>{" "}
            <span className="text-parchment-300/60">·</span>{" "}
            <Link
              href={`/player/${playerSlug(game.black)}`}
              className="hover:text-brass-light transition-colors"
            >
              {game.black}
            </Link>
          </h1>
          <p className="text-sm text-parchment-300/70">
            {formatPgnDate(game.date)}
            {game.eco && (
              <span>
                {" · "}
                <span className="data-num">{game.eco}</span>
                {game.opening && ` · ${game.opening}`}
              </span>
            )}
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6 mt-10 text-sm">
          <PlayerSide
            color="White"
            name={game.white}
            elo={game.whiteElo}
            title={game.whiteTitle}
            fide={game.whiteFideId}
          />
          <PlayerSide
            color="Black"
            name={game.black}
            elo={game.blackElo}
            title={game.blackTitle}
            fide={game.blackFideId}
          />
        </section>

        <hr className="rule my-10" />

        <section className="space-y-4">
          <h2 className="font-display text-xs text-brass uppercase tracking-[.25em]">
            PGN
          </h2>
          {game.pgn ? (
            <pre className="card p-6 text-xs sm:text-sm font-mono leading-relaxed text-parchment-100/90 whitespace-pre-wrap break-words overflow-x-auto">
              {game.pgn}
            </pre>
          ) : (
            <p className="card p-6 text-sm text-parchment-300/70">
              PGN body not stored locally. View at the original source.
            </p>
          )}
        </section>

        {game.broadcastUrl && (
          <div className="mt-10">
            <a
              href={game.broadcastUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 border border-brass/40 text-brass-light hover:bg-brass/10 transition-all text-sm font-mono uppercase tracking-[.2em]"
            >
              View on Lichess →
            </a>
          </div>
        )}
      </article>
    </>
  );
}

function PlayerSide({
  color,
  name,
  elo,
  title,
  fide,
}: {
  color: string;
  name: string;
  elo: number | null;
  title: string | null;
  fide: string | null;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-[.22em] text-parchment-300/60">
        {color}
      </p>
      <p className="font-display text-2xl text-parchment-50">
        {title && <span className="text-brass mr-2 text-base">{title}</span>}
        <Link
          href={`/player/${playerSlug(name)}`}
          className="hover:text-brass-light transition-colors"
        >
          {name}
        </Link>
      </p>
      <p className="data-num text-sm text-parchment-300/70">
        {elo ? `${elo} Elo` : "—"}
        {fide && (
          <span className="ml-3 text-parchment-300/50">FIDE {fide}</span>
        )}
      </p>
    </div>
  );
}
