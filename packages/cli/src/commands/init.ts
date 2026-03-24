import { createCommand } from 'commander';
import path from 'node:path';
import readline from 'node:readline/promises';
import { initGuild } from '@shardworks/nexus-core';

const DEFAULT_MODEL = 'sonnet';

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

      if (pathArg) {
        guildPath = pathArg;
      } else {
        const name = await prompt('Guild name');
        if (!name) {
          console.error('Error: guild name is required.');
          process.exitCode = 1;
          return;
        }
        guildPath = name;
      }

      const model = options.model;
      const home = path.resolve(guildPath);

      try {
        initGuild(home, model);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
        return;
      }

      console.log(`Guild created at ${home}`);
      console.log(`\n  export NEXUS_HOME=${home}\n`);
    });
}
