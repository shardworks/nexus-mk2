import { createCommand } from 'commander';
import { VERSION } from '../index.ts';
import { makeStatusCommand } from './commands/status.ts';

export const program = createCommand('nexus')
  .description('Nexus Mk 2.1 — experimental multi-agent AI system')
  .version(VERSION);

program.addCommand(makeStatusCommand());
