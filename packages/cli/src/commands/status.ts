import { createCommand } from 'commander';
import {
  readGuildConfig,
  checkAllPreconditions,
  VERSION,
} from '@shardworks/nexus-core';
import type { ToolPreconditionResult } from '@shardworks/nexus-core';
import { resolveHome } from '../resolve-home.ts';

export function makeStatusCommand() {
  return createCommand('status')
    .description('Show guild system status — implements, engines, and health checks')
    .action((_, cmd) => {
      let home: string;
      try {
        home = resolveHome(cmd);
      } catch {
        console.error('Not inside a guild. Run `nsg init` to create one, or use --guild-root.');
        process.exit(1);
      }

      const config = readGuildConfig(home);
      const results = checkAllPreconditions(home, config);

      const implements_ = results.filter(r => r.category === 'implements');
      const engines = results.filter(r => r.category === 'engines');

      // Header
      console.log(`\nNexus Mk 2.1 — v${VERSION}`);
      console.log(`Guild: ${config.name}`);
      console.log(`Root:  ${home}\n`);

      // Check if the manifest engine is operational — everything depends on it
      const manifestEngine = engines.find(e => e.name === 'manifest');
      if (manifestEngine && !manifestEngine.available) {
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║  ⚠  MANIFEST ENGINE UNAVAILABLE                            ║');
        console.log('║                                                              ║');
        console.log('║  The manifest engine has unmet preconditions. No anima       ║');
        console.log('║  sessions can be started until this is resolved.             ║');
        for (const reason of manifestEngine.failures) {
          const padded = `║  → ${reason}`.padEnd(63) + '║';
          console.log(padded);
        }
        console.log('╚══════════════════════════════════════════════════════════════╝\n');
      }

      // Engines
      printSection('Engines', engines);

      // Implements
      printSection('Implements', implements_);

      // Summary
      const totalTools = results.length;
      const available = results.filter(r => r.available).length;
      const unavailableCount = totalTools - available;
      console.log(`\n${available}/${totalTools} operational` +
        (unavailableCount > 0 ? ` — ${unavailableCount} unavailable` : ''));
      console.log('');
    });
}

function printSection(title: string, results: ToolPreconditionResult[]): void {
  if (results.length === 0) {
    console.log(`${title}: (none registered)`);
    return;
  }

  console.log(`${title}:`);
  for (const r of results) {
    if (r.available) {
      console.log(`  ✓ ${r.name}`);
    } else {
      console.log(`  ✗ ${r.name}`);
      for (const reason of r.failures) {
        console.log(`    → ${reason}`);
      }
    }
  }
}
