/**
 * Block-type bag — every BlockType the Laboratory contributes via
 * supportKit.blockTypes. Keys are the BlockType ids the Spider's
 * dispatch predicate consults.
 *
 * These gates exist to keep cross-guild scenario engines from blocking
 * the parent guild's spider crawl loop while waiting on remote state.
 * The engines do their setup work (read brief, post commission) and
 * return `{status: 'blocked'}`; the Spider polls the relevant gate
 * here without holding the dispatch loop.
 */

import type { BlockType } from '@shardworks/spider-apparatus';
import xguildWritTerminalBlockType from './xguild-writ-terminal.ts';
import xguildRigTerminalBlockType from './xguild-rig-terminal.ts';

export { default as xguildWritTerminalBlockType } from './xguild-writ-terminal.ts';
export { default as xguildRigTerminalBlockType } from './xguild-rig-terminal.ts';

export const blockTypes: Record<string, BlockType> = {
  'lab.xguild-writ-terminal': xguildWritTerminalBlockType,
  'lab.xguild-rig-terminal': xguildRigTerminalBlockType,
};
