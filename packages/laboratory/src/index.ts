/**
 * @shardworks/laboratory-apparatus — The Laboratory (retired).
 *
 * This plugin is a retired observational apparatus. It previously watched
 * Stacks CDC events on the Clerk's writs and links books and the
 * Animator's sessions book, mirroring data into the sanctum's
 * `experiments/data/commission-log.yaml` and `experiments/data/commissions/<id>/`
 * trees. As of 2026-04-30, the manual commission-log fields have been
 * deprecated as a research instrument (spec generation is automated, so
 * spec quality has no patron-set variance, and structured patron review
 * has been retired). All collection points have been removed.
 *
 * The data the Laboratory used to mirror is fully available from the
 * guild books: writ status and links from `clerk` (writs, links), and
 * session telemetry (cost, tokens, duration, anima identity, engine id)
 * from `animator/sessions` plus structural engine-to-session linkage from
 * `spider/rigs`.
 *
 * The plugin is left as a no-op so existing guild.json registrations
 * remain loadable. Once the plugin entry is removed from each guild's
 * configuration, this package can be deleted entirely.
 */

import type { Plugin } from '@shardworks/nexus-core';

// Re-export the (now nearly-empty) config type for backward compatibility
// with any tooling that imports from this package.
export type { LaboratoryConfig } from './types.ts';

const laboratoryPlugin: Plugin = {
  apparatus: {
    requires: [],

    start: async () => {
      // No-op. This apparatus has been retired; all CDC watchers and
      // file-mirroring behavior have been removed.
    },
  },
};

export default laboratoryPlugin;
