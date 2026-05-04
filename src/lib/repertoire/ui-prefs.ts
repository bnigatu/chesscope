// Per-user UI preferences for the explorer surface. Kept as a single
// JSON blob so adding the next setting doesn't need a storage-key
// rename or a migration. loadUiPrefs returns sensible defaults for
// any field that's missing or invalid in the stored value, so old
// saved blobs forward-compatibly pick up new fields.

export type ArrowMode = "key" | "all";
export type PieceAnimationSpeed = "none" | "fast" | "medium" | "slow";

export type UiPrefs = {
  /** Render the green/amber overlay arrows for played moves on the
   *  board. When false, the board is clean — useful for screenshots
   *  or for users who prefer a less busy view. */
  showSuggestionArrows: boolean;
  /** "key" = green for the dominant move(s) + amber for alternates
   *  (chess.com "Key Moves"). "all" = every arrow renders in a
   *  uniform amber regardless of frequency rank (chess.com "All
   *  Moves") — useful when the heatmap reading is more distracting
   *  than helpful. */
  arrowMode: ArrowMode;
  /** Piece slide duration when a move is applied. Maps to
   *  react-chessboard's animationDuration in ms. */
  pieceAnimation: PieceAnimationSpeed;
};

export const UI_PREFS_DEFAULTS: UiPrefs = {
  showSuggestionArrows: true,
  arrowMode: "key",
  pieceAnimation: "medium",
};

/** Maps the named animation tier to a millisecond value for the
 *  underlying chessboard library. Centralised so the modal and the
 *  board agree. */
export const PIECE_ANIMATION_MS: Record<PieceAnimationSpeed, number> = {
  none: 0,
  fast: 100,
  medium: 200,
  slow: 400,
};

const UI_PREFS_KEY = "chesscope.uiPrefs";

export function loadUiPrefs(): UiPrefs {
  if (typeof window === "undefined") return UI_PREFS_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return UI_PREFS_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    const arrowMode: ArrowMode =
      parsed.arrowMode === "all" || parsed.arrowMode === "key"
        ? parsed.arrowMode
        : UI_PREFS_DEFAULTS.arrowMode;
    const pieceAnimation: PieceAnimationSpeed =
      parsed.pieceAnimation === "none" ||
      parsed.pieceAnimation === "fast" ||
      parsed.pieceAnimation === "medium" ||
      parsed.pieceAnimation === "slow"
        ? parsed.pieceAnimation
        : UI_PREFS_DEFAULTS.pieceAnimation;
    return {
      showSuggestionArrows:
        typeof parsed.showSuggestionArrows === "boolean"
          ? parsed.showSuggestionArrows
          : UI_PREFS_DEFAULTS.showSuggestionArrows,
      arrowMode,
      pieceAnimation,
    };
  } catch {
    return UI_PREFS_DEFAULTS;
  }
}

export function saveUiPrefs(prefs: UiPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* localStorage full or disabled — ignore */
  }
}
