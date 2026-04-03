/**
 * Execute parallel LLM instrument runs via `claude --print`.
 *
 * Each run is independent: separate API call, independent sampling.
 * The runner spawns N parallel processes with full isolation (no tools,
 * no project config, sandboxed working directory).
 */

import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ExecutionConfig } from './types.ts';

/** Maximum time per LLM run (5 minutes) */
const RUN_TIMEOUT_MS = 5 * 60 * 1000;

export interface RunOutcome {
  index: number;
  success: boolean;
  response: string;
  error?: string;
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
      '--output-format', 'text',
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
      } else {
        resolve({ index, success: true, response: stdout });
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
