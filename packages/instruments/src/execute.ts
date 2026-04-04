/**
 * Execute parallel LLM instrument runs via `claude --print`.
 *
 * Each run is independent: separate API call, independent sampling.
 * The runner spawns N parallel processes with full isolation (no tools,
 * no project config, sandboxed working directory).
 *
 * Uses `--output-format json` to capture the full response envelope
 * including token usage, cost, session ID, and duration alongside
 * the LLM's text output.
 */

import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ExecutionConfig, RunUsage } from './types.ts';

/** Maximum time per LLM run (5 minutes) */
const RUN_TIMEOUT_MS = 5 * 60 * 1000;

export interface RunOutcome {
  index: number;
  success: boolean;
  response: string;
  error?: string;
  /** Full JSON envelope from claude --print --output-format json */
  rawJson?: Record<string, unknown>;
  /** Extracted usage/cost data */
  usage?: RunUsage;
}

/**
 * Parse the JSON envelope from `claude --print --output-format json`.
 *
 * Extracts the text result and usage/cost metadata.
 */
function parseJsonEnvelope(stdout: string): {
  text: string;
  rawJson: Record<string, unknown>;
  usage: RunUsage;
} {
  const envelope = JSON.parse(stdout) as Record<string, unknown>;
  const text = String(envelope.result ?? '');

  // Extract usage data from the envelope
  const usageBlock = (envelope.usage ?? {}) as Record<string, unknown>;
  const modelUsage = (envelope.modelUsage ?? {}) as Record<string, Record<string, unknown>>;
  const modelNames = Object.keys(modelUsage);

  const usage: RunUsage = {
    input_tokens: Number(usageBlock.input_tokens ?? 0),
    output_tokens: Number(usageBlock.output_tokens ?? 0),
    cache_creation_input_tokens: Number(usageBlock.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens: Number(usageBlock.cache_read_input_tokens ?? 0),
    cost_usd: Number(envelope.total_cost_usd ?? 0),
    duration_ms: Number(envelope.duration_ms ?? 0),
    session_id: String(envelope.session_id ?? ''),
    model: modelNames[0] ?? 'unknown',
  };

  return { text, rawJson: envelope, usage };
}

/**
 * Execute a single instrument run.
 *
 * Pipes the user message via stdin to avoid OS argument length limits.
 * The process runs in an empty tmpdir with all tools disabled.
 */
function executeRun(
  config: ExecutionConfig,
  systemPrompt: string,
  userMessage: string,
  sandboxDir: string,
  index: number,
): Promise<RunOutcome> {
  return new Promise((resolve) => {
    const args = [
      '--print',
      '--model', config.model,
      '--output-format', 'json',
      '--max-turns', String(config.max_turns),
      '--tools', '',
      '--disallowed-tools', 'Bash,Read,Write,Edit,Glob,Grep',
      '--setting-sources', 'user',
      '--system-prompt', systemPrompt,
    ];

    const proc = execFile('claude', args, {
      cwd: sandboxDir,
      timeout: RUN_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
        HOME: process.env.HOME ?? '/tmp',
      },
    }, (err, stdout, stderr) => {
      if (err) {
        resolve({
          index,
          success: false,
          response: '',
          error: err.message + (stderr ? `\n${stderr}` : ''),
        });
        return;
      }

      try {
        const { text, rawJson, usage } = parseJsonEnvelope(stdout);
        resolve({ index, success: true, response: text, rawJson, usage });
      } catch (parseErr) {
        // JSON parse failed — fall back to treating stdout as raw text
        // (shouldn't happen, but defensive)
        resolve({
          index,
          success: true,
          response: stdout,
          error: `JSON envelope parse failed: ${parseErr}`,
        });
      }
    });

    // Pipe user message via stdin
    if (proc.stdin) {
      proc.stdin.write(userMessage);
      proc.stdin.end();
    }
  });
}

/**
 * Execute N parallel instrument runs and return all outcomes.
 */
export async function executeRuns(
  config: ExecutionConfig,
  systemPrompt: string,
  userMessage: string,
): Promise<RunOutcome[]> {
  // Create isolated sandbox directories — one per run
  const sandboxBase = mkdtempSync(join(tmpdir(), 'instrument-'));

  const promises: Promise<RunOutcome>[] = [];
  for (let i = 0; i < config.runs; i++) {
    const sandboxDir = mkdtempSync(join(sandboxBase, `run-${i}-`));
    promises.push(executeRun(config, systemPrompt, userMessage, sandboxDir, i));
  }

  return Promise.all(promises);
}
