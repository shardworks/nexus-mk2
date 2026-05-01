/**
 * Engine bag — every engine the Laboratory contributes via supportKit.
 *
 * Keys are the engine design ids the Spider's template references.
 * The Fabricator scans this object at startup and registers each
 * design under the laboratory plugin id.
 *
 * The five phase orchestrators (`lab.{setup,scenario,probes,archive,
 * teardown}-phase`) form the rig template's static backbone; they
 * read `writ.ext.laboratory.config` at run time and emit per-phase
 * grafts. The other engines (codex/guild fixtures, scenario,
 * probes, archive) are the work engines those grafts reference.
 *
 * Stubs land their real implementations under their respective
 * implementation children.
 */

import type { EngineDesign } from '@shardworks/fabricator-apparatus';
import { phaseEngines } from './phases.ts';
import { codexSetupEngine, codexTeardownEngine } from './codex-fixture.ts';
import {
  archiveStub,
  commissionPostXguildStub,
  guildSetupStub,
  guildTeardownStub,
  probeGitRangeStub,
  probeStacksDumpStub,
  waitForWritTerminalXguildStub,
} from './stubs.ts';

export const engines: Record<string, EngineDesign> = {
  // Phase orchestrators (template backbone)
  ...phaseEngines,

  // Work engines (graft targets)
  'lab.codex-setup': codexSetupEngine,
  'lab.codex-teardown': codexTeardownEngine,
  'lab.guild-setup': guildSetupStub,
  'lab.guild-teardown': guildTeardownStub,
  'lab.commission-post-xguild': commissionPostXguildStub,
  'lab.wait-for-writ-terminal-xguild': waitForWritTerminalXguildStub,
  'lab.probe-stacks-dump': probeStacksDumpStub,
  'lab.probe-git-range': probeGitRangeStub,
  'lab.archive': archiveStub,
};
