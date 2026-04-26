"""
Chesscope broadcast ingestion.

Pulls monthly PGN dumps from database.lichess.org, parses each game, and
upserts it into Turso. Designed for a weekly GitHub Actions cron: resumable
on failure, idempotent reruns, no infinite loops on broken streams.

Architecture:

  1. DISCOVER: scrape https://database.lichess.org/ for available monthly
     broadcast dump URLs. Lichess switched from a single combined file to
     monthly files, so we don't hard-code a path.

  2. DOWNLOAD: pull each month's .pgn.zst to local disk with HTTP Range
     resume + retries with exponential backoff. SHA256 verified against
     the published checksum where available.

  3. PARSE: stream-decompress the local file and walk games.

  4. UPSERT: batch into Turso over Hrana-HTTPS (the libsql:// scheme is
     auto-rewritten to https:// — see the long comment near `turso_http_url`).

Run:
    export TURSO_URL=libsql://...
    export TURSO_AUTH_TOKEN=...
    python scripts/ingest_broadcasts.py

Useful flags:
    --month YYYY-MM    Ingest a single month only.
    --url URL          Explicit URL or local file path. Overrides --month.
    --limit N          Smoke test: stop after N games (across all months).
    --keep-cache       Don't delete the downloaded files when done.
    --skip-download    Use already-downloaded files in --cache-dir.
    --cache-dir PATH   Where to store downloads (default: ./cache).
    --no-verify        Skip SHA256 checks (test only).
    --store-pgn        Persist full PGN bodies in Turso (larger DB).
    --skip-aggregate   Skip the players-table rebuild.
    --dry-run          Parse and count, don't write to Turso.
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import io
import os
import re
import shutil
import sys
import time
import unicodedata
from pathlib import Path
from typing import Iterable, Optional

import chess.pgn
import libsql_client
import logging
import requests
import zstandard as zstd

# Lichess broadcast PGNs sometimes use "0-0" (zero-zero) for castling
# instead of the standard "O-O" (letter-O). python-chess logs each one as
# a WARNING ("illegal san: '0-0' in <fen> while parsing <Game...>"). The
# game still gets ingested with metadata + moves up to the bad SAN, so
# the warnings are noise. Mute them to keep the action log readable.
logging.getLogger("chess.pgn").setLevel(logging.ERROR)
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass
# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DUMP_INDEX_URL = "https://database.lichess.org/"
DUMP_URL_TEMPLATE = (
    "https://database.lichess.org/broadcast/lichess_db_broadcast_{month}.pgn.zst"
)
CHECKSUMS_URL = "https://database.lichess.org/broadcast/sha256sums.txt"
USER_AGENT = "chesscope-ingest/2.1 (+https://chesscope.com)"

DEFAULT_CACHE_DIR = Path("./cache")
DOWNLOAD_CHUNK_SIZE = 1 << 20      # 1 MiB
DOWNLOAD_TIMEOUT = (15, 120)        # (connect, read) seconds
DOWNLOAD_MAX_RETRIES = 8

# Turso batch sizing. Larger = fewer round-trips, but Turso enforces a
# payload size cap per transaction. 500 is empirically safe.
BATCH_SIZE = 1000
PROGRESS_EVERY = 5_000


# ---------------------------------------------------------------------------
# Phase 1: Discover available monthly dumps
# ---------------------------------------------------------------------------


_MONTH_PATTERN = re.compile(
    r"broadcast/(lichess_db_broadcast_(\d{4}-\d{2})\.pgn\.zst)"
)


def _build_session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=5,
        backoff_factor=1.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "HEAD"],
        raise_on_status=False,
    )
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.headers.update({"User-Agent": USER_AGENT})
    return s


def list_monthly_dumps(session: requests.Session) -> list[tuple[str, str]]:
    """Scrape the index page for broadcast dumps. Returns a list of
    (month, url) pairs sorted newest first."""
    resp = session.get(DUMP_INDEX_URL, timeout=30)
    resp.raise_for_status()
    months = sorted(
        {m.group(2) for m in _MONTH_PATTERN.finditer(resp.text)},
        reverse=True,
    )
    return [(m, DUMP_URL_TEMPLATE.format(month=m)) for m in months]


# ---------------------------------------------------------------------------
# Phase 2: Download with resume + retry + verify
# ---------------------------------------------------------------------------


def _format_bytes(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def _expected_size(session: requests.Session, url: str) -> Optional[int]:
    try:
        r = session.head(url, allow_redirects=True, timeout=DOWNLOAD_TIMEOUT)
        cl = r.headers.get("Content-Length")
        return int(cl) if cl else None
    except requests.RequestException:
        return None


def download_with_resume(
    session: requests.Session,
    url: str,
    dest: Path,
    *,
    max_attempts: int = DOWNLOAD_MAX_RETRIES,
) -> Path:
    """Download `url` to `dest` with HTTP Range resume on each retry. The
    point: a 150 MB download over a flaky connection mustn't restart from
    byte 0 every time."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    expected_size = _expected_size(session, url)

    if expected_size:
        print(
            f"[chesscope] target file is {_format_bytes(expected_size)}",
            file=sys.stderr,
        )

    last_err: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        already = tmp.stat().st_size if tmp.exists() else 0
        if expected_size and already >= expected_size:
            break

        headers = {}
        if already > 0:
            headers["Range"] = f"bytes={already}-"
            print(
                f"[chesscope] attempt {attempt}: resuming from "
                f"{_format_bytes(already)}",
                file=sys.stderr,
            )
        else:
            print(
                f"[chesscope] attempt {attempt}: starting fresh download",
                file=sys.stderr,
            )

        try:
            with session.get(
                url, headers=headers, stream=True, timeout=DOWNLOAD_TIMEOUT
            ) as r:
                if r.status_code == 416:
                    # Asked for bytes past EOF — partial is already complete.
                    print(
                        "[chesscope] server reports file already complete",
                        file=sys.stderr,
                    )
                    break
                if r.status_code == 200 and already > 0:
                    # Server ignored Range. Restart from 0.
                    print(
                        "[chesscope] server ignored Range; restarting",
                        file=sys.stderr,
                    )
                    tmp.unlink(missing_ok=True)
                    already = 0
                if r.status_code not in (200, 206):
                    raise requests.HTTPError(
                        f"HTTP {r.status_code} from {url}"
                    )

                mode = "ab" if already > 0 else "wb"
                start = time.time()
                bytes_this_run = 0
                last_progress = start
                with open(tmp, mode) as f:
                    for chunk in r.iter_content(DOWNLOAD_CHUNK_SIZE):
                        if not chunk:
                            continue
                        f.write(chunk)
                        bytes_this_run += len(chunk)
                        now = time.time()
                        if now - last_progress >= 5:
                            total_now = already + bytes_this_run
                            rate = bytes_this_run / max(now - start, 1)
                            pct = (
                                f" ({100 * total_now / expected_size:.1f}%)"
                                if expected_size
                                else ""
                            )
                            print(
                                f"[chesscope] {_format_bytes(total_now)}"
                                f"{pct} at {_format_bytes(rate)}/s",
                                file=sys.stderr,
                            )
                            last_progress = now

            final_size = tmp.stat().st_size
            if expected_size and final_size < expected_size:
                # Server closed mid-stream without raising. Loop and resume.
                print(
                    f"[chesscope] short read: {_format_bytes(final_size)} of "
                    f"{_format_bytes(expected_size)}; resuming",
                    file=sys.stderr,
                )
                continue
            break

        except (
            requests.exceptions.ChunkedEncodingError,
            requests.exceptions.ConnectionError,
            requests.exceptions.ReadTimeout,
            requests.exceptions.HTTPError,
            ConnectionError,
        ) as exc:
            last_err = exc
            backoff = min(60, 2 ** attempt)
            print(
                f"[chesscope] attempt {attempt} failed ({exc!r}); "
                f"retrying in {backoff}s",
                file=sys.stderr,
            )
            time.sleep(backoff)
    else:
        raise RuntimeError(
            f"download failed after {max_attempts} attempts; "
            f"last error: {last_err!r}"
        )

    tmp.rename(dest)
    print(
        f"[chesscope] downloaded {_format_bytes(dest.stat().st_size)} "
        f"-> {dest.name}",
        file=sys.stderr,
    )
    return dest


