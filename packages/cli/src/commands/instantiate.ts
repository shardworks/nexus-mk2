import { createCommand } from 'commander';
import { resolveNexusHome, instantiate } from '@shardworks/nexus-core';

export function makeInstantiateCommand() {
  return createCommand('instantiate')
    .description('Create a new anima in the guild')
    .argument('<name>', 'Name for the new anima')
    .requiredOption('--roles <roles>', 'Comma-separated roles (e.g. artificer,sage)')
    .option('--curricula <curricula>', 'Comma-separated curricula to assign')
    .option('--temperament <temperament>', 'Temperament to assign')
    .action((name: string, options: { roles: string; curricula?: string; temperament?: string }) => {
      const home = resolveNexusHome();
      const roles = options.roles.split(',').map(r => r.trim()).filter(Boolean);
      const curricula = options.curricula?.split(',').map(c => c.trim()).filter(Boolean);

      if (roles.length === 0) {
        console.error('Error: at least one role is required');
        process.exitCode = 1;
        return;
      }

      try {
        const result = instantiate({
          home,
          name,
          roles,
          curricula,
          temperament: options.temperament,
        });

        console.log(`Anima "${result.name}" instantiated (id: ${result.animaId})`);
        console.log(`  Roles: ${result.roles.join(', ')}`);
        if (result.curricula.length > 0) {
          console.log(`  Curricula: ${result.curricula.join(', ')}`);
        }
        if (result.temperament) {
          console.log(`  Temperament: ${result.temperament}`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });
}
