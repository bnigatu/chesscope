"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/utils";

export type Move = { san: string; alternates: string[] };

const PIECE_ICONS: Record<string, string> = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
};

function figurine(san: string, isBlackMove: boolean): string {
  if (!san) return "";
  const first = san[0];
  if (!/[KQRBN]/.test(first)) return san;
  const key = isBlackMove ? first.toLowerCase() : first;
  return (PIECE_ICONS[key] ?? first) + san.slice(1);
}

export function MoveListPanel({
  moves,
  cursor,
  onJump,
  onSwitchAlternate,
}: {
  moves: Move[];
  cursor: number;
  onJump: (idx: number) => void;
  onSwitchAlternate: (plyIdx: number, altSan: string) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!playing) return;
    if (cursor >= moves.length) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => onJump(cursor + 1), 1500);
    return () => window.clearTimeout(t);
  }, [playing, cursor, moves.length, onJump]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const rows = Math.ceil(moves.length / 2);
  const atStart = cursor === 0;
  const atEnd = cursor === moves.length;

  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[.25em] text-brass">
        Continuation
      </h2>

      <div
        className={cx(
          "border border-parchment-50/8 rounded-sm",
          "bg-ink-800/60",
          "max-h-[360px] overflow-y-auto"
        )}
      >
        {rows === 0 ? (
          <p className="px-3 py-6 text-sm text-parchment-300/40 italic text-center">
            No moves yet.
          </p>
        ) : (
          <div className="divide-y divide-parchment-50/6">
            {Array.from({ length: rows }).map((_, r) => {
              const wIdx = r * 2;
              const bIdx = wIdx + 1;
              const isActiveRow = cursor - 1 === wIdx || cursor - 1 === bIdx;
              return (
                <div
                  key={r}
                  ref={isActiveRow ? activeRef : null}
                  className={cx(
                    "grid grid-cols-[2.25rem_1fr_1fr] items-stretch",
                    r % 2 === 0 ? "bg-ink-800/30" : "bg-ink-700/30"
                  )}
                >
                  <span className="flex items-center justify-end pr-2 text-[11px] font-mono text-parchment-300/55">
                    {r + 1}.
                  </span>
                  <MoveCell
                    move={moves[wIdx]}
                    plyIdx={wIdx}
                    selected={cursor === wIdx + 1}
                    onJump={onJump}
                    onSwitchAlternate={onSwitchAlternate}
                  />
                  <MoveCell
                    move={moves[bIdx]}
                    plyIdx={bIdx}
                    selected={cursor === bIdx + 1}
                    onJump={onJump}
                    onSwitchAlternate={onSwitchAlternate}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-5 gap-1">
        <PlayBtn
          label="<<"
          title="Start"
          disabled={atStart}
          onClick={() => onJump(0)}
        />
        <PlayBtn
          label="<"
          title="Previous"
          disabled={atStart}
          onClick={() => onJump(Math.max(0, cursor - 1))}
        />
        <PlayBtn
          label={playing ? "❚❚" : "▶"}
          title={playing ? "Pause" : "Autoplay"}
          disabled={moves.length === 0}
          onClick={() => setPlaying((p) => !p)}
          accent
        />
        <PlayBtn
          label=">"
          title="Next"
          disabled={atEnd}
          onClick={() => onJump(Math.min(moves.length, cursor + 1))}
        />
        <PlayBtn
          label=">>"
          title="End"
          disabled={atEnd}
          onClick={() => onJump(moves.length)}
        />
      </div>
    </section>
  );
}

function MoveCell({
  move,
  plyIdx,
  selected,
  onJump,
  onSwitchAlternate,
}: {
  move: Move | undefined;
  plyIdx: number;
  selected: boolean;
  onJump: (idx: number) => void;
  onSwitchAlternate: (plyIdx: number, altSan: string) => void;
}) {
  if (!move) return <span aria-hidden />;
  const isBlack = plyIdx % 2 === 1;
  return (
    <div className="flex items-baseline gap-1 px-2 py-1.5 min-w-0">
      <button
        type="button"
        onClick={() => onJump(plyIdx + 1)}
        className={cx(
          "font-mono text-sm shrink-0 rounded-sm px-1 transition-colors",
          selected
            ? "bg-brass/25 text-parchment-50"
            : "text-parchment-100/85 hover:text-brass-light"
        )}
      >
        {figurine(move.san, isBlack)}
      </button>
      {move.alternates.length > 0 && (
        <span className="text-parchment-300/40 italic text-xs truncate min-w-0">
          (
          {move.alternates.map((alt, i) => (
            <span key={alt}>
              {i > 0 && ", "}
              <button
                type="button"
                onClick={() => onSwitchAlternate(plyIdx, alt)}
                className="hover:text-parchment-100/80 hover:underline"
                title={`Switch to ${alt}`}
              >
                {figurine(alt, isBlack)}
              </button>
            </span>
          ))}
          )
        </span>
      )}
    </div>
  );
}

function PlayBtn({
  label,
  title,
  onClick,
  disabled,
  accent,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cx(
        "py-1.5 text-sm font-mono",
        "border border-parchment-50/10 rounded-sm transition-colors",
        accent && !disabled
          ? "text-brass-light border-brass/40 hover:bg-brass/10"
          : "text-parchment-100/80 hover:border-brass/40 hover:text-parchment-50",
        disabled && "opacity-30 cursor-default hover:border-parchment-50/10"
      )}
    >
      {label}
    </button>
  );
}