def fetch_published_checksums(session: requests.Session) -> dict[str, str]:
    """Pull the published SHA256 checksums for the broadcast dumps.
    Returns {filename: sha256-hex}. Empty on failure."""
    try:
        r = session.get(CHECKSUMS_URL, timeout=DOWNLOAD_TIMEOUT)
        r.raise_for_status()
    except requests.RequestException as exc:
        print(
            f"[chesscope] couldn't fetch checksums ({exc!r}); skipping verify",
            file=sys.stderr,
        )
        return {}

    out: dict[str, str] = {}
    for line in r.text.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            sha, filename = parts[0], parts[-1]
            out[filename.split("/")[-1]] = sha
    return out


def verify_sha256(path: Path, expected: str) -> bool:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    actual = h.hexdigest()
    if actual != expected:
        print(
            f"[chesscope] CHECKSUM MISMATCH for {path.name}\n"
            f"  expected: {expected}\n  actual:   {actual}",
            file=sys.stderr,
        )
        return False
    print(
        f"[chesscope] checksum OK ({path.name}: {actual[:16]}…)",
        file=sys.stderr,
    )
    return True


# ---------------------------------------------------------------------------
# Phase 3: Parse
# ---------------------------------------------------------------------------


@dataclasses.dataclass
class GameRow:
    id: str
    source: str
    white: str
    black: str
    white_fide_id: Optional[str]
    black_fide_id: Optional[str]
    white_elo: Optional[int]
    black_elo: Optional[int]
    white_title: Optional[str]
    black_title: Optional[str]
    event: Optional[str]
    round: Optional[str]
    board: Optional[str]
    date: Optional[str]
    timestamp: Optional[int]
    time_control: Optional[str]
    eco: Optional[str]
    opening: Optional[str]
    result: str
    ply_count: Optional[int]
    broadcast_name: Optional[str]
    broadcast_url: Optional[str]
    study_name: Optional[str]
    chapter_name: Optional[str]
    pgn: Optional[str]
    ingested_at: int


