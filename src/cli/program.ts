import { createCommand } from 'commander';
import { VERSION } from '../index.ts';
import { makeInitCommand } from './commands/init.ts';
import { makeInstallToolCommand } from './commands/install-tool.ts';
import { makeRemoveToolCommand } from './commands/remove-tool.ts';
import { makeStatusCommand } from './commands/status.ts';

export const program = createCommand('nexus')
  .description('Nexus Mk 2.1 — experimental multi-agent AI system')
  .version(VERSION);

program.addCommand(makeInitCommand());
program.addCommand(makeInstallToolCommand());
program.addCommand(makeRemoveToolCommand());
program.addCommand(makeStatusCommand());
