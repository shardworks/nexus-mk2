/**
 * Write structured YAML artifacts from instrument results.
 *
 * Produces two outputs:
 *   1. The result artifact (scores, aggregate, per-run detail)
 *   2. The context archive (assembled prompts for reproducibility)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type { InstrumentConfig, InstrumentResult, ResolvedParams } from './types.ts';

/**
 * Write the result artifact to the output directory.
 */
export function writeArtifact(
  outputDir: string,
  config: InstrumentConfig,
  result: InstrumentResult,
): string {
  mkdirSync(outputDir, { recursive: true });

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

  // Per-run detail
  doc.runs = result.runs.map((run, i) => ({
    run: i + 1,
    ...run.dimensions,
    composite: run.composite,
    ...run.qualitative,
  }));

  const artifactPath = join(outputDir, `quality-${config.name}.yaml`);
  const header = [
    `# Quality Review: ${result.params.commission ?? 'unknown'}`,
    `# Instrument: ${config.name} ${config.version}`,
    `# Generated: ${result.reviewed_at}`,
    `# Runs: ${result.aggregate.n} successful of ${config.execution.runs} attempted`,
    '',
  ].join('\n');

  writeFileSync(artifactPath, header + yaml.dump(doc, { lineWidth: 120, sortKeys: false }));
  return artifactPath;
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
  const contextDir = join(outputDir, 'quality-context');
  mkdirSync(contextDir, { recursive: true });

  writeFileSync(join(contextDir, `system-prompt-${config.name}.md`), systemPrompt);
  writeFileSync(join(contextDir, `user-message-${config.name}.md`), userMessage);

  // Save each extracted input separately
  for (const [name, value] of Object.entries(extractedInputs)) {
    if (value) {
      writeFileSync(join(contextDir, `input-${name.toLowerCase()}.txt`), value);
    }
  }
}
