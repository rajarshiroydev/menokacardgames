"use client";

import { useId, useState } from "react";

import { playerColor, toneClass } from "@/components/ledger/avatar";
import { useMoney } from "@/components/ledger/money";
import type { GroupStandings } from "@/lib/friends/group-standings";
import { chartAxis, settledValues } from "@/lib/poker/chart-axis";
import { formatPercent } from "@/lib/poker/game";
import type { Standings } from "@/lib/poker/standings";

type ChartPoint = {
  index: number;
  /** Running average return after this game, in percent. */
  value: number;
  /** Null when the player missed this game and the average carried forward. */
  sessionReturn: number | null;
  sampleCount: number;
  /** Money won or lost so far, in currency units. */
  net: number;
};

type ChartLine = {
  key: string;
  name: string;
  averageReturn: number | null;
  /** Money won or lost over every ranked game. */
  net: number;
  points: ChartPoint[];
};

/** What the standings graph plots (user request 2026-10-26). */
type ChartMetric = "return" | "net";

export function chartLinesFromStandings(standings: Standings): ChartLine[] {
  return standings.entries.map((entry) => {
    const line = standings.series.get(entry.key);
    return {
      key: entry.key,
      name: entry.name,
      averageReturn: entry.averageReturn,
      net: entry.net,
      points: (line?.returns ?? []).flatMap((point) =>
        point
          ? [
              {
                index: point.sessionIndex,
                value: point.runningAverage,
                sessionReturn: point.sessionReturn,
                sampleCount: point.sampleCount,
                net: line?.cumulativeNet[point.sessionIndex] ?? 0,
              },
            ]
          : [],
      ),
    };
  });
}

/** Rebuilds each friend-visible line, carrying the last point across missed games. */
export function chartLinesFromGroup(group: GroupStandings): ChartLine[] {
  return group.rows.map((row, rowIndex) => {
    const played = group.chart?.[rowIndex] ?? [];
    const points: ChartPoint[] = [];
    played.forEach(([index, value, sessionReturn, net = 0], playedIndex) => {
      const sampleCount = playedIndex + 1;
      const nextPlayed = played[playedIndex + 1]?.[0] ?? group.games + 1;
      points.push({ index, value, sessionReturn, sampleCount, net });
      for (let missed = index + 1; missed < nextPlayed; missed += 1) {
        points.push({ index: missed, value, sessionReturn: null, sampleCount, net });
      }
    });
    return {
      key: `row-${rowIndex}`,
      name: row.name,
      averageReturn: row.averageReturn,
      net: row.net,
      points,
    };
  });
}

/** An axis amount, short enough for the graph's edge: "+₹50K", "−₹1.5M". */
function compactSignedMoney(value: number, symbol: string) {
  if (value === 0) return `${symbol}0`;
  const amount = Math.abs(value);
  const short =
    amount >= 1_000_000
      ? `${Number((amount / 1_000_000).toFixed(2))}M`
      : amount >= 1_000
        ? `${Number((amount / 1_000).toFixed(2))}K`
        : String(Number(amount.toFixed(2)));
  return `${value > 0 ? "+" : "−"}${symbol}${short}`;
}

