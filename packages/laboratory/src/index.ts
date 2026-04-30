/**
 * @shardworks/laboratory-apparatus — The Laboratory (retired).
 *
 * This plugin is a retired observational apparatus. It previously watched
 * Stacks CDC events on the Clerk's writs and links books and the
 * Animator's sessions book, mirroring observational data into a sanctum
 * filesystem tree. As of 2026-04-30, the underlying research instrument
 * (the commission log) was deprecated — spec generation is now automated
 * (no patron-set quality variance), and structured patron review has been
 * retired. All collection points have been removed. The historical
 * commission-log baseline is preserved as an artifact under X013 and X008.
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
