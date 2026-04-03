/**
 * Type definitions for the LLM instrument runner.
 *
 * An "instrument" is a versioned, reproducible LLM evaluation tool:
 * a prompt + parameter set that produces structured numeric output.
 * The runner is generic — instrument-specific logic lives in shell
 * extractors and prompt templates, declared in instrument.yaml.
 */

// ── Instrument Configuration (parsed from instrument.yaml) ──

export interface InstrumentConfig {
  /** Human-readable instrument name */
  name: string;
  /** Version identifier (e.g. "v2") */
  version: string;

  /** LLM execution parameters */
  execution: ExecutionConfig;

  /** CLI parameters the instrument accepts, passed to extractors as env vars */
  parameters: Record<string, ParameterDef>;

  /** Optional setup script that runs before extractors (relative to instrument dir) */
  setup?: string;

  /** Template variables — each maps to an extractor script */
  inputs: Record<string, InputDef>;

  /** Prompt file paths (relative to instrument dir) */
  prompts: PromptPaths;

  /** Schema for parsing and validating LLM output */
  output: OutputSchema;
}

export interface ExecutionConfig {
  model: string;
  effort: string;
  max_turns: number;
  tools: 'disabled';
  runs: number;
  min_successful_runs: number;
}

export interface ParameterDef {
  required: boolean;
  description?: string;
}

export interface InputDef {
  /** Path to extractor script, relative to instrument dir */
  extractor: string;
  /** If true, runner won't abort when extractor fails (template slot left empty) */
  optional?: boolean;
}

export interface PromptPaths {
  system: string;
  user: string;
}

export interface OutputSchema {
  format: 'yaml';
  dimensions: DimensionDef[];
  qualitative: QualitativeDef[];
  composite: CompositeDef;
}

export interface DimensionDef {
  name: string;
  type: 'integer';
  range: [number, number];
}

export interface QualitativeDef {
  name: string;
  type: 'block_scalar';
}

export interface CompositeDef {
  method: 'mean';
  dimensions: 'all' | string[];
}

// ── Runtime Types ───────────────────────────────────────────

/** Resolved parameters from CLI --param flags */
export type ResolvedParams = Record<string, string>;

/** Extractor outputs keyed by input variable name */
export type ExtractedInputs = Record<string, string>;

/** Scores from a single LLM run */
export interface ParsedRun {
  dimensions: Record<string, number>;
  qualitative: Record<string, string>;
  composite: number;
}

/** Aggregated statistics for a single dimension */
export interface DimensionStats {
  mean: number;
  sd: number;
}

/** Full aggregation result */
export interface AggregateResult {
  composite: number;
  composite_sd: number;
  n: number;
  dimensions: Record<string, DimensionStats>;
  high_variance: string[];
}

/** Complete instrument run result */
export interface InstrumentResult {
  instrument: { name: string; version: string };
  params: ResolvedParams;
  reviewed_at: string;
  aggregate: AggregateResult;
  runs: ParsedRun[];
}
