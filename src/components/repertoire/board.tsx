"use client";

import { memo } from "react";
import { Chessboard } from "react-chessboard";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type BoardProps = {
  fen?: string;
  orientation?: "white" | "black";
  onPieceDrop?: (from: string, to: string, promotion?: string) => boolean;
};

function BoardImpl({
  fen = STARTING_FEN,
  orientation = "white",
  onPieceDrop,
}: BoardProps) {
  return (
    <div className="w-full max-w-[640px] mx-auto">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: !!onPieceDrop,
          darkSquareStyle: { backgroundColor: "#769656" },
          lightSquareStyle: { backgroundColor: "#eeeed2" },
          boardStyle: {
            borderRadius: "2px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.45)",
          },
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
