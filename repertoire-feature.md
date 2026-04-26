# Chesscope — Repertoire Explorer

> Design doc for the second major feature on chesscope.com. Read after
> `memory.md`. This is a re-architecture of openingtree.com's core
> functionality, integrated into the chesscope stack and modernized.
> When implementing, prefer the patterns documented here over your own
> defaults — the rationale is in §10.

---

## 1. What this feature is

**Repertoire Explorer** is a per-player opening tree builder.

Pick a username, hit "Build", and chesscope walks every game that user has
ever played on Lichess and/or Chess.com, aggregating them into an
interactive opening tree. Click a move on the board (or in the moves
panel) to drill down: see how often the player reached this position, the
win/draw/loss distribution from here, every opponent they faced, and links
to the actual games.

The launch killer feature — **combined Lichess + Chess.com fetch in a
single tree**. The original openingtree.com made you pick one source at a
time, which was wrong: most players are on both platforms with different
usernames, and a real repertoire spans both. Chesscope unifies them.

Use cases:
- **Pre-game scouting** — opponent's openings across both sites in one view.
- **Self-review** — your own repertoire, gaps, problem variations.
- **Coaching prep** — student's full game history, not just one platform.
- **Theoretical research** — anyone's deviations from book in a given line.

URL: **`chesscope.com/repertoire`** (the form) and **`chesscope.com/repertoire/{handle}`** (built tree).
The `{handle}` is a chesscope-internal slug (see §3); the actual usernames
live in query params so a single page can show "Magnus on lichess" plus
"Magnus on chess.com" combined.

## 2. Where it sits in the existing stack

Same Next.js app. New routes only — does not disturb the broadcast search.

```
chesscope/
├── src/app/
│   ├── repertoire/
│   │   ├── page.tsx                    NEW · landing form (pick user + sources)
│   │   └── [handle]/page.tsx           NEW · explorer (board + tree + moves)
│   └── api/
│       ├── lichess/
│       │   ├── games/route.ts          NEW · proxy: stream a user's PGN games
│       │   └── explorer/route.ts       NEW · proxy: lichess opening explorer
│       ├── chesscom/
│       │   ├── games/route.ts          NEW · proxy: pull monthly archives
│       │   └── archives/route.ts       NEW · proxy: list available months
│       └── repertoire/
│           └── share/route.ts          NEW · save/load shared tree state
├── src/components/repertoire/
│   ├── board.tsx                       NEW · the chessboard
│   ├── controls-bar.tsx                NEW · flip / clear / undo (always visible)
│   ├── moves-panel.tsx                 NEW · played-moves table
│   ├── book-panel.tsx                  NEW · lichess-DB book moves
│   ├── games-modal.tsx                 NEW · drill-in to specific games
│   ├── source-picker.tsx               NEW · which sites/usernames
│   ├── filters.tsx                     NEW · date, time-control, color, etc.
│   └── progress.tsx                    NEW · streaming ingest progress
└── src/lib/repertoire/
    ├── tree.ts                         NEW · OpeningTree data structure
    ├── ingest.ts                       NEW · fetch + parse + tree-merge
    ├── eco.ts                          NEW · ECO classification
    └── shortcuts.ts                    NEW · keyboard binding registry
```

## 3. Handle / slug system

A handle is a stable URL token for a (user, sources) combination, generated
on the server, persisted to Turso so links survive across sessions.

```
chesscope.com/repertoire/abc1234

  → in `repertoire_handles` table:
    handle:  "abc1234"
    config:  { lichess: "DrNigatu", chesscom: "DrNigatu", ... }
    created_at: ...
```

Generated via `/api/repertoire/share` (POST → 201 with handle). Handles
are 7-char base62, content-hashed from the config blob, so identical
configs collapse to one URL. Pretty share links.

Schema addition (`src/lib/schema.ts`):

```ts
export const repertoireHandles = sqliteTable("repertoire_handles", {
  handle: text("handle").primaryKey(),       // 7-char base62
  config: text("config").notNull(),          // JSON blob
  hits: integer("hits").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});
```

No row required for a one-shot view: clients can also use a query-string-only URL
(`/repertoire?lichess=X&chesscom=Y`). Handles are an opt-in convenience.

## 4. Layout and visual design

### Desktop (≥ 1024px)

