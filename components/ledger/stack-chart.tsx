"use client";

import { useId, useState } from "react";

import { playerColor, toneClass } from "@/components/ledger/avatar";
import { compactSignedMoney } from "@/components/ledger/leaderboard-chart";
import { useMoney } from "@/components/ledger/money";
import { chartAxis } from "@/lib/poker/chart-axis";
import type { GameState } from "@/lib/poker/types";

/**
 * Session Standings' Graph view (user request 2026-11-06): each player's
 * chips won or lost after every finished hand, one coloured line each, from
 * nothing at the start. It plots the net rather than the stack itself, so a
 * rebuy doesn't show as a jump: the line moves only when chips change hands.
 * A player who joined late starts from nothing the hand before their first.
 */
export function StackChart({ game }: { game: GameState }) {
  const { symbol, unit, signedMoney } = useMoney();
  const clipId = useId();
  const [highlight, setHighlight] = useState<number | null>(null);
  const results = game.handResults ?? [];
  if (!results.length) {
    return (
      <p className="muted small-note stack-chart-empty">
        The graph starts once the first hand is finished.
      </p>
    );
  }

  // Step 0 is the start; step n is after the nth finished hand on record.
  const steps = results.length;
  const firstHand = results[0].no;
  const series = game.players.map((player, index) => {
    const first = results.findIndex((result) => result.nets[index] !== undefined);
    const points =
      first < 0
        ? []
        : [
            { step: first, value: 0, hand: null as number | null },
            ...results.slice(first).map((result, offset) => ({
              step: first + offset + 1,
              value: result.nets[index] ?? 0,
              hand: result.no as number | null,
            })),
          ];
    return {
      index,
      name: player.name,
      color: playerColor(player.name),
      net: points.at(-1)?.value ?? 0,
      points,
    };
  });
  const shown = series.filter((player) => player.points.length);
  const legend = [...shown].sort((a, b) => b.net - a.net);

  const chartWidth = 320;
  const chartHeight = 220;
  const plot = { top: 10, right: 8, bottom: 36, left: 48 };
  const plotWidth = chartWidth - plot.left - plot.right;
  const plotHeight = chartHeight - plot.top - plot.bottom;
  const axis = chartAxis(
    shown.flatMap((player) => player.points.map((point) => point.value)),
    { minSpan: Math.max(10, game.ante * 2) },
  );
  const xFor = (step: number) => plot.left + (step / steps) * plotWidth;
  const yFor = (value: number) =>
    plot.top + ((axis.max - value) / (axis.max - axis.min || 1)) * plotHeight;
  const xLabelEvery = Math.max(1, Math.ceil(steps / 5));
  const perUnit = unit === "cents" ? 100 : 1;
  const drawOrder = [...shown].sort(
    (a, b) => Number(a.index === highlight) - Number(b.index === highlight),
  );

  return (
    <figure className="stack-chart" aria-label="Chips won or lost by hand">
      <svg
        className="chart-plot"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label="Each coloured line shows the chips one player has won or lost so far, after every finished hand."
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={plot.left - 4}
              y={plot.top - 4}
              width={plotWidth + 8}
              height={plotHeight + 8}
            />
          </clipPath>
        </defs>

        {axis.ticks.map((tick) => (
          <g key={tick}>
            <line
              className={tick === 0 ? "chart-zero" : "chart-grid"}
              x1={plot.left}
              x2={chartWidth - plot.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
            />
            <text
              className="chart-label"
              x={plot.left - 6}
              y={yFor(tick) + 3}
              textAnchor="end"
            >
              {compactSignedMoney(tick / perUnit, symbol)}
            </text>
          </g>
        ))}

        {Array.from({ length: steps + 1 }, (_, step) =>
          step === 0 ||
          step === steps ||
          (step % xLabelEvery === 0 && steps - step >= xLabelEvery / 2) ? (
            <text
              className="chart-label"
              key={step}
              x={xFor(step)}
              y={plot.top + plotHeight + 14}
              textAnchor={step === 0 ? "start" : step === steps ? "end" : "middle"}
            >
              {step === 0 ? "Start" : results[step - 1].no}
            </text>
          ) : null,
        )}
        <text
          className="chart-axis-title"
          x={plot.left + plotWidth / 2}
          y={chartHeight - 2}
          textAnchor="middle"
        >
          Hand
        </text>

        <g clipPath={`url(#${clipId})`}>
          {drawOrder.map((player) => {
            const last = player.points.at(-1);
            const dimmed = highlight !== null && highlight !== player.index;
            const focused = highlight === player.index;
            return (
              <g
                key={player.index}
                className="chart-series"
                opacity={dimmed ? 0.12 : 1}
              >
                <polyline
                  className="chart-line"
                  points={player.points
                    .map((point) => `${xFor(point.step)},${yFor(point.value)}`)
                    .join(" ")}
                  stroke={player.color}
                  strokeWidth={focused ? 3 : 1.8}
                />
                {player.points.map((point) =>
                  point.hand !== null && (steps <= 40 || point === last) ? (
                    <circle
                      cx={xFor(point.step)}
                      cy={yFor(point.value)}
                      fill={player.color}
                      key={point.step}
                      r={point === last ? 3.2 : 1.4}
                    >
                      <title>{`${player.name}, hand ${point.hand}: ${signedMoney(point.value)}`}</title>
                    </circle>
                  ) : null,
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <figcaption className="muted small-note">
        Chips won or lost after each hand
        {firstHand > 1 ? `, from hand ${firstHand}` : ""}. Tap a name to pick
        out their line.
      </figcaption>
      <div
        className="chart-legend"
        style={{ gridTemplateRows: `repeat(${Math.ceil(legend.length / 2)}, auto)` }}
      >
        {legend.map((player) => {
          const dimmed = highlight !== null && highlight !== player.index;
          return (
            <button
              className="legend-item"
              key={player.index}
              type="button"
              aria-pressed={highlight === player.index}
              style={{ opacity: dimmed ? 0.4 : 1 }}
              onClick={() =>
                setHighlight((current) =>
                  current === player.index ? null : player.index,
                )
              }
            >
              <span className="legend-dot" style={{ backgroundColor: player.color }} />
              <span className="legend-name">{player.name}</span>
              <span className={`legend-value ${toneClass(player.net)}`}>
                {signedMoney(player.net)}
              </span>
            </button>
          );
        })}
      </div>
    </figure>
  );
}
