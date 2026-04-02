/**
 * @shardworks/laboratory-apparatus — The Laboratory.
 *
 * Observational apparatus for experiment data collection. Watches guild
 * state changes via Stacks CDC and writes experiment data to the sanctum.
 * Purely passive — reads and records but never modifies guild state.
 *
 * See: .scratch/specs/laboratory-apparatus.md
 */

import type { Plugin } from '@shardworks/nexus-core';
import { startLaboratory } from './laboratory.ts';

// ── Public types ─────────────────────────────────────────────────────

export type {
  LaboratoryConfig,
  ResolvedConfig,
  WritLike,
  SessionLike,
} from './types.ts';

export { resolveConfig } from './laboratory.ts';

// ── Default export: the apparatus plugin ─────────────────────────────

const laboratoryPlugin: Plugin = {
  apparatus: {
    requires: ['stacks'],

    start: async (ctx) => {
      startLaboratory(ctx);
    },
  },
};

export default laboratoryPlugin;
