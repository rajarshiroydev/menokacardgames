/**
 * The standings graph's y-axis (user request 2026-10-26: lines looked alike
 * because a few early spikes set the scale). The axis spans only the values
 * it is given, always with zero, so it isn't mirrored around zero, and its
 * gridlines sit at round numbers.
 */

export type ChartAxis = {
  min: number;
  max: number;
  ticks: number[];
};

/** The 1, 2 or 5 × 10ⁿ nearest to `raw` (on a log scale). */
export function niceChartStep(raw: number) {
  const power = 10 ** Math.floor(Math.log10(raw));
  const candidates = [1, 2, 5, 10].map((factor) => factor * power);
  return candidates.reduce((best, step) =>
    Math.abs(Math.log(step / raw)) < Math.abs(Math.log(best / raw)) ? step : best,
  );
}

/**
 * An axis just past `values` and zero, with gridlines at round steps inside
 * it, about `targetSteps` apart. Ending at the data rather than the next
 * gridline keeps the lines using the graph's full height. `minSpan` keeps a
 * flat graph from zooming into tiny steps.
 */
export function chartAxis(
  values: number[],
  { minSpan, targetSteps = 5 }: { minSpan: number; targetSteps?: number },
): ChartAxis {
  const finite = values.filter(Number.isFinite);
  let low = Math.min(0, ...finite);
  let high = Math.max(0, ...finite);
  if (high - low < minSpan) {
    // Grow evenly around the data, keeping zero in view.
    const grow = (minSpan - (high - low)) / 2;
    if (low === 0) high = low + minSpan;
    else if (high === 0) low = high - minSpan;
    else {
      low -= grow;
      high += grow;
    }
  }
  // A little room so the end dots aren't cut by the edge.
  const pad = (high - low) * 0.04;
  const min = low < 0 ? low - pad : low;
  const max = high > 0 ? high + pad : high;
  const step = niceChartStep((high - low) / targetSteps);
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  // Whole multiples of the step, rounded so 0.1 × 3 prints as 0.3.
  const ticks = Array.from({ length: last - first + 1 }, (_, index) => {
    const value = (first + index) * step;
    return Math.round(value * 1e6) / 1e6 || 0;
  }).reverse();
  return { min, max, ticks };
}

/**
 * The values the return graph's height is fitted to: every line's point
 * after its first `settle` games, plus each line's latest point. A running
 * average over one or two games swings wildly, so those early points may run
 * off the top or bottom of the graph instead of flattening every line.
 */
export function settledValues(
  lines: Array<Array<{ value: number; sampleCount: number }>>,
  settle = 2,
) {
  return lines.flatMap((points) => [
    ...points.filter((point) => point.sampleCount > settle).map((point) => point.value),
    ...(points.length ? [points[points.length - 1].value] : []),
  ]);
}
