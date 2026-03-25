import { createCommand } from 'commander';
import { VERSION, registerSessionProvider } from '@shardworks/nexus-core';
import { claudeCodeProvider } from '@shardworks/claude-code-session-provider';
import { makeInitCommand } from './commands/init.ts';
import { makeToolCommand } from './commands/tool.ts';
import { makeRestoreCommand } from './commands/rehydrate.ts';
import { makeCommissionCommand } from './commands/commission.ts';
import { makeStatusCommand } from './commands/status.ts';
import { makeConsultCommand } from './commands/consult.ts';
import { makeSignalCommand } from './commands/signal.ts';
import { makeClockCommand } from './commands/clock.ts';
import { makeWorkshopCommand } from './commands/workshop.ts';
import { makeAnimaCommand } from './commands/anima.ts';
import { makeWorkCommand } from './commands/work.ts';
import { makePieceCommand } from './commands/piece.ts';
import { makeJobCommand } from './commands/job.ts';
import { makeStrokeCommand } from './commands/stroke.ts';

// Register the Claude Code session provider so core's session funnel
// can launch claude sessions.
registerSessionProvider(claudeCodeProvider);

export const program = createCommand('nsg')
  .description('Nexus Mk 2.1 — experimental multi-agent AI system')
  .version(VERSION)
  .option('--guild-root <path>', 'Path to guild root (default: auto-detect from cwd)');

// ── Top-level commands (special operations, not noun-verb) ─────────────
program.addCommand(makeInitCommand());
program.addCommand(makeConsultCommand());
program.addCommand(makeStatusCommand());
program.addCommand(makeSignalCommand());

// ── Noun groups ────────────────────────────────────────────────────────

// nsg guild [restore]
const guildGroup = createCommand('guild')
  .description('Guild-wide operations');
guildGroup.addCommand(makeRestoreCommand());
program.addCommand(guildGroup);

// nsg workshop [create|register|list|show|remove]
program.addCommand(makeWorkshopCommand());

// nsg tool [install|remove|list]
program.addCommand(makeToolCommand());

// nsg anima [create|list|show|update|remove|manifest]
program.addCommand(makeAnimaCommand());

// nsg commission [create|list|show|update]
program.addCommand(makeCommissionCommand());

// nsg clock [list|tick|run]
program.addCommand(makeClockCommand());

// nsg work [create|list|show|update]
program.addCommand(makeWorkCommand());

// nsg piece [create|list|show|update]
program.addCommand(makePieceCommand());

// nsg job [create|list|show|update]
program.addCommand(makeJobCommand());

// nsg stroke [create|list|show|update]
program.addCommand(makeStrokeCommand());
