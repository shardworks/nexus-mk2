import { createCommand } from 'commander';
import {
  addWorkshop,
  removeWorkshop,
  listWorkshops,
  createWorkshop,
  checkGhAuth,
  deriveWorkshopName,
} from '@shardworks/nexus-core';
import { resolveHome } from '../resolve-home.ts';

export function makeWorkshopCommand() {
  const workshop = createCommand('workshop')
    .description('Manage guild workshops (repositories where the guild works)');

  // nsg workshop add <url> [--name <name>]
  workshop.addCommand(
    createCommand('add')
      .description('Clone a remote repository and register it as a workshop')
      .argument('<url>', 'Git remote URL to clone')
      .option('--name <name>', 'Workshop name (default: derived from URL)')
      .action((url: string, options: { name?: string }, cmd) => {
        const home = resolveHome(cmd);
        const name = options.name ?? deriveWorkshopName(url);

        try {
          const result = addWorkshop({ home, name, remoteUrl: url });
          console.log(`Workshop "${result.name}" added.`);
          console.log(`  Remote: ${result.remoteUrl}`);
          console.log(`  Bare clone: ${result.barePath}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  // nsg workshop remove <name>
  workshop.addCommand(
    createCommand('remove')
      .description('Remove a workshop — deletes bare clone, worktrees, and guild.json entry')
      .argument('<name>', 'Workshop name to remove')
      .action((name: string, _, cmd) => {
        const home = resolveHome(cmd);

        try {
          removeWorkshop({ home, name });
          console.log(`Workshop "${name}" removed.`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  // nsg workshop list
  workshop.addCommand(
    createCommand('list')
      .description('List all registered workshops')
      .action((_, cmd) => {
        const home = resolveHome(cmd);

        try {
          const workshops = listWorkshops(home);

          if (workshops.length === 0) {
            console.log('No workshops registered.');
            console.log('  Add one with: nsg workshop add <url>');
            return;
          }

          console.log(`${workshops.length} workshop${workshops.length === 1 ? '' : 's'}:\n`);
          for (const ws of workshops) {
            const statusIcon = ws.cloned ? '✓' : '✗';
            const wtLabel = ws.activeWorktrees > 0
              ? ` (${ws.activeWorktrees} active worktree${ws.activeWorktrees === 1 ? '' : 's'})`
              : '';
            console.log(`  ${statusIcon} ${ws.name}${wtLabel}`);
            console.log(`    ${ws.remoteUrl}`);
            if (!ws.cloned) {
              console.log(`    ⚠ bare clone missing — run: nsg tool rehydrate`);
            }
          }
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  // nsg workshop create <org/name> [--public]
  workshop.addCommand(
    createCommand('create')
      .description('Create a new GitHub repository and register it as a workshop')
      .argument('<repo>', 'Repository name in org/name format')
      .option('--public', 'Create a public repository (default: private)')
      .option('--name <name>', 'Workshop name (default: derived from repo name)')
      .action((repo: string, options: { public?: boolean; name?: string }, cmd) => {
        const home = resolveHome(cmd);

        // Precondition: gh must be installed and authenticated
        const authError = checkGhAuth();
        if (authError) {
          console.error(`Error: ${authError}`);
          process.exitCode = 1;
          return;
        }

        try {
          const result = createWorkshop({
            home,
            repoName: repo,
            private: !options.public,
          });
          console.log(`Workshop "${result.name}" created.`);
          console.log(`  Repository: https://github.com/${repo}`);
          console.log(`  Remote: ${result.remoteUrl}`);
          console.log(`  Bare clone: ${result.barePath}`);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exitCode = 1;
        }
      }),
  );

  return workshop;
}
