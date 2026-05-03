/**
 * lab-trial-post tool — post a trial writ from a YAML manifest.
 *
 * CLI surface (via the framework's auto-grouping):
 *
 *     nsg lab trial-post <manifest>
 *     nsg lab trial-post --manifest <path> [--draft]
 *
 * Steps:
 *   1. Read and validate the manifest YAML (parse, schema, fixture
 *      DAG, probe id uniqueness).
 *   2. Translate to a writ-post shape + the trial config that lands
 *      under `ext.laboratory.config`.
 *   3. Post the writ via `clerk.post` (type: 'trial').
 *   4. Stamp the trial config via `clerk.setWritExt` under the
 *      'laboratory' plugin id.
 *   5. Unless `--draft` is set, transition the writ from 'new' to
 *      'open' so the rig fires immediately (parallel to the
 *      `commission-post` UX for mandates).
 *
 * The codex parameter follows the same auto-resolution rules
 * commission-post uses: when omitted, inherit from parentId; or if
 * the guild has exactly one registered codex, default to that;
 * otherwise the call fails with a clear error.
 */

import { resolve as resolvePath } from 'node:path';

import { z } from 'zod';
import { guild, VERSION as LAB_HOST_VERSION } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { ClerkApi } from '@shardworks/clerk-apparatus';
import { manifestToWritShape, readManifestFile } from '../manifest.ts';
import { TRIAL_TYPE_NAME } from '../types.ts';
import { isStablePin } from '../stable-pin.ts';

/** Plugin id for the laboratory ext slot. */
const LABORATORY_PLUGIN_ID = 'laboratory';

/**
 * Minimal structural subset of the codexes apparatus's API the
 * handler relies on for the auto-resolution shortcut. Declared
 * locally to keep `codexes` a soft (recommends) dependency — the
 * trial-post handler does not import the codexes package.
 */
interface CodexRegistry {
  list(): Promise<Array<{ name: string }>>;
}

export default tool({
  name: 'lab-trial-post',
  description: 'Post a trial writ from a YAML manifest',
  instructions:
    'Reads a YAML manifest describing the trial (slug, fixtures, scenario, probes, archive), ' +
    'validates it (schema + fixture DAG + probe id uniqueness), posts a trial writ with the ' +
    'config attached at ext.laboratory.config, and (unless --draft is passed) transitions the ' +
    'writ from new to open so the rig fires. The manifest schema mirrors LaboratoryTrialConfig ' +
    'with optional title, description, parentId, and codex fields. ' +
    'Codex resolution follows commission-post conventions: omitted codex inherits from parentId ' +
    'when provided; otherwise defaults to the single registered codex when the guild has exactly ' +
    'one, fails with a clear error when the guild has multiple, and fails when none are registered.',
  params: {
    manifest: z.string().describe('Path to the YAML manifest file describing the trial.'),
    draft: z
      .boolean()
      .optional()
      .describe(
        'When true, leave the writ in new (draft) phase instead of transitioning to open. ' +
        'Draft writs are held out of the queue until explicitly published with writ-publish.',
      ),
  },
  permission: 'write',
  handler: async (params) => {
    const manifest = await readManifestFile(params.manifest);
    const { title, body, parentId, codex, trialConfig } = manifestToWritShape(manifest);

    // Stamp the absolute manifest path so engines can resolve
    // manifest-relative paths in givens (files[].sourcePath,
    // briefPath, …). resolvePath() makes it absolute against the
    // current process cwd if the user passed a relative path on the
    // CLI; ALWAYS-ABSOLUTE in the writ keeps the engine-side
    // resolution simple (just dirname + path.resolve).
    trialConfig.manifestPath = resolvePath(params.manifest);

    // Resolve frameworkVersion: manifest → lab-host VERSION → fail.
    // Refuses dev source ('0.0.0') because dev artifacts aren't
    // reproducible — manifest authors must pin explicitly when
    // running on a dev lab-host. The resolved value is written back
    // into the trial config so the archive snapshot captures the
    // pin actually used.
    if (trialConfig.frameworkVersion === undefined) {
      if (LAB_HOST_VERSION === '0.0.0') {
        throw new Error(
          'lab-trial-post: frameworkVersion must be specified in the manifest when the lab host ' +
          'is running from unbuilt source (VERSION=0.0.0). Add a top-level `frameworkVersion: ' +
          '<stable-pin>` field to the manifest.',
        );
      }
      const fallback = LAB_HOST_VERSION;
      const stable = isStablePin(fallback);
      if (!stable.ok) {
        throw new Error(
          `lab-trial-post: lab-host's @shardworks/nexus-core VERSION="${fallback}" is not a ` +
          `stable pin (${stable.reason}). Specify frameworkVersion explicitly in the manifest.`,
        );
      }
      trialConfig.frameworkVersion = fallback;
    }

    const clerk = guild().apparatus<ClerkApi>('clerk');

    // Resolve parentId via clerk's id-resolver (accepts prefixes and
    // canonical ids).
    const resolvedParentId = parentId ? await clerk.resolveId(parentId) : undefined;

    // Codex auto-resolution — same rules as commission-post.
    let resolvedCodex = codex;
    if (resolvedCodex === undefined && resolvedParentId === undefined) {
      const codexes = guild().tryApparatus<CodexRegistry>('codexes');
      const registered = codexes ? await codexes.list() : [];
      const names = registered
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
      if (names.length === 1) {
        resolvedCodex = names[0];
      } else if (names.length === 0) {
        throw new Error(
          'no codexes are registered; install a codex package or declare one in guild.json before posting trials',
        );
      } else {
        throw new Error(
          `lab-trial-post: --codex is required when the guild has multiple codexes (registered: ${names.join(', ')})`,
        );
      }
    }

    // 1. Post the writ in its declared initial state ('new').
    const writ = await clerk.post({
      type: TRIAL_TYPE_NAME,
      title,
      body,
      codex: resolvedCodex,
      parentId: resolvedParentId,
    });

    // 2. Stamp ext.laboratory.config with the trial config.
    let stamped = await clerk.setWritExt(writ.id, LABORATORY_PLUGIN_ID, {
      config: trialConfig,
    });

    // 3. Auto-publish to 'open' unless --draft was supplied.
    if (params.draft !== true) {
      stamped = await clerk.transition(stamped.id, 'open');
    }

    return stamped;
  },
});
