// Streaming PGN ingestion for Lichess and Chess.com.

import { Chess } from "chess.js";
import type { GameRef, ParsedGame } from "./tree";
import type { RepertoireFilters, TimeControlKey } from "./filters";
import { classifyTimeControl } from "./filters";

export type IngestSource = "lichess" | "chesscom" | "pgn";

const TAG_RE = /^\[(\w+)\s+"([^"]*)"\]/;

function parseTags(pgn: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const line of pgn.split("\n")) {
    const m = TAG_RE.exec(line.trim());
    if (m) tags[m[1]] = m[2];
    else if (line.trim() === "") continue;
    else if (!line.trim().startsWith("[")) break;
  }
  return tags;
}

function parsePgnGame(
  pgn: string,
  source: IngestSource,
  fallbackId: string
): ParsedGame | null {
  const tags = parseTags(pgn);
  const result = (tags.Result ?? "*") as GameRef["result"];
  const game = new Chess();
  try {
    game.loadPgn(pgn, { strict: false });
  } catch {
    return null;
  }
  const history = game.history();
  if (!history.length) return null;

  const id =
    tags.Site?.match(/lichess\.org\/([A-Za-z0-9]+)/)?.[1] ??
    tags.Link?.match(/chess\.com\/game\/[a-z]+\/(\d+)/)?.[1] ??
    fallbackId;
  const url = tags.Site?.startsWith("http")
    ? tags.Site
    : tags.Link?.startsWith("http")
    ? tags.Link
    : "";

  const ref: GameRef = {
    id,
    source,
    url,
    white: tags.White ?? "?",
    black: tags.Black ?? "?",
    result,
    date: tags.UTCDate?.replace(/\./g, "-") ?? tags.Date?.replace(/\./g, "-") ?? "",
    whiteElo: parseElo(tags.WhiteElo),
    blackElo: parseElo(tags.BlackElo),
    timeControl: tags.TimeControl,
    ply: history.length,
  };

  return { ref, moves: history };
}

