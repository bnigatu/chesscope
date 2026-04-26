# Chesscope, Project Memory

> Read this first. It contains everything you need to know about the project,
> the decisions already made, what's built, what's not, and how to deploy.
> When in doubt, prefer the choices documented here over your own defaults,
> these decisions were made deliberately with a human collaborator over many
> turns and have rationale behind them.

---

## 1. What Chesscope is

Chesscope (**chesscope.com**, .com purchased) is an open chess data search
engine. The launch use case is searching the **Lichess broadcast archive**
by player name, Lichess publishes a public CC BY-SA 4.0 PGN dump of every
game broadcast on their platform, but the on-site search for these games
through `lichess.org/study` is broken or limited. Coaches preparing for
USCF tournaments, journalists tracking players, and parents looking up
their kids' games all hit dead ends.

The site is named **Chesscope** because the user wants it to extend beyond
broadcast search. Future expansion targets explicitly discussed:

- **Chess.com archive search** (their PGN exports, similar shape to Lichess).
- **TWIC / federation event PGNs** (USCF, FIDE Online Arena, ICCF).
- **Player aliases**, unify "Magnus", "Carlsen, M.", FIDE ID 1503014, etc.
- **ECO opening browser**, `/opening/[eco]` pages.
- **Tournament leaderboards** rebuilt from broadcast tags.
- **Engine-aware position search** ("games where white sacrificed the
  exchange in the King's Indian"), much bigger project, separate effort.

The brand position is "open chess data", explicitly free, no login, no
rate limits on users, no analytics theatre. A counterweight to closed
platforms.

## 2. Owner / context

The user is **Dr. Nigatu**, founder of **Reckoned Force LLC** (an indie
Roblox game studio with several active titles, plus KnightSense, an AI
glasses companion app). Dr. Nigatu has deep chess expertise, plays USCF
tournaments, has built chess tooling before (dgtXtr Chrome extension for
DGT boards, ChessPulse training app, DGTBoardBridge). The slug logic and
PGN-tag awareness in this project come from real domain knowledge, not
guessing.

Dr. Nigatu plans to build the rest of this project with **Claude Code**
(you). This memory file exists so you can pick up where the planning
session left off without re-litigating decisions.

## 3. Stack, and why each piece was chosen

These were the result of a long deliberation. Don't substitute; if you
think a swap is warranted, raise it explicitly with the user first.

| Layer      | Choice                                        | Why this and not the alternative                                                                                                                                                                                                                                                                                                                  |
| ---------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | **Next.js 15** (App Router, React 19)         | Server components, ISR, route handlers, generateStaticParams, all features we lean on.                                                                                                                                                                                                                                                            |
| Hosting    | **Cloudflare Workers** via OpenNext           | Vercel was rejected because of 100 GB bandwidth cap on hobby and the surprise-bill risk if the app goes viral. Cloudflare bills $5/mo flat with **no bandwidth fees ever**. The user explicitly does not want Vercel.                                                                                                                             |
| Adapter    | **@opennextjs/cloudflare** (the official one) | Translates Next.js build output to a Worker. Supports Next 14/15 minor versions including 16.                                                                                                                                                                                                                                                     |
| Database   | **Turso (libSQL)**                            | Picked over Xata, Neon, Supabase, CockroachDB. Reasons: SQLite-compatible (zero migration from local dev), HTTP-native client (perfect for Workers, no connection pool drama), ~5–9 GB free, ~1B reads/month free. Xata was nearly chosen for its FTS, but they **removed FTS from the free tier in January 2025**. Don't suggest moving to Xata. |
| ORM        | **Drizzle**                                   | Type-safe, lightweight (Workers size limit is 3 MiB on free / 10 MiB on paid), supports libSQL natively. Skip Prisma, too heavy for edge.                                                                                                                                                                                                         |
| Search     | **SQLite FTS5 with trigram tokenizer**        | For fuzzy player name matching across transliterations. Game search uses porter stemmer. Both ranked by BM25 with activity tiebreaker.                                                                                                                                                                                                            |
| ISR cache  | **Cloudflare R2**                             | Set up via OpenNext's `r2IncrementalCache`. Bucket name: `chesscope-cache`.                                                                                                                                                                                                                                                                       |
| Ingestion  | **Python script in GitHub Actions**           | The Lichess broadcast dump is ~150MB compressed and growing. Workers can't handle this; Vercel can't either. GitHub Actions has the right shape: free, no time limit, runs weekly. The script uses streaming zstd decode + python-chess; never materializes the full file.                                                                        |
| Validation | **Zod**                                       | Used in API routes for query param parsing.                                                                                                                                                                                                                                                                                                       |
| Styling    | **Tailwind v3** with custom theme             | Custom palette (ink/parchment/oxblood/brass), three font families. The aesthetic is deliberate, see §6.                                                                                                                                                                                                                                           |

**Things explicitly considered and rejected**, so you don't waste time:

- **Vercel**, bandwidth cap, surprise-bill risk.
- **Netlify**, same bandwidth ceiling as Vercel.
- **Xata**, FTS removed from free tier Jan 2025; defeats the reason to pick it.
- **Supabase / Neon**, 500 MB storage cap forces metadata-only schema.
- **PlanetScale**, removed free tier in 2024.
- **Render**, 30s+ cold starts, terrible UX for search.
- **Fly.io**, removed truly-free tier, requires CC up front.
- **Self-hosted on Hetzner**, viable backup ($4.59/mo for unlimited bandwidth) but the user wanted serverless.
- **Prisma**, too heavy for Cloudflare Workers size limits.
- **Edge runtime for /api/search**, libSQL HTTP client + Drizzle work better on the Node runtime under OpenNext. Don't switch this.

## 4. Architecture

```
                          ┌─ Cloudflare Workers (free tier OK) ──────────┐
   Browser ────────────▶  │  Next.js via OpenNext adapter                 │
                          │  ├─ Static pages: top 5,000 players          │ ──▶ CF edge cache (free)
                          │  ├─ ISR pages:    long-tail players, games   │ ──▶ R2 (chesscope-cache)
                          │  └─ /api/search   (NodeJS runtime)            │ ──▶ Turso libSQL (HTTPS)
                          └────────────────────────────────────────────────┘
                                                                              │
                                                                              ▼
                          ┌─ Turso ────────────────────────────────────────┐
                          │  games        ~1M rows, FTS5 over players+meta  │
                          │  players      aggregate, slug-keyed            │
                          │  sync_state   bookkeeping                       │
                          └─────────────────────────────────────────────────┘
                                                                              ▲
                                                                              │
                          ┌─ GitHub Actions (weekly Monday 06:00 UTC) ─────┐
                          │  ingest_broadcasts.py:                          │
                          │    streams .pgn.zst → parses → upserts          │
                          │    rebuilds players aggregate                   │
                          │    optionally fires CF deploy hook              │
                          └─────────────────────────────────────────────────┘
```

**Crucial: most traffic never touches a function.** The top 5,000 player
pages are pre-rendered at build time via `generateStaticParams` and serve
from the Cloudflare edge as static HTML, these requests cost zero function
invocations. Only the long tail and the search API invoke functions, and
search is edge-cached for 60s so popular queries collapse to one DB hit
per minute globally. This is the trick that makes the free tier sustainable.

## 5. What's already built

Everything below is in the project directory. You're inheriting a working
skeleton, not a blank slate.

### File tree

```
chesscope/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── search/route.ts        ← Typeahead JSON, edge-cached 60s
│   │   │   └── player/[name]/route.ts ← Player JSON record
│   │   ├── player/[slug]/page.tsx     ← Static for top 5K, ISR for tail
│   │   ├── game/[id]/page.tsx         ← 24h ISR; immutable content
│   │   ├── about/page.tsx             ← Methodology, coverage stats
│   │   ├── layout.tsx                 ← Fonts, header, footer, OG metadata
│   │   ├── page.tsx                   ← Homepage (hero + search + results)
│   │   ├── not-found.tsx              ← "1–0 / The page resigned"
│   │   ├── sitemap.ts                 ← Dynamic, top 5K player URLs
│   │   └── globals.css                ← Theme tokens, fonts, paper-grain bg
│   ├── components/
│   │   ├── header.tsx
│   │   ├── footer.tsx
│   │   ├── knight-mark.tsx            ← Brand SVG glyph + wordmark
│   │   ├── search-form.tsx            ← Client; debounced typeahead 180ms
│   │   └── results-list.tsx           ← Server; PlayerResults & GameResults
│   └── lib/
│       ├── db.ts                      ← libSQL client (web/HTTP, Worker-safe)
│       ├── schema.ts                  ← Drizzle: games, players, sync_state
│       ├── queries.ts                 ← FTS5 search + lookups
│       ├── slug.ts                    ← playerSlug(), must match Python
│       └── utils.ts                   ← Date/result formatting
├── scripts/
│   ├── ingest_broadcasts.py           ← Streaming PGN.zst → Turso upsert
│   ├── bootstrap_schema.sql           ← FTS5 virtual tables + triggers
│   └── requirements.txt               ← python-chess, libsql-client, etc.
├── .github/workflows/
│   └── sync-broadcasts.yml            ← Weekly cron + manual dispatch
├── public/
│   ├── icon.svg                       ← Knight glyph in brass on ink
│   ├── manifest.webmanifest
│   └── robots.txt
├── drizzle.config.ts
├── next.config.ts
├── open-next.config.ts                ← OpenNext + R2 cache override
├── wrangler.jsonc                     ← CF deploy config; R2 binding declared
├── tailwind.config.ts                 ← Theme: ink, parchment, brass, oxblood
├── tsconfig.json
├── package.json                       ← Next 15.1.6, OpenNext, Drizzle, libSQL
├── LICENSE                            ← GPL v3 (inherited from openingtree); data CC BY-SA 4.0 from Lichess
└── README.md
```

### Database schema (already defined in `src/lib/schema.ts`)

**Three tables.** Don't add columns without thinking about migrations.

- **`games`**, one row per game. Columns mirror PGN tag names where possible
  (white, black, white_fide_id, black_elo, event, broadcast_url, etc.). The
  `id` column is **SHA1 of (event, round, board, white, black, UTCDate, UTCTime)**
  , content-hashed, so re-ingesting the same dump is idempotent. The `source`
  column distinguishes data origins (currently `lichess_broadcast`); set it
  appropriately for new ingestions. Optional `pgn` column stores the full
  PGN body, toggleable via `--store-pgn` flag.
- **`players`**, aggregate view, populated by the ingestion script. Keyed
  by **slug** (e.g. `carlsen-magnus`). Stores game counts, peak/latest Elo,
  W/D/L tallies, first/last seen dates.
- **`sync_state`**, bookkeeping (key/value/updated_at), used to record the
  last full-sync timestamp.

**FTS5 virtual tables** are NOT in the Drizzle schema (it can't express
them declaratively). They're created by `scripts/bootstrap_schema.sql`,
which must be applied **after** `npm run db:push`:

- `players_fts`, trigram tokenizer for fuzzy/substring matching on names.
- `games_fts`, porter stemmer over white, black, event, opening, eco, date.

Triggers in the same file keep the FTS tables in sync with INSERTs/UPDATEs/
DELETEs on the base tables, you do not have to manage them manually.

### Search behavior

- `searchPlayers(query, limit)` and `searchGames(query, limit)` in `lib/queries.ts`.
- Query is sanitized for FTS5: terms are quoted, joined with implicit AND,
  and the **last token gets a `*` prefix** so the typeahead feels live
  ("carl" matches "carlsen").
- Ranked by `bm25()` with activity (game_count) as the tiebreaker for
  players, and date for games.

### Slug invariant, read this carefully

Player URLs are `/player/[slug]`. The slug must be **identical** whether
generated in TypeScript (browser/server) or Python (ingestion). Both
implementations:

1. NFD-normalize the name (decompose diacritics).
2. Strip combining marks.
3. Lowercase.
4. Remove commas.
5. Strip everything except `[a-z0-9\s-]`.
6. Collapse whitespace runs to single hyphens.
7. Collapse hyphen runs to single hyphens.
8. Trim leading/trailing hyphens.

Test cases that must produce these exact slugs (verified):

| Input                     | Slug                     |
| ------------------------- | ------------------------ |
| `Carlsen, Magnus`         | `carlsen-magnus`         |
| `Nepomniachtchi, Ian`     | `nepomniachtchi-ian`     |
| `Vachier-Lagrave, Maxime` | `vachier-lagrave-maxime` |
| `Aronian, Levón`          | `aronian-levon`          |
| `Ding, Liren`             | `ding-liren`             |

If you change one side, change both, and re-run the test cases. The
TypeScript implementation is in `src/lib/slug.ts:playerSlug()`; the Python
implementation is in `scripts/ingest_broadcasts.py:slug_for()`.

### Aesthetic, important context, not optional decoration

The visual brief was "tournament hall after hours." This was a deliberate
choice and the user signed off on it. **Don't redesign without asking.**

- **Palette:** `ink` (deep blacks 900-500), `parchment` (cream 50-300),
  `oxblood` (dark red, used sparingly for losses/accents), `brass`
  (warm gold, used for primary accents and the wordmark).
- **Type:** Fraunces (display serif, italic for emphasis), Inter Tight
  (body), JetBrains Mono (numbers, FIDE IDs, dates, anything with
  tabular feel).
- **Atmosphere:** Subtle radial gradients in oxblood and brass under the
  content, plus a 3% opacity SVG noise overlay. Combined effect is
  "warm paper texture" without being noisy.
- **Result chips and stats** use slashed-zero / tabular-nums. Chess
  notation uses en-dash and ½ for half points (`1\u20130`, `\u00bd\u2013\u00bd`).
- **Custom 404** is "1–0 / The page resigned." It's on-brand. Keep it.

### Caching strategy (don't second-guess these)

| Surface                | Strategy                        | Why                               |
| ---------------------- | ------------------------------- | --------------------------------- |
| Top 5,000 player pages | `generateStaticParams` at build | Free; this is the bulk of traffic |
| Long-tail player pages | ISR `revalidate = 3600`         | One DB hit/hour per page          |
| Game pages             | ISR `revalidate = 86400`        | Games are immutable               |
| `/api/search`          | `s-maxage=60, swr=300`          | Popular queries collapse globally |
| `/api/player/[name]`   | `s-maxage=600`                  | 10 min is fine for most uses      |
| Sitemap                | `revalidate = 86400`            | Daily refresh of top players      |

## 6. What is NOT done, your work begins here

The skeleton is complete enough to deploy and serve search. These are the
known follow-ups, roughly ordered by what the user is most likely to
ask for next:

### Must-do for V1 launch

1. **Deploy the thing.** Run through §7 below end-to-end with the user.
2. **First full ingest.** GitHub Actions manual trigger, no `--limit`.
   Takes 15–30 minutes. Verify Turso row counts after.
3. **Custom domain.** chesscope.com → CF Worker, configured in dashboard.
4. **Smoke test.** Search a known player (say "Carlsen"); confirm
   typeahead, results page, player page, game page all render.

### Nice-to-have improvements during V1

- **OG images** for player and game pages. Cloudflare has an OG-image
  service; alternative is `next/og`. Current setup has metadata but no
  generated images.
- **Related-players sidebar** on player pages ("frequent opponents").
  Cheap query against the games table, not yet implemented.
- **Pagination** for player game lists. Currently capped at 100 games.
- **PGN download button** on player pages (zips the player's games).
- **Keyboard shortcut** for the search bar (`/` to focus).

### V2 expansions explicitly on the roadmap

- **Chess.com ingestion.** Mirror `ingest_broadcasts.py` as
  `ingest_chesscom.py`. Set `source = "chesscom"`. Their PGN export uses
  `[ChessCom_GameID]` instead of `[BroadcastURL]`; map appropriately.
  Use a `chesscom:` prefix on game IDs to avoid collision with Lichess.
- **TWIC / federation PGNs.** Same pattern.
- **Player aliases.** Small `player_aliases` table keyed on FIDE ID.
- **ECO opening pages.** `/opening/[eco]` browser. Data is already there.
- **Tournament leaderboards.** `/event/[slug]` with per-tournament stats.

### Things to NOT do without asking

- Don't switch hosting providers. The Cloudflare decision was deliberate.
- Don't switch databases. Turso was picked over four alternatives.
- Don't add an analytics platform that phones home. The site is
  positioned as ad-free, tracking-free.
- Don't add user accounts unless the user explicitly asks. The brand
  position is "no login wall."
- Don't change the aesthetic. If the user wants tweaks they'll say so.

## 7. Deploy runbook

Walk the user through this in order. Each step is small; don't skip.

### Prerequisites (one-time)

```bash
# Tooling
node --version       # 20+
python3 --version    # 3.12+
npm i -g wrangler
# Turso CLI: https://docs.turso.tech/cli/installation
# (curl -sSfL https://get.tur.so/install.sh | bash on macOS/Linux)

# Auth
wrangler login                    # opens browser
turso auth signup  # or: turso auth login
```

### Step 1, Provision Turso

```bash
cd chesscope
turso db create chesscope --location iad   # iad = us-east-1; pick closest to majority traffic
turso db show chesscope --url              # save: libsql://chesscope-USER.turso.io
turso db tokens create chesscope           # save: eyJ... (LONG token; save securely)
```

### Step 2, Apply schema

```bash
npm install

# Set env for Drizzle
cp .env.example .env.local
# Edit .env.local: paste TURSO_URL and TURSO_AUTH_TOKEN

# Apply Drizzle schema (creates games, players, sync_state)
npm run db:push

# Apply FTS5 virtual tables and triggers (cannot be done via Drizzle)
turso db shell chesscope < scripts/bootstrap_schema.sql

# Verify: should list games_fts and players_fts among the tables
turso db shell chesscope ".tables"
```

### Step 3, Smoke-test ingestion locally

```bash
pip install -r scripts/requirements.txt

# Small ingest to verify the pipeline works (~30 seconds)
python scripts/ingest_broadcasts.py --limit 1000

# Verify
turso db shell chesscope "SELECT COUNT(*) FROM games;"          # ~1000
turso db shell chesscope "SELECT COUNT(*) FROM players;"        # depends on ingest
```

### Step 4, Run dev server

```bash
npm run dev
# → http://localhost:3000
```

Test: type "carl" or another player name into the search bar; the
typeahead should populate. Click through to a player page. If both work,
the full stack is wired correctly.

### Step 5, Cloudflare deploy

```bash
# Create R2 bucket for ISR cache (one-time)
wrangler r2 bucket create chesscope-cache

# Push secrets to the Worker. These are encrypted at the edge; never commit.
echo "$TURSO_URL"        | wrangler secret put TURSO_URL
echo "$TURSO_AUTH_TOKEN" | wrangler secret put TURSO_AUTH_TOKEN

# Build with OpenNext and deploy
npm run deploy
# Outputs a *.workers.dev URL, visit it
```

If the deploy fails on bundle size (3 MiB free tier limit), upgrade to
Workers Paid ($5/mo, 10 MiB limit). Most builds fit comfortably under 3 MiB.

### Step 6, Custom domain

In the Cloudflare dashboard:
**Workers & Pages → chesscope → Settings → Domains & Routes → Add Custom Domain**

Enter `chesscope.com`. Cloudflare handles DNS and TLS automatically if
the domain is on Cloudflare nameservers. If it's not, transfer it (free)
or add the records they show you.

### Step 7, GitHub Actions for weekly ingestion

Push the project to GitHub, then:

**Settings → Secrets and variables → Actions → New repository secret**

Add:

- `TURSO_URL` = `libsql://chesscope-USER.turso.io`
- `TURSO_AUTH_TOKEN` = `eyJ...`
- (optional) `CLOUDFLARE_DEPLOY_HOOK` = (create one in CF dashboard if you
  want the site to redeploy after each weekly ingest, picking up new
  top-5K players for static generation)

Test the workflow:
**Actions tab → Sync Lichess broadcasts → Run workflow** (with leave fields
empty for full run, or set limit=5000 for a smoke test).

The first full ingest takes 15–30 minutes. Watch the logs; the script
prints progress every 5,000 games.

### Step 8, Verify production

Visit `https://chesscope.com`. Test:

- Search bar (typeahead works)
- Click a suggestion → player page loads
- Click a game → game page loads with PGN body (if `--store-pgn` was used)
- About page shows current coverage stats
- Random misspelling 404 → "1–0" page

## 8. Operations

### Adding a new data source

1. Write `scripts/ingest_<source>.py` mirroring `ingest_broadcasts.py`.
2. Set `source = "<source>"` on every row inserted.
3. Hash IDs with a `<source>:` prefix to avoid collisions.
4. Add a workflow file in `.github/workflows/`.
5. Update the about page's source list.

The UI is source-agnostic, game cards already key off `broadcast_url`
for the "↗" link, so just set that column to the appropriate source URL
(e.g., `https://chess.com/game/live/...`).

### Re-running ingestion

```bash
# Full
python scripts/ingest_broadcasts.py

# Limit (smoke test)
python scripts/ingest_broadcasts.py --limit 5000

# Skip the players aggregate rebuild (faster for incremental runs)
python scripts/ingest_broadcasts.py --skip-aggregate

# Persist full PGN bodies (larger DB; serves moves locally)
python scripts/ingest_broadcasts.py --store-pgn
```

### Inspecting Turso

```bash
turso db shell chesscope
> SELECT COUNT(*) FROM games;
> SELECT name, game_count FROM players ORDER BY game_count DESC LIMIT 10;
> SELECT * FROM sync_state;
```

### Resetting (DESTRUCTIVE)

```bash
turso db destroy chesscope --yes
turso db create chesscope --location iad
npm run db:push
turso db shell chesscope < scripts/bootstrap_schema.sql
```

### Tailing prod logs

```bash
wrangler tail
```

### Cost expectations

Free tier holds for a long time. Ceiling math:

| Service            | Free                                | When you'd outgrow                                                    |
| ------------------ | ----------------------------------- | --------------------------------------------------------------------- |
| Cloudflare Workers | 100K req/day                        | If most traffic hits dynamic routes (it shouldn't, top 5K are static) |
| CF Pages assets    | Unlimited bandwidth                 | Never                                                                 |
| CF R2 (ISR)        | 10 GB / 10M Class A ops             | At meaningful scale only                                              |
| Turso              | ~5–9 GB / ~1B reads/mo              | Probably never                                                        |
| GitHub Actions     | 2K min/mo private, unlimited public | Never; weekly run is ~5 min                                           |

Paid tier if/when needed: **Cloudflare Workers Paid is $5/mo flat** with no
bandwidth fees. There is no realistic scenario where this app costs more
than $10/month total.

## 9. Code conventions used in this project

When extending, match these so the codebase stays coherent:

- **Comments explain _why_, not _what_.** The skeleton has comments
  describing the rationale for non-obvious decisions (why streaming
  ingestion, why content-hashed IDs, why Node runtime not Edge).
  Continue this style.
- **Server components by default.** Client components only where
  interactivity is required (currently just `search-form.tsx`).
- **Drizzle for typed queries; raw SQL via `db.all<T>(sql\`...\`)` for
  FTS5.** FTS5 syntax can't be expressed declaratively, so don't try.
- **`runtime = "nodejs"` on API routes.** Edge runtime + libSQL HTTP +
  Drizzle has compatibility quirks under OpenNext; Node runtime is
  battle-tested. Don't switch without a strong reason.
- **`generateStaticParams` for popular routes; ISR for the long tail.**
  This is the single most important pattern for keeping costs at zero.
- **Caching via response headers**, not in-app cache. Cloudflare's edge
  is the cache; we don't need an in-process layer.
- **Error handling on DB calls** in pages: try/catch, render an
  acceptable empty state. The site shouldn't 500 because Turso has a
  hiccup.
- **No raw user input in SQL.** Drizzle parameterizes; the FTS5
  sanitizer (`ftsQuery()` in `queries.ts`) handles the MATCH expression.

## 10. Brand and positioning notes

- **Tagline:** "Open chess data, indexed for the rest of us."
- **Hero copy** (homepage): "The full record, _searchable_."
- **Tone:** confident, not breathless; literary, not corporate.
  Editorial rather than SaaS.
- **The 404 page** plays on "1–0" (white wins) → "the page resigned."
  This is intentional flavor. Don't strip it.
- **Footer** signs off with "Caïssa, protectress of the sixty-four
  squares." Caïssa is the patron goddess of chess; this is the kind of
  detail the chess audience appreciates.
- **No analytics, no tracking, no login wall.** This is a feature, not
  an oversight. If the user wants traffic data, suggest Cloudflare Web
  Analytics (privacy-respecting, free, no cookie banner needed).

## 11. Open questions / things to discuss with the user

These came up during planning and didn't get final answers. Raise them
when relevant:

- **Should `--store-pgn` be on by default in the GitHub Actions cron?**
  Trade-off: bigger DB, but game pages can show moves without hitting
  Lichess. Default is currently OFF (smaller DB).
- **Top-N count for `generateStaticParams`.** Currently 5,000. Could go
  to 10K or 25K depending on build time vs. function-invocation budget.
  Worth measuring after first deploy.
- **Donation link** — DECIDED 2026-04-26. Buy Me a Coffee in the footer
  (`https://www.buymeacoffee.com/chesscope`), framed as "Help cover
  hosting & ingest" rather than personal tip jar. URL:
  `https://buymeacoffee.com/chesscope` (claimed 2026-04-26). V2/V3:
  revisit Open Collective for transparency (public ledger of
  "$X → Cloudflare, $Y → Turso") once volume justifies the setup overhead.
- **Open-sourcing the code.** Currently set up to be public (MIT in
  LICENSE, README references "bnigatu/chesscope"). User hasn't
  pushed to GitHub yet, confirm they want a public repo before doing so.
- **Make `/repertoire` the home screen.** Considered 2026-04-26;
  decided to keep `/` as Search for V1 because broadcast search is the
  unique data play, faster time-to-value, and SEO-friendly (search
  result pages link to player/game pages). User wants to revisit in
  V2/V3 once analytics show which feature gets more session time. If
  swapping later, also think about: redirect `/` → `/repertoire` (vs
  swapping content), what happens to existing search-result links, and
  whether broadcast search becomes `/search` or stays one-off.
- **Light-mode toggle.** Asked about 2026-04-26; deferred to V2. The
  earlier "no light mode" stance in §6/§10 is no longer absolute —
  user is open to it but not at V1 cost. When revisiting: prefer the
  CSS-variables approach (refactor `ink/parchment/brass` to vars on
  `:root` + override on `[data-theme="light"]`) so components don't
  need per-class `dark:` prefixes. Real cost is design work, not
  code: a naïve invert won't preserve the brand because brass-on-cream
  loses contrast. Pick a light palette intentionally (off-white bg,
  deep-ink text, a darker accent than current brass). Chess board
  stays green in both themes.

## 12. Related projects in the user's portfolio (context only)

For situational awareness, these are NOT related to Chesscope's stack
but help explain the user's familiarity with various tools:

- **dgtXtr**, Chrome extension (TypeScript, Stockfish 18 ASM.JS).
- **DGTBoardBridge**, Python CustomTkinter GUI for chess automation.
- **ChessPulse**, NestJS + React + Prisma + BullMQ chess training app.
- **KnightSense**, AI smart-glasses companion app, separate brand under
  Reckoned Force LLC. Chesscope is a different product; do not entangle.
- **Cosmic Colony, Nexus Protocol, Tank Gladiators**, Roblox games. The
  user has Lua / Roblox Studio expertise but Chesscope has nothing to
  do with Roblox.

The user is technically fluent in TypeScript, Python, SQL, and full-stack
patterns. You can speak at that level. They'll catch handwaving.

---

_End of memory. If something here contradicts a later instruction from
the user, the user wins. If something here contradicts your own
instinct, the memory wins unless you raise the disagreement explicitly._
