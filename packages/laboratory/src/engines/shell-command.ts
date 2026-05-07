/**
 * lab.shell-command — clockwork engine for running a shell command in a
 * given working directory.
 *
 * Used by claude-direct trial templates as the verify stage (typecheck +
 * test gating). Trivial wrapper around `bash -c <command>` with stdout /
 * stderr tail capture and a timeout.
 *
 * Givens:
 *   command   : string  — required, non-empty. Executed via `bash -c`.
 *   cwd       : string  — required, absolute path. The command's working dir.
 *   timeoutMs : number  — optional, default 600_000 (10 minutes). Wallclock cap.
 *
 * Yields:
 *   {
 *     exitCode:   number,         // 0 on success; non-zero or null on failure
 *     stdout:     string,         // tail-truncated to ~16 KB
 *     stderr:     string,         // tail-truncated to ~16 KB
 *     durationMs: number,
 *     timedOut:   boolean,        // true if killed by the timeout
 *   }
 *
 * The engine itself completes regardless of the command's exit code —
 * downstream consumers (probes, archive, runlog scripts) interpret the
 * result. This keeps the rig from short-circuiting on a Tier-1 verify
 * failure; the trial still archives, the verify failure surfaces in the
 * extracted data.
 */

import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import type { EngineDesign, EngineRunResult } from '@shardworks/fabricator-apparatus';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const TAIL_LIMIT = 16 * 1024; // 16 KB per stream

interface ShellCommandGivens {
  command: string;
  cwd: string;
  timeoutMs: number;
}

function validateGivens(givens: Record<string, unknown>): ShellCommandGivens {
  const command = givens.command;
  if (typeof command !== 'string' || command.trim() === '') {
    throw new Error(
      `lab.shell-command: givens.command must be a non-empty string` +
        (command !== undefined ? ` (got ${JSON.stringify(command)})` : ' (missing)'),
    );
  }
  const cwd = givens.cwd;
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) {
    throw new Error(
      `lab.shell-command: givens.cwd must be an absolute path (got ${JSON.stringify(cwd)})`,
    );
  }
  const timeoutRaw = givens.timeoutMs;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (timeoutRaw !== undefined && timeoutRaw !== null) {
    if (typeof timeoutRaw !== 'number' || !Number.isFinite(timeoutRaw) || timeoutRaw <= 0) {
      throw new Error(
        `lab.shell-command: givens.timeoutMs must be a positive finite number ` +
          `(got ${JSON.stringify(timeoutRaw)})`,
      );
    }
    timeoutMs = timeoutRaw;
  }
  return { command, cwd, timeoutMs };
}

function tail(buf: string): string {
  return buf.length > TAIL_LIMIT ? buf.slice(-TAIL_LIMIT) : buf;
}

export const shellCommandEngine: EngineDesign = {
  id: 'lab.shell-command',

  async run(givens, _context): Promise<EngineRunResult> {
    const { command, cwd, timeoutMs } = validateGivens(givens);
    const startedAt = Date.now();

    return new Promise<EngineRunResult>((resolve, reject) => {
      const child = spawn('bash', ['-c', command], { cwd, env: process.env });
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // Escalate to SIGKILL after 5s if still alive
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 5000);
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = tail(stdout + chunk.toString('utf8'));
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = tail(stderr + chunk.toString('utf8'));
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startedAt;
        resolve({
          status: 'completed',
          yields: {
            exitCode: code,
            stdout,
            stderr,
            durationMs,
            timedOut,
          },
        });
      });
    });
  },
};

export default shellCommandEngine;
