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

type BoardProps = {
  fen?: string;
  orientation?: "white" | "black";
  onPieceDrop?: (from: string, to: string, promotion?: string) => boolean;
  arrows?: BoardArrow[];
  /** Pixel cap on the board's rendered width. The wrapper still uses
      w-full so it shrinks under the cap on narrow viewports. */
  size?: number;
};

function BoardImpl({
  fen = STARTING_FEN,
  orientation = "white",
  onPieceDrop,
  arrows,
  size = 640,
}: BoardProps) {
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
          // Chess.com Blue palette (matches the user's chess.com
          // board theme): slate blue dark squares, pale-grey-blue
          // light squares.
          darkSquareStyle: { backgroundColor: "#7b96b7" },
          lightSquareStyle: { backgroundColor: "#dee3e6" },
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
