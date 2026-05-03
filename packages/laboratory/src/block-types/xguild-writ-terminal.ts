/**
 * Block type: `lab.xguild-writ-terminal`.
 *
 * Holds an engine until a writ in another guild reaches a
 * terminal-classification state (the canonical "trial done" signal for
 * full-pipeline trials where seal transitions the writ).
 *
 * Each `check()` performs ONE shellout (`nsg writ show ...`) and
 * returns synchronously — no in-checker polling. The Spider's
 * `pollIntervalMs` controls how often `check()` is invoked.
 *
 * Replaces the in-engine `while(true)` polling loop that previously
 * blocked the parent guild's spider crawl loop for the entire lifetime
 * of the trial. See: parent design discussion in click for moving this
 * to a stateless gate.
 *
 * Condition shape:
 *   {
 *     testGuildPath: string,    // absolute path to the test guild
 *     writId: string,           // the writ to poll
 *     deadline: string,         // ISO 8601 — `failed` when exceeded
 *   }
 */

import { z } from 'zod';
import type { BlockType, CheckResult } from '@shardworks/spider-apparatus';
import { fetchWritState } from '../engines/xguild-shell.ts';

const TERMINAL_CLASSIFICATION = 'terminal';

const conditionSchema = z.object({
  testGuildPath: z.string(),
  writId: z.string(),
  deadline: z.string(),
});

const xguildWritTerminalBlockType: BlockType = {
  id: 'lab.xguild-writ-terminal',
  conditionSchema,
  // 5s matches the original engine's default pollIntervalMs. Each tick
  // is one cheap nsg shellout against the test guild — fine to poll
  // every few seconds.
  pollIntervalMs: 5_000,
  async check(condition: unknown): Promise<CheckResult> {
    const { testGuildPath, writId, deadline } = conditionSchema.parse(condition);

    if (Date.now() >= Date.parse(deadline)) {
      return {
        status: 'failed',
        reason: `timed out waiting for writ ${writId} (test guild ${testGuildPath}) to reach a terminal state`,
      };
    }

    // Single shellout. Throws on transient failure → spider keeps the
    // engine held and retries on the next tick (caller logs the warn).
    const writ = await fetchWritState({
      testGuildPath,
      writId,
      caller: 'lab.xguild-writ-terminal',
    });

    return writ.classification === TERMINAL_CLASSIFICATION
      ? { status: 'cleared' }
      : { status: 'pending' };
  },
};

export default xguildWritTerminalBlockType;
