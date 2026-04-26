# Chesscope

> Open chess data, indexed for the rest of us.

A search engine for the public Lichess broadcast archive, and beyond.
Built because the search you used to rely on quietly broke, and the chess
world deserves better than a missing endpoint.

**Stack:** Next.js 15 (App Router) → OpenNext Cloudflare adapter → Cloudflare
Workers · Turso (libSQL) with FTS5 trigram tokenizer · GitHub Actions for
weekly ingestion · R2 for ISR cache.

**Why this stack:** The marginal cost of one more search is essentially zero.
Cloudflare doesn't bill for bandwidth, Turso's free tier covers a billion
reads a month, and pre-rendering the top 5,000 player pages at build time
means most traffic never touches the database. The whole thing runs on free
tiers indefinitely; if it goes viral you'd pay $5–10/month at most.

---

## Architecture at a glance

```
                            ┌─ Cloudflare Workers ────────────────┐
   Browser  ──────────────▶ │  Next.js (OpenNext adapter)          │
                            │  ├─ Static pages (top 5K players)    │ ──▶ Edge cache (free)
                            │  ├─ ISR pages (long-tail players)    │ ──▶ R2 cache
                            │  └─ /api/search route (NodeJS)       │ ──▶ Turso libSQL
                            └──────────────────────────────────────┘
                                                                       │
                                                                       │ HTTP
                                                                       ▼
                            ┌─ Turso ──────────────────────────────┐
                            │  games          (1M+ rows, FTS5)     │
                            │  players        (aggregated)         │
                            │  sync_state                          │
                            └──────────────────────────────────────┘
                                                                       ▲
                                                                       │ weekly upsert
                                                                       │
                            ┌─ GitHub Actions ─────────────────────┐
                            │  Streams broadcast PGN dump from     │
                            │  database.lichess.org → upserts to   │
                            │  Turso → triggers Cloudflare deploy  │
                            └──────────────────────────────────────┘
```

---

## One-time setup

You'll do these once, then never again.

### 1. Tools you need

