/**
 * Statistical aggregation for instrument runs.
 *
 * Computes per-dimension mean and standard deviation, composite
 * statistics from per-run composites, and flags high-variance
 * dimensions.
 */

import type { ParsedRun, AggregateResult, DimensionDef, DimensionStats } from './types.ts';

/** Dimensions with SD above this threshold are flagged */
const HIGH_VARIANCE_THRESHOLD = 0.5;

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sd(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(mean(squaredDiffs));
}

/**
 * Aggregate parsed runs into summary statistics.
 */
export function aggregate(runs: ParsedRun[], dimensionDefs: DimensionDef[]): AggregateResult {
  const n = runs.length;
  if (n === 0) {
    throw new Error('Cannot aggregate zero runs');
  }

  // Per-dimension stats
  const dimensions: Record<string, DimensionStats> = {};
  const highVariance: string[] = [];

  for (const def of dimensionDefs) {
    const values = runs.map((r) => r.dimensions[def.name]).filter((v) => v != null);
    const dimMean = round(mean(values), 2);
    const dimSd = round(sd(values), 2);

    dimensions[def.name] = { mean: dimMean, sd: dimSd };

    if (dimSd > HIGH_VARIANCE_THRESHOLD) {
      highVariance.push(def.name);
    }
  }

  // Composite stats from per-run composites (proper SD, not averaged SDs)
  const compositeValues = runs.map((r) => r.composite);
  const compositeMean = round(mean(compositeValues), 2);
  const compositeSd = round(sd(compositeValues), 2);

  return {
    composite: compositeMean,
    composite_sd: compositeSd,
    n,
    dimensions,
    high_variance: highVariance,
  };
}