function parseElo(s?: string): number | undefined {
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function* streamPgn(
  res: Response,
  source: IngestSource,
  signal?: AbortSignal
): AsyncIterable<ParsedGame> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let counter = 0;
  try {
    while (true) {
      if (signal?.aborted) return;
      // Reader can reject with AbortError if the upstream fetch is
      // cancelled mid-read. Treat that as a clean exit rather than
      // letting it bubble up as an unhandled promise rejection.
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        return;
      }
      const { value, done } = chunk;
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      while (true) {
        // Crucial: check abort inside the yield loop too. The fetch's
        // body reader can take a moment to error after abort fires, but
        // we may already have hundreds of games sitting in `buf` waiting
        // to be yielded — each yield must also check the signal so the
        // count stops moving the instant the user clicks Cancel.
        if (signal?.aborted) return;
        const first = buf.indexOf("[Event ");
        if (first === -1) {
          buf = "";
          break;
        }
        if (first > 0) buf = buf.slice(first);
        const next = buf.indexOf("\n[Event ", 1);
        if (next === -1) break;
        const block = buf.slice(0, next + 1).trim();
        buf = buf.slice(next + 1);
        const parsed = parsePgnGame(block, source, `${source}-${counter++}`);
        if (parsed) yield parsed;
      }
    }
    buf += decoder.decode();
    if (buf.trim()) {
      let i = 0;
      while (i < buf.length) {
        if (signal?.aborted) return;
        const next = buf.indexOf("\n[Event ", i + 1);
        const end = next === -1 ? buf.length : next + 1;
        const block = buf.slice(i, end).trim();
        if (block) {
          const parsed = parsePgnGame(block, source, `${source}-${counter++}`);
          if (parsed) yield parsed;
        }
        if (next === -1) break;
        i = next + 1;
      }
    }
  } finally {
    try {
      reader.cancel();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Maps our filter shape to the Lichess `/api/games/user` query string. Many
 * filters are server-side on Lichess so we save bandwidth by pushing them
 * upstream when we can. Anything Lichess doesn't support (opponent rating
 * range, opponent name) is applied client-side via shouldIngest().
 */
function lichessParams(
  filters: RepertoireFilters,
  serverSideMax: boolean
): URLSearchParams {
  const p = new URLSearchParams();
  p.set("color", filters.color);
  if (filters.mode === "rated") p.set("rated", "true");
  else if (filters.mode === "casual") p.set("rated", "false");
  const tc = filters.timeControls;
  const allOn = tc.bullet && tc.blitz && tc.rapid && tc.daily;
  if (!allOn) {
    const list: string[] = [];
    if (tc.bullet) list.push("bullet", "ultraBullet");
    if (tc.blitz) list.push("blitz");
    if (tc.rapid) list.push("rapid", "classical");
    if (tc.daily) list.push("correspondence");
    if (list.length) p.set("perfType", list.join(","));
  }
  if (filters.fromDate) p.set("since", String(toMillis(filters.fromDate)));
  if (filters.toDate) {
    p.set("until", String(toMillis(filters.toDate) + 86_399_999));
  }
  if (serverSideMax && filters.limit > 0) p.set("max", String(filters.limit));
  return p;
}

function toMillis(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

/**
 * Returns true if a parsed game matches the filters that we have to
 * apply client-side (because the upstream API doesn't support them, or
 * because we're filtering chess.com archives).
 */
export function shouldIngest(
  game: ParsedGame,
  filters: RepertoireFilters,
  playerName: string
): boolean {
  const playerWhite = game.ref.white.toLowerCase() === playerName.toLowerCase();
  const playerBlack = game.ref.black.toLowerCase() === playerName.toLowerCase();
  if (!playerWhite && !playerBlack) return false;
  if (filters.color === "white" && !playerWhite) return false;
  if (filters.color === "black" && !playerBlack) return false;

  // Time control bucket
  const tcKey: TimeControlKey | null = classifyTimeControl(
    game.ref.timeControl
  );
  if (tcKey && !filters.timeControls[tcKey]) return false;

  // Date range
  if (filters.fromDate && game.ref.date && game.ref.date < filters.fromDate)
    return false;
  if (filters.toDate && game.ref.date && game.ref.date > filters.toDate)
    return false;

  // Opponent rating range
  const oppElo = playerWhite ? game.ref.blackElo : game.ref.whiteElo;
  if (filters.minRating > 0 && oppElo != null && oppElo < filters.minRating)
    return false;
  if (
    filters.maxRating > 0 &&
    filters.maxRating < 3000 &&
    oppElo != null &&
    oppElo > filters.maxRating
  )
    return false;

  // Opponent name
  if (filters.opponent.trim()) {
    const opp = (playerWhite ? game.ref.black : game.ref.white).toLowerCase();
    if (!opp.includes(filters.opponent.trim().toLowerCase())) return false;
  }

  return true;
}

export async function* ingestLichess(
  user: string,
  filters: RepertoireFilters,
  signal?: AbortSignal
): AsyncIterable<ParsedGame> {
  const params = lichessParams(filters, true);
  params.set("user", user);
  const res = await fetch(`/api/lichess/games?${params.toString()}`, {
    signal,
  });
  if (!res.ok) throw new Error(`Lichess fetch failed: ${res.status}`);
  yield* streamPgn(res, "lichess", signal);
}

export async function* ingestPgnText(
  text: string,
  signal?: AbortSignal
): AsyncIterable<ParsedGame> {
  const blob = new Blob([text], { type: "application/x-chess-pgn" });
  const res = new Response(blob);
  if (signal?.aborted) return;
  yield* streamPgn(res, "pgn", signal);
}

export async function* ingestChesscom(
  user: string,
  filters: RepertoireFilters,
  signal?: AbortSignal
): AsyncIterable<ParsedGame> {
  const archivesRes = await fetch(
    `/api/chesscom/archives?user=${encodeURIComponent(user)}`,
    { signal }
  );
  if (!archivesRes.ok) {
    throw new Error(`Chess.com archives fetch failed: ${archivesRes.status}`);
  }
  const { months } = (await archivesRes.json()) as { months: string[] };

  // Trim months by date range to avoid downloading archives we'll filter
  // out anyway. Chess.com months are YYYY-MM; compare against our
  // YYYY-MM-DD bounds by truncating.
  const trimmed = months.filter((m) => {
    if (filters.fromDate && m < filters.fromDate.slice(0, 7)) return false;
    if (filters.toDate && m > filters.toDate.slice(0, 7)) return false;
    return true;
  });

  for (const month of trimmed) {
    if (signal?.aborted) return;
    const res = await fetch(
      `/api/chesscom/games?user=${encodeURIComponent(user)}&month=${month}`,
      { signal }
    );
    if (!res.ok) continue;
    yield* streamPgn(res, "chesscom", signal);
  }
}

/**
 * Round-robin merge of multiple async iterables.
 */
export async function* mergeIngest(
  sources: AsyncIterable<ParsedGame>[]
): AsyncIterable<ParsedGame> {
  const iters = sources.map((s) => s[Symbol.asyncIterator]());
  type Slot = {
    idx: number;
    p: Promise<{ idx: number; res: IteratorResult<ParsedGame> }>;
  };
  const queue: Slot[] = iters.map((it, idx) => ({
    idx,
    p: it.next().then((res) => ({ idx, res })),
  }));
  let active = queue.length;
  while (active > 0) {
    const winner = await Promise.race(queue.map((s) => s.p));
    const i = queue.findIndex((s) => s.idx === winner.idx);
    if (i === -1) continue;
    queue.splice(i, 1);
    if (winner.res.done) {
      active--;
    } else {
      yield winner.res.value;
      queue.push({
        idx: winner.idx,
        p: iters[winner.idx]
          .next()
          .then((res) => ({ idx: winner.idx, res })),
      });
    }
  }
}
