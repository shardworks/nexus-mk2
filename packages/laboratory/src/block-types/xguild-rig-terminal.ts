/**
 * Block type: `lab.xguild-rig-terminal`.
 *
 * Holds an engine until the spider rig dispatched from a writ in
 * another guild reaches a terminal `RigStatus`
 * (`completed` | `failed` | `cancelled`). Used for spec-only /
 * planning-only trials whose mandate writ never seals — the rig
 * itself is the only "trial done" signal.
 *
 * Each `check()` is a single dispatch:
 *   1. `nsg rig for-writ <writId>` — discover the rig. While the rig
 *      hasn't been dispatched yet, returns `null` and the check
 *      reports `pending`.
 *   2. Once a rig id is found, `nsg rig show --id <rigId>` — read its
 *      status. `pending` until the status is in the terminal set;
 *      `cleared` when it lands.
 *
 * Both phases share the same `deadline` — once it elapses without
 * reaching a terminal rig, the engine fails. This is a slight
 * simplification of the previous two-phase semantics (separate
 * `rigDiscoveryTimeoutMs` and `timeoutMs`), but the Spider's
 * stateless-gate model can't naturally carry per-phase timing without
 * mutating the condition between checks. The combined deadline is
 * `discoveryTimeoutMs + timeoutMs` — strictly more permissive in the
 * common case where discovery is fast.
 *
 * Condition shape:
 *   {
 *     testGuildPath: string,
 *     writId: string,
 *     deadline: string,         // ISO 8601 — `failed` when exceeded
 *   }
 */

import { z } from 'zod';
import type { BlockType, CheckResult } from '@shardworks/spider-apparatus';
import { fetchRigForWrit, fetchRigState } from '../engines/xguild-shell.ts';

const RIG_TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const conditionSchema = z.object({
  testGuildPath: z.string(),
  writId: z.string(),
  deadline: z.string(),
});

const xguildRigTerminalBlockType: BlockType = {
  id: 'lab.xguild-rig-terminal',
  conditionSchema,
  pollIntervalMs: 5_000,
  async check(condition: unknown): Promise<CheckResult> {
    const { testGuildPath, writId, deadline } = conditionSchema.parse(condition);

    if (Date.now() >= Date.parse(deadline)) {
      return {
        status: 'failed',
        reason: `timed out waiting for rig dispatched from writ ${writId} (test guild ${testGuildPath}) to reach a terminal state`,
      };
    }

    const rigId = await fetchRigForWrit({
      testGuildPath,
      writId,
      caller: 'lab.xguild-rig-terminal',
    });
    if (rigId === null) {
      return { status: 'pending' };
    }

    const rig = await fetchRigState({
      testGuildPath,
      rigId,
      caller: 'lab.xguild-rig-terminal',
    });
    return typeof rig.status === 'string' && RIG_TERMINAL_STATUSES.has(rig.status)
      ? { status: 'cleared' }
      : { status: 'pending' };
  },
};

export default xguildRigTerminalBlockType;
