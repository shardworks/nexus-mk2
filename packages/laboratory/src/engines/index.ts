/**
 * Engine bag — every engine the Laboratory contributes via supportKit.
 *
 * Keys are the engine design ids the Spider's template references.
 * The Fabricator scans this object at startup and registers each
 * design under the laboratory plugin id.
 */

import type { EngineDesign } from '@shardworks/fabricator-apparatus';
import orchestrateEngine from './orchestrate.ts';
import {
  archiveStub,
  codexSetupStub,
  codexTeardownStub,
  commissionPostXguildStub,
  guildSetupStub,
  guildTeardownStub,
  probeGitRangeStub,
  probeStacksDumpStub,
  waitForWritTerminalXguildStub,
} from './stubs.ts';

export const engines: Record<string, EngineDesign> = {
  'lab.orchestrate': orchestrateEngine,
  'lab.codex-setup': codexSetupStub,
  'lab.codex-teardown': codexTeardownStub,
  'lab.guild-setup': guildSetupStub,
  'lab.guild-teardown': guildTeardownStub,
  'lab.commission-post-xguild': commissionPostXguildStub,
  'lab.wait-for-writ-terminal-xguild': waitForWritTerminalXguildStub,
  'lab.probe-stacks-dump': probeStacksDumpStub,
  'lab.probe-git-range': probeGitRangeStub,
  'lab.archive': archiveStub,
};
