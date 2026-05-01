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

const laboratoryPlugin: Plugin = {
  apparatus: {
    /**
     * Hard requires — apparatuses whose APIs the Laboratory's startup
     * code calls directly. Other apparatuses (spider, fabricator,
     * codexes) are required at engine-execution time, not startup,
     * and are checked via the `recommends` channel below so a guild
     * missing them can still load the lab without a hard failure.
     */
    requires: ['stacks', 'clerk'],

    /**
     * Engines contributed by the lab call into these apparatus APIs
     * at run time. The framework emits warnings if any are absent;
     * trials that depend on the missing surface will fail when their
     * engine runs, not at startup.
     */
    recommends: ['spider', 'fabricator', 'codexes'],

    /**
     * Kit contributions. Empty in the skeleton; engines and rig
     * templates are added by subsequent implementation children.
     */
    supportKit: {
      // engines:            {}  — added in c-moma9y1k / c-momaa03d / c-momaa1vt / c-momaa3w7 / c-momaa5o9
      // rigTemplates:       {}  — added in c-moma9vrm
      // rigTemplateMappings:{}  — added in c-moma9vrm
      // tools:              {}  — added in c-moma9ty6 (manifest CLI)
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
