// FEN-keyed opening tree built from a stream of parsed games.
//
// Every chess position is identified by its position-only FEN (piece
// placement / side to move / castling / en passant — no half/fullmove
// clocks), so different move orders that reach the same position
// aggregate into one node. This matches Lichess Explorer, ChessBase,
// and openingtree.com — the canonical shape for chess opening data.
//
// State per FEN:
//   - aggregate counts (W/D/L, total Elos, longest/shortest)
//   - a sample of game refs that visited this position (capped)
//   - the moves played FROM this position, each with the resulting FEN
//
// addGame walks the game once, updating the FEN at each ply.

import { Chess } from "chess.js";

export type GameRef = {
  id: string;
  source: "lichess" | "chesscom" | "pgn";
  url: string;
  white: string;
  black: string;
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  date: string;
  whiteElo?: number;
  blackElo?: number;
  timeControl?: string;
  ply: number;
};

export type ParsedGame = {
  ref: GameRef;
  moves: string[];
};

export type MoveEdge = {
  count: number;
  resultingFen: string;
  /** Sample game leading to this move, populated when count === 1 so
      the UI can render the single-game row openingtree-style. */
  lastPlayedGame?: GameRef;
};

export type FenNode = {
  count: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  totalWhiteElo: number;
  totalBlackElo: number;
  whiteEloSamples: number;
  blackEloSamples: number;
  longestPlies?: number;
  shortestPlies?: number;
  lastDate?: string;
  /** Sample game refs that reached this position. Capped at SAMPLE_CAP. */
  games: GameRef[];
  /** Moves played from this position, keyed by SAN. */
  movesFrom: Record<string, MoveEdge>;
};

export type Tree = {
  /** Position-only FEN (4 fields) → aggregate node. */
  byFen: Record<string, FenNode>;
};

const SAMPLE_CAP = 50;

export const STARTING_FEN_FULL =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const STARTING_FEN = positionFen(STARTING_FEN_FULL);

/**
 * Drop the halfmove + fullmove counters from a chess.js FEN. Same
 * physical position with different move-counters is the same opening
 * position for our purposes.
 */
export function positionFen(fullFen: string): string {
  return fullFen.split(" ").slice(0, 4).join(" ");
}

/**
 * Compute the FEN reached by playing `san` from `currentFen`. Returns
 * null if the move is illegal in that position.
 */
export function fenAfterMove(
  currentFen: string,
  san: string
): string | null {
  const game = new Chess();
  try {
    // chess.js needs a full FEN; tack on the trivial counters if the
    // input is position-only.
    const parts = currentFen.split(" ");
    const full = parts.length === 4 ? `${currentFen} 0 1` : currentFen;
    game.load(full);
  } catch {
    return null;
  }
  try {
    const m = game.move(san);
    if (!m) return null;
  } catch {
    return null;
  }
  return positionFen(game.fen());
}

export function makeTree(): Tree {
  return {
    byFen: {},
  };
}

function getOrCreateNode(tree: Tree, fen: string): FenNode {
  let node = tree.byFen[fen];
  if (!node) {
    node = {
      count: 0,
      whiteWins: 0,
      blackWins: 0,
      draws: 0,
      totalWhiteElo: 0,
      totalBlackElo: 0,
      whiteEloSamples: 0,
      blackEloSamples: 0,
      games: [],
      movesFrom: {},
    };
    tree.byFen[fen] = node;
  }
  return node;
}

