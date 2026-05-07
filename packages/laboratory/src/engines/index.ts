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
 * grafts. The other engines (codex/guild fixtures, scenario, probes,
 * archive) are the work engines those grafts reference.
 */

import type { EngineDesign } from '@shardworks/fabricator-apparatus';
import { phaseEngines } from './phases.ts';
import { codexSetupEngine, codexTeardownEngine } from './codex-fixture.ts';
import {
  codexCheckoutSetupEngine,
  codexCheckoutTeardownEngine,
} from './codex-checkout.ts';
import { guildSetupEngine, guildTeardownEngine } from './guild-fixture.ts';
import { daemonSetupEngine, daemonTeardownEngine } from './daemon-fixture.ts';
import {
  commissionPostXguildEngine,
  waitForRigTerminalXguildEngine,
  waitForWritTerminalXguildEngine,
} from './scenario-xguild.ts';
import { claudeSessionEngine } from './claude-session.ts';
import { shellCommandEngine } from './shell-command.ts';
import { archiveEngine } from '../archive/engine.ts';
import { trialContextEngine } from '../probes/trial-context.ts';
import { stacksDumpEngine } from '../probes/stacks-dump.ts';
import { gitRangeEngine } from '../probes/git-range.ts';
import { trialSessionsEngine } from '../probes/trial-sessions.ts';

export const engines: Record<string, EngineDesign> = {
  // Phase orchestrators (template backbone)
  ...phaseEngines,

  // Fixture work engines
  'lab.codex-setup': codexSetupEngine,
  'lab.codex-teardown': codexTeardownEngine,
  'lab.codex-checkout': codexCheckoutSetupEngine,
  'lab.codex-checkout-teardown': codexCheckoutTeardownEngine,
  'lab.guild-setup': guildSetupEngine,
  'lab.guild-teardown': guildTeardownEngine,
  'lab.daemon-setup': daemonSetupEngine,
  'lab.daemon-teardown': daemonTeardownEngine,

  // Scenario work engines
  'lab.commission-post-xguild': commissionPostXguildEngine,
  'lab.wait-for-writ-terminal-xguild': waitForWritTerminalXguildEngine,
  'lab.wait-for-rig-terminal-xguild': waitForRigTerminalXguildEngine,

  // Claude-direct trial primitives
  'lab.claude-session': claudeSessionEngine,
  'lab.shell-command': shellCommandEngine,

  // Probe work engines
  'lab.probe-stacks-dump': stacksDumpEngine,
  'lab.probe-git-range': gitRangeEngine,
  'lab.probe-trial-context': trialContextEngine,
  'lab.probe-trial-sessions': trialSessionsEngine,

  // Archive engine
  'lab.archive': archiveEngine,
};
