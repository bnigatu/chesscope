import type { Metadata } from "next";
import { getCoverageStats } from "@/lib/queries";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  title: "About",
  description:
    "How Chesscope works, where the data comes from, and why it exists.",
  alternates: { canonical: "/about" },
};

export const revalidate = 3600;

export default async function AboutPage() {
  let stats: Awaited<ReturnType<typeof getCoverageStats>> | null = null;
  try {
    stats = await getCoverageStats();
  } catch {
    stats = null;
  }

  return (
    <article className="container-narrow py-20 prose-invert">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          url: "https://chesscope.com/about",
          name: "About Chesscope",
          description:
            "How Chesscope works, where the data comes from, and why it exists.",
          inLanguage: "en",
          isPartOf: { "@id": "https://chesscope.com/#website" },
        }}
      />
      <p className="font-mono text-[11px] uppercase tracking-[.3em] text-brass mb-6">
        ◆ Methodology
      </p>
      <h1 className="font-display text-5xl sm:text-6xl font-light text-parchment-50 leading-tight">
        About Chesscope
      </h1>

      <div className="mt-12 space-y-10 text-base text-parchment-100/85 leading-relaxed max-w-2xl">
        <Section heading="Why this exists">
          Lichess publishes a vast archive of professional chess games as part
          of its broadcast feature, but searching that archive by player name
          has been broken or limited for some time. The data is public,
          beautifully structured, and freely licensed, there is no good reason
          that a coach preparing for a USCF tournament, a parent looking up
          their kid&rsquo;s last games, or a journalist tracking a player should
          hit a dead end. Chesscope fills that gap.
        </Section>

        <Section heading="Where the data comes from">
          The bulk of the corpus is the official Lichess broadcast PGN dump,
          released under the Creative Commons Attribution-ShareAlike 4.0
          license. Each game preserves the original{" "}
          <code className="font-mono text-brass-light">BroadcastURL</code> tag,
          so every result links back to the canonical Lichess study. Future
          sources (Chess.com archives, TWIC, federation broadcasts) will be
          added as separate ingestion paths.
        </Section>

        <Section heading="How search works">
          Player name lookups use SQLite&rsquo;s FTS5 with a trigram tokenizer,
          which gives substring and typo-tolerant matching even on names that
          have inconsistent transliteration. Game search uses the porter stemmer
          over the player, event, and opening fields. Results are ranked by BM25
          with activity as the tiebreaker.
        </Section>

        <Section heading="Repertoire Explorer">
          <p>
            Beyond broadcast search, Chesscope can build any player&rsquo;s
            full opening tree from{" "}
            <strong className="text-parchment-50">Lichess and Chess.com</strong>{" "}
            in a single view — pre-game scouting, self-review, coaching prep.
            Pull every game a user has played across both platforms, click any
            move to drill in, see win-rate and performance stats per position.
          </p>
          <ul className="mt-4 space-y-2.5 not-prose text-parchment-100/85">
            <li className="flex gap-3">
              <span aria-hidden className="text-brass shrink-0 mt-1">
                ◆
              </span>
              <span>
                <strong className="text-parchment-50">Combined sources</strong>{" "}
                — Lichess and Chess.com merged into one tree, no flipping
                between two sites.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="text-brass shrink-0 mt-1">
                ◆
              </span>
              <span>
                <strong className="text-parchment-50">Stockfish 18 NNUE</strong>{" "}
                runs locally in the browser, multi-PV, click any line to play
                it out on the board.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="text-brass shrink-0 mt-1">
                ◆
              </span>
              <span>
                <strong className="text-parchment-50">Per-position stats</strong>{" "}
                — performance rating, score percentage, opponent strength,
                longest/shortest lines, last played.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="text-brass shrink-0 mt-1">
                ◆
              </span>
              <span>
                <strong className="text-parchment-50">Lichess opening explorer</strong>{" "}
                for book theory at every position, with single-game drill-in.
                Connect your Lichess account to enable.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="text-brass shrink-0 mt-1">
                ◆
              </span>
              <span>
                <strong className="text-parchment-50">PGN upload</strong>{" "}
                supported. Trees can be saved to a{" "}
                <code className="font-mono text-brass-light">.tree</code> file
                and reloaded later.
              </span>
            </li>
          </ul>
          <p className="mt-5">
            <a
              href="/repertoire"
              className="font-mono text-xs uppercase tracking-[.25em] text-brass-light hover:underline"
            >
              → Build a repertoire
            </a>
          </p>
        </Section>

        <Section heading="Coverage">
          {stats ? (
            <ul className="grid grid-cols-2 gap-x-8 gap-y-3 not-prose data-num text-parchment-50">
              <li className="flex justify-between border-b border-parchment-50/8 pb-2">
                <span className="text-parchment-300/60">Games</span>
                <span>{stats.games?.toLocaleString() ?? "—"}</span>
              </li>
              <li className="flex justify-between border-b border-parchment-50/8 pb-2">
                <span className="text-parchment-300/60">Players</span>
                <span>{stats.players?.toLocaleString() ?? "—"}</span>
              </li>
              <li className="flex justify-between border-b border-parchment-50/8 pb-2">
                <span className="text-parchment-300/60">Tournaments</span>
                <span>{stats.events?.toLocaleString() ?? "—"}</span>
              </li>
              <li className="flex justify-between border-b border-parchment-50/8 pb-2">
                <span className="text-parchment-300/60">Latest</span>
                <span>{stats.latest ?? "—"}</span>
              </li>
            </ul>
          ) : (
            <p>The index is being built. Stats will appear here shortly.</p>
          )}
        </Section>

        <Section heading="Updating">
          The index refreshes weekly via a GitHub Actions cron that pulls the
          latest broadcast dump, parses it streaming, and upserts new games to
          the database. Reruns are idempotent, game IDs are content hashes, so
          the same game is never indexed twice.
        </Section>

        <Section heading="What's next">
          Beyond broadcast search, the platform is intentionally extensible: the
          schema accepts non-Lichess sources via the{" "}
          <code className="font-mono text-brass-light">source</code> column, so
          adding chess.com archives, federation PGNs, or even private coaching
          corpora is a question of writing another ingestion script. Suggestions
          welcome.
        </Section>

        <Section heading="Source code">
          <p>
            Chesscope is fully open source. Read the code, file an issue, or
            send a pull request on{" "}
            <a
              href="https://github.com/bnigatu/chesscope"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brass-light hover:underline"
            >
              GitHub
            </a>
            .
          </p>
        </Section>

        <Section heading="License & attribution">
          Game data inherits the CC BY-SA 4.0 license of the Lichess broadcast
          dump. The Chesscope code itself is open source under the{" "}
          <strong>GNU General Public License v3</strong> — the Repertoire
          Explorer is a re-architecture of openingtree.com (also GPL v3), so
          chesscope inherits that copyleft. When in doubt, attribute Lichess.
        </Section>
      </div>
    </article>
  );
}

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl text-brass-light">{heading}</h2>
      <div>{children}</div>
    </section>
  );
}
