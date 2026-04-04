/**
 * Write structured YAML artifacts from instrument results.
 *
 * Produces three outputs:
 *   1. The result artifact (scores, aggregate, cost, per-run detail)
 *   2. The context archive (assembled prompts for reproducibility)
 *   3. Per-run transcript JSON (full LLM response envelopes for forensics)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type { InstrumentConfig, InstrumentResult, AggregateCost, ResolvedParams } from './types.ts';
import type { RunOutcome } from './execute.ts';

/**
 * Write the result artifact to the output directory.
 */
export function writeArtifact(
  outputDir: string,
  config: InstrumentConfig,
  result: InstrumentResult,
): string {
  const instrumentDir = join(outputDir, 'instruments', config.name);
  mkdirSync(instrumentDir, { recursive: true });

  // Build the artifact document
  const doc: Record<string, unknown> = {
    instrument: {
      name: config.name,
      version: config.version,
    },
    reviewed_at: result.reviewed_at,
    params: result.params,

    aggregate: {
      composite: result.aggregate.composite,
      composite_sd: result.aggregate.composite_sd,
      n: result.aggregate.n,
      dimensions: result.aggregate.dimensions,
    },
  };

  if (result.aggregate.high_variance.length > 0) {
    (doc.aggregate as Record<string, unknown>).high_variance = result.aggregate.high_variance;
  }

  // Cost summary (when available)
  if (result.cost) {
    doc.cost = result.cost;
  }

  // Per-run detail
  doc.runs = result.runs.map((run, i) => {
    const runDoc: Record<string, unknown> = {
      run: i + 1,
      ...run.dimensions,
      composite: run.composite,
      ...run.qualitative,
    };
    if (run.usage) {
      runDoc.cost_usd = run.usage.cost_usd;
      runDoc.duration_ms = run.usage.duration_ms;
    }
    return runDoc;
  });

  const artifactPath = join(instrumentDir, 'result.yaml');
  const header = [
    `# Instrument: ${config.name} ${config.version}`,
    `# Commission: ${result.params.commission ?? 'unknown'}`,
    `# Generated: ${result.reviewed_at}`,
    `# Runs: ${result.aggregate.n} successful of ${config.execution.runs} attempted`,
    '',
  ].join('\n');

  writeFileSync(artifactPath, header + yaml.dump(doc, { lineWidth: 120, sortKeys: false }));
  return artifactPath;
}

/**
 * Write per-run transcript JSON files for forensic analysis.
 *
 * Each file contains the full `claude --print --output-format json` envelope,
 * preserving the raw LLM response, token usage, cost, and session ID.
 */
export function writeRunTranscripts(
  outputDir: string,
  config: InstrumentConfig,
  outcomes: RunOutcome[],
): void {
  const runsDir = join(outputDir, 'instruments', config.name, 'runs');
  mkdirSync(runsDir, { recursive: true });

  for (const outcome of outcomes) {
    const data = outcome.rawJson ?? {
      // Fallback when JSON envelope wasn't captured
      response_text: outcome.response,
      error: outcome.error,
      success: outcome.success,
    };
    writeFileSync(
      join(runsDir, `run-${outcome.index + 1}.json`),
      JSON.stringify(data, null, 2) + '\n',
    );
  }
}

/**
 * Save the assembled prompts and extraction context for reproducibility.
 */
export function writeContext(
  outputDir: string,
  config: InstrumentConfig,
  systemPrompt: string,
  userMessage: string,
  extractedInputs: Record<string, string>,
): void {
  // Output to instruments/{name}/context/
  const contextDir = join(outputDir, 'instruments', config.name, 'context');
  mkdirSync(contextDir, { recursive: true });

  writeFileSync(join(contextDir, 'system-prompt.md'), systemPrompt);
  writeFileSync(join(contextDir, 'user-message.md'), userMessage);

  // Save each extracted input separately
  for (const [name, value] of Object.entries(extractedInputs)) {
    if (value) {
      writeFileSync(join(contextDir, `input-${name.toLowerCase()}.txt`), value);
    }
  }
}

/**
 * Aggregate cost data across successful runs.
 */
export function aggregateCost(outcomes: RunOutcome[]): AggregateCost | undefined {
  const withUsage = outcomes.filter((o) => o.success && o.usage);
  if (withUsage.length === 0) return undefined;

  return {
    total_cost_usd: round(withUsage.reduce((sum, o) => sum + (o.usage?.cost_usd ?? 0), 0), 6),
    total_input_tokens: withUsage.reduce((sum, o) => sum + (o.usage?.input_tokens ?? 0), 0),
    total_output_tokens: withUsage.reduce((sum, o) => sum + (o.usage?.output_tokens ?? 0), 0),
    total_cache_creation_tokens: withUsage.reduce((sum, o) => sum + (o.usage?.cache_creation_input_tokens ?? 0), 0),
    total_cache_read_tokens: withUsage.reduce((sum, o) => sum + (o.usage?.cache_read_input_tokens ?? 0), 0),
    total_duration_ms: withUsage.reduce((sum, o) => sum + (o.usage?.duration_ms ?? 0), 0),
    model: withUsage[0]?.usage?.model ?? 'unknown',
  };
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