- Node.js 20+ and npm
- Python 3.12+ (only for local ingestion testing; CI handles production)
- A [Cloudflare account](https://dash.cloudflare.com) (free)
- A [Turso account](https://turso.tech) (free)
- A GitHub account (free)
- The Wrangler CLI: `npm i -g wrangler` then `wrangler login`
- The Turso CLI: see [docs.turso.tech/cli](https://docs.turso.tech/cli/installation)

### 2. Provision the database

```bash
# Create the database. Pick a region close to your Cloudflare deploy.
turso db create chesscope --location iad   # us-east-1

# Apply Drizzle's schema (games, players, sync_state).
npm install
npm run db:push

# Apply FTS5 virtual tables and triggers.
turso db shell chesscope < scripts/bootstrap_schema.sql

# Grab the credentials you'll need everywhere.
turso db show chesscope --url           # → libsql://chesscope-USER.turso.io
turso db tokens create chesscope        # → eyJ... (long token)
```

Save those two values; we'll set them as secrets in three places.

### 3. Local development

```bash
cp .env.example .env.local
# Paste TURSO_URL and TURSO_AUTH_TOKEN into .env.local

# Smoke-test the ingestion with 1,000 games. Takes ~30 seconds.
pip install -r scripts/requirements.txt
python scripts/ingest_broadcasts.py --limit 1000

# Run the dev server.
npm run dev
# → http://localhost:3000
```

If the homepage loads with stats and the search bar finds players, the stack
is wired correctly.

### 4. Cloudflare deploy

```bash
# Create the R2 bucket used for ISR cache (one-time).
wrangler r2 bucket create chesscope-cache

# Push secrets to the Worker, they're encrypted at the edge.
echo "$TURSO_URL" | wrangler secret put TURSO_URL
echo "$TURSO_AUTH_TOKEN" | wrangler secret put TURSO_AUTH_TOKEN

# Build with the OpenNext adapter and deploy.
npm run deploy
```

The first deploy outputs a `*.workers.dev` URL. Visit it; you should see the
homepage. If you bought `chesscope.com`, configure the custom domain in the
Cloudflare dashboard: **Workers & Pages → chesscope → Settings → Domains
& Routes → Add Custom Domain**. Cloudflare handles the DNS and TLS for you
if the domain is on Cloudflare nameservers.

### 5. GitHub Actions for weekly ingestion

```bash
# In the GitHub repo: Settings → Secrets and variables → Actions → New secret
TURSO_URL              = libsql://chesscope-USER.turso.io
TURSO_AUTH_TOKEN       = eyJ...
CLOUDFLARE_DEPLOY_HOOK = (optional; create one in CF dashboard if you want
                          re-deploys after each weekly ingest)
```

The workflow at `.github/workflows/sync-broadcasts.yml` runs Mondays at
06:00 UTC. You can also trigger it manually from the Actions tab, handy
for the first full ingest, which takes 15–30 minutes.

---

## How search works

The search bar is a `<form>` posting to `/?q=…`, so it works without
JavaScript. With JS enabled, the typeahead hits `/api/search` debounced at
180ms, gets back the top 8 player hits ranked by FTS5 BM25 with activity
as the tiebreaker.

The trigram tokenizer is what makes "Shtivelband" find "Schtivelband" and
"Carlsen, M." find "Carlsen, Magnus", important because chess names are
transliterated and abbreviated inconsistently across PGN sources.

For the global query (the URL `?q=…` form, not the typeahead), we run two
parallel queries: one against `players_fts` and one against `games_fts`,
then render both result sets. This means a search like "carlsen tata
steel" surfaces both Magnus Carlsen the player AND every Tata Steel
broadcast game.

---

## Adding new sources

The schema's `source` column is the seam. To add chess.com archives:

1. Write `scripts/ingest_chesscom.py` modeled on `ingest_broadcasts.py`.
   The differences will mostly be in the headers, chess.com PGN exports
   use `[ChessCom_GameID]` instead of `[BroadcastURL]`, etc.
2. Set `source = "chesscom"` on every row inserted.
3. Hash IDs with a `chesscom:` prefix so they can't collide with Lichess
   IDs even if the underlying tuple matches.
4. Add the workflow file alongside `sync-broadcasts.yml`.

The UI is source-agnostic, game cards already key off the `broadcast_url`
column for the "↗" link, so all you need is to set that column to the
appropriate source URL (`https://chess.com/game/live/...`).

---

## Cost expectations

Free tier limits, as of this writing:

| Service                   | Free                                       | Where you'd outgrow it                                                |
| ------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| Cloudflare Workers        | 100K requests/day                          | If most of your traffic hits dynamic routes (it shouldn't, see below) |
| Cloudflare Pages assets   | Unlimited bandwidth                        | Never                                                                 |
| Cloudflare R2 (ISR cache) | 10 GB storage, 10M Class A ops/mo          | At meaningful scale only                                              |
| Turso                     | ~5–9 GB storage, ~1B reads/month           | Probably never for this app                                           |
| GitHub Actions            | 2,000 min/mo (private), unlimited (public) | Never; we use ~5 min/week                                             |

The architecture is set up so that **most requests don't invoke a function
at all**. The top 5,000 player pages are pre-rendered at build time and
served as static HTML from Cloudflare's CDN, those requests cost zero
function invocations and zero bandwidth. ISR catches the long tail; the API
route is the only thing that always invokes a function, and it's
edge-cached for 60 seconds so popular searches collapse to one DB hit
per minute globally.

If you ever need more, the Cloudflare paid plan is $5/month flat with no
bandwidth fees ever.

---

## Project layout

```
chesscope/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── search/route.ts        # JSON typeahead endpoint
│   │   │   └── player/[name]/route.ts # JSON player record
│   │   ├── player/[slug]/page.tsx     # Statically pre-rendered for top 5K
│   │   ├── game/[id]/page.tsx         # Cached 24h
│   │   ├── about/page.tsx
│   │   ├── layout.tsx                 # Fonts, header, footer, metadata
│   │   ├── page.tsx                   # Homepage with hero + search
│   │   ├── not-found.tsx              # "1–0 / The page resigned"
│   │   ├── sitemap.ts                 # Dynamic, top 5K players
│   │   └── globals.css                # Theme tokens + atmospheric details
│   ├── components/
│   │   ├── header.tsx
│   │   ├── footer.tsx
│   │   ├── knight-mark.tsx            # SVG glyph + wordmark
│   │   ├── search-form.tsx            # Client; debounced typeahead
│   │   └── results-list.tsx           # Server; player & game tables
│   └── lib/
│       ├── db.ts                      # libSQL client (web/HTTP, Worker-compatible)
│       ├── schema.ts                  # Drizzle schema
│       ├── queries.ts                 # FTS5 search + lookups
│       ├── slug.ts                    # Player URL helpers
│       └── utils.ts                   # Date/result formatting
├── scripts/
│   ├── ingest_broadcasts.py           # Streaming PGN-zst → Turso upsert
│   ├── bootstrap_schema.sql           # FTS5 virtual tables + triggers
│   └── requirements.txt               # Python deps
├── .github/workflows/
│   └── sync-broadcasts.yml            # Weekly cron + manual trigger
├── public/
│   ├── icon.svg                       # Favicon
│   ├── manifest.webmanifest
│   └── robots.txt
├── drizzle.config.ts
├── next.config.ts
├── open-next.config.ts                # OpenNext Cloudflare adapter
├── wrangler.jsonc                     # Cloudflare deploy config
├── tailwind.config.ts                 # Theme: ink, parchment, brass, oxblood
├── tsconfig.json
├── package.json
├── LICENSE                            # GPL v3 for code; CC BY-SA 4.0 for data
└── README.md
```

---

## Operations

### Re-running ingestion manually

```bash
# Full run (production cron):
python scripts/ingest_broadcasts.py

# Limit for testing:
python scripts/ingest_broadcasts.py --limit 5000

# Skip the players-aggregate rebuild (faster for incremental runs):
python scripts/ingest_broadcasts.py --skip-aggregate

# Persist full PGN bodies (larger DB; lets you serve the moves locally):
python scripts/ingest_broadcasts.py --store-pgn
```

### Inspecting Turso

```bash
turso db shell chesscope
> SELECT COUNT(*) FROM games;
> SELECT name, game_count FROM players ORDER BY game_count DESC LIMIT 10;
> SELECT * FROM sync_state;
```

### Resetting the database

```bash
# DESTRUCTIVE, wipes everything.
turso db destroy chesscope --yes
turso db create chesscope --location iad
npm run db:push
turso db shell chesscope < scripts/bootstrap_schema.sql
```

### Tailing production logs

```bash
wrangler tail
```

---

## Roadmap

- **chess.com archive ingestion.** Same pattern, different tag conventions.
- **Federation event PGNs** (USCF, FIDE Online Arena, ICCF). Generally
  available as ZIP downloads; same upsert pipeline.
- **Player aliases.** "Magnus", "Carlsen, M.", "M Carlsen", and the FIDE
  ID 1503014 should all resolve to the same `/player/carlsen-magnus`
  page. Solvable with a small alias table keyed on FIDE ID.
- **ECO opening browser.** Already indexed; a `/opening/[eco]` page is a
  small leap from the data we have.
- **Engine-aware search** ("games where white sacrificed the exchange in
  the King's Indian"). Requires position-by-position indexing, a
  meaningfully different project, but the data exists.
- **Tournament leaderboards** rebuilt from the broadcast tags.
  Lightweight, the `event` and `result` columns are all we need.

---

## Credits

- Game data from [Lichess broadcasts](https://database.lichess.org/#broadcasts), CC BY-SA 4.0.
- Built on [Next.js](https://nextjs.org), [Turso](https://turso.tech),
  [Drizzle ORM](https://orm.drizzle.team), and the [OpenNext Cloudflare
  adapter](https://opennext.js.org/cloudflare).
- Typography: [Fraunces](https://fonts.google.com/specimen/Fraunces),
  [Inter Tight](https://fonts.google.com/specimen/Inter+Tight),
  [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono).
- Caïssa, the patron goddess of chess, gets the dedication.

## License

Code: [GPL v3](./LICENSE) — inherited from openingtree.com, whose Repertoire
Explorer architecture chesscope re-implements. Data: CC BY-SA 4.0 inherited
from the Lichess broadcast dump.
