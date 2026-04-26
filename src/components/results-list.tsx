import Link from "next/link";
import type { GameHit, PlayerHit } from "@/lib/queries";
import { formatPgnDate, formatResult, lastName } from "@/lib/utils";

export function PlayerResults({ players }: { players: PlayerHit[] }) {
  if (players.length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xs text-brass uppercase tracking-[.25em]">
        Players
      </h2>
      <ul className="divide-y divide-parchment-50/8">
        {players.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/player/${p.slug}`}
              className="flex items-baseline justify-between gap-6 py-4 group"
            >
              <div className="flex items-baseline gap-3 min-w-0">
                <span className="font-display text-xl text-parchment-50 group-hover:text-brass-light transition-colors truncate">
                  {p.name}
                </span>
                {p.fideId && (
                  <span className="data-num text-[11px] text-parchment-300/50 shrink-0">
                    FIDE {p.fideId}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-6 shrink-0 data-num text-xs text-parchment-300/70">
                {p.peakElo ? (
                  <span>
                    <span className="text-parchment-300/50">peak </span>
                    {p.peakElo}
                  </span>
                ) : null}
                <span>
                  <span className="text-parchment-300/50">games </span>
                  {p.gameCount.toLocaleString()}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GameResults({
  games,
  caption,
}: {
  games: GameHit[];
  caption?: string;
}) {
  if (games.length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xs text-brass uppercase tracking-[.25em]">
        {caption ?? "Games"}
      </h2>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-parchment-300/50 text-[11px] uppercase tracking-[.18em] border-b border-parchment-50/8">
            <tr>
              <th className="px-4 py-3 font-normal">Date</th>
              <th className="px-4 py-3 font-normal">White</th>
              <th className="px-4 py-3 font-normal text-center">Result</th>
              <th className="px-4 py-3 font-normal">Black</th>
              <th className="px-4 py-3 font-normal hidden md:table-cell">
                Event
              </th>
              <th className="px-4 py-3 font-normal hidden lg:table-cell">
                Opening
              </th>
              <th className="px-4 py-3 font-normal" aria-label="Source link" />
            </tr>
          </thead>
          <tbody className="divide-y divide-parchment-50/6">
            {games.map((g) => (
              <tr
                key={g.id}
                className="hover:bg-ink-700/40 transition-colors"
              >
                <td className="px-4 py-2.5 data-num text-parchment-300/70 whitespace-nowrap">
                  {formatPgnDate(g.date)}
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/game/${g.id}`}
                    className="text-parchment-50 hover:text-brass-light transition-colors"
                  >
                    {lastName(g.white)}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className="data-num text-parchment-100/90">
                    {formatResult(g.result)}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/game/${g.id}`}
                    className="text-parchment-50 hover:text-brass-light transition-colors"
                  >
                    {lastName(g.black)}
                  </Link>
                </td>
                <td className="px-4 py-2.5 hidden md:table-cell text-parchment-100/80 truncate max-w-[18ch]">
                  {g.event ?? "—"}
                </td>
                <td className="px-4 py-2.5 hidden lg:table-cell text-parchment-300/70 truncate max-w-[20ch]">
                  {g.opening ?? g.eco ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {g.broadcastUrl && (
                    <a
                      href={g.broadcastUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-parchment-300/60 hover:text-brass transition-colors"
                      aria-label="View on Lichess"
                    >
                      ↗
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
