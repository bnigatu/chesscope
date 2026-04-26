// Opening tree built from a stream of parsed games. Keyed by SAN path
// from the start position; each node aggregates W/D/L counts plus a
// capped sample of game references for drilling in.

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
  ply: number; // total plies in the game (for longest/shortest stats)
};

export type ParsedGame = {
  ref: GameRef;
  moves: string[]; // mainline SANs
};

export type TreeNode = {
  san: string; // empty for root
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
  bestWinElo?: number;
  bestWinGame?: GameRef;
  worstLossElo?: number;
  worstLossGame?: GameRef;
  // map keyed by SAN — using object so React updates don't have to clone Map
  children: Record<string, TreeNode>;
  games: GameRef[]; // capped
};

const SAMPLE_CAP = 50;

export function makeRoot(): TreeNode {
  return {
    san: "",
    count: 0,
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    totalWhiteElo: 0,
    totalBlackElo: 0,
    whiteEloSamples: 0,
    blackEloSamples: 0,
    children: {},
    games: [],
  };
}

export function addGame(
  root: TreeNode,
  game: ParsedGame,
  perspective: "white" | "black",
  playerName: string,
  maxPlies = 30
): void {
  let node = root;
  recordAt(node, game);
  // Walk up to maxPlies — past that we don't need the tree depth for an
  // opening explorer, and the memory cost is real.
  const limit = Math.min(maxPlies, game.moves.length);
  // Filter to only the side the user played.
  // perspective="white" → record nodes after white's move (even plies index 0,2,4)
  // perspective="black" → record nodes after black's move (odd plies index 1,3,5)
  const playerWasWhite = playerName
    ? game.ref.white.toLowerCase() === playerName.toLowerCase()
    : true;
  const recordSide =
    perspective === "white" ? playerWasWhite : !playerWasWhite;
  void recordSide; // perspective gating is handled by the caller (ingester)
  for (let i = 0; i < limit; i++) {
    const san = game.moves[i];
    const child =
      node.children[san] ??
      (node.children[san] = {
        san,
        count: 0,
        whiteWins: 0,
        blackWins: 0,
        draws: 0,
        totalWhiteElo: 0,
        totalBlackElo: 0,
        whiteEloSamples: 0,
        blackEloSamples: 0,
        children: {},
        games: [],
      });
    recordAt(child, game);
    node = child;
  }
}

function recordAt(node: TreeNode, game: ParsedGame): void {
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

  if (
    node.longestPlies == null ||
    game.ref.ply > node.longestPlies
  ) {
    node.longestPlies = game.ref.ply;
  }
  if (
    node.shortestPlies == null ||
    game.ref.ply < node.shortestPlies
  ) {
    node.shortestPlies = game.ref.ply;
  }
  if (!node.lastDate || game.ref.date > node.lastDate) {
    node.lastDate = game.ref.date;
  }
  if (node.games.length < SAMPLE_CAP) {
    node.games.push(game.ref);
  }
}

export function walk(root: TreeNode, path: string[]): TreeNode | null {
  let node: TreeNode | undefined = root;
  for (const san of path) {
    node = node?.children[san];
    if (!node) return null;
  }
  return node ?? null;
}

export type MoveOption = {
  san: string;
  count: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  lastDate?: string;
  /**
   * Sample game leading to this move, populated when count === 1 so the
   * UI can render the single-game row openingtree-style. For count > 1
   * it's still set (newest-leaning sample) but the panel ignores it.
   */
  lastPlayedGame?: GameRef;
};

/**
 * Children of the node at `path`, sorted by frequency. These are the
 * moves the player has tried at this position.
 */
export function topMovesAt(
  root: TreeNode,
  path: string[],
  limit = 12
): MoveOption[] {
  const node = walk(root, path);
  if (!node) return [];
  return Object.values(node.children)
    .map((c) => ({
      san: c.san,
      count: c.count,
      whiteWins: c.whiteWins,
      blackWins: c.blackWins,
      draws: c.draws,
      lastDate: c.lastDate,
      lastPlayedGame: c.games[c.games.length - 1] ?? c.games[0],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
