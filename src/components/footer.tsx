import Link from "next/link";
import { Wordmark } from "./knight-mark";

export function Footer() {
  return (
    <footer className="mt-32 border-t border-parchment-50/8">
      <div className="container-wide py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="space-y-4">
            <Wordmark className="text-base" />
            <p className="text-sm text-parchment-300/80 leading-relaxed max-w-xs">
              Open chess data, indexed for the rest of us. Built because
              search shouldn&rsquo;t be a luxury.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-display text-sm text-brass uppercase tracking-[.2em]">
              Sources
            </h4>
            <ul className="space-y-2 text-sm text-parchment-100/80">
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

          <div className="space-y-3">
            <h4 className="font-display text-sm text-brass uppercase tracking-[.2em]">
              Project
            </h4>
            <ul className="space-y-2 text-sm text-parchment-100/80">
              <li>
                <Link href="/about" className="link-editorial">
                  About &amp; methodology
                </Link>
              </li>
              <li>
                <a href="mailto:support@chesscope.com" className="link-editorial">
                  Contact
                </a>
              </li>
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
                  Help cover hosting & ingest
                </span>
              </li>
            </ul>
          </div>
        </div>

        <hr className="rule my-10" />

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs text-parchment-300/60">
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
