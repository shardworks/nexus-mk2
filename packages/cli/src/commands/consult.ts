/**
 * consult command
 *
 * Starts an interactive Claude session with a guild member (anima).
 * The anima is identified by role (positional) or by name (--name flag).
 *
 * Session setup:
 *   1. Look up the anima in the Ledger
 *   2. Manifest the anima (system prompt + MCP config via engine-manifest)
 *   3. Write temp files: system prompt, MCP server config, Claude MCP config
 *   4. Launch `claude --bare --dangerously-skip-permissions` in the guild root
 *   5. Clean up temp files after the session exits
 *
 * --setting-sources user limits Claude to user-level settings only, skipping
 * project-level CLAUDE.md auto-discovery that could bleed unintended
 * instructions into the anima's carefully composed context.
 */
import { createCommand } from 'commander';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { manifest } from '@shardworks/engine-manifest';
import type { McpServerConfig } from '@shardworks/engine-manifest';
import { ledgerPath } from '@shardworks/nexus-core';
import { resolveHome } from '../resolve-home.ts';

/**
 * Look up the name of the first active anima holding a given role.
 *
 * If multiple animas share the role, one is selected arbitrarily (lowest id).
 * Throws if no active anima holds the role.
 */
function resolveAnimaByRole(home: string, role: string): string {
  const db = new Database(ledgerPath(home));
  db.pragma('foreign_keys = ON');
  try {
    const row = db.prepare(`
      SELECT a.name FROM animas a
      JOIN roster r ON r.anima_id = a.id
      WHERE r.role = ? AND a.status = 'active'
      ORDER BY a.id ASC
      LIMIT 1
    `).get(role) as { name: string } | undefined;

    if (!row) {
      throw new Error(`No active anima found for role "${role}".`);
    }
    return row.name;
  } finally {
    db.close();
  }
}

/**
 * Build the Claude MCP config JSON (mcpServers format) that launches the
 * engine-mcp-server as a stdio process serving the anima's tools.
 *
 * The engine module exports main() but doesn't self-invoke, so we write a
 * tiny wrapper script that imports it and calls main(). This also sidesteps
 * the CJS/ESM resolution mismatch — we resolve the engine via
 * import.meta.resolve (ESM-aware) and import it by URL in the wrapper.
 */
function buildClaudeMcpConfig(
  tmpDir: string,
  mcpServerConfigPath: string,
  serverConfig: McpServerConfig,
): object {
  // Resolve engine-mcp-server via ESM resolution (handles both dev .ts and prod .js).
  const engineUrl = import.meta.resolve('@shardworks/engine-mcp-server');
  const enginePath = fileURLToPath(engineUrl);

  // Write a wrapper script that imports and invokes main().
  // The wrapper passes the config path via argv so main() picks it up.
  const wrapperPath = path.join(tmpDir, 'mcp-entry.mjs');
  fs.writeFileSync(
    wrapperPath,
    `import { main } from ${JSON.stringify(engineUrl)};\nawait main();\n`,
  );

  // In dev the resolved path is .ts source; add the transform flag.
  const nodeArgs: string[] = [];
  if (enginePath.endsWith('.ts')) {
    nodeArgs.push(
      '--disable-warning=ExperimentalWarning',
      '--experimental-transform-types',
    );
  }

  return {
    mcpServers: {
      'nexus-guild': {
        command: 'node',
        args: [...nodeArgs, wrapperPath, mcpServerConfigPath],
        env: serverConfig.env ?? {},
      },
    },
  };
}

export function makeConsultCommand() {
  return createCommand('consult')
    .description('Start an interactive consultation with a guild member')
    .argument('[role]', 'Role to consult (finds the active anima holding this role)')
    .option('--name <anima>', 'Consult by anima name directly, bypassing role lookup')
    .action(async (role: string | undefined, options: { name?: string }, cmd) => {
      const home = resolveHome(cmd);

      if (!role && !options.name) {
        cmd.help();
        return;
      }

      if (role && options.name) {
        console.error('Error: provide a role argument or --name, not both.');
        process.exitCode = 1;
        return;
      }

      // Resolve anima name
      let animaName: string;
      try {
        animaName = options.name
          ? options.name
          : resolveAnimaByRole(home, role!);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
        return;
      }

      // Manifest the anima (system prompt + MCP config)
      let result: Awaited<ReturnType<typeof manifest>>;
      try {
        result = await manifest(home, animaName);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
        return;
      }

      // Write temp files into a dedicated temp dir
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nsg-consult-'));

      try {
        const systemPromptPath = path.join(tmpDir, 'system-prompt.md');
        const mcpServerConfigPath = path.join(tmpDir, 'mcp-server-config.json');
        const claudeMcpConfigPath = path.join(tmpDir, 'claude-mcp-config.json');

        fs.writeFileSync(systemPromptPath, result.systemPrompt);
        fs.writeFileSync(mcpServerConfigPath, JSON.stringify(result.mcpConfig, null, 2));
        fs.writeFileSync(
          claudeMcpConfigPath,
          JSON.stringify(buildClaudeMcpConfig(tmpDir, mcpServerConfigPath, result.mcpConfig), null, 2),
        );

        console.log(`Consulting ${result.anima.name} (${result.anima.roles.join(', ')})...\n`);

        spawnSync(
          'claude',
          [
            '--setting-sources', 'user',
            '--dangerously-skip-permissions',
            '--system-prompt-file', systemPromptPath,
            '--mcp-config', claudeMcpConfigPath,
          ],
          {
            cwd: home,
            stdio: 'inherit',
          },
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
}
