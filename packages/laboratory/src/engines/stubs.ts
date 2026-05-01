/**
 * Skeleton (stub) engine implementations.
 *
 * Every Laboratory engine other than `lab.orchestrate` is currently a
 * no-op stub: it logs to console, yields a `{ skipped: true, ... }`
 * payload, and returns success. Stubs exist so the rig template wires
 * end-to-end — a posted trial crawls cleanly through orchestrate →
 * grafted-stubs → completion — well before any engine does real work.
 *
 * Each stub will be replaced by its real implementation under the
 * matching click:
 *
 *   - lab.codex-setup / lab.codex-teardown          — c-moma9y1k
 *   - lab.guild-setup / lab.guild-teardown          — c-momaa03d
 *   - lab.commission-post-xguild
 *     lab.wait-for-writ-terminal-xguild             — c-momaa1vt
 *   - lab.probe-stacks-dump
 *     lab.probe-git-range                            — c-momaa3w7
 *   - lab.archive                                    — c-momaa5o9
 *
 * When swapping a stub for its real implementation, move it to its
 * own file under `engines/`; `stubs.ts` shrinks toward empty.
 */

import type { EngineDesign, EngineRunResult } from '@shardworks/fabricator-apparatus';

/** Build a stub engine: logs, yields a placeholder, returns completed. */
function stubEngine(designId: string, summary: string): EngineDesign {
  return {
    id: designId,
    async run(givens, context): Promise<EngineRunResult> {
      // eslint-disable-next-line no-console
      console.log(
        `[${designId}] STUB invoked (rig=${context.rigId} engine=${context.engineId}); ` +
          `givens keys=[${Object.keys(givens).join(', ')}]; summary="${summary}"`,
      );
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

export const codexSetupStub = stubEngine(
  'lab.codex-setup',
  'clone upstream codex at base SHA, push to fresh GH repo, register via nsg codex add',
);

export const codexTeardownStub = stubEngine(
  'lab.codex-teardown',
  'gh repo delete the codex repo created by lab.codex-setup',
);

export const guildSetupStub = stubEngine(
  'lab.guild-setup',
  'nsg init + per-pin nsg plugin install + nsg codex add + deep-merge guild.json + copy files',
);

export const guildTeardownStub = stubEngine(
  'lab.guild-teardown',
  'rm -rf the test guild dir created by lab.guild-setup',
);

// ── Scenario engines ─────────────────────────────────────────────────

export const commissionPostXguildStub = stubEngine(
  'lab.commission-post-xguild',
  'shell out to nsg commission-post --guild-root <test-guild> --brief <path>',
);

export const waitForWritTerminalXguildStub = stubEngine(
  'lab.wait-for-writ-terminal-xguild',
  'poll writ status across guilds via nsg --guild-root <other> writ show',
);

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
