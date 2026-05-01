/**
 * The Laboratory — public types.
 *
 * Two concerns live here:
 *
 *   1. The `trial` writ type configuration — its state machine, registered
 *      with the Clerk at startup. Mirrors the mandate lifecycle (`new →
 *      open → completed | failed | cancelled`, with `stuck` as a
 *      non-terminal "needs attention" state off `open`). Trials are leaves
 *      in v1 — the `experiment` parent type is reserved for v2 (see click
 *      c-momaacry).
 *
 *   2. The `ext.laboratory.config` schema — the structured trial
 *      configuration carried on every trial writ. Mirrors the YAML
 *      manifest shape exactly so the CLI's translation layer is a thin
 *      validator + post step.
 *
 * The legacy `LaboratoryConfig` (data-mirroring stub) is removed — that
 * plugin's no-op phase is over.
 *
 * See: experiments/infrastructure/setup-and-artifacts.md (the standalone-bash
 * spec the apparatus supersedes; its run.yaml shape is the template here).
 */

import type { WritTypeConfig } from '@shardworks/clerk-apparatus';

// ── Writ-type configuration ──────────────────────────────────────────

/** The writ-type name registered with the Clerk. */
export const TRIAL_TYPE_NAME = 'trial';

/**
 * The `trial` writ type. State machine mirrors mandate's
 * `new → open → completed/failed/cancelled` with `stuck` as a
 * non-terminal off `open`. Children-cascade behavior is included so
 * trials can be nested under a future `experiment` parent without a
 * config-level migration; in v1 trials are leaves and the cascade
 * triggers are inert.
 */
export const TRIAL_WRIT_TYPE_CONFIG: WritTypeConfig = {
  name: TRIAL_TYPE_NAME,
  states: [
    {
      name: 'new',
      classification: 'initial',
      allowedTransitions: ['open', 'cancelled'],
    },
    {
      name: 'open',
      classification: 'active',
      allowedTransitions: ['stuck', 'completed', 'failed', 'cancelled'],
    },
    {
      name: 'stuck',
      classification: 'active',
      attrs: ['stuck'],
      allowedTransitions: ['open', 'failed', 'cancelled'],
    },
    {
      name: 'completed',
      classification: 'terminal',
      attrs: ['success'],
      allowedTransitions: [],
    },
    {
      name: 'failed',
      classification: 'terminal',
      attrs: ['failure'],
      allowedTransitions: [],
    },
    {
      name: 'cancelled',
      classification: 'terminal',
      attrs: ['cancelled'],
      allowedTransitions: [],
    },
  ],
  childrenBehavior: {
    allSuccess: { transition: 'completed', copyResolution: true },
    anyFailure: { transition: 'failed', copyResolution: true },
    parentTerminal: {
      transition: 'cancelled',
      resolution: 'Automatically cancelled due to parent termination',
    },
  },
};

// ── ext.laboratory.config schema ─────────────────────────────────────
//
// The structured trial configuration. Mirrors the YAML manifest shape
// (see docs/laboratory/manifest-format.md once authored). Every field
// here will be validated by the manifest CLI before the trial writ is
// posted.

/**
 * Slug carried on every trial — used in disposable-surface naming
 * (codex repo, guild dir). Authored by the manifest. Length-limited at
 * the CLI boundary (see manifest-cli child); engines treat it as
 * already-validated input.
 *
 * Format target: lowercase kebab-case, alphanumeric + hyphen only,
 * 1–40 chars. Disposable-resource names of the shape
 * `trial-<slug>-<trialId-prefix>` slot below 63-char DNS / GH-repo
 * limits with margin.
 */
export type TrialSlug = string;

/**
 * One fixture declaration in a trial. Fixtures handle setup and
 * teardown of disposable surfaces (codex repos, test guilds, etc.)
 * and form a dependency DAG.
 *
 * Setup and teardown are paired engines. By convention the teardown
 * engine id is the setup id with `-setup` swapped for `-teardown`
 * (e.g. `lab.codex-setup` ↔ `lab.codex-teardown`). The `teardownEngineId`
 * field overrides this default when the convention doesn't fit.
 *
 * MVP0 ships trial-scope only — every fixture is fresh per trial,
 * torn down at trial end. The `scope` and `mutability` hooks are
 * reserved for v2 (see click c-mom19282).
 */
export interface TrialFixtureDecl {
  /** Fixture id within this trial. Referenced by `dependsOn`. */
  id: string;
  /** Setup engine design id (e.g. `'lab.codex-setup'`). */
  engineId: string;
  /** Override teardown engine id. Defaults to convention (`-setup` → `-teardown`). */
  teardownEngineId?: string;
  /** Givens passed to BOTH the setup and teardown engines. */
  givens: Record<string, unknown>;
  /** Other fixture ids that must be set up before this one. */
  dependsOn?: string[];
  /** Reserved for v2 — only `'trial'` valid in v1. */
  scope?: 'trial';
  /** Reserved for v2 — informational in v1. */
  mutability?: 'mutable' | 'read-only' | 'snapshotted';
}

/**
 * The scenario — what work runs inside the trial after fixtures are
 * up. In v1, scenarios are themselves engine designs (commission-post-
 * xguild + wait-for-writ-terminal-xguild are the canonical pair).
 * Future scenarios may compose multiple engine invocations.
 */
export interface TrialScenarioDecl {
  /** Engine design id to run as the scenario. */
  engineId: string;
  /** Givens passed to the scenario engine. */
  givens: Record<string, unknown>;
}

/** A probe — extracts data from one or more fixtures. */
export interface TrialProbeDecl {
  /** Probe id within this trial. */
  id: string;
  /** Engine design id (e.g. `'lab.probe-stacks-dump'`). */
  engineId: string;
  /** Givens passed to the probe engine. */
  givens: Record<string, unknown>;
}

/**
 * The archive declaration — where probe outputs land at trial end.
 * The engine and storage layout are being designed under click
 * c-momaa5o9; this shape is provisional.
 */
export interface TrialArchiveDecl {
  /** Engine design id (e.g. `'lab.archive'`). */
  engineId: string;
  /** Givens passed to the archive engine. */
  givens: Record<string, unknown>;
}

/**
 * The structured payload carried on every trial writ at
 * `ext.laboratory.config`. The manifest YAML on disk has the same
 * shape plus a top-level `description` field that lands on the writ
 * body instead of in `ext`.
 */
export interface LaboratoryTrialConfig {
  /** Trial slug (used in disposable-surface naming). */
  slug: TrialSlug;
  /** Fixtures to set up (DAG; topo-sort happens at template time). */
  fixtures: TrialFixtureDecl[];
  /** The workload that runs after setup. */
  scenario: TrialScenarioDecl;
  /** Probes to extract data. Run after the scenario reaches its end-condition. */
  probes: TrialProbeDecl[];
  /** Archive — where probe outputs go. */
  archive: TrialArchiveDecl;
}

// ── GuildConfig augmentation ─────────────────────────────────────────
//
// The Laboratory contributes no top-level guild.json config in v1.
// Trial-specific configuration lives on individual writs at
// `ext.laboratory.config`, not in guild config. Reserved for future
// global lab settings (e.g. default codex org, archive root path).

export interface LaboratoryConfig {
  /**
   * Reserved for v2. No fields read in v1 — present so guild.json
   * fragments that include an empty `laboratory: {}` block still
   * typecheck.
   */
  reserved?: never;
}

declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    laboratory?: LaboratoryConfig;
  }
}
