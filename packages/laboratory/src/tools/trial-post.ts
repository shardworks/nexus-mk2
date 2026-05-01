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

import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { ClerkApi } from '@shardworks/clerk-apparatus';
import { manifestToWritShape, readManifestFile } from '../manifest.ts';
import { TRIAL_TYPE_NAME } from '../types.ts';

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
