#!/usr/bin/env node
/**
 * CLI entry point for the generic LLM instrument runner.
 *
 * Usage:
 *   instrument-runner --instrument-name <name> [--instrument-version <v>] \
 *     --param key=value --output-dir <path> [--dry-run]
 *
 *   instrument-runner --instrument <path-to-version-dir> \
 *     --param key=value --output-dir <path> [--dry-run]
 *
 * Instrument resolution (in priority order):
 *   1. --instrument <path>    Explicit path to a versioned instrument directory
 *   2. --instrument-name + --instrument-version    Resolves under instrument root
 *   3. --instrument-name only    Auto-selects version if exactly one exists
 *
 * The instrument root defaults to experiments/instruments/ relative to cwd,
 * overridable via --instrument-root.
 */

import { mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import { resolveInstrumentDir } from './resolve.ts';
import { loadConfig, validateParams } from './config.ts';
import { runSetup, runExtractors } from './extract.ts';
import { assemblePrompts } from './template.ts';
import { executeRuns } from './execute.ts';
import { parseRun } from './parse.ts';
import { aggregate } from './aggregate.ts';
import { writeArtifact, writeContext } from './artifact.ts';
import type { ResolvedParams, ParsedRun } from './types.ts';

// ── Parse CLI arguments ─────────────────────────────────────

function parseCliArgs(): {
  instrumentDir: string;
  params: ResolvedParams;
  outputDir: string;
  dryRun: boolean;
} {
  const { values } = parseArgs({
    allowPositionals: false,
    options: {
      instrument: { type: 'string' },
      'instrument-root': { type: 'string' },
      'instrument-name': { type: 'string' },
      'instrument-version': { type: 'string' },
      param: { type: 'string', multiple: true },
      'output-dir': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    console.log(`
Usage:
  instrument-runner --instrument-name <name> [options]
  instrument-runner --instrument <path> [options]

Instrument resolution:
  --instrument <dir>          Explicit path to versioned instrument directory
  --instrument-name <name>    Instrument name (resolved under instrument root)
  --instrument-version <v>    Version to use (required if multiple exist)
  --instrument-root <dir>     Root directory (default: experiments/instruments)

Options:
  --param key=value    Parameter to pass to extractors (repeatable)
  --output-dir <dir>   Where to write artifacts (default: ./output)
  --dry-run            Print plan without executing LLM calls
  --help               Show this help
`);
    process.exit(0);
  }

  // Resolve instrument directory
  const instrumentDir = resolveInstrumentDir({
    instrument: values.instrument,
    instrumentRoot: values['instrument-root'],
    instrumentName: values['instrument-name'],
    instrumentVersion: values['instrument-version'],
  });

  // Parse --param key=value pairs
  const params: ResolvedParams = {};
  for (const p of values.param ?? []) {
    const eq = p.indexOf('=');
    if (eq === -1) {
      console.error(`Error: --param must be key=value, got: ${p}`);
      process.exit(1);
    }
    params[p.slice(0, eq)] = p.slice(eq + 1);
  }

  return {
    instrumentDir,
    params,
    outputDir: resolve(values['output-dir'] ?? './output'),
    dryRun: values['dry-run'] ?? false,
  };
}

// ── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { instrumentDir, params, outputDir, dryRun } = parseCliArgs();

  // 1. Configure
  console.log(`═══ Instrument Runner ═══`);
  const config = loadConfig(instrumentDir);
  console.log(`  Instrument: ${config.name} ${config.version}`);
  console.log(`  Model:      ${config.execution.model}`);
  console.log(`  Runs:       ${config.execution.runs}`);
  console.log(`  Output:     ${outputDir}`);
  console.log('');

  validateParams(config, params);

  // 2. Extract
  console.log('── Extracting inputs ──');
  const contextDir = mkdtempSync(`${tmpdir()}/instrument-ctx-`);

  runSetup(config, instrumentDir, params, contextDir);

  const inputs = runExtractors(config, instrumentDir, params, contextDir);
  for (const [name, value] of Object.entries(inputs)) {
    const lines = value.split('\n').length;
    console.log(`  ${name}: ${lines} lines`);
  }
  console.log('');

  // 3. Assemble prompts
  const { systemPrompt, userMessage } = assemblePrompts(instrumentDir, config.prompts, inputs);
  console.log(`  System prompt: ${systemPrompt.split('\n').length} lines`);
  console.log(`  User message:  ${userMessage.split('\n').length} lines`);
  console.log('');

  // Save context for reproducibility (before execution, in case it fails)
  writeContext(outputDir, config, systemPrompt, userMessage, inputs);
  console.log(`  Context saved to: ${outputDir}/instruments/${config.name}/context/`);

  if (dryRun) {
    console.log('');
    console.log('── DRY RUN ──');
    console.log(`Would execute ${config.execution.runs} runs`);
    console.log(`System prompt: ${systemPrompt.split('\n').length} lines`);
    console.log(`User message: ${userMessage.split('\n').length} lines`);
    process.exit(0);
  }

  // 4. Execute
  console.log('');
  console.log(`── Running ${config.execution.runs} independent reviews in parallel ──`);

  const outcomes = await executeRuns(config.execution, systemPrompt, userMessage);

  const successful = outcomes.filter((o) => o.success);
  const failed = outcomes.filter((o) => !o.success);

  for (const o of outcomes) {
    console.log(`  ${o.success ? '✓' : '✗'} Run ${o.index + 1}${o.error ? ` — ${o.error.split('\n')[0]}` : ''}`);
  }

  if (successful.length < config.execution.min_successful_runs) {
    console.error(
      `\nError: only ${successful.length} runs succeeded (need at least ${config.execution.min_successful_runs})`,
    );
    process.exit(3);
  }

  if (failed.length > 0) {
    console.log(`\n  Warning: ${failed.length} of ${config.execution.runs} runs failed.`);
  }

  // 5. Parse
  console.log('');
  console.log('── Parsing responses ──');

  const parsedRuns: ParsedRun[] = [];
  for (const outcome of successful) {
    const parsed = parseRun(outcome.response, config.output);
    if (parsed) {
      parsedRuns.push(parsed);
      console.log(`  ✓ Run ${outcome.index + 1}: composite ${parsed.composite}`);
    } else {
      console.log(`  ✗ Run ${outcome.index + 1}: could not parse valid scores`);
    }
  }

  if (parsedRuns.length < config.execution.min_successful_runs) {
    console.error(
      `\nError: only ${parsedRuns.length} runs produced parseable scores (need at least ${config.execution.min_successful_runs})`,
    );
    process.exit(4);
  }

  // 6. Aggregate
  const agg = aggregate(parsedRuns, config.output.dimensions);

  // 7. Write artifact
  const result = {
    instrument: { name: config.name, version: config.version },
    params,
    reviewed_at: new Date().toISOString(),
    aggregate: agg,
    runs: parsedRuns,
  };

  const artifactPath = writeArtifact(outputDir, config, result);

  // Summary
  console.log('');
  console.log('═══ Review Complete ═══');
  console.log('');
  console.log(`  Composite:  ${agg.composite} (sd: ${agg.composite_sd})`);
  console.log('  Dimensions:');
  for (const [name, stats] of Object.entries(agg.dimensions)) {
    console.log(`    ${name.padEnd(25)} ${stats.mean} (sd: ${stats.sd})`);
  }
  console.log('');
  console.log(`  Artifact: ${artifactPath}`);

  if (agg.composite_sd > 0.5) {
    console.log('');
    console.log(`  ⚠ High composite variance (sd: ${agg.composite_sd}).`);
    console.log('    Consider increasing runs for this commission.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
