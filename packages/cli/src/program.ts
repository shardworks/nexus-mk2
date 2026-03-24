import { createCommand } from 'commander';
import { VERSION } from '@shardworks/nexus-core';
import { makeInitCommand } from './commands/init.ts';
import { makeInstallToolCommand } from './commands/install-tool.ts';
import { makeRemoveToolCommand } from './commands/remove-tool.ts';
import { makeRehydrateCommand } from './commands/rehydrate.ts';
import { makeDispatchCommand } from './commands/dispatch.ts';
import { makeInstantiateCommand } from './commands/instantiate.ts';
import { makeManifestCommand } from './commands/manifest.ts';
import { makeStatusCommand } from './commands/status.ts';

export const program = createCommand('nsg')
  .description('Nexus Mk 2.1 — experimental multi-agent AI system')
  .version(VERSION)
  .option('--guild-root <path>', 'Path to guild root (default: auto-detect from cwd)');

// ── Top-level commands ──────────────────────────────────────────────────
program.addCommand(makeInitCommand());
program.addCommand(makeDispatchCommand());
program.addCommand(makeStatusCommand());

// ── nsg tool [install|remove|rehydrate] ─────────────────────────────────
const toolGroup = createCommand('tool')
  .description('Manage guild tools (implements, engines, curricula, temperaments)');
toolGroup.addCommand(makeInstallToolCommand());
toolGroup.addCommand(makeRemoveToolCommand());
toolGroup.addCommand(makeRehydrateCommand());
program.addCommand(toolGroup);

// ── nsg anima [create|manifest] ─────────────────────────────────────────
const animaGroup = createCommand('anima')
  .description('Manage animas');
animaGroup.addCommand(makeInstantiateCommand());
animaGroup.addCommand(makeManifestCommand());
program.addCommand(animaGroup);