def header(game: chess.pgn.Game, key: str) -> Optional[str]:
    val = game.headers.get(key, "").strip()
    return val or None


def header_int(game: chess.pgn.Game, key: str) -> Optional[int]:
    val = header(game, key)
    if val is None:
        return None
    digits = re.sub(r"[^0-9]", "", val)
    try:
        return int(digits) if digits else None
    except ValueError:
        return None


def game_id(game: chess.pgn.Game) -> str:
    """SHA1 of the identifying tuple. Stable across reruns; collision-free
    in practice (same teams, date, round → it IS the same game)."""
    parts = [
        header(game, "Event") or "",
        header(game, "Round") or "",
        header(game, "Board") or "",
        header(game, "White") or "",
        header(game, "Black") or "",
        header(game, "UTCDate") or header(game, "Date") or "",
        header(game, "UTCTime") or "",
    ]
    raw = "|".join(parts).encode("utf-8")
    return hashlib.sha1(raw).hexdigest()


def to_unix(date_str: Optional[str], time_str: Optional[str]) -> Optional[int]:
    if not date_str:
        return None
    try:
        d = date_str.replace("??", "01")
        y, mo, da = d.split(".")
        h, mi, se = (time_str or "00:00:00").split(":")[:3]
        from datetime import datetime, timezone

        dt = datetime(
            int(y), int(mo), int(da), int(h), int(mi), int(se),
            tzinfo=timezone.utc,
        )
        return int(dt.timestamp())
    except (ValueError, AttributeError):
        return None


def extract_pgn_body(game: chess.pgn.Game) -> str:
    exporter = chess.pgn.StringExporter(
        headers=True, variations=True, comments=True
    )
    return game.accept(exporter)


