"use client";

import { memo } from "react";
import { Chessboard } from "react-chessboard";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type BoardArrow = {
  startSquare: string;
  endSquare: string;
  color: string;
};

/**
 * Named board palettes mirroring chess.com's most popular options.
 * The keys are the values stored in localStorage; labels are what
 * the settings modal shows. Adding a theme = add an entry here.
 */
export const BOARD_THEMES = {
  blue: { label: "Blue", dark: "#7b96b7", light: "#dee3e6" },
  green: { label: "Green", dark: "#769656", light: "#eeeed2" },
  brown: { label: "Brown", dark: "#b58863", light: "#f0d9b5" },
  walnut: { label: "Walnut", dark: "#8b6f4e", light: "#e6cfa1" },
  slate: { label: "Slate", dark: "#647082", light: "#cbd1d8" },
} as const;

export type BoardThemeId = keyof typeof BOARD_THEMES;

type BoardProps = {
  fen?: string;
  orientation?: "white" | "black";
  onPieceDrop?: (from: string, to: string, promotion?: string) => boolean;
  arrows?: BoardArrow[];
  /** Pixel cap on the board's rendered width. The wrapper still uses
      w-full so it shrinks under the cap on narrow viewports. */
  size?: number;
  /** Named palette key. Defaults to 'blue' (chess.com Blue). */
  theme?: BoardThemeId;
  /** Piece slide animation duration in ms. 0 disables animation. */
  animationMs?: number;
};

function BoardImpl({
  fen = STARTING_FEN,
  orientation = "white",
  onPieceDrop,
  arrows,
  size = 640,
  theme = "blue",
  animationMs,
}: BoardProps) {
  const palette = BOARD_THEMES[theme] ?? BOARD_THEMES.blue;
  return (
    <div
      className="w-full mx-auto"
      style={{ maxWidth: `${size}px` }}
    >
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: !!onPieceDrop,
          animationDurationInMs:
            typeof animationMs === "number" ? animationMs : undefined,
          darkSquareStyle: { backgroundColor: palette.dark },
          lightSquareStyle: { backgroundColor: palette.light },
          boardStyle: {
            borderRadius: "2px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.45)",
          },
          arrows: arrows && arrows.length > 0 ? arrows : undefined,
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!onPieceDrop || !targetSquare) return false;
            return onPieceDrop(sourceSquare, targetSquare);
          },
        }}
      />
    </div>
  );
}

// Memoized so the heavy ingest tick re-renders in the parent don't
// interrupt drag interactions inside react-chessboard.
export const Board = memo(BoardImpl);
