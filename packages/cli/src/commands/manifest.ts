import { createCommand } from 'commander';
import { manifest } from '@shardworks/engine-manifest';
import { resolveHome } from '../resolve-home.ts';

export function makeManifestCommand() {
  return createCommand('manifest')
    .description('Resolve an anima\'s composition and show session config')
    .argument('<anima>', 'Anima name to manifest')
    .option('--json', 'Output full session config as JSON')
    .action(async (animaName: string, options: { json?: boolean }, cmd) => {
      const home = resolveHome(cmd);

      try {
        const result = await manifest(home, animaName);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Anima: ${result.anima.name} (${result.anima.roles.join(', ')})`);
          console.log(`Implements: ${result.mcpConfig.implements.map(i => i.name).join(', ')}`);
          console.log(`System prompt: ${result.systemPrompt.length} chars`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });
}
