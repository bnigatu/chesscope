// Serialize and deserialize the OpeningTree to a local .tree file.
//
// The file is JSON with a small wrapper recording the version, the
// sources used, and the filters in effect. The tree itself is stored
// in full (sample game refs included up to the SAMPLE_CAP set in
// tree.ts), so the loaded view is identical to the live one.

import type { Tree } from "./tree";
import type { RepertoireFilters } from "./filters";

// V1: SAN-recursive TreeNode. Deprecated; loading V1 files yields a
// version-mismatch error. V2: FEN-keyed Tree.
export const TREE_FILE_VERSION = 2;
export const TREE_FILE_EXT = ".tree";

export type SavedTree = {
  version: number;
  generatedAt: string; // ISO date
  // Free-form metadata so the load screen can show what was being explored.
  sources: {
    lichess?: string;
    chesscom?: string;
    pgnFilename?: string;
    playerName?: string;
  };
  filters: RepertoireFilters;
  tree: Tree;
};

export function serializeTree(saved: Omit<SavedTree, "version" | "generatedAt">): string {
  const payload: SavedTree = {
    version: TREE_FILE_VERSION,
    generatedAt: new Date().toISOString(),
    ...saved,
  };
  return JSON.stringify(payload);
}

export function downloadTreeFile(saved: Omit<SavedTree, "version" | "generatedAt">) {
  const filename = suggestedFilename(saved);
  const blob = new Blob([serializeTree(saved)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Free the object URL after a tick so the click event has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function deserializeTree(text: string): SavedTree {
  const parsed = JSON.parse(text) as SavedTree;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.version !== "number" ||
    !parsed.tree
  ) {
    throw new Error("Not a valid Chesscope tree file.");
  }
  if (parsed.version > TREE_FILE_VERSION) {
    throw new Error(
      `Tree file is from a newer version (${parsed.version}). Update Chesscope.`
    );
  }
  if (parsed.version < TREE_FILE_VERSION) {
    throw new Error(
      `Tree file is from an older version (v${parsed.version}). The tree format changed in v${TREE_FILE_VERSION}; rebuild from your sources.`
    );
  }
  return parsed;
}

function suggestedFilename(saved: Omit<SavedTree, "version" | "generatedAt">): string {
  const slug =
    saved.sources.lichess ||
    saved.sources.chesscom ||
    saved.sources.playerName ||
    saved.sources.pgnFilename ||
    "repertoire";
  const safe = slug.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `${safe}-${saved.filters.color}-${date}${TREE_FILE_EXT}`;
}
