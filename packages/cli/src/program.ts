import { createCommand } from 'commander';
import { VERSION, registerSessionProvider } from '@shardworks/nexus-core';
import { claudeCodeProvider } from '@shardworks/claude-code-session-provider';
import { makeInitCommand } from './commands/init.ts';
import { makeInstallToolCommand } from './commands/install-tool.ts';
import { makeRemoveToolCommand } from './commands/remove-tool.ts';
import { makeRestoreCommand } from './commands/rehydrate.ts';
import { makeCommissionCommand } from './commands/commission.ts';
import { makeInstantiateCommand } from './commands/instantiate.ts';
import { makeManifestCommand } from './commands/manifest.ts';
import { makeStatusCommand } from './commands/status.ts';
import { makeConsultCommand } from './commands/consult.ts';
import { makeSignalCommand } from './commands/signal.ts';
import { makeClockCommand } from './commands/clock.ts';
import { makeWorkshopCommand } from './commands/workshop.ts';

// Register the Claude Code session provider so core's session funnel
// can launch claude sessions.
registerSessionProvider(claudeCodeProvider);

export const program = createCommand('nsg')
  .description('Nexus Mk 2.1 — experimental multi-agent AI system')
  .version(VERSION)
  .option('--guild-root <path>', 'Path to guild root (default: auto-detect from cwd)');

// ── Top-level commands ──────────────────────────────────────────────────
program.addCommand(makeInitCommand());
program.addCommand(makeConsultCommand());
program.addCommand(makeCommissionCommand());
program.addCommand(makeStatusCommand());
program.addCommand(makeSignalCommand());
program.addCommand(makeClockCommand());

program.addCommand(makeWorkshopCommand());

// ── nsg guild [restore] ─────────────────────────────────────────────────
const guildGroup = createCommand('guild')
  .description('Guild-wide operations');
guildGroup.addCommand(makeRestoreCommand());
program.addCommand(guildGroup);

// ── nsg tool [install|remove] ───────────────────────────────────────────
const toolGroup = createCommand('tool')
  .description('Manage guild tools (implements, engines, curricula, temperaments)');
toolGroup.addCommand(makeInstallToolCommand());
toolGroup.addCommand(makeRemoveToolCommand());
program.addCommand(toolGroup);

// ── nsg anima [create|manifest] ─────────────────────────────────────────
const animaGroup = createCommand('anima')
  .description('Manage animas');
animaGroup.addCommand(makeInstantiateCommand());
animaGroup.addCommand(makeManifestCommand());
program.addCommand(animaGroup);