export function LeaderboardChart({
  sessionCount,
  lines,
}: {
  sessionCount: number;
  lines: ChartLine[];
}) {
  const { symbol, signedMoney } = useMoney();
  const clipId = useId();
  const [metric, setMetric] = useState<ChartMetric>("return");
  const [highlight, setHighlight] = useState<string | null>(null);
  const chartWidth = 320;
  const chartHeight = 240;
  const plot = { top: 10, right: 8, bottom: 36, left: 48 };
  const plotWidth = chartWidth - plot.left - plot.right;
  const plotHeight = chartHeight - plot.top - plot.bottom;
  const isNet = metric === "net";
  const series = lines.map((entry) => {
    const points = entry.points.map((point, pointIndex) => {
      const gameNet = point.net - (entry.points[pointIndex - 1]?.net ?? 0);
      return {
        index: point.index,
        value: isNet ? point.net : point.value,
        marked: point.sessionReturn !== null,
        label: isNet
          ? `${entry.name}, game ${point.index}: ${
              point.sessionReturn === null ? "did not play" : `${signedMoney(gameNet)} this game`
            } · ${signedMoney(point.net)} so far`
          : `${entry.name}, game ${point.index}: ${
              point.sessionReturn === null
                ? "did not play"
                : `game return ${formatPercent(point.sessionReturn)}`
            } · average ${formatPercent(point.value)} over ${
              point.sampleCount
            } game${point.sampleCount === 1 ? "" : "s"}`,
      };
    });
    // Money starts from nothing the game before a player's first.
    const first = entry.points[0];
    if (isNet && first) {
      points.unshift({
        index: first.index - 1,
        value: 0,
        marked: false,
        label: `${entry.name}: before their first game`,
      });
    }
    return {
      color: playerColor(entry.name),
      entry,
      points,
    };
  });
  // The legend follows the metric: rank order for returns, most won first for money.
  const legend = isNet
    ? [...series].sort((a, b) => b.entry.net - a.entry.net)
    : series;

  // Returns fit where the lines settle, so a player's first wild games can
  // run off the edge; money fits every point.
  const axis = isNet
    ? chartAxis(
        series.flatMap((player) => player.points.map((point) => point.value)),
        { minSpan: 10 },
      )
    : chartAxis(
        settledValues(lines.map((entry) => entry.points)),
        { minSpan: 10 },
      );
  const xFor = (index: number) =>
    plot.left + (index / Math.max(1, sessionCount)) * plotWidth;
  const yFor = (value: number) =>
    plot.top + ((axis.max - value) / (axis.max - axis.min || 1)) * plotHeight;
  const xLabelEvery = Math.max(1, Math.ceil(sessionCount / 5));
  const tickLabel = (value: number) => {
    if (isNet) return compactSignedMoney(value, symbol);
    if (value === 0) return "0%";
    return `${value > 0 ? "+" : "−"}${Math.abs(value)}%`;
  };
  const title = isNet ? "Net Profit or Loss" : "Average Return";
  const description = isNet
    ? "Each colored line shows the money one player has won or lost so far, after every ranked game. Games they missed keep the line flat."
    : "Each colored line shows one player's running average return after every game, starting at their first ranked game. Games they missed carry the previous average forward. A player's first games can run past the top or bottom edge.";
  // Draw the highlighted line last so it sits on top.
  const drawOrder = [...series].sort(
    (a, b) =>
      Number(a.entry.key === highlight) - Number(b.entry.key === highlight),
  );

  return (
    <>
      <div className="section-heading chart-heading">
        <h2>{title}</h2>
        <div className="segmented chart-metric" role="group" aria-label="Graph shows">
          {(
            [
              ["return", "Return %"],
              ["net", "Net"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={metric === value ? "selected" : ""}
              aria-pressed={metric === value}
              onClick={() => setMetric(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <figure className="glass card leaderboard-chart" aria-label={title}>
        <svg
          className="chart-plot"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
          aria-labelledby="standings-chart-title standings-chart-description"
        >
          <title id="standings-chart-title">{title}</title>
          <desc id="standings-chart-description">{description}</desc>
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
                {tickLabel(tick)}
              </text>
            </g>
          ))}

          {Array.from({ length: sessionCount + 1 }, (_, index) =>
            index === 0 ||
            index === sessionCount ||
            (index % xLabelEvery === 0 && sessionCount - index >= xLabelEvery / 2) ? (
              <text
                className="chart-label"
                key={index}
                x={xFor(index)}
                y={plot.top + plotHeight + 14}
                textAnchor={index === 0 ? "start" : index === sessionCount ? "end" : "middle"}
              >
                {index === 0 ? "Start" : index}
              </text>
            ) : null,
          )}
          <text
            className="chart-axis-title"
            x={plot.left + plotWidth / 2}
            y={chartHeight - 2}
            textAnchor="middle"
          >
            Game
          </text>

          <g clipPath={`url(#${clipId})`}>
            {drawOrder.map((player) => {
              const last = player.points.at(-1);
              const dimmed = highlight !== null && highlight !== player.entry.key;
              const focused = highlight === player.entry.key;
              return (
                <g
                  key={player.entry.key}
                  className="chart-series"
                  opacity={dimmed ? 0.12 : 1}
                >
                  <polyline
                    className="chart-line"
                    points={player.points
                      .map((point) => `${xFor(point.index)},${yFor(point.value)}`)
                      .join(" ")}
                    stroke={player.color}
                    strokeWidth={focused ? 3 : 1.8}
                  />
                  {player.points.map((point) =>
                    point.marked || point === last ? (
                      <circle
                        cx={xFor(point.index)}
                        cy={yFor(point.value)}
                        fill={player.color}
                        key={point.index}
                        r={point === last ? 3.2 : 1.4}
                      >
                        <title>{point.label}</title>
                      </circle>
                    ) : null,
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {/* Two columns read top to bottom, left column first, so rank order
            runs down each column. */}
        <div
          className="chart-legend"
          style={{ gridTemplateRows: `repeat(${Math.ceil(legend.length / 2)}, auto)` }}
        >
          {legend.map(({ color, entry }) => {
            const value = entry.averageReturn;
            const dimmed = highlight !== null && highlight !== entry.key;
            return (
              <button
                className="legend-item"
                key={entry.key}
                type="button"
                aria-pressed={highlight === entry.key}
                style={{ opacity: dimmed ? 0.4 : 1 }}
                onClick={() =>
                  setHighlight((current) =>
                    current === entry.key ? null : entry.key,
                  )
                }
              >
                <span className="legend-dot" style={{ backgroundColor: color }} />
                <span className="legend-name">{entry.name}</span>
                <span
                  className={`legend-value ${toneClass(isNet ? entry.net : value)}`}
                >
                  {value === null
                    ? "unranked"
                    : isNet
                      ? signedMoney(entry.net)
                      : formatPercent(value)}
                </span>
              </button>
            );
          })}
        </div>
      </figure>
    </>
  );
}
