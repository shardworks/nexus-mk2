/**
 * @shardworks/instruments — Generic LLM instrument runner.
 *
 * Executes versioned, reproducible LLM evaluation instruments.
 * Each instrument is defined by an instrument.yaml configuration,
 * shell-based extractors for input assembly, prompt templates,
 * and an output schema for parsing structured LLM responses.
 *
 * Primary entry point is the CLI (cli.ts). This module re-exports
 * the core functions for programmatic use.
 */

export { resolveInstrumentDir } from './resolve.ts';
export { loadConfig, validateParams } from './config.ts';
export { runSetup, runExtractors } from './extract.ts';
export { expandTemplate, expandString, assemblePrompts } from './template.ts';
export { executeRuns } from './execute.ts';
export { parseRun } from './parse.ts';
export { aggregate } from './aggregate.ts';
export { writeArtifact, writeContext } from './artifact.ts';
export type * from './types.ts';
