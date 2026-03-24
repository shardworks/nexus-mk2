import { createCommand } from 'commander';
import { VERSION } from '@shardworks/nexus-core';
import { makeInitCommand } from './commands/init.ts';
import { makeInstallToolCommand } from './commands/install-tool.ts';
import { makeRemoveToolCommand } from './commands/remove-tool.ts';
import { makeDispatchCommand } from './commands/dispatch.ts';
import { makePublishCommand } from './commands/publish.ts';
import { makeInstantiateCommand } from './commands/instantiate.ts';
import { makeManifestCommand } from './commands/manifest.ts';
import { makeStatusCommand } from './commands/status.ts';

export const program = createCommand('nexus')
  .description('Nexus Mk 2.1 — experimental multi-agent AI system')
  .version(VERSION);

program.addCommand(makeInitCommand());
program.addCommand(makeInstallToolCommand());
program.addCommand(makeRemoveToolCommand());
program.addCommand(makeDispatchCommand());
program.addCommand(makePublishCommand());
program.addCommand(makeInstantiateCommand());
program.addCommand(makeManifestCommand());
program.addCommand(makeStatusCommand());
