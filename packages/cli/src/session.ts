/**
 * Session launcher — shared infrastructure for starting claude sessions.
 *
 * Both `nsg consult` (interactive) and the Clockworks `summon` verb
 * (commissioned) use this to launch anima sessions. Factored here so
 * session setup, metrics collection, and cleanup happen in one place.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ManifestResult, McpServerConfig } from '@shardworks/engine-manifest';

// ── Types ──────────────────────────────────────────────────────────────

export interface SessionOptions {
  /** Absolute path to the guild root (for tool/engine resolution). */
  home: string;
  /** Working directory for the claude process. */
  cwd: string;
  /** Manifest result from engine-manifest. */
  manifest: ManifestResult;
  /** Interactive = stdio inherit; print = commission spec as prompt. */
  mode: 'interactive' | { print: string };
  /** Display name for session tracking (--name flag). */
  name?: string;
}

export interface SessionResult {
  /** Process exit code (0 = success, non-zero = error or crash). */
  exitCode: number;
  // Future: tokenUsage, cost, sessionId, duration, etc.
  // When we add --output-format json parsing, metrics go here.
}

// ── Internal helpers ───────────────────────────────────────────────────

/**
 * Build the Claude MCP config JSON (mcpServers format) that launches the
 * engine-mcp-server as a stdio process serving the anima's tools.
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

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Launch a claude session for an anima.
 *
 * Handles all temp file setup, claude process spawning, and cleanup.
 * Returns a SessionResult with the exit code (and eventually metrics).
 *
 * Interactive mode: stdio inherited, human at the keyboard.
 * Print mode: commission spec passed as prompt, output captured.
 */
export function launchSession(options: SessionOptions): SessionResult {
  const { home, cwd, manifest: result, mode, name } = options;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nsg-session-'));

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

    if (mode === 'interactive') {
      // Interactive: human at keyboard, inherit stdio
      const proc = spawnSync('claude', args, { cwd, stdio: 'inherit' });
      return { exitCode: proc.status ?? 1 };
    } else {
      // Print mode: commission spec as prompt, capture output
      args.push('--print', mode.print);

      const proc = spawnSync('claude', args, {
        cwd,
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      return { exitCode: proc.status ?? 1 };
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
