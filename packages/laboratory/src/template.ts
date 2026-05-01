/**
 * The Laboratory's rig templates.
 *
 * MVP0 ships ONE template: `post-and-collect-default`. It contains
 * exactly one engine declaration (`lab.orchestrate`); the rest of
 * the rig — fixture-setups, scenario, probes, archive,
 * fixture-teardowns — is built dynamically as a graft chain at
 * runtime by orchestrate, reading the trial config from
 * `writ.ext.laboratory.config`.
 *
 * Rig template name vs writ-type mapping:
 *
 *   The Spider qualifies kit-contributed template keys by plugin id
 *   when storing them in its registry. The unqualified key
 *   `'post-and-collect-default'` registers as
 *   `'laboratory.post-and-collect-default'`. The mapping value
 *   below uses the unqualified form because spider.ts joins the
 *   plugin id when resolving mappings (matches astrolabe's
 *   convention; see /workspace/nexus/packages/plugins/astrolabe/src
 *   for precedent).
 */

import type { RigTemplate } from '@shardworks/spider-apparatus';

/**
 * The post-and-collect-default rig template — head engine only.
 *
 * `lab.orchestrate` runs first, reads the trial's
 * `ext.laboratory.config`, and grafts the per-trial engine chain
 * onto the rig (returns `{ status: 'completed', graft, graftTail }`).
 * The graft does the real work; this template just bootstraps it.
 */
export const POST_AND_COLLECT_DEFAULT: RigTemplate = {
  engines: [
    {
      id: 'orchestrate',
      designId: 'lab.orchestrate',
      // No upstream — head engine.
      givens: {
        writ: '${writ}',
      },
    },
  ],
  // Resolution comes from the last grafted engine (the final
  // teardown, or archive if no fixtures). The Spider falls back to
  // the last completed engine when resolutionEngine is not set, so
  // we leave it unset and let the natural fallback do the right
  // thing — the graftTail is honored as the rig-completion gate.
};

/**
 * The Laboratory's rig templates, keyed by unqualified template
 * name. The Spider registers them as `laboratory.<key>`.
 */
export const rigTemplates: Record<string, RigTemplate> = {
  'post-and-collect-default': POST_AND_COLLECT_DEFAULT,
};

/**
 * Writ-type → unqualified-template-name mappings. The trial writ
 * type maps to post-and-collect-default by default.
 */
export const rigTemplateMappings: Record<string, string> = {
  trial: 'post-and-collect-default',
};
