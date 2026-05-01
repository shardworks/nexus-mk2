/**
 * The Laboratory's rig templates.
 *
 * MVP0 ships ONE template: `post-and-collect-default`. Its engine
 * list IS the trial-flow backbone — five phase orchestrators
 * (setup → scenario → probes → archive → teardown) wired in
 * sequence. Each phase orchestrator is a clockwork engine: it
 * reads `writ.ext.laboratory.config`, computes the per-phase
 * graft, and returns immediately. The grafted engines do the
 * real work; the template documents the flow.
 *
 * Why the backbone is in the template (not in a single
 * orchestrator):
 *
 *   - The template is the user-facing shape document for a trial.
 *     With phases visible, reading the template tells you "this
 *     rig runs setup, then scenario, then probes, then archive,
 *     then teardown."
 *   - Per-phase failure visibility: oculus and introspection tools
 *     see the phase backbone in the rig's engine list; "the probes
 *     phase failed" is a more useful signal than "the orchestrator
 *     failed somewhere."
 *   - Each phase orchestrator implementation is cohesive (DAG
 *     sort, parallel scatter, reverse-sequential chain) — splitting
 *     them avoids one big function with phase-mode flags.
 *   - Sets up an extension point: a future plugin contributing
 *     `lab.warmup-phase` (or similar) could slot into a custom
 *     template alongside the existing phases.
 *
 * Cross-phase data flow happens at the work-engine layer, not the
 * orchestrator layer. All grafted engines share a single namespace,
 * so e.g. the scenario engine's upstream points directly at each
 * fixture-setup engine — phase orchestrators don't need to relay
 * yields between phases.
 *
 * Rig template name vs writ-type mapping: the Spider qualifies
 * kit-contributed template keys by plugin id when storing them in
 * its registry. The unqualified key `'post-and-collect-default'`
 * registers as `'laboratory.post-and-collect-default'`. The mapping
 * value below uses the unqualified form because spider.ts joins
 * the plugin id when resolving mappings (matches astrolabe's
 * convention).
 */

import type { RigTemplate } from '@shardworks/spider-apparatus';

/**
 * The post-and-collect-default rig template — five phase
 * orchestrators in sequence.
 *
 * Each phase orchestrator reads the trial's `ext.laboratory.config`,
 * computes its phase's graft, and returns. graftTail is set only
 * on `lab.teardown-phase` (the rig's true end) — intermediate
 * phases let the next phase fire immediately, since real
 * work-engines wait on explicit upstream refs.
 */
export const POST_AND_COLLECT_DEFAULT: RigTemplate = {
  engines: [
    {
      id: 'setup-phase',
      designId: 'lab.setup-phase',
      // Head engine — no upstream.
      givens: { writ: '${writ}' },
    },
    {
      id: 'scenario-phase',
      designId: 'lab.scenario-phase',
      upstream: ['setup-phase'],
      givens: { writ: '${writ}' },
    },
    {
      id: 'probes-phase',
      designId: 'lab.probes-phase',
      upstream: ['scenario-phase'],
      givens: { writ: '${writ}' },
    },
    {
      id: 'archive-phase',
      designId: 'lab.archive-phase',
      upstream: ['probes-phase'],
      givens: { writ: '${writ}' },
    },
    {
      id: 'teardown-phase',
      designId: 'lab.teardown-phase',
      upstream: ['archive-phase'],
      givens: { writ: '${writ}' },
    },
  ],
  // resolutionEngine intentionally unset — the Spider falls back
  //   to the last completed engine, which is the final teardown
  //   (or archive when there are no fixtures), via the
  //   teardown-phase orchestrator's graftTail.
};

/** The Laboratory's rig templates, keyed by unqualified template name. */
export const rigTemplates: Record<string, RigTemplate> = {
  'post-and-collect-default': POST_AND_COLLECT_DEFAULT,
};

/** Writ-type → unqualified-template-name mappings. */
export const rigTemplateMappings: Record<string, string> = {
  trial: 'post-and-collect-default',
};
