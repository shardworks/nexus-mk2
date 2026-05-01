/**
 * Skeleton (stub) engine implementations — for engines that have not yet
 * been replaced by real code. Stubs log, yield a placeholder payload,
 * and return `{ status: 'completed' }` so the rig template's wiring
 * stays exercised end-to-end while implementation lands incrementally.
 *
 * Remaining stubs and the click that lands their real implementation:
 *
 *   - lab.probe-stacks-dump
 *     lab.probe-git-range                            — c-momaa3w7
 *   - lab.archive                                    — c-momaa5o9
 *
 * When swapping a stub for its real implementation, move it to its own
 * file under `engines/`; `stubs.ts` shrinks toward empty.
 *
 * Already replaced:
 *   - lab.codex-setup / lab.codex-teardown          (c-moma9y1k)
 *     → see `engines/codex-fixture.ts`.
 *   - lab.guild-setup / lab.guild-teardown          (c-momaa03d)
 *     → see `engines/guild-fixture.ts`.
 *   - lab.commission-post-xguild
 *     lab.wait-for-writ-terminal-xguild             (c-momaa1vt)
 *     → see `engines/scenario-xguild.ts`.
 */

import type { EngineDesign, EngineRunResult } from '@shardworks/fabricator-apparatus';

/**
 * Build a stub engine: yields a placeholder, returns completed. No
 * console output — a daemon running concurrent rigs would otherwise
 * see stub chatter dominate its logs.
 */
function stubEngine(designId: string, summary: string): EngineDesign {
  return {
    id: designId,
    async run(givens): Promise<EngineRunResult> {
      return {
        status: 'completed',
        yields: {
          stub: true,
          designId,
          summary,
          // Echo a minimal subset of givens so downstream stubs can
          // resolve `${yields.<id>.<key>}` templates without crashing.
          givenKeys: Object.keys(givens),
        },
      };
    },
  };
}

// ── Fixture engines ──────────────────────────────────────────────────

// lab.codex-setup / lab.codex-teardown moved to codex-fixture.ts.
// lab.guild-setup / lab.guild-teardown moved to guild-fixture.ts.

// ── Scenario engines ─────────────────────────────────────────────────

// lab.commission-post-xguild / lab.wait-for-writ-terminal-xguild moved
// to scenario-xguild.ts.

// ── Probe engines ────────────────────────────────────────────────────

export const probeStacksDumpStub = stubEngine(
  'lab.probe-stacks-dump',
  'export every book in test guild as JSON-per-table with carve-out for >50KB rows',
);

export const probeGitRangeStub = stubEngine(
  'lab.probe-git-range',
  'capture per-commit diffs + commits-manifest.yaml between base and head SHAs',
);

// ── Archive engine ───────────────────────────────────────────────────

export const archiveStub = stubEngine(
  'lab.archive',
  'archive probe outputs to the configured target (open: lab books vs sanctum vs hybrid; c-momaa5o9)',
);
