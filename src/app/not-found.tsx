import Link from "next/link";
import { SearchForm } from "@/components/search-form";

export default function NotFound() {
  return (
    <div className="container-narrow py-32 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[.3em] text-brass mb-6">
        ◆ Resignation
      </p>
      <h1 className="font-display text-7xl sm:text-9xl font-light text-parchment-50 leading-none">
        1<span className="text-parchment-300/60">–</span>0
      </h1>
      <p className="mt-8 font-display italic text-2xl text-parchment-100/80">
        The page you were looking for has resigned.
      </p>
      <p className="mt-3 text-sm text-parchment-300/70 max-w-md mx-auto">
        It might be a misspelled name, a deleted study, or a tournament that
        hasn&rsquo;t been broadcast yet. Try a search:
      </p>
      <div className="mt-12 max-w-xl mx-auto">
        <SearchForm size="md" />
      </div>
      <div className="mt-12">
        <Link
          href="/"
          className="text-xs uppercase tracking-[.2em] font-mono text-parchment-300/70 hover:text-brass transition-colors"
        >
          ← Return home
        </Link>
      </div>
    </div>
  );
}
