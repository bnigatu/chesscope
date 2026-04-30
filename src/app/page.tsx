import type { Metadata } from "next";
import Link from "next/link";
import { Board } from "@/components/repertoire/board";
import { SourcePickerForm } from "@/components/repertoire/source-picker";
import { RepertoireExplorer } from "@/components/repertoire/explorer";
import { filtersFromParams } from "@/lib/repertoire/filters";

export const metadata: Metadata = {
  // Use `absolute` to bypass the layout's title.template — homepage
  // title already includes the brand, we don't want " · Chesscope"
  // appended a second time.
  title: {
    absolute:
      "Chesscope — opening repertoire from Lichess and Chess.com in one tree",
  },
  description:
    "Build any player's full opening repertoire from Lichess and Chess.com in one interactive tree. Stockfish engine, transposition-aware, save positions. Free, no login.",
  alternates: { canonical: "/" },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const isBuilt = sp.built === "1";
  const lichess = sp.lichess?.trim() || null;
  const chesscom = sp.chesscom?.trim() || null;
  const pgnEnabled = sp.pgn === "1";
  const treeEnabled = sp.tree === "1";
  const filters = filtersFromParams(sp);
  // Initial moves passed in via the share-link URL. Each entry is a SAN
  // separated by commas. The explorer validates against chess.js and
  // ignores anything that doesn't make a legal move from the running
  // position, so junk input fails closed (cursor stays at 0).
  const initialSanLine = sp.moves
    ? sp.moves
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="container-wide py-10 sm:py-14">
      <header
        className={
          isBuilt
            ? "mb-6 flex items-center justify-between gap-4"
            : "mb-8 sm:mb-12 space-y-3 max-w-3xl"
        }
      >
        <p className="font-mono text-[11px] uppercase tracking-[.3em] text-brass">
          ◆ Repertoire Explorer
        </p>
        {isBuilt ? (
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-[.25em] text-brass-light hover:underline"
          >
            ← Back to form
          </Link>
        ) : (
          <h1 className="font-display text-4xl sm:text-5xl font-light text-parchment-50 leading-[1.1]">
            See any player&rsquo;s full opening repertoire —{" "}
            <em className="font-display italic text-brass-light">
              Lichess and Chess.com
            </em>{" "}
            in one tree.
          </h1>
        )}
      </header>

      {isBuilt ? (
        <RepertoireExplorer
          lichessUser={lichess}
          chesscomUser={chesscom}
          pgnEnabled={pgnEnabled}
          treeEnabled={treeEnabled}
          filters={filters}
          initialSanLine={initialSanLine}
        />
      ) : (
        <FormView />
      )}
    </div>
  );
}

function FormView() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
      <div className="lg:col-span-8 lg:order-2">
        <Board />
      </div>
      <aside className="lg:col-span-4 lg:order-1 space-y-8 lg:sticky lg:top-6 lg:self-start">
        <SourcePickerForm />
      </aside>
    </div>
  );
}
