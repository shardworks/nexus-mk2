/**
 * Parse and validate instrument.yaml configuration.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type {
  InstrumentConfig,
  ExecutionConfig,
  ParameterDef,
  InputDef,
  PromptPaths,
  OutputSchema,
  DimensionDef,
  QualitativeDef,
  CompositeDef,
  ResolvedParams,
} from './types.ts';

/**
 * Load and validate an instrument configuration from a directory.
 * The directory must contain an `instrument.yaml` file.
 */
export function loadConfig(instrumentDir: string): InstrumentConfig {
  const configPath = join(instrumentDir, 'instrument.yaml');
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch {
    throw new Error(`Cannot read instrument config: ${configPath}`);
  }

  const doc = yaml.load(raw) as Record<string, unknown>;
  if (!doc || typeof doc !== 'object') {
    throw new Error(`Invalid instrument config: ${configPath} (not a YAML object)`);
  }

  return validateConfig(doc, configPath);
}

function validateConfig(doc: Record<string, unknown>, path: string): InstrumentConfig {
  const require = (field: string): unknown => {
    if (!(field in doc) || doc[field] == null) {
      throw new Error(`Missing required field '${field}' in ${path}`);
    }
    return doc[field];
  };

  const name = String(require('name'));
  const version = String(require('version'));
  const execution = validateExecution(require('execution') as Record<string, unknown>, path);
  const parameters = validateParameters(require('parameters') as Record<string, unknown>, path);
  const inputs = validateInputs(require('inputs') as Record<string, unknown>, path);
  const prompts = validatePrompts(require('prompts') as Record<string, unknown>, path);
  const output = validateOutput(require('output') as Record<string, unknown>, path);
  const setup = doc.setup != null ? String(doc.setup) : undefined;

  return { name, version, execution, parameters, setup, inputs, prompts, output };
}

function validateExecution(raw: Record<string, unknown>, path: string): ExecutionConfig {
  if (!raw || typeof raw !== 'object') throw new Error(`Invalid 'execution' in ${path}`);

  return {
    model: String(raw.model ?? 'claude-opus-4-6'),
    effort: String(raw.effort ?? 'medium'),
    max_turns: Number(raw.max_turns ?? 1),
    tools: 'disabled',
    runs: Number(raw.runs ?? 3),
    min_successful_runs: Number(raw.min_successful_runs ?? 2),
  };
}

function validateParameters(
  raw: Record<string, unknown>,
  path: string,
): Record<string, ParameterDef> {
  if (!raw || typeof raw !== 'object') throw new Error(`Invalid 'parameters' in ${path}`);

  const result: Record<string, ParameterDef> = {};
  for (const [key, val] of Object.entries(raw)) {
    const v = val as Record<string, unknown>;
    result[key] = {
      required: v.required === true,
      description: v.description != null ? String(v.description) : undefined,
    };
  }
  return result;
}

function validateInputs(raw: Record<string, unknown>, path: string): Record<string, InputDef> {
  if (!raw || typeof raw !== 'object') throw new Error(`Invalid 'inputs' in ${path}`);

  const result: Record<string, InputDef> = {};
  for (const [key, val] of Object.entries(raw)) {
    const v = val as Record<string, unknown>;
    result[key] = {
      extractor: String(v.extractor),
      optional: v.optional === true,
    };
  }
  return result;
}

function validatePrompts(raw: Record<string, unknown>, path: string): PromptPaths {
  if (!raw || typeof raw !== 'object') throw new Error(`Invalid 'prompts' in ${path}`);
  if (!raw.system) throw new Error(`Missing 'prompts.system' in ${path}`);
  if (!raw.user) throw new Error(`Missing 'prompts.user' in ${path}`);

  return {
    system: String(raw.system),
    user: String(raw.user),
  };
}

function validateOutput(raw: Record<string, unknown>, path: string): OutputSchema {
  if (!raw || typeof raw !== 'object') throw new Error(`Invalid 'output' in ${path}`);

  const format = String(raw.format ?? 'yaml');
  if (format !== 'yaml') throw new Error(`Unsupported output format '${format}' in ${path}`);

  const dimensions = validateDimensions(raw.dimensions as unknown[], path);
  const qualitative = validateQualitative((raw.qualitative ?? []) as unknown[], path);
  const composite = validateComposite(raw.composite as Record<string, unknown>, path);

  return { format, dimensions, qualitative, composite };
}

function validateDimensions(raw: unknown[], path: string): DimensionDef[] {
  if (!Array.isArray(raw)) throw new Error(`Invalid 'output.dimensions' in ${path}`);

  return raw.map((d) => {
    const dim = d as Record<string, unknown>;
    const range = dim.range as number[];
    if (!Array.isArray(range) || range.length !== 2) {
      throw new Error(`Invalid range for dimension '${dim.name}' in ${path}`);
    }
    return {
      name: String(dim.name),
      type: 'integer' as const,
      range: [range[0], range[1]] as [number, number],
    };
  });
}

function validateQualitative(raw: unknown[], path: string): QualitativeDef[] {
  if (!Array.isArray(raw)) throw new Error(`Invalid 'output.qualitative' in ${path}`);

  return raw.map((q) => {
    const qual = q as Record<string, unknown>;
    return {
      name: String(qual.name),
      type: 'block_scalar' as const,
    };
  });
}

function validateComposite(raw: Record<string, unknown>, path: string): CompositeDef {
  if (!raw || typeof raw !== 'object') throw new Error(`Invalid 'output.composite' in ${path}`);

  const method = String(raw.method ?? 'mean');
  if (method !== 'mean') throw new Error(`Unsupported composite method '${method}' in ${path}`);

  const dimensions = raw.dimensions === 'all' ? 'all' : (raw.dimensions as string[]);
  return { method, dimensions };
}

/**
 * Validate resolved parameters against the instrument's parameter schema.
 */
export function validateParams(
  config: InstrumentConfig,
  params: ResolvedParams,
): void {
  for (const [name, def] of Object.entries(config.parameters)) {
    if (def.required && !params[name]) {
      throw new Error(
        `Missing required parameter '${name}'` +
          (def.description ? ` (${def.description})` : ''),
      );
    }
  }
}
