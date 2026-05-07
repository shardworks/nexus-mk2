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

/**
 * Claude-direct trial template — single-stage shape.
 *
 * Used by claude-direct trials whose scenario engine is
 * `spider.graft-rig-template`. The graft engine looks this template up
 * by qualified name (`laboratory.claude-direct-monolithic`) and grafts
 * it into the rig as the scenario's tail.
 *
 * Stages:
 *   - `implement` — `lab.claude-session` against the codex working dir
 *   - `verify`    — `lab.shell-command` running the trial's verifyCommand
 *
 * Caller givens (passed through `spider.graft-rig-template` and
 * substituted into `${vars.<key>}` references below):
 *   - rolePath        : abs path → claude session's --system-prompt-file
 *   - briefPath       : abs path → work prompt content
 *   - model           : claude model id
 *   - cwd             : codex working dir (typically
 *                       `${yields.fixture-codex-checkout-setup.workdir}`)
 *   - executionWrap   : 'production' | 'bare'
 *   - verifyCommand   : shell command run by lab.shell-command
 *   - verifyTimeoutMs : optional, default 600_000 in lab.shell-command
 *
 * Manifest-local rigTemplates (config.spider.rigTemplates) don't apply
 * on the lab host's own spider — the lab guild's spider config doesn't
 * change per-trial. Until that's wired through (separate piece of work),
 * canonical claude-direct trial templates ship from the laboratory plugin
 * as kit contributions.
 */
export const CLAUDE_DIRECT_MONOLITHIC: RigTemplate = {
  engines: [
    {
      id: 'implement',
      designId: 'lab.claude-session',
      upstream: [],
      givens: {
        writ: '${writ}',
        rolePath: '${vars.rolePath}',
        briefPath: '${vars.briefPath}',
        model: '${vars.model}',
        cwd: '${vars.cwd}',
        executionWrap: '${vars.executionWrap}',
      },
    },
    {
      id: 'verify',
      designId: 'lab.shell-command',
      upstream: ['implement'],
      givens: {
        command: '${vars.verifyCommand}',
        cwd: '${vars.cwd}',
        timeoutMs: '${vars.verifyTimeoutMs}',
      },
    },
  ],
  resolutionEngine: 'verify',
};

/**
 * Claude-direct trial template — implement → review → revise → verify.
 *
 * Used by claude-direct trials where production's review-loop dynamic
 * matters (especially with sonnet-class implementers that benefit from a
 * revision pass). Qualified template name:
 * `laboratory.claude-direct-with-review`.
 *
 * Stages:
 *   - `implement` — `lab.claude-session` (role: artificer; brief: caller-supplied)
 *   - `review`    — `lab.claude-session` with `outputContract: review-pass-concerns`.
 *                   Reviewer reads HEAD + the brief and emits either
 *                   `REVIEW: PASS` or `REVIEW: CONCERNS\n<body>`. Engine
 *                   yields `{ passed: bool, concerns: string }`.
 *   - `revise`    — `lab.claude-session` gated by
 *                   `when: '!${yields.review.passed}'`. Skipped entirely
 *                   when review passed (Spider's existing skip semantics);
 *                   when run, receives a promptTemplate citing the
 *                   reviewer's concerns.
 *   - `verify`    — `lab.shell-command`. Runs whether revise ran or was
 *                   skipped (the rig DAG flows through skipped engines).
 *
 * Caller givens beyond the monolithic shape:
 *   - reviewerRolePath  : abs path → reviewer's --system-prompt-file
 *   - reviewerModel     : claude model id for review session (often opus)
 *
 * Multi-iteration loops (review_2 / revise_2 / ...) aren't expressible
 * in this template; if a future experiment needs them, author a
 * `claude-direct-with-review-2-iter` template alongside.
 */
export const CLAUDE_DIRECT_WITH_REVIEW: RigTemplate = {
  engines: [
    {
      id: 'implement',
      designId: 'lab.claude-session',
      upstream: [],
      givens: {
        writ: '${writ}',
        rolePath: '${vars.rolePath}',
        briefPath: '${vars.briefPath}',
        model: '${vars.model}',
        cwd: '${vars.cwd}',
        executionWrap: '${vars.executionWrap}',
      },
    },
    {
      id: 'review',
      designId: 'lab.claude-session',
      upstream: ['implement'],
      givens: {
        writ: '${writ}',
        rolePath: '${vars.reviewerRolePath}',
        briefPath: '${vars.briefPath}',
        model: '${vars.reviewerModel}',
        cwd: '${vars.cwd}',
        executionWrap: 'bare',
        outputContract: 'review-pass-concerns',
      },
    },
    {
      id: 'revise',
      designId: 'lab.claude-session',
      upstream: ['review'],
      when: '!${yields.review.passed}',
      givens: {
        writ: '${writ}',
        rolePath: '${vars.rolePath}',
        promptTemplate:
          'A reviewer evaluated your prior commit (HEAD) against this brief and raised the following concerns. Address them and recommit.\n\n' +
          '## Original brief\n\n' +
          'Re-read the original brief at: ${vars.briefPath}\n\n' +
          '## Reviewer concerns\n\n' +
          '${yields.review.concerns}',
        model: '${vars.model}',
        cwd: '${vars.cwd}',
        executionWrap: '${vars.executionWrap}',
      },
    },
    {
      id: 'verify',
      designId: 'lab.shell-command',
      upstream: ['revise'],
      givens: {
        command: '${vars.verifyCommand}',
        cwd: '${vars.cwd}',
        timeoutMs: '${vars.verifyTimeoutMs}',
      },
    },
  ],
  resolutionEngine: 'verify',
};

/** The Laboratory's rig templates, keyed by unqualified template name. */
export const rigTemplates: Record<string, RigTemplate> = {
  'post-and-collect-default': POST_AND_COLLECT_DEFAULT,
  'claude-direct-monolithic': CLAUDE_DIRECT_MONOLITHIC,
  'claude-direct-with-review': CLAUDE_DIRECT_WITH_REVIEW,
};

/** Writ-type → unqualified-template-name mappings. */
export const rigTemplateMappings: Record<string, string> = {
  trial: 'post-and-collect-default',
};