```
┌─────────────────────────────────────────────────────────────────┐
│ Header (existing)                                               │
├──────────────────────────────────┬──────────────────────────────┤
│                                  │                              │
│   CONFIGURATION (sticky left)    │   BOARD (right)              │
│   ┌─ Source picker ─────────┐    │   ┌────────────────────┐     │
│   │ ☑ Lichess  [DrNigatu]   │    │   │   Chess board      │     │
│   │ ☑ Chess.com [DrNigatu]  │    │   │   (chess.com green)│     │
│   └─────────────────────────┘    │   └────────────────────┘     │
│                                  │   ┌─ Controls bar ─────┐     │
│   ┌─ Filters ──────────────┐     │   │ ⟲  ↶  ↷  ⇄  ✕      │     │
│   │ Color: ● White ○ Black │     │   │ flip undo redo     │     │
│   │ Time control: …        │     │   │ swap clear         │     │
│   │ Date range: …          │     │   └────────────────────┘     │
│   │ Min ply / Min games: … │     │                              │
│   └────────────────────────┘     │   ┌─ Played moves table ┐    │
│                                  │   │ Move | %  | W/D/L  │    │
│   [ Build / Update tree ]        │   │ e4   | 62 | 100/40 │    │
│                                  │   │ d4   | 28 |  45/22 │    │
│   ┌─ Progress ─────────────┐     │   │ ...                │    │
│   │ ●●●●●●○○○○ 3,182 games │     │   └────────────────────┘    │
│   │ lichess: 2,011         │     │                              │
│   │ chess.com: 1,171       │     │   ┌─ Book moves (Lichess DB)┐│
│   └────────────────────────┘     │   │ Most popular at this FEN ││
│                                  │   └────────────────────────┘ │
│                                  │                              │
└──────────────────────────────────┴──────────────────────────────┘
        col-span: 4                          col-span: 8
```

### Mobile (< 1024px)

Board on top, controls bar directly below it (still always visible).
Configuration collapses into a slide-down drawer triggered by a settings
icon; filters stack vertically inside the drawer. The moves and book
panels become sibling sections below the board, scrollable.

### Color palette

The user asked for a chess.com tone. Add to `tailwind.config.ts`:

```ts
chess: {
  // chess.com classic green board
  light: "#eeeed2",          // light squares
  dark: "#769656",           // dark squares
  // accents from the chess.com palette
  highlight: "#f7ec74",      // last-move yellow
  selected: "#bbcb44",       // selected square green-yellow
  arrow: "rgba(255,170,0,.8)", // arrow color
},
```

Keep the chesscope ink/parchment/brass shell from the homepage; **only the
board surface and its overlays** get the green palette. The contrast
between the parchment chrome and the green board is the visual anchor of
the feature page.

## 5. Chess board library

