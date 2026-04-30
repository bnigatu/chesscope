"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/utils";

type Book = "lichess" | "masters";

type BookMove = {
  uci: string;
  san: string;
  averageRating?: number;
  white: number;
  draws: number;
  black: number;
};

type ExplorerGame = {
  id: string;
  winner?: "white" | "black" | null;
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  year?: number;
  month?: string;
};

type ExplorerResponse = {
  white: number;
  draws: number;
  black: number;
  moves: BookMove[];
  topGames?: ExplorerGame[];
  opening?: { eco: string; name: string } | null;
};

type Status = "idle" | "loading" | "needsAuth" | "error";

export function BookPanel({
  fen,
  onPick,
}: {
  fen: string;
  onPick?: (san: string) => void;
}) {
  const [book, setBook] = useState<Book>("lichess");
  const [data, setData] = useState<ExplorerResponse | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setStatus("loading");

    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/lichess/explorer?fen=${encodeURIComponent(fen)}&book=${book}`,
          { signal: ctl.signal },
        );
        if (res.status === 401) {
          // Either no token or upstream rejected ours.
          setData(null);
          setStatus("needsAuth");
          return;
        }
        if (!res.ok) throw new Error(`Explorer returned ${res.status}`);
        const json = (await res.json()) as ExplorerResponse;
        if (ctl.signal.aborted) return;
        setData(json);
        setStatus("idle");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setStatus("error");
      }
    }, 200);

    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
  }, [fen, book]);

  async function disconnect() {
    try {
      await fetch("/api/lichess/oauth/logout", { method: "POST" });
    } finally {
      setData(null);
      setStatus("needsAuth");
    }
  }

  const total = data ? data.white + data.draws + data.black : 0;
  const signedIn = status !== "needsAuth";

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="font-mono text-[11px] uppercase tracking-[.25em] text-brass">
          Book moves
        </h2>
        <div className="flex items-center gap-2">
          <BookTab
            active={book === "lichess"}
            onClick={() => setBook("lichess")}
            label="Lichess"
          />
          <BookTab
            active={book === "masters"}
            onClick={() => setBook("masters")}
            label="Masters"
          />
        </div>
      </div>

      <div
        className={cx(
          "border border-parchment-50/8 rounded-sm bg-ink-800/60 overflow-hidden",
        )}
      >
        {status === "needsAuth" && <NeedsAuth />}

        {status !== "needsAuth" && data?.opening && (
          <div className="px-3 py-2 border-b border-parchment-50/6 text-xs">
            <span className="font-mono text-parchment-300/55">
              {data.opening.eco}
            </span>
            <span className="text-parchment-100/85 ml-2">
              {data.opening.name}
            </span>
          </div>
        )}

        {status === "loading" && !data && (
          <p className="px-3 py-6 text-center text-xs italic text-parchment-300/40">
            Loading book…
          </p>
        )}
        {status === "error" && (
          <p className="px-3 py-6 text-center text-xs italic text-oxblood-light">
            Book lookup failed.
          </p>
        )}
        {status !== "loading" &&
          status !== "needsAuth" &&
          data &&
          data.moves.length === 0 && (
            <p className="px-3 py-6 text-center text-xs italic text-parchment-300/40">
              No book moves at this position.
            </p>
          )}

        {status !== "needsAuth" && data && data.moves.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] uppercase tracking-[.18em] text-parchment-300/50 border-b border-parchment-50/8">
              <tr>
                <th className="px-3 py-2 font-normal">Move</th>
                <th className="px-2 py-2 font-normal text-right">Games</th>
                <th className="px-2 py-2 font-normal text-right">Elo</th>
                <th className="px-2 py-2 font-normal w-1/3">W/D/L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-parchment-50/6">
              {data.moves.map((m) => {
                const moveTotal = m.white + m.draws + m.black;
                const w = pct(m.white, moveTotal);
                const d = pct(m.draws, moveTotal);
                const l = pct(m.black, moveTotal);
                return (
                  <tr
                    key={m.uci}
                    onClick={() => onPick?.(m.san)}
                    className={cx(
                      "transition-colors",
                      onPick && "cursor-pointer hover:bg-ink-700/40",
                    )}
                    title={onPick ? `Play ${m.san}` : undefined}
                  >
                    <td className="px-3 py-1.5 font-mono text-parchment-50 font-bold">
                      {m.san}
                    </td>
                    <td className="px-2 py-1.5 data-num text-right text-parchment-100/85">
                      {compact(moveTotal)}
                    </td>
                    <td className="px-2 py-1.5 data-num text-right text-parchment-300/70">
                      {m.averageRating ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex h-3 rounded-sm overflow-hidden border border-parchment-50/10">
                        {w > 0 && (
                          <div
                            className="bg-parchment-50"
                            style={{ width: `${w}%` }}
                          />
                        )}
                        {d > 0 && (
                          <div
                            className="bg-parchment-300/40"
                            style={{ width: `${d}%` }}
                          />
                        )}
                        {l > 0 && (
                          <div
                            className="bg-oxblood"
                            style={{ width: `${l}%` }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {status !== "needsAuth" &&
          data &&
          data.topGames &&
          data.topGames.length > 0 && (
            <div className="border-t border-parchment-50/8">
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-[.18em] text-parchment-300/55">
                {data.topGames.length === 1 ? "Game" : "Top games"}
              </div>
              <ul className="divide-y divide-parchment-50/6">
                {data.topGames.map((g) => (
                  <li key={g.id}>
                    <a
                      href={`https://lichess.org/${g.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-baseline gap-1 px-3 py-1.5 text-xs hover:bg-ink-700/40 transition-colors"
                      title="Open on Lichess"
                    >
                      <span
                        className={cx(
                          "font-display truncate",
                          g.winner === "white" &&
                            "font-bold text-parchment-50"
                        )}
                      >
                        {g.white.name}
                        <span className="data-num text-parchment-300/55">
                          {" "}
                          ({g.white.rating})
                        </span>
                      </span>
                      <span className="data-num text-parchment-300/70 mx-1 shrink-0">
                        {g.winner === "white"
                          ? "1–0"
                          : g.winner === "black"
                          ? "0–1"
                          : "½–½"}
                      </span>
                      <span
                        className={cx(
                          "font-display truncate flex-1",
                          g.winner === "black" &&
                            "font-bold text-parchment-50"
                        )}
                      >
                        {g.black.name}
                        <span className="data-num text-parchment-300/55">
                          {" "}
                          ({g.black.rating})
                        </span>
                      </span>
                      <span className="text-parchment-300/55 shrink-0">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

        {status !== "needsAuth" && data && total > 0 && (
          <div className="px-3 py-1.5 border-t border-parchment-50/6 flex justify-between text-[10px] font-mono text-parchment-300/50">
            <span>{compact(total)} games at this position</span>
            {signedIn && (
              <button
                type="button"
                onClick={disconnect}
                className="hover:text-parchment-100/80 transition-colors"
                title="Disconnect Lichess"
              >
                disconnect
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function NeedsAuth() {
  // Build the connect URL on the client so we can pass `next` as the
  // current page (with its query params) — bringing the user right back
  // to the same exploration state after they auth.
  const next =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/";
  const href = `/api/lichess/oauth/login?next=${encodeURIComponent(next)}`;
  return (
    <div className="px-4 py-6 text-center space-y-3">
      <p className="text-sm text-parchment-100/80">
        Connect your Lichess account to view book theory.
      </p>
      <p className="text-[11px] text-parchment-300/55 italic">
        Lichess started requiring sign-in on its Opening Explorer in 2026 to
        defend against DDoS. We never see your password, auth happens on
        lichess.org. Token is stored only on your device.
      </p>
      <a
        href={href}
        className={cx(
          "inline-block px-4 py-2 mt-1",
          "border border-brass/50 text-brass-light rounded-sm",
          "font-mono text-xs uppercase tracking-[.2em]",
          "hover:bg-brass/10 hover:border-brass transition-colors",
        )}
      >
        Connect Lichess
      </a>
    </div>
  );
}

function BookTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "px-2 py-0.5 text-[10px] uppercase tracking-[.18em] rounded-sm",
        "border transition-colors",
        active
          ? "border-brass/50 text-brass-light bg-brass/10"
          : "border-parchment-50/10 text-parchment-300/55 hover:text-parchment-100",
      )}
    >
      {label}
    </button>
  );
}

function pct(n: number, total: number): number {
  if (!total) return 0;
  return (n / total) * 100;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toLocaleString();
}
