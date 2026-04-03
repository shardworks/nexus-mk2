/**
 * Parse and validate LLM output against the instrument's output schema.
 *
 * The LLM response is expected to contain a YAML block (possibly inside
 * a markdown code fence). The parser extracts the YAML, validates
 * dimension scores against declared ranges, and extracts qualitative
 * fields.
 */

import yaml from 'js-yaml';
import type { OutputSchema, ParsedRun, DimensionDef, CompositeDef } from './types.ts';

/**
 * Extract a YAML block from an LLM response.
 *
 * Handles two cases:
 *   1. Response wrapped in ```yaml ... ``` code fence
 *   2. Raw YAML (the whole response is YAML)
 */
function extractYaml(response: string): string {
  // Try to find a YAML code fence first
  const fenceMatch = response.match(/```(?:yaml)?\s*\n([\s\S]*?)\n\s*```/);
  if (fenceMatch) return fenceMatch[1];

  // Fall back to treating the whole response as YAML
  return response.trim();
}

/**
 * Compute composite score from dimension values.
 */
function computeComposite(
  dimensions: Record<string, number>,
  compositeDef: CompositeDef,
  dimensionDefs: DimensionDef[],
): number {
  const names =
    compositeDef.dimensions === 'all'
      ? dimensionDefs.map((d) => d.name)
      : compositeDef.dimensions;

  const values = names.map((name) => dimensions[name]).filter((v) => v != null);
  if (values.length === 0) return 0;

  // Only 'mean' is supported currently
  const sum = values.reduce((a, b) => a + b, 0);
  return round(sum / values.length, 2);
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * Parse a single LLM run response against the output schema.
 *
 * Returns null if the response cannot be parsed or validated.
 */
export function parseRun(response: string, schema: OutputSchema): ParsedRun | null {
  const yamlText = extractYaml(response);

  let doc: Record<string, unknown>;
  try {
    const parsed = yaml.load(yamlText);
    if (!parsed || typeof parsed !== 'object') return null;
    doc = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  // Extract dimensions — may be nested under a "dimensions" key or flat
  const dimSource = (
    doc.dimensions && typeof doc.dimensions === 'object'
      ? doc.dimensions
      : doc
  ) as Record<string, unknown>;

  const dimensions: Record<string, number> = {};
  for (const def of schema.dimensions) {
    const raw = dimSource[def.name];
    if (raw == null) return null;

    const value = Number(raw);
    if (!Number.isInteger(value)) return null;
    if (value < def.range[0] || value > def.range[1]) return null;

    dimensions[def.name] = value;
  }

  // Extract qualitative fields
  const qualitative: Record<string, string> = {};
  for (const def of schema.qualitative) {
    const raw = doc[def.name];
    qualitative[def.name] = raw != null ? String(raw).trim() : '';
  }

  const composite = computeComposite(dimensions, schema.composite, schema.dimensions);

  return { dimensions, qualitative, composite };
}
