import { createCommand } from 'commander';
import { installTool } from '@shardworks/nexus-core';
import { resolveHome } from '../resolve-home.ts';

export function makeInstallToolCommand() {
  return createCommand('install')
    .description('Install an implement, engine, curriculum, or temperament into the guild')
    .argument('<source>', 'Local directory, npm package specifier, or tarball path')
    .option('--name <name>', 'Override the tool name (defaults to package name or directory name)')
    .option('--slot <slot>', 'Override the version slot (defaults to version from descriptor)')
    .option('--roles <roles>', 'Comma-separated roles for implement access gating')
    .option('--link', 'Symlink local directory instead of copying (for active development)')
    .action((source: string, options: { name?: string; slot?: string; roles?: string; link?: boolean }, cmd) => {
      const home = resolveHome(cmd);
      const roles = options.roles?.split(',').map(r => r.trim()).filter(Boolean);

      const result = installTool({
        home,
        source,
        name: options.name,
        slot: options.slot,
        roles,
        link: options.link,
      });

      console.log(`Installed ${result.category.slice(0, -1)} "${result.name}" at slot ${result.slot}`);
    });
}
