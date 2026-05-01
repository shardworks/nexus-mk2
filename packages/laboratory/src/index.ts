/**
 * @shardworks/laboratory-apparatus — The Laboratory.
 *
 * Apparatus for running trial-shaped experiments on guild
 * configurations. Audiences:
 *
 *   - **Nexus dev:** cost/quality tuning (P3 work, prompt evaluation,
 *     plugin variant comparison) — automate the experimental-
 *     infrastructure spec at experiments/infrastructure/setup-and-
 *     artifacts.md.
 *   - **End users:** evaluate their own prompts/plugins/configs by
 *     authoring trial manifests against a stable apparatus surface.
 *
 * Architecture (MVP0):
 *
 *   - One writ type: `trial` — a single execution unit. Lifecycle
 *     mirrors mandate. (Higher-level `experiment` grouping is parked
 *     for v2; click c-momaacry.)
 *   - One canonical rig template: `post-and-collect-default` —
 *     composes fixture-setup, scenario, probes, teardown, and archive
 *     engines from the writ's `ext.laboratory.config`.
 *   - Engines: fixtures (setup/teardown, DAG), scenario (cross-guild
 *     commission post + wait), probes (data extraction), archive
 *     (still in design at click c-momaa5o9).
 *
 * The plugin is currently a skeleton — only the trial writ-type
 * registration is wired. Engine designs, rig templates, and CLI tools
 * are added as their respective implementation children land.
 *
 * See: experiments/infrastructure/setup-and-artifacts.md
 */

import type { Plugin } from '@shardworks/nexus-core';
import { guild } from '@shardworks/nexus-core';
import type { ClerkApi } from '@shardworks/clerk-apparatus';

// ── Public type re-exports ───────────────────────────────────────────

export {
  TRIAL_TYPE_NAME,
  TRIAL_WRIT_TYPE_CONFIG,
} from './types.ts';
export type {
  LaboratoryConfig,
  LaboratoryTrialConfig,
  TrialFixtureDecl,
  TrialScenarioDecl,
  TrialProbeDecl,
  TrialArchiveDecl,
  TrialSlug,
} from './types.ts';

// ── Apparatus ────────────────────────────────────────────────────────

import { TRIAL_WRIT_TYPE_CONFIG } from './types.ts';
import { engines } from './engines/index.ts';
import { rigTemplates, rigTemplateMappings } from './template.ts';

const laboratoryPlugin: Plugin = {
  apparatus: {
    /**
     * Hard requires — apparatuses whose APIs the Laboratory's startup
     * code calls directly (clerk for writ-type registration), plus
     * those whose presence is structurally needed for the lab's
     * contributions to be useful (spider for rig-template execution,
     * fabricator for engine-design registration). Stacks is required
     * transitively via clerk.
     */
    requires: ['stacks', 'clerk', 'spider', 'fabricator'],

    /**
     * Recommended at startup; required at engine-execution time when
     * the relevant fixture or scenario engine actually fires. Marking
     * them as recommends (not requires) lets a guild start the lab
     * without these installed — the trials that touch the missing
     * surface fail when their engine runs, not at startup.
     */
    recommends: ['codexes', 'animator'],

    /**
     * Kit contributions wired up:
     *
     *   - `engines`              — every Laboratory engine design
     *                               (orchestrate + fixture/scenario/
     *                               probe/archive stubs). Stubs land
     *                               their real behavior under their
     *                               respective implementation clicks.
     *   - `rigTemplates`         — the single canonical
     *                               `post-and-collect-default` template
     *                               (head engine: orchestrate).
     *   - `rigTemplateMappings`  — `trial` → `post-and-collect-default`.
     *
     * `tools` (the manifest CLI surface, `nsg lab trial post`) is
     * added under c-moma9ty6.
     */
    supportKit: {
      engines,
      rigTemplates,
      rigTemplateMappings,
    },

    async start() {
      // Register the `trial` writ type with the Clerk. The
      // registration window closes at framework `phase:started`;
      // calling later throws.
      const clerk = guild().apparatus<ClerkApi>('clerk');
      clerk.registerWritType(TRIAL_WRIT_TYPE_CONFIG);
    },
  },
};

export default laboratoryPlugin;
