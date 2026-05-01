/**
 * Trial manifest — YAML format, zod schema, parser, and validator.
 *
 * The manifest is the authoring surface for trials. Its shape mirrors
 * `LaboratoryTrialConfig` exactly, with two additions:
 *
 *   - `description` — optional prose that becomes the trial writ's
 *     body (free-form, no structural meaning).
 *   - `title` — optional short title that becomes the trial writ's
 *     title (defaults to `Trial: <slug>`).
 *
 * The manifest also accepts optional `parentId` and `codex` fields
 * for clerk's writ-post API; both are passed through to clerk.post
 * unchanged.
 *
 * Manifest YAML example:
 *
 *     slug: orientation-suppression-strong-prompt
 *     title: P3 orientation suppression — strong prompt variant
 *     description: |
 *       Tests whether an imperative anti-orientation directive in the
 *       implementer handoff produces productive work in <5 turns.
 *
 *     fixtures:
 *       - id: codex
 *         engineId: lab.codex-setup
 *         givens:
 *           upstreamRepo: shardworks/nexus
 *           baseSha: <40-char>
 *
 *       - id: test-guild
 *         engineId: lab.guild-setup
 *         dependsOn: [codex]
 *         givens:
 *           plugins: [...]
 *           config: { ... }
 *           files: [...]
 *
 *     scenario:
 *       engineId: lab.commission-post-xguild
 *       givens:
 *         briefPath: files/brief.md
 *
 *     probes:
 *       - id: stacks
 *         engineId: lab.probe-stacks-dump
 *         givens:
 *           outputPath: stacks-export/
 *
 *     archive:
 *       engineId: lab.archive
 *       givens: {}
 *
 * The parser:
 *   1. Reads the YAML file.
 *   2. Parses it into a JS object.
 *   3. Validates against `manifestSchema`.
 *   4. Cross-validates fixture DAG (cycles, unknown deps, dup ids).
 *   5. Splits into a writ-post shape and the trial config that goes
 *      under `ext.laboratory.config`.
 */

import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type {
  LaboratoryTrialConfig,
  TrialFixtureDecl,
  TrialScenarioDecl,
  TrialProbeDecl,
  TrialArchiveDecl,
} from './types.ts';
import { topoSortFixtures } from './engines/phases.ts';

// ── Slug ──────────────────────────────────────────────────────────

/**
 * Trial slug rules (used in disposable-surface naming):
 *   - lowercase alphanumeric and hyphens only
 *   - must start with a letter
 *   - 1–40 characters
 *
 * `trial-<slug>-<trialId-prefix>` (the codex/repo naming format)
 * with a 40-char slug and an 8-char id-prefix sums to 55 chars,
 * comfortably under the 63-char DNS / GH-repo limit.
 */
export const SLUG_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
export const SLUG_MAX_LENGTH = 40;

const slugSchema = z.string().regex(
  SLUG_PATTERN,
  'must be lowercase kebab-case (start with a letter; alphanumeric and hyphens; ≤40 chars)',
);

// ── Sub-schemas ───────────────────────────────────────────────────

const givensSchema = z.record(z.string(), z.unknown()).default({});

const fixtureSchema = z.object({
  id: z
    .string()
    .min(1, 'must be non-empty')
    .regex(/^[a-z][a-z0-9-]{0,39}$/, 'fixture id must be kebab-case (≤40 chars)'),
  engineId: z.string().min(1, 'engineId is required'),
  teardownEngineId: z.string().min(1).optional(),
  givens: givensSchema,
  dependsOn: z.array(z.string()).optional(),
  scope: z.literal('trial').optional(),
  mutability: z.enum(['mutable', 'read-only', 'snapshotted']).optional(),
}) satisfies z.ZodType<TrialFixtureDecl>;

const scenarioSchema = z.object({
  engineId: z.string().min(1, 'engineId is required'),
  givens: givensSchema,
}) satisfies z.ZodType<TrialScenarioDecl>;

const probeSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9-]{0,39}$/, 'probe id must be kebab-case (≤40 chars)'),
  engineId: z.string().min(1, 'engineId is required'),
  givens: givensSchema,
}) satisfies z.ZodType<TrialProbeDecl>;

const archiveSchema = z.object({
  engineId: z.string().min(1, 'engineId is required'),
  givens: givensSchema,
}) satisfies z.ZodType<TrialArchiveDecl>;

// ── Top-level manifest ────────────────────────────────────────────

export const manifestSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  parentId: z.string().min(1).optional(),
  codex: z.string().min(1).optional(),
  fixtures: z.array(fixtureSchema).default([]),
  scenario: scenarioSchema,
  probes: z.array(probeSchema).default([]),
  archive: archiveSchema,
});

export type TrialManifest = z.output<typeof manifestSchema>;

// ── Parsing & validation ──────────────────────────────────────────

/**
 * Errors thrown by the manifest parser. The CLI catches these and
 * presents them with the manifest file path for actionable feedback.
 */
export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

/**
 * Parse and fully validate a manifest from a YAML string.
 *
 * Validation order:
 *   1. YAML syntactic parse.
 *   2. Schema validation (zod).
 *   3. Cross-field validation:
 *      - fixture id uniqueness (caught by topoSort)
 *      - fixture dependsOn references valid (caught by topoSort)
 *      - fixture dep DAG acyclic (caught by topoSort)
 *      - probe id uniqueness within probes
 */
export function parseManifest(yamlText: string): TrialManifest {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    throw new ManifestError(`YAML parse failed: ${(err as Error).message}`);
  }

  if (raw === null || raw === undefined) {
    throw new ManifestError('manifest is empty');
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ManifestError('manifest must be a YAML map at the top level');
  }

  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new ManifestError(`manifest schema validation failed:\n${issues}`);
  }

  // Cross-field: fixture DAG
  try {
    topoSortFixtures(parsed.data.fixtures);
  } catch (err) {
    throw new ManifestError(`fixture DAG invalid: ${(err as Error).message}`);
  }

  // Cross-field: probe id uniqueness
  const probeIds = new Set<string>();
  for (const probe of parsed.data.probes) {
    if (probeIds.has(probe.id)) {
      throw new ManifestError(`duplicate probe id: "${probe.id}"`);
    }
    probeIds.add(probe.id);
  }

  return parsed.data;
}

/**
 * Read a manifest file, parse it, and validate. Convenience wrapper
 * for the CLI's most common entry path. Wraps file-read errors with
 * the manifest path.
 */
export async function readManifestFile(filePath: string): Promise<TrialManifest> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (err) {
    throw new ManifestError(
      `failed to read manifest at ${filePath}: ${(err as Error).message}`,
    );
  }
  try {
    return parseManifest(text);
  } catch (err) {
    if (err instanceof ManifestError) {
      // Re-throw with the path prefix so error messages are
      // immediately actionable from the CLI.
      throw new ManifestError(`${filePath}: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Split a parsed manifest into the shape clerk.post expects plus the
 * trial config that lands under `ext.laboratory.config`. The split
 * is a pure-data transform; no side effects, no clerk lookups.
 */
export function manifestToWritShape(manifest: TrialManifest): {
  title: string;
  body: string;
  parentId?: string;
  codex?: string;
  trialConfig: LaboratoryTrialConfig;
} {
  const trialConfig: LaboratoryTrialConfig = {
    slug: manifest.slug,
    fixtures: manifest.fixtures,
    scenario: manifest.scenario,
    probes: manifest.probes,
    archive: manifest.archive,
  };
  return {
    title: manifest.title ?? `Trial: ${manifest.slug}`,
    body: manifest.description ?? '',
    parentId: manifest.parentId,
    codex: manifest.codex,
    trialConfig,
  };
}
