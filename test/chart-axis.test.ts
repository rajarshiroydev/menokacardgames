import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chartAxis, niceChartStep, settledValues } from "../lib/poker/chart-axis.ts";

describe("chart axis", () => {
  it("steps in the nearest 1, 2 or 5 × 10ⁿ", () => {
    assert.equal(niceChartStep(64), 50);
    assert.equal(niceChartStep(80), 100);
    assert.equal(niceChartStep(12), 10);
    assert.equal(niceChartStep(0.3), 0.2);
  });

  it("ends just past the data instead of mirroring it around zero", () => {
    // The Bikram testbed group: settled averages from −88% to +231%.
    const axis = chartAxis([-87.73, 30, 231.05], { minSpan: 10 });
    assert.deepEqual(axis.ticks, [200, 150, 100, 50, 0, -50, -100]);
    assert.ok(axis.max > 231.05 && axis.max < 245);
    assert.ok(axis.min < -87.73 && axis.min > -102);
  });

  it("always shows zero, at the edge when nothing is below it", () => {
    const axis = chartAxis([20, 80], { minSpan: 10 });
    assert.equal(axis.min, 0);
    assert.deepEqual(axis.ticks, [80, 60, 40, 20, 0]);
    assert.equal(chartAxis([-900, -100], { minSpan: 10 }).max, 0);
  });

  it("keeps a flat graph from zooming into tiny steps", () => {
    assert.deepEqual(chartAxis([], { minSpan: 10 }).ticks, [10, 8, 6, 4, 2, 0]);
    const flat = chartAxis([1, -1], { minSpan: 20 });
    assert.ok(flat.max - flat.min >= 20);
  });

  it("prints fractional steps cleanly", () => {
    assert.deepEqual(chartAxis([0.3], { minSpan: 0.3, targetSteps: 3 }).ticks, [0.3, 0.2, 0.1, 0]);
  });
});

describe("settled values", () => {
  it("skips each line's first two games but keeps its latest point", () => {
    const steady = [
      { value: 250, sampleCount: 1 },
      { value: 120, sampleCount: 2 },
      { value: 60, sampleCount: 3 },
    ];
    const newcomer = [{ value: 186, sampleCount: 1 }];
    assert.deepEqual(settledValues([steady, newcomer]), [60, 60, 186]);
  });
});