def parse_game(game: chess.pgn.Game, *, store_pgn: bool) -> GameRow:
    return GameRow(
        id=game_id(game),
        source="lichess_broadcast",
        white=header(game, "White") or "?",
        black=header(game, "Black") or "?",
        white_fide_id=header(game, "WhiteFideId"),
        black_fide_id=header(game, "BlackFideId"),
        white_elo=header_int(game, "WhiteElo"),
        black_elo=header_int(game, "BlackElo"),
        white_title=header(game, "WhiteTitle"),
        black_title=header(game, "BlackTitle"),
        event=header(game, "Event") or header(game, "BroadcastName"),
        round=header(game, "Round"),
        board=header(game, "Board"),
        date=header(game, "UTCDate") or header(game, "Date"),
        timestamp=to_unix(
            header(game, "UTCDate") or header(game, "Date"),
            header(game, "UTCTime"),
        ),
        time_control=header(game, "TimeControl"),
        eco=header(game, "ECO"),
        opening=header(game, "Opening"),
        result=header(game, "Result") or "*",
        ply_count=sum(1 for _ in game.mainline_moves()) or None,
        broadcast_name=header(game, "BroadcastName"),
        broadcast_url=header(game, "BroadcastURL"),
        study_name=header(game, "StudyName"),
        chapter_name=header(game, "ChapterName"),
        pgn=extract_pgn_body(game) if store_pgn else None,
        ingested_at=int(time.time()),
    )


# Errors that mean the underlying byte stream has gone bad — break, don't
# loop. The old script swallowed these and re-tried `read_game()` forever.
FATAL_STREAM_ERRORS = (OSError, EOFError, zstd.ZstdError)


def iter_games_from_file(
    path: Path, *, store_pgn: bool, limit: Optional[int] = None
) -> Iterable[GameRow]:
    """Yield games from a local .pgn or .pgn.zst file. Bounded error
    tolerance: skip individual bad games, but bail if the underlying byte
    stream is dead."""
    if path.suffix == ".zst":
        f = open(path, "rb")
        stream: io.TextIOBase = io.TextIOWrapper(
            zstd.ZstdDecompressor().stream_reader(f),
            encoding="utf-8",
            errors="replace",
        )
    else:
        stream = open(path, "r", encoding="utf-8", errors="replace")

    seen = 0
    consecutive_failures = 0
    try:
        while True:
            try:
                game = chess.pgn.read_game(stream)
            except FATAL_STREAM_ERRORS as exc:
                print(
                    f"[chesscope] fatal stream error, stopping parse: {exc}",
                    file=sys.stderr,
                )
                return
            except Exception as exc:  # noqa: BLE001
                consecutive_failures += 1
                if consecutive_failures > 50:
                    print(
                        f"[chesscope] >50 consecutive parse errors; giving "
                        f"up. last: {exc!r}",
                        file=sys.stderr,
                    )
                    return
                continue

            if game is None:
                return  # clean EOF

            consecutive_failures = 0
            seen += 1
            try:
                yield parse_game(game, store_pgn=store_pgn)
            except Exception as exc:  # noqa: BLE001
                print(
                    f"[chesscope] row build error, skipping: {exc!r}",
                    file=sys.stderr,
                )
                continue
            if limit and seen >= limit:
                return
    finally:
        try:
            stream.close()
        except Exception:  # noqa: BLE001
            pass


# ---------------------------------------------------------------------------
# Phase 4: Turso upsert
# ---------------------------------------------------------------------------


GAMES_INSERT = """
INSERT INTO games (
  id, source, white, black, white_fide_id, black_fide_id,
  white_elo, black_elo, white_title, black_title,
  event, round, board, date, timestamp, time_control,
  eco, opening, result, ply_count,
  broadcast_name, broadcast_url, study_name, chapter_name,
  pgn, ingested_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  white_elo = excluded.white_elo,
  black_elo = excluded.black_elo,
  result    = excluded.result,
  ply_count = excluded.ply_count,
  pgn       = COALESCE(excluded.pgn, games.pgn),
  ingested_at = excluded.ingested_at
"""


