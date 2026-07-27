"use client";

import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "@/components/repertoire/board";

/**
 * Homepage hero board: quietly replays Morphy's Opera-house game on a
 * loop. The motion lives entirely inside the board — it never overlaps
 * the form or any other UI (deliberate contrast to the floating-pieces
 * heroes elsewhere). Pauses while the pointer is over the board or the
 * tab is hidden, and stays a static start position under
 * prefers-reduced-motion.
 *
 * The game score is public-domain historical fact (Paris, 1858); FENs
 * are derived from SAN via chess.js so there's no hand-encoded board
 * state to drift out of sync.
 */

const GAME_TITLE = "Morphy – Duke of Brunswick & Count Isouard · Paris, 1858";

// prettier-ignore
const OPERA_SAN = [
  "e4", "e5", "Nf3", "d6", "d4", "Bg4", "dxe5", "Bxf3", "Qxf3", "dxe5",
  "Bc4", "Nf6", "Qb3", "Qe7", "Nc3", "c6", "Bg5", "b5", "Nxb5", "cxb5",
  "Bxb5+", "Nbd7", "O-O-O", "Rd8", "Rxd7", "Rxd7", "Rd1", "Qe6",
  "Bxd7+", "Nxd7", "Qb8+", "Nxb8", "Rd8#",
];

// FEN per position: index 0 = start, index i = after ply i. Built once
// per module load; if a SAN ever failed to parse we fall back to just
// the start position (board renders static — never a crash).
let cachedFens: string[] | null = null;
function operaFens(): string[] {
  if (cachedFens) return cachedFens;
  try {
    const chess = new Chess();
    const fens = [chess.fen()];
    for (const san of OPERA_SAN) {
      chess.move(san);
      fens.push(chess.fen());
    }
    cachedFens = fens;
  } catch {
    cachedFens = [new Chess().fen()];
  }
  return cachedFens;
}

const TICK_MS = 1700;
// Extra ticks to hold on the final (mate) position before looping, and
// on the reset start position before the first move replays.
const HOLD_AT_MATE = 3;
const HOLD_AT_START = 1;

export function HeroBoard() {
  const fens = operaFens();
  const canReplay = fens.length > 1;

  // ply: -1 = start position, i >= 0 = position after OPERA_SAN[i].
  const [ply, setPly] = useState(-1);
  const [animate, setAnimate] = useState(false);
  const pausedRef = useRef(false);
  const holdRef = useRef(HOLD_AT_START);

  useEffect(() => {
    if (!canReplay) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setAnimate(true);
    const id = setInterval(() => {
      // Paused on hover (someone is looking closely — don't yank the
      // position), or in a hidden tab (don't burn cycles off-screen).
      if (pausedRef.current || document.hidden) return;
      if (holdRef.current > 0) {
        holdRef.current--;
        return;
      }
      setPly((p) => {
        if (p + 1 >= OPERA_SAN.length) {
          holdRef.current = HOLD_AT_START;
          return -1; // loop back to the initial position
        }
        if (p + 2 === OPERA_SAN.length) holdRef.current = HOLD_AT_MATE;
        return p + 1;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [canReplay]);

  const moveNo = Math.floor(ply / 2) + 1;
  const isWhite = ply % 2 === 0;

  return (
    <div
      onPointerEnter={() => {
        pausedRef.current = true;
      }}
      onPointerLeave={() => {
        pausedRef.current = false;
      }}
    >
      {/* Decorative for assistive tech: the replay is ambience, and
          react-chessboard's 32 piece "buttons" would otherwise read as
          anonymous controls. `inert` also strips them from the tab
          order (aria-hidden alone leaves focusable descendants — axe
          aria-hidden-focus). The caption below stays accessible. */}
      <div aria-hidden="true" inert>
        <Board
          fen={fens[ply + 1]}
          // Slide only while replaying; the reduced-motion/static path
          // renders the start position with no animation machinery.
          animationMs={animate ? 550 : 0}
        />
      </div>
      <p
        className="mt-2 text-center font-mono text-[11px] tracking-wide text-parchment-300 tabular-nums min-h-[1rem]"
        aria-live="off"
      >
        {GAME_TITLE}
        {animate && ply >= 0 && (
          <>
            {" · "}
            <span className="text-brass-light">
              {moveNo}
              {isWhite ? "." : "…"} {OPERA_SAN[ply]}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
