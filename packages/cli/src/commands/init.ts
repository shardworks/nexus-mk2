import { createCommand } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import readline from 'node:readline/promises';
import { initGuild, bootstrapBaseTools } from '@shardworks/nexus-core';
import { applyMigrations } from '@shardworks/engine-ledger-migrate';

const DEFAULT_MODEL = 'sonnet';

/** Resolve a package name to its root directory on disk. */
function makePackageResolver(): (packageName: string) => string {
  const require = createRequire(import.meta.url);
  return (packageName: string) => {
    // Resolve the package's main entry, then walk up to find package.json
    const entry = require.resolve(packageName);
    let dir = path.dirname(entry);
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
      dir = path.dirname(dir);
    }
    throw new Error(`Could not find package root for ${packageName}`);
  };
}

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    const answer = await rl.question(`${question}${suffix}: `);
    return answer.trim() || defaultValue || '';
  } finally {
    rl.close();
  }
}

export function makeInitCommand() {
  return createCommand('init')
    .description('Create a new guild — guildhall, directory structure, guild.json, and Ledger')
    .argument('[path]', 'Path for the new guild (interactive prompt if omitted)')
    .option('--model <model>', 'Default model for anima sessions', DEFAULT_MODEL)
    .action(async (pathArg: string | undefined, options: { model: string }) => {
      let guildPath: string;
      let guildName: string;

      if (pathArg) {
        guildPath = pathArg;
        guildName = path.basename(path.resolve(pathArg));
      } else {
        const name = await prompt('Guild name');
        if (!name) {
          console.error('Error: guild name is required.');
          process.exitCode = 1;
          return;
        }
        guildPath = name;
        guildName = name;
      }

      const model = options.model;
      const home = path.resolve(guildPath);

      try {
        // 1. Create guild skeleton (bare repo, worktree, dirs, guild.json, migration file)
        initGuild(home, guildName, model);

        // 2. Install all framework tools via installTool
        const resolvePackage = makePackageResolver();
        bootstrapBaseTools(home, resolvePackage);

        // 3. Create ledger via migration engine
        applyMigrations(home);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
        return;
      }

      console.log(`Guild created at ${home}`);
      console.log(`\n  export NEXUS_HOME=${home}\n`);
    });
}