function recordAt(node: FenNode, game: ParsedGame): void {
  node.count++;
  if (game.ref.result === "1-0") node.whiteWins++;
  else if (game.ref.result === "0-1") node.blackWins++;
  else if (game.ref.result === "1/2-1/2") node.draws++;

  if (typeof game.ref.whiteElo === "number") {
    node.totalWhiteElo += game.ref.whiteElo;
    node.whiteEloSamples++;
  }
  if (typeof game.ref.blackElo === "number") {
    node.totalBlackElo += game.ref.blackElo;
    node.blackEloSamples++;
  }

  if (node.longestPlies == null || game.ref.ply > node.longestPlies) {
    node.longestPlies = game.ref.ply;
  }
  if (node.shortestPlies == null || game.ref.ply < node.shortestPlies) {
    node.shortestPlies = game.ref.ply;
  }
  if (!node.lastDate || game.ref.date > node.lastDate) {
    node.lastDate = game.ref.date;
  }
  if (node.games.length < SAMPLE_CAP) {
    node.games.push(game.ref);
  }
}

export function addGame(
  tree: Tree,
  game: ParsedGame,
  // Safety guard against pathological PGN. Longest documented chess
  // game is 538 plies (Nikolić–Arsović 1989); 1000 catches malformed
  // input without limiting real games.
  maxPlies = 1000
): void {
  const chess = new Chess();
  const startFen = positionFen(chess.fen());
  recordAt(getOrCreateNode(tree, startFen), game);

  const limit = Math.min(maxPlies, game.moves.length);
  let currentFen = startFen;
  for (let i = 0; i < limit; i++) {
    const san = game.moves[i];
    let canonicalSan: string;
    try {
      const m = chess.move(san);
      if (!m) break;
      canonicalSan = m.san;
    } catch {
      break;
    }
    const newFen = positionFen(chess.fen());

    // Record the edge from currentFen → newFen via canonicalSan.
    const parentNode = tree.byFen[currentFen];
    if (parentNode) {
      const edge =
        parentNode.movesFrom[canonicalSan] ??
        (parentNode.movesFrom[canonicalSan] = {
          count: 0,
          resultingFen: newFen,
        });
      edge.count++;
      // Newest game wins (caller iterates newest-first across months).
      edge.lastPlayedGame = game.ref;
    }

    // Record at the new position.
    recordAt(getOrCreateNode(tree, newFen), game);
    currentFen = newFen;
  }
}

/**
 * Walk a SAN path from the starting position, returning each ply's
 * resulting FEN. Used by the explorer to map its SAN-keyed history
 * (the user's exploration line) onto FEN lookups in the tree.
 */
export function fenAtPath(sanLine: string[]): string {
  let fen = STARTING_FEN;
  for (const san of sanLine) {
    const next = fenAfterMove(fen, san);
    if (!next) break;
    fen = next;
  }
  return fen;
}

export type MoveOption = {
  san: string;
  /**
   * Games that reached the resulting position regardless of move order
   * (FEN-keyed). The number you'd typically display.
   */
  count: number;
  /**
   * Games that took THIS exact (parent_fen, san) edge. When this is
   * much smaller than `count`, the move transposes into a position
   * that's been studied via other move orders. Used by the moves panel
   * to render a transposition warning icon.
   */
  edgeCount: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  lastDate?: string;
  lastPlayedGame?: GameRef;
};

/**
 * Moves played from the position at `fen`, sorted by frequency.
 * Each move's stats come from the *resulting* FEN node — that's the
 * count of games that landed in the post-move position regardless of
 * how they got there. So Najdorf positions reached via different
 * move orders aggregate correctly.
 */
export function topMovesAt(
  tree: Tree,
  fen: string,
  limit = 12
): MoveOption[] {
  const parent = tree.byFen[fen];
  if (!parent) return [];
  const out: MoveOption[] = [];
  for (const [san, edge] of Object.entries(parent.movesFrom)) {
    const child = tree.byFen[edge.resultingFen];
    if (!child) continue;
    out.push({
      san,
      count: child.count,
      edgeCount: edge.count,
      whiteWins: child.whiteWins,
      blackWins: child.blackWins,
      draws: child.draws,
      lastDate: child.lastDate,
      lastPlayedGame: edge.lastPlayedGame,
    });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, limit);
}

export function nodeAt(tree: Tree, fen: string): FenNode | null {
  return tree.byFen[fen] ?? null;
}
