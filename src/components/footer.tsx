import Link from "next/link";
import { Wordmark } from "./knight-mark";

export function Footer() {
  return (
    <footer className="mt-8 border-t border-parchment-50/8">
      <div className="container-wide py-5">
        {/* 4 columns so Donate gets its own slot — keeps the footer
            short enough to stay visible below the explorer board. */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <Wordmark className="text-base" />
            <p className="text-xs text-parchment-300/80 leading-snug max-w-xs">
              Open chess data, indexed for the rest of us.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-display text-xs text-brass uppercase tracking-[.2em]">
              Sources
            </h4>
            <ul className="space-y-1 text-xs text-parchment-100/80">
              <li>
                <a
                  href="https://database.lichess.org/#broadcasts"
                  target="_blank"
                  rel="noopener"
                  className="link-editorial"
                >
                  Lichess broadcasts
                </a>{" "}
                <span className="text-parchment-300/60">CC BY-SA 4.0</span>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-display text-xs text-brass uppercase tracking-[.2em]">
              Project
            </h4>
            <ul className="space-y-1 text-xs text-parchment-100/80">
              <li>
                <Link href="/about" className="link-editorial">
                  About &amp; methodology
                </Link>
              </li>
              <li>
                <a
                  href="mailto:support@chesscope.com"
                  className="link-editorial"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-display text-xs text-brass uppercase tracking-[.2em]">
              Support
            </h4>
            <ul className="space-y-1 text-xs text-parchment-100/80">
              <li>
                <a
                  href="https://buymeacoffee.com/chesscope"
                  target="_blank"
                  rel="noopener"
                  className="link-editorial"
                >
                  Donate
                </a>{" "}
                <span className="text-parchment-300/60">
                  Help cover hosting &amp; ingest
                </span>
              </li>
            </ul>
          </div>
        </div>

        <hr className="rule my-3" />

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-[11px] text-parchment-300/60">
          <p className="font-mono">
            © {new Date().getFullYear()} Chesscope. Game data is the property
            of its respective sources, redistributed under their licenses.
          </p>
          <p className="italic">
            Caïssa &mdash; protectress of the sixty-four squares.
          </p>
        </div>
      </div>
    </footer>
  );
}
