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
 * --bare prevents Claude from auto-discovering CLAUDE.md files in the guild,
 * which could bleed unintended instructions into the anima's context.
 */
import { createCommand } from 'commander';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
 * engine-mcp-server as a stdio process serving the anima's implements.
 *
 * Resolves the engine-mcp-server entry point via require.resolve — handles
 * both the dev (TypeScript source) and prod (compiled dist) cases.
 */
function buildClaudeMcpConfig(
  mcpServerConfigPath: string,
  serverConfig: McpServerConfig,
): object {
  const require = createRequire(import.meta.url);
  const enginePath = require.resolve('@shardworks/engine-mcp-server');

  // In dev the resolved path is the .ts source; add the transform flag.
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
        args: [...nodeArgs, enginePath, mcpServerConfigPath],
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
          JSON.stringify(buildClaudeMcpConfig(mcpServerConfigPath, result.mcpConfig), null, 2),
        );

        console.log(`Consulting ${result.anima.name} (${result.anima.roles.join(', ')})...\n`);

        spawnSync(
          'claude',
          [
            '--bare',
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
