import { createCommand } from 'commander';
import { resolveNexusHome, installTool } from '@shardworks/nexus-core';

export function makeInstallToolCommand() {
  return createCommand('install-tool')
    .description('Install an implement, engine, curriculum, or temperament into the guild')
    .argument('<source>', 'Local directory path containing a nexus descriptor')
    .option('--name <name>', 'Override the tool name (defaults to directory name)')
    .option('--slot <slot>', 'Override the version slot (defaults to version from descriptor)')
    .option('--roles <roles>', 'Comma-separated roles for implement access gating')
    .action((source: string, options: { name?: string; slot?: string; roles?: string }) => {
      const home = resolveNexusHome();
      const roles = options.roles?.split(',').map(r => r.trim()).filter(Boolean);

      const result = installTool({
        home,
        source,
        name: options.name,
        slot: options.slot,
        roles,
      });

      console.log(`Installed ${result.category.slice(0, -1)} "${result.name}" at slot ${result.slot}`);
    });
}
