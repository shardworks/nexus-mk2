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
  // Resolve the mcp-server entry point within this package.
  // Use .js extension — TypeScript's transform-types does not rewrite
  // extensions in import.meta.resolve() calls, so .ts would be baked
  // into compiled output and fail at runtime (dist/ only has .js).
  const mcpServerUrl = import.meta.resolve('./mcp-server.js');
  const mcpServerPath = fileURLToPath(mcpServerUrl);

  // In dev (monorepo), only mcp-server.ts exists — the .js URL won't
  // resolve on disk. Detect this and swap to .ts with transform flags.
  const isDev = !fs.existsSync(mcpServerPath);
  const actualUrl = isDev
    ? mcpServerUrl.replace(/\.js$/, '.ts')
    : mcpServerUrl;

  // Write a wrapper script that imports and invokes main().
  const wrapperPath = path.join(tmpDir, 'mcp-entry.mjs');
  fs.writeFileSync(
    wrapperPath,
    `import { main } from ${JSON.stringify(actualUrl)};\nawait main();\n`,
  );

  // Dev mode needs transform-types to handle the .ts source.
  const nodeArgs: string[] = [];
  if (isDev) {
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
        // Use stream-json to capture transcript, token usage, and cost.
        args.push(
          '--print', prompt ?? '',
          '--output-format', 'stream-json',
          '--verbose',
        );
        const { exitCode, transcript, costUsd, tokenUsage, providerSessionId } =
          await spawnClaudeStreamJson(args, cwd);
        const durationMs = Date.now() - startTime;
        return { exitCode, durationMs, transcript, costUsd, tokenUsage, providerSessionId };
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  },
};

/**
 * Spawn the claude CLI process asynchronously in interactive mode.
 *
 * @param args - CLI arguments for claude
 * @param cwd - Working directory for the process
 * @param stdio - 'inherit' for interactive, 'pipe' for autonomous (stdin only)
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

/** Parsed result from stream-json output. */
interface StreamJsonResult {
  exitCode: number;
  transcript: Record<string, unknown>[];
  costUsd?: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  providerSessionId?: string;
}

/**
 * Spawn Claude in autonomous mode with --output-format stream-json.
 *
 * Captures stdout (NDJSON lines), parses each line to extract:
 * - assistant messages → transcript
 * - result message → cost, token usage, session ID
 *
 * Forwards assistant text content to stderr so it's visible during execution.
 */
function spawnClaudeStreamJson(args: string[], cwd: string): Promise<StreamJsonResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd,
      // stdin: pipe (close immediately), stdout: pipe (capture NDJSON), stderr: inherit (errors visible)
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const transcript: Record<string, unknown>[] = [];
    let costUsd: number | undefined;
    let tokenUsage: StreamJsonResult['tokenUsage'] | undefined;
    let providerSessionId: string | undefined;

    let buffer = '';

    proc.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();

      // Process complete lines
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);

        if (!line) continue;

        try {
          const msg = JSON.parse(line) as Record<string, unknown>;

          if (msg.type === 'assistant') {
            // Capture the full assistant message in the transcript
            transcript.push(msg as Record<string, unknown>);

            // Forward text content to stderr for visibility
            const message = msg.message as Record<string, unknown> | undefined;
            if (message) {
              const content = message.content as Array<Record<string, unknown>> | undefined;
              if (content) {
                for (const block of content) {
                  if (block.type === 'text' && typeof block.text === 'string') {
                    process.stderr.write(block.text);
                  }
                }
              }
            }
          } else if (msg.type === 'user') {
            // Capture tool results / user messages in transcript
            transcript.push(msg as Record<string, unknown>);
          } else if (msg.type === 'result') {
            // Extract metrics from the result message
            costUsd = typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : undefined;
            providerSessionId = typeof msg.session_id === 'string' ? msg.session_id : undefined;

            // Parse token usage from the result's usage field
            const usage = msg.usage as Record<string, unknown> | undefined;
            if (usage) {
              tokenUsage = {
                inputTokens: (typeof usage.input_tokens === 'number' ? usage.input_tokens : 0),
                outputTokens: (typeof usage.output_tokens === 'number' ? usage.output_tokens : 0),
                cacheReadTokens: typeof usage.cache_read_input_tokens === 'number'
                  ? usage.cache_read_input_tokens : undefined,
                cacheWriteTokens: typeof usage.cache_creation_input_tokens === 'number'
                  ? usage.cache_creation_input_tokens : undefined,
              };
            }
          }
          // Silently skip other message types (system, rate_limit_event, etc.)
        } catch {
          // Non-JSON line — ignore (shouldn't happen with stream-json, but be defensive)
        }
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    proc.on('close', (code) => {
      // Ensure trailing newline after streamed text output
      if (transcript.length > 0) {
        process.stderr.write('\n');
      }

      resolve({
        exitCode: code ?? 1,
        transcript,
        costUsd,
        tokenUsage,
        providerSessionId,
      });
    });
  });
}

export default claudeCodeProvider;