**Use [`react-chessboard`](https://github.com/Clariity/react-chessboard) v4+.**
Why this and not the alternatives:

| Library | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **react-chessboard** | Active (v4 in 2024), React 18+, custom colors trivial, good drag/drop | Larger than chessground | ✅ Use this |
| react-chessground | What openingtree used | Dead, React 16 era, awkward to theme | ❌ |
| chessground (lichess) | Best perf, used by Lichess | Not React-native; you wrap it yourself | Optional fallback |
| @react-chess/chessboard | Minimal | Sparse maintenance | ❌ |

Pair with **`chess.js` 1.x** (current API; the `0.12` in the original is
pre-rewrite and has a different surface). For the FEN parsing on hot paths
inside the tree, you may also want `chessops` (lichess's lib) — much
faster than chess.js for batch operations. Use chessops in `lib/repertoire/tree.ts`,
chess.js for the interactive board.

Install:

```bash
npm i react-chessboard chess.js chessops
```

## 6. Always-visible controls bar

The original buried `flip board`, `reset position`, and `clear games` inside
modals and tab switches. **Surface them as a permanent strip below the
board.** Each button has a keyboard shortcut shown in its tooltip on hover.

Buttons, left to right:

| Icon | Action | Shortcut | Notes |
| --- | --- | --- | --- |
| ⟲ | Flip board | `f` | Swap orientation |
| ↶ | Undo move | `←` | Pop one move from the position |
| ↷ | Redo move | `→` | Step forward in history |
| ⇤ | Jump to start | `↑` | Reset to starting position |
| ⇥ | Jump to end | `↓` | Last move in current line |
| ⇄ | Switch color | `c` | Show repertoire from other color |
| 🗒 | Copy FEN | `shift+f` | Clipboard write |
| 🔗 | Copy share link | `shift+l` | Generates a handle if needed |
| ✕ | Clear games | `⌘⇧⌫` | With "are you sure?" toast |

Render as a single `<ControlsBar>` component; don't split into two rows on
mobile, but allow horizontal scroll if cramped (the original wrapped, which
caused the buttons to jump around as the panel grew).

## 7. Keyboard shortcuts

Implemented as a small registry in `src/lib/repertoire/shortcuts.ts`:

```ts
type Binding = {
  keys: string;            // "f", "shift+f", "ctrl+shift+backspace"
  description: string;
  action: () => void;
};
```

Display the cheatsheet on `?` (question mark) in a modal — chess.com
convention. Cheatsheet pulls directly from the registry so it stays in
sync as bindings evolve.

## 8. Combined Lichess + Chess.com ingest

The headline feature. The original used per-source iterators that were
called sequentially when you switched the source picker. **Chesscope runs
them in parallel and merges into one tree.**

### Backend proxy endpoints

All third-party API calls go through chesscope's backend, never the
browser. Same pattern chesspulse uses. Reasons:

1. **CORS.** Lichess's NDJSON streaming endpoint sends CORS headers, but
   Chess.com's monthly archive endpoints do not — the browser can't fetch
   them directly without a proxy.
2. **Rate limiting.** We can apply a per-IP budget at the edge, preventing
   any one user from getting chesscope's IP banned by either service.
3. **Caching.** Most user lookups repeat (Magnus, Hikaru, etc.). Cache the
   PGN streams in R2 with a short TTL and 90% of requests skip the
   upstream entirely.
4. **Auth.** If we add Lichess OAuth later (for private games), the token
   stays server-side.

### `/api/lichess/games` — sketch

```ts
// src/app/api/lichess/games/route.ts
export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const params = lichessQuerySchema.parse({
    user: u.searchParams.get("user"),
    color: u.searchParams.get("color") ?? undefined,
    since: u.searchParams.get("since") ?? undefined,
    until: u.searchParams.get("until") ?? undefined,
    perfType: u.searchParams.get("perfType") ?? undefined,
    rated: u.searchParams.get("rated") ?? undefined,
  });

  const upstream = new URL(`https://lichess.org/api/games/user/${params.user}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v && k !== "user") upstream.searchParams.set(k, v);
  });

  const upstreamRes = await fetch(upstream, {
    headers: {
      Accept: "application/x-chess-pgn",
      "User-Agent": "chesscope.com/1.0 (contact: support@chesscope.com)",
    },
  });

  if (!upstreamRes.ok) {
    return NextResponse.json(
      { error: `Lichess returned ${upstreamRes.status}` },
      { status: upstreamRes.status === 404 ? 404 : 502 }
    );
  }

  return new Response(upstreamRes.body, {
    headers: {
      "Content-Type": "application/x-chess-pgn",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}
```

### `/api/chesscom/games` — sketch

Chess.com's API doesn't have a single endpoint for "all of a user's games",
but it exposes monthly archives. Two-step:

1. `GET /api/chesscom/archives?user=X` → list of YYYY-MM months
2. `GET /api/chesscom/games?user=X&month=YYYY-MM` → PGN stream for that month

Browser fetches the archive list, then opens N parallel streams (one per
month, capped at 6 concurrent). Aggregate progress on the client side.

### `/api/lichess/explorer` — opening database proxy

This is the chesspulse-style hidden database access. Lichess has a public
opening explorer endpoint (`https://explorer.lichess.ovh/lichess`,
`/masters`, `/player`). We proxy it to:

- Avoid CORS / make caching easy
- Serve a unified shape regardless of which book they're querying
- Fall back gracefully when the upstream is down

```ts
// /api/lichess/explorer?fen=...&book=masters|lichess|player&speeds=blitz,rapid
```

Response shape — normalized so the frontend doesn't care which book:

```json
{
  "moves": [
    { "san": "e5", "white": 12340, "draws": 5210, "black": 9870, "averageRating": 1832 }
  ],
  "topGames": [
    { "id": "abc123", "white": "...", "black": "...", "year": 2024 }
  ],
  "opening": { "eco": "C20", "name": "King's Pawn Game" }
}
```

### Frontend ingestion

```ts
// src/lib/repertoire/ingest.ts
export async function* ingest(config: IngestConfig): AsyncIterable<Game> {
  const tasks: AsyncIterable<Game>[] = [];
  if (config.lichess) tasks.push(ingestLichess(config.lichess, config.filters));
  if (config.chesscom) tasks.push(ingestChesscom(config.chesscom, config.filters));
  // Round-robin merge — don't wait for one source to finish before yielding from the other.
  yield* merge(tasks);
}
```

The tree-builder reads from `ingest()` and updates the React state every
N games (e.g. 50). UI shows two source-tagged progress bars. If one source
fails, the other continues — partial trees are useful.

## 9. The opening tree data structure

Same shape as the original `OpeningGraph.js`, but typed and immutable-ish.

```ts
export type Move = {
  san: string;
  fen: string;
  count: number;
  white: number;
  draws: number;
  black: number;
  children: Map<string, Move>;
  games: GameRef[];
};

export type GameRef = {
  id: string;
  source: "lichess" | "chesscom";
  url: string;
  white: string; black: string;
  result: "1-0" | "0-1" | "1/2-1/2";
  date: string;
  whiteElo?: number; blackElo?: number;
  timeControl?: string;
};

export class OpeningTree {
  root: Move = makeRoot();

  addGame(game: ParsedGame, perspective: "white" | "black"): void { /* ... */ }
  walk(path: string[]): Move | null { /* ... */ }
  topMovesAt(path: string[], n = 10): Move[] { /* ... */ }
  toJSON(): TreeJSON { /* ... */ }
  static fromJSON(j: TreeJSON): OpeningTree { /* ... */ }
}
```

Memory matters — 100K games builds a tree with ~200K nodes. Caps:
- Each node retains at most 50 sample games (newest preferred).
- Nodes with `count < min_games` filter (default 2) are pruned at render time.

## 10. Code review of the original openingtree codebase

### High-priority issues

1. **Three competing UI libraries** — Material UI v4 + reactstrap + Bootstrap 4 (~800KB). For chesscope, stay Tailwind-only.
2. **`chess.js@0.12.0`** — predates the rewrite. Pin to `^1.0`.
3. **Cookie-based caching** — 4KB-per-domain budget, silently overflows. Use IndexedDB + Turso.
4. **`PGNParser.js` is 1944 lines** of hand-written PEG parser. Replace with `chess.js` built-in PGN parsing or `@mliebelt/pgn-parser`.
5. **No streaming progress** — UI waits for all games. Stream as you ingest.
6. **Class components with manual `addStateManagement(this)`** — convert to function components with `useReducer` + Zustand.

### Medium-priority

7. **`worker-plugin`** → native `new Worker(new URL(...), { type: "module" })`.
8. **OAuth login dedicated Worker** — adopt the pattern *if* we add OAuth, not in V1.
9. **`react-faq-component`, `react-step-progress-bar`, `react-select-search`, `material-ui-dropzone`** — replace with native/custom.
10. **Selenium tests** — replace with Playwright if needed.
11. **Custom webpack config (forked CRA)** — Next.js handles all this.
12. **No type checking** — migrate data-shape code to TypeScript.

### Worth keeping

13. **The iterator pattern** — adopt for `LichessIngester`, `ChesscomIngester`, eventual `TwicIngester`.
14. **Advanced filter shape** — color, time control, date range, ELO range, opponent.
15. **Auto-shape arrows on the board** showing top moves — preserve via `react-chessboard`'s `customArrows`.
16. **The "Notable Players" iterator** — chesscope can do similar with seeded examples.

### Drop entirely

- Material UI snackbars → Sonner or a 30-line toast.
- `react-ga` → Cloudflare Web Analytics.
- Cookie-consent and dark-mode toggle — dark is the default; no light mode.

## 11. Backend design specifics

### Rate limiting

| Endpoint | Budget |
| --- | --- |
| `/api/lichess/games` | 10 req/min/IP, 100 req/hour/IP |
| `/api/chesscom/games` | 20 req/min/IP, 500 req/hour/IP |
| `/api/lichess/explorer` | 60 req/min/IP |
| `/api/repertoire/share` | 5 POST/hour/IP |

### Caching

| Layer | What | TTL |
| --- | --- | --- |
| Cloudflare edge | `/api/lichess/explorer` responses by FEN | 24h, swr 7d |
| R2 | Raw PGN streams by (source, user, month) | 1h, swr 24h |
| Browser | IndexedDB cache of last fetched tree per handle | until manual clear |

### Lichess User-Agent

```
chesscope.com/1.0 (+https://chesscope.com; contact: support@chesscope.com)
```

## 12. Build order

1. **Layout shell.** Two-column desktop, stacked mobile. Static board placeholder, controls bar, no logic.
2. **Source picker + filters.** Form state in URL query string.
3. **Lichess ingest only.** `/api/lichess/games` proxy, streaming parse, tree renders.
4. **Chess.com ingest.** Combined tree.
5. **Lichess explorer integration.** Book moves panel.
6. **Keyboard shortcuts.** Registry + `?` cheatsheet.
7. **Handles + sharing.** `/api/repertoire/share`, `repertoire_handles` table.
8. **Tree caching.** IndexedDB + R2.
8.5 **Stockfish.wasm engine panel.** (See §13.6.)
9. **Polish.** Auto-shape arrows, ECO panel, frequent opponents, PGN export.

## 13. Open questions

(Answered in §13.5 below.)

## 13.5 — Confirmed scope decisions

| Question | Decision |
| --- | --- |
| Require login (Lichess OAuth) | **No** |
| Keep PGN file upload | **Yes (V1)** |
| Save/load tree to/from local file | **Yes (V1)** |
| Variant support | **No** |
| Engine integration (Stockfish.wasm) | **Yes** |
| Public directory of popular trees | **No** |

### Sources deferred to V2/V3 (do NOT implement in V1)

These openingtree sources were considered and explicitly punted by the user
on 2026-04-26 — keep them out of V1 unless the user revisits:

- **Lichess tournaments / broadcasts** — would reuse the existing chesscope
  broadcast index, but adds UX surface. V2/V3.
- **Sharable URL handles** (`/repertoire/[handle]`) — needs Turso schema +
  share-link generation. V2/V3.
- **Notable chess players / events** — curated JSON lists in repo. V3.

The Lichess Opening Explorer at `https://explorer.lichess.ovh/` is public
and unauthenticated. The proxy at `/api/lichess/explorer` is for caching
and CORS hygiene, **not** auth. OAuth would actually hurt V1: per-user
authenticated requests skip the edge cache.

## 13.6 — Stockfish.wasm integration

Engine analysis runs **client-side** via `lila-stockfish-web`.

### COOP/COEP headers — critical

Multi-threaded WASM needs SharedArrayBuffer, gated behind two response headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Set these **only on `/repertoire` and `/repertoire/[handle]` routes**, not site-wide. Configure in `next.config.ts`:

```ts
async headers() {
  return [{
    source: "/repertoire/:path*",
    headers: [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
    ],
  }];
}
```

### SAB fallback

```ts
const hasSAB = typeof SharedArrayBuffer !== "undefined";
const engineUrl = hasSAB
  ? "/stockfish/stockfish-nnue-16.js"
  : "/stockfish/stockfish-nnue-16-single.js";
```

### Engine UI

Engine **off by default**. Toggle via `e` key. Multi-PV slider, threads slider (default 1). Pause on `document.visibilityState === "hidden"`. Cloud eval option (Lichess `/api/cloud-eval`) is V2; surface the toggle in V1 but mark "coming soon".

## 14. Naming and copy

- **Feature name:** Repertoire Explorer.
- **Verb:** "Build" your repertoire.
- **Hero:** "See any player's full opening repertoire — Lichess and Chess.com in one tree."
- **Empty state:** "Type a username to begin" with starting position at 30% opacity behind it.
- **Source labels:** plain text "Lichess" and "Chess.com" (no logos in V1; trademark).
- **Progress copy:** "Walking 3,182 games · 47% from lichess".

---

## TL;DR

Build a per-player opening explorer at `/repertoire` that fetches from
Lichess **and** Chess.com **simultaneously** through chesscope's own
backend proxies. Two-column layout (config left, board right) on desktop,
stacked on mobile. Use **react-chessboard** with chess.com green tones.
Surface flip/clear/undo as a permanent controls bar with keyboard
shortcuts (`f`, `←/→`, `c`, `?` for help). Add a Lichess opening explorer
proxy at `/api/lichess/explorer` for the book-moves panel.

Build order in §12. Start with §12 step 1 (layout shell with placeholder
board) — small, visible, lets the user react before any heavy ingest plumbing.