def row_to_params(r: GameRow) -> list:
    return [
        r.id, r.source, r.white, r.black, r.white_fide_id, r.black_fide_id,
        r.white_elo, r.black_elo, r.white_title, r.black_title,
        r.event, r.round, r.board, r.date, r.timestamp, r.time_control,
        r.eco, r.opening, r.result, r.ply_count,
        r.broadcast_name, r.broadcast_url, r.study_name, r.chapter_name,
        r.pgn, r.ingested_at,
    ]


def write_batch(client: libsql_client.Client, rows: list[GameRow]) -> int:
    if not rows:
        return 0
    statements = [
        libsql_client.Statement(GAMES_INSERT, row_to_params(r)) for r in rows
    ]
    for attempt in range(1, 4):
        try:
            client.batch(statements)
            return len(rows)
        except Exception as exc:  # noqa: BLE001
            if attempt == 3:
                raise
            backoff = 2 ** attempt
            print(
                f"[chesscope] turso batch failed ({exc!r}); "
                f"retry {attempt}/3 in {backoff}s",
                file=sys.stderr,
            )
            time.sleep(backoff)
    return 0


# ---------------------------------------------------------------------------
# Players aggregate
# ---------------------------------------------------------------------------


def slug_for(name: str) -> str:
    """Mirror of src/lib/slug.ts:playerSlug. Keep these in sync."""
    if not name:
        return ""
    decomposed = unicodedata.normalize("NFD", name)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    s = stripped.lower().replace(",", "")
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")


PLAYERS_UPSERT = """
INSERT INTO players (
  slug, name, fide_id, title, peak_elo, latest_elo,
  game_count, wins, draws, losses, first_seen, last_seen, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  fide_id = COALESCE(excluded.fide_id, players.fide_id),
  title = COALESCE(excluded.title, players.title),
  peak_elo = excluded.peak_elo,
  latest_elo = excluded.latest_elo,
  game_count = excluded.game_count,
  wins = excluded.wins,
  draws = excluded.draws,
  losses = excluded.losses,
  first_seen = excluded.first_seen,
  last_seen = excluded.last_seen,
  updated_at = excluded.updated_at
"""


def refresh_players(client: libsql_client.Client) -> None:
    print("[chesscope] rebuilding players aggregate…", file=sys.stderr)
    rs = client.execute(
        """
        SELECT white AS name, white_fide_id AS fide, white_title AS title,
               white_elo AS elo, date, timestamp,
               CASE result WHEN '1-0' THEN 1 ELSE 0 END AS w,
               CASE result WHEN '1/2-1/2' THEN 1 ELSE 0 END AS d,
               CASE result WHEN '0-1' THEN 1 ELSE 0 END AS l
          FROM games
         WHERE white IS NOT NULL AND white != '?'
        UNION ALL
        SELECT black AS name, black_fide_id AS fide, black_title AS title,
               black_elo AS elo, date, timestamp,
               CASE result WHEN '0-1' THEN 1 ELSE 0 END AS w,
               CASE result WHEN '1/2-1/2' THEN 1 ELSE 0 END AS d,
               CASE result WHEN '1-0' THEN 1 ELSE 0 END AS l
          FROM games
         WHERE black IS NOT NULL AND black != '?'
        """
    )
    agg: dict[str, dict] = {}
    for row in rs.rows:
        name = row[0]
        slug = slug_for(name)
        if not slug:
            continue
        a = agg.setdefault(slug, {
            "name": name, "fide_id": None, "title": None,
            "peak_elo": None, "latest_elo": None, "latest_ts": -1,
            "game_count": 0, "wins": 0, "draws": 0, "losses": 0,
            "first_seen": None, "last_seen": None,
        })
        if row[1] and not a["fide_id"]:
            a["fide_id"] = row[1]
        if row[2] and not a["title"]:
            a["title"] = row[2]
        elo = row[3]
        date = row[4]
        ts = row[5] or 0
        a["game_count"] += 1
        a["wins"] += row[6]
        a["draws"] += row[7]
        a["losses"] += row[8]
        if elo is not None:
            if a["peak_elo"] is None or elo > a["peak_elo"]:
                a["peak_elo"] = elo
            if ts > a["latest_ts"]:
                a["latest_ts"] = ts
                a["latest_elo"] = elo
        if date:
            if a["first_seen"] is None or date < a["first_seen"]:
                a["first_seen"] = date
            if a["last_seen"] is None or date > a["last_seen"]:
                a["last_seen"] = date

    rows = []
    now = int(time.time())
    for slug, a in agg.items():
        rows.append([
            slug, a["name"], a["fide_id"], a["title"],
            a["peak_elo"], a["latest_elo"],
            a["game_count"], a["wins"], a["draws"], a["losses"],
            a["first_seen"], a["last_seen"], now,
        ])

    written = 0
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i:i + BATCH_SIZE]
        client.batch([
            libsql_client.Statement(PLAYERS_UPSERT, params) for params in chunk
        ])
        written += len(chunk)
    print(f"[chesscope] players: {written:,} unique slugs upserted",
          file=sys.stderr)


