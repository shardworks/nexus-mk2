/**
 * Claude Code Session Provider
 *
 * Implements the SessionProvider interface for Claude Code sessions.
 * Handles both interactive (TUI) and autonomous (--print) modes.
 *
 * This is a platform dependency of the CLI, not a guild-registered engine.
 * The CLI imports it at startup and registers it as the session provider.
 * Guilds don't need to know about it — it's a transitive dep of @shardworks/nexus.
 *
 * Key design choice: uses async spawn() instead of spawnSync().
 * This is required for stream-json transcript parsing, timeout enforcement,
 * and future concurrent session support.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ResolvedTool, ManifestResult } from '@shardworks/nexus-core';
import type { McpServerConfig } from './mcp-server.ts';
import type { SessionProvider, SessionProviderLaunchOptions, SessionProviderResult } from '@shardworks/nexus-core';

// ── MCP Config Generation ──────────────────────────────────────────────

/**
 * Generate the MCP server config for the resolved tool set.
 *
 * For tools with a `package` field in guild.json, the modulePath is the
 * npm package name (resolved via NODE_PATH at runtime). For tools without
 * a package field, the modulePath is an absolute path to the entry point.
 */
export function generateMcpConfig(
  home: string,
  tools: ResolvedTool[],
): McpServerConfig {
  const mcpTools: Array<{ name: string; modulePath: string }> = [];

  for (const t of tools) {
    if (t.package) {
      mcpTools.push({ name: t.name, modulePath: t.package });
    } else {
      const descriptorPath = path.join(t.path, 'nexus-tool.json');
      if (!fs.existsSync(descriptorPath)) continue;

      const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf-8'));
      const entry = descriptor.entry as string;
      mcpTools.push({ name: t.name, modulePath: path.join(t.path, entry) });
    }
  }

  // Set NODE_PATH so the MCP server process can resolve npm-installed guild
  // tools from the guildhall's node_modules, regardless of where the MCP
  // engine code itself lives on disk.
  const nodePath = path.join(home, 'node_modules');
  return { home, tools: mcpTools, env: { NODE_PATH: nodePath } };
}

// ── Claude MCP Config ──────────────────────────────────────────────────

/**
 * Build the Claude MCP config JSON (mcpServers format) that launches the
 * MCP server as a stdio process serving the anima's tools.
 */
function buildClaudeMcpConfig(
  tmpDir: string,
  mcpServerConfigPath: string,
  serverConfig: McpServerConfig,
): object {
  // Resolve the mcp-server entry point within this package
  const mcpServerUrl = import.meta.resolve('./mcp-server.ts');
  const mcpServerPath = fileURLToPath(mcpServerUrl);

  // Write a wrapper script that imports and invokes main().
  const wrapperPath = path.join(tmpDir, 'mcp-entry.mjs');
  fs.writeFileSync(
    wrapperPath,
    `import { main } from ${JSON.stringify(mcpServerUrl)};\nawait main();\n`,
  );

  // In dev the resolved path is .ts source; add the transform flag.
  const nodeArgs: string[] = [];
  if (mcpServerPath.endsWith('.ts')) {
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

// ── Session Provider ───────────────────────────────────────────────────

/**
 * Claude Code session provider.
 *
 * Launches sessions via the `claude` CLI. Interactive mode inherits stdio;
 * autonomous mode uses --print with optional --output-format stream-json.
 */
export const claudeCodeProvider: SessionProvider = {
  name: 'claude-code',

  async launch(options: SessionProviderLaunchOptions): Promise<SessionProviderResult> {
    const { home, manifest, prompt, interactive, cwd, name } = options;
    const startTime = Date.now();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nsg-session-'));

    try {
      // Generate MCP config from resolved tools
      const mcpConfig = generateMcpConfig(home, manifest.tools);

      const systemPromptPath = path.join(tmpDir, 'system-prompt.md');
      const mcpServerConfigPath = path.join(tmpDir, 'mcp-server-config.json');
      const claudeMcpConfigPath = path.join(tmpDir, 'claude-mcp-config.json');

      fs.writeFileSync(systemPromptPath, manifest.systemPrompt);
      fs.writeFileSync(mcpServerConfigPath, JSON.stringify(mcpConfig, null, 2));
      fs.writeFileSync(
        claudeMcpConfigPath,
        JSON.stringify(buildClaudeMcpConfig(tmpDir, mcpServerConfigPath, mcpConfig), null, 2),
      );

      // Base args — shared between interactive and print modes
      const args: string[] = [
        '--bare',
        '--setting-sources', 'user',
        '--dangerously-skip-permissions',
        '--system-prompt-file', systemPromptPath,
        '--mcp-config', claudeMcpConfigPath,
      ];

      if (name) {
        args.push('--name', name);
      }

      if (interactive) {
        // Interactive: human at keyboard, inherit stdio
        const exitCode = await spawnClaude(args, cwd, 'inherit');
        const durationMs = Date.now() - startTime;
        return { exitCode, durationMs };
      } else {
        // Autonomous: commission spec / brief as prompt
        args.push('--print', prompt ?? '');
        // TODO Phase 4: add --output-format stream-json and parse transcript + metrics
        const exitCode = await spawnClaude(args, cwd, 'pipe');
        const durationMs = Date.now() - startTime;
        return { exitCode, durationMs };
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  },
};

/**
 * Spawn the claude CLI process asynchronously.
 *
 * Uses child_process.spawn (not spawnSync) for:
 * - Stream-json transcript parsing (future)
 * - Timeout enforcement (future)
 * - Concurrent session support (future)
 *
 * @param args - CLI arguments for claude
 * @param cwd - Working directory for the process
 * @param stdio - 'inherit' for interactive, 'pipe' for autonomous
 * @returns Exit code (0 = success)
 */
function spawnClaude(
  args: string[],
  cwd: string,
  stdio: 'inherit' | 'pipe',
): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd,
      stdio: stdio === 'inherit'
        ? 'inherit'
        : ['pipe', 'inherit', 'inherit'],
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    proc.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}

export default claudeCodeProvider;