def update_sync_state(
    client: libsql_client.Client, key: str, value: str
) -> None:
    client.execute(
        """
        INSERT INTO sync_state (key, value, updated_at)
        VALUES (?, ?, unixepoch())
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
        """,
        [key, value],
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def turso_http_url(libsql_url: str) -> str:
    """Force HTTP transport.

    The default `libsql://` scheme makes the Python client attempt a
    WebSocket handshake (wss://), which modern Turso servers reject with
    HTTP 505. Hrana-over-HTTPS is exactly the same protocol on the wire
    and is what the TypeScript client uses too. Rewrite to https:// here
    to dodge the WS path."""
    if libsql_url.startswith("libsql://"):
        return "https://" + libsql_url[len("libsql://"):]
    return libsql_url


def main() -> int:
    ap = argparse.ArgumentParser(description="Chesscope broadcast ingestion")
    ap.add_argument(
        "--url",
        default=None,
        help="Explicit URL or local file path. Overrides --month.",
    )
    ap.add_argument(
        "--month",
        default=None,
        help="Single month to ingest (YYYY-MM). Default: all available.",
    )
    ap.add_argument(
        "--cache-dir",
        default=str(DEFAULT_CACHE_DIR),
        help="Where to download dumps (default: ./cache).",
    )
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--store-pgn", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--skip-aggregate", action="store_true")
    ap.add_argument(
        "--skip-download",
        action="store_true",
        help="Reuse cached files; don't fetch from network.",
    )
    ap.add_argument(
        "--keep-cache",
        action="store_true",
        help="Don't delete the downloaded files when done.",
    )
    ap.add_argument(
        "--no-verify",
        action="store_true",
        help="Skip SHA256 checks (test only).",
    )
    args = ap.parse_args()

    cache_dir = Path(args.cache_dir)
    session = _build_session()

    # Decide which sources to ingest.
    sources: list[tuple[str, str]]  # (month_label, url_or_path)
    if args.url:
        # Treat as either URL or local path. Use a stable label.
        label = (
            args.url.rsplit("/", 1)[-1]
            .replace(".pgn.zst", "")
            .replace("lichess_db_broadcast_", "")
        )
        sources = [(label or "explicit", args.url)]
    elif args.month:
        sources = [(args.month, DUMP_URL_TEMPLATE.format(month=args.month))]
    else:
        try:
            sources = list_monthly_dumps(session)
        except requests.RequestException as exc:
            print(
                f"[chesscope] couldn't list dumps from {DUMP_INDEX_URL}: "
                f"{exc!r}",
                file=sys.stderr,
            )
            return 3
        if not sources:
            print(
                f"[chesscope] no monthly broadcast dumps found at "
                f"{DUMP_INDEX_URL}",
                file=sys.stderr,
            )
            return 3
        print(
            f"[chesscope] discovered {len(sources)} monthly dump(s); "
            f"latest: {sources[0][0]}",
            file=sys.stderr,
        )

    # Connect to Turso (skip in dry-run).
    client: Optional[libsql_client.Client] = None
    if not args.dry_run:
        turso_url = os.environ.get("TURSO_URL")
        turso_token = os.environ.get("TURSO_AUTH_TOKEN")
        if not turso_url or not turso_token:
            print(
                "[chesscope] TURSO_URL and TURSO_AUTH_TOKEN are required "
                "(use --dry-run to skip).",
                file=sys.stderr,
            )
            return 2
        client = libsql_client.create_client_sync(
            url=turso_http_url(turso_url),
            auth_token=turso_token,
        )

    # Pre-fetch the checksums map once, used across all months.
    checksums: dict[str, str] = (
        {}
        if args.no_verify or args.skip_download
        else fetch_published_checksums(session)
    )

    started = time.time()
    total = 0
    last_source = sources[-1][1] if sources else ""
    downloaded_paths: list[Path] = []

    for month_label, source in sources:
        last_source = source

        # Resolve to a local path (download if URL).
        if source.startswith(("http://", "https://")):
            filename = source.rsplit("/", 1)[-1]
            local_path = cache_dir / filename
            if args.skip_download:
                if not local_path.exists():
                    print(
                        f"[chesscope] --skip-download set but {local_path} "
                        f"missing; skipping {month_label}",
                        file=sys.stderr,
                    )
                    continue
            else:
                try:
                    download_with_resume(session, source, local_path)
                except RuntimeError as exc:
                    # 404 or similar on a single month isn't fatal — skip.
                    print(
                        f"[chesscope] giving up on {month_label}: {exc}",
                        file=sys.stderr,
                    )
                    continue
                downloaded_paths.append(local_path)

                if not args.no_verify:
                    expected = checksums.get(filename)
                    if expected:
                        if not verify_sha256(local_path, expected):
                            print(
                                f"[chesscope] checksum failed; deleting "
                                f"{local_path.name} — re-run to retry",
                                file=sys.stderr,
                            )
                            local_path.unlink(missing_ok=True)
                            continue
                    else:
                        print(
                            f"[chesscope] no published checksum for "
                            f"{filename}; proceeding without verify",
                            file=sys.stderr,
                        )
        else:
            local_path = Path(source)
            if not local_path.exists():
                print(
                    f"[chesscope] local path not found: {local_path}",
                    file=sys.stderr,
                )
                continue

        # Per-source remaining quota when --limit is set.
        remaining = (args.limit - total) if args.limit else None
        if remaining is not None and remaining <= 0:
            break

        batch: list[GameRow] = []
        for row in iter_games_from_file(
            local_path, store_pgn=args.store_pgn, limit=remaining
        ):
            batch.append(row)
            if len(batch) >= BATCH_SIZE:
                if client is not None:
                    total += write_batch(client, batch)
                else:
                    total += len(batch)
                batch.clear()
                if total > 0 and total % PROGRESS_EVERY == 0:
                    rate = total / max(time.time() - started, 1)
                    print(
                        f"[chesscope] {total:,} games ingested "
                        f"({rate:,.0f}/sec)",
                        file=sys.stderr,
                    )

        if batch:
            if client is not None:
                total += write_batch(client, batch)
            else:
                total += len(batch)

        if args.limit and total >= args.limit:
            break

    elapsed = time.time() - started
    print(
        f"[chesscope] done: {total:,} games in {elapsed:,.1f}s "
        f"({total / max(elapsed, 1):,.0f}/sec)",
        file=sys.stderr,
    )

    if client is not None:
        if not args.skip_aggregate:
            refresh_players(client)
        update_sync_state(client, "last_full_sync_total", str(total))
        update_sync_state(client, "last_full_sync_source", last_source)
        update_sync_state(
            client, "last_full_sync_at", str(int(time.time()))
        )
        client.close()

    if not args.keep_cache and downloaded_paths:
        for p in downloaded_paths:
            try:
                p.unlink()
            except OSError:
                pass
        try:
            if cache_dir.exists() and not any(cache_dir.iterdir()):
                shutil.rmtree(cache_dir)
        except OSError:
            pass
        print(
            "[chesscope] cleaned cache (use --keep-cache to retain)",
            file=sys.stderr,
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())