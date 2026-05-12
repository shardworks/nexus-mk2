/**
 * Shared shellout helpers for cross-guild scenario engines and their
 * companion block types.
 *
 * The cross-guild surface is v1: shell out to the test guild's
 * locally-installed `nsg` binstub. Each helper performs ONE shellout
 * and returns the parsed result. Polling/retrying is the caller's job
 * (the BlockTypes call these once per `check()`; engines call them
 * once on first dispatch and once on resume).
 */

import { execFile as execFileCb } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

export async function exec(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFile(cmd, args, {
      maxBuffer: 50 * 1024 * 1024,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(
      `${cmd} ${args.join(' ')} failed: ${e.stderr || e.message || 'unknown error'}`,
    );
  }
}

/**
 * Tolerant JSON parser for cross-guild shellout output. A well-behaved
 * `nsg <subcommand> --format json` invocation emits exactly one JSON
 * document on stdout, but real-world stdout can be polluted by trailing
 * content from a follow-on emitter (e.g. a plugin's shutdown log, or a
 * future telemetry hook). When the standard `JSON.parse` rejects with
 * the V8-flavoured "Unexpected non-whitespace character after JSON at
 * position N" error, slice the stdout to the failure position and retry
 * — the prefix is, by definition, a complete and valid JSON document.
 *
 * Emits a stderr warning on the recovery path so the underlying
 * pollution stays diagnosable. Throws the original error (wrapped with
 * caller context) only when no prefix-recovery path is available.
 */
function parseJsonTolerant(stdout: string, caller: string, target: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch (err) {
    const message = (err as Error).message;
    const match = /at position (\d+)/.exec(message);
    if (match) {
      const pos = Number(match[1]);
      if (Number.isFinite(pos) && pos > 0 && pos <= stdout.length) {
        try {
          const parsed = JSON.parse(stdout.slice(0, pos));
          console.warn(
            `[${caller}] tolerated trailing content after JSON for ${target}: ` +
              `${stdout.length - pos} bytes of garbage after a valid ${pos}-byte JSON prefix.`,
          );
          return parsed;
        } catch {
          // Prefix isn't valid either — fall through to the original throw.
        }
      }
    }
    throw new Error(
      `[${caller}] JSON parse failed for ${target}: ${message}; ` +
        `stdout=${stdout.slice(0, 200)}`,
    );
  }
}

/**
 * Resolve the test guild's locally-installed `nsg` binstub.
 *
 * The cross-guild shellouts always run against the test guild's own
 * CLI — version-matched to the test guild's `nexus` field, no
 * dependency on whatever CLI happens to be on PATH. lab.guild-setup
 * bootstraps the install via `npx -p @shardworks/nexus@<spec> nsg
 * init …`, so the binstub exists by the time any scenario engine
 * runs.
 */
export function resolveLocalNsg(testGuildPath: string, caller: string): string {
  const localNsg = path.join(testGuildPath, 'node_modules', '.bin', 'nsg');
  if (!existsSync(localNsg)) {
    throw new Error(
      `[${caller}] no local nsg at ${localNsg}. The test guild must have been ` +
        `bootstrapped via lab.guild-setup (which installs @shardworks/nexus locally). ` +
        `If you're invoking this engine outside the laboratory's standard rig, ensure ` +
        `the test guild's package.json declares @shardworks/nexus and that npm install ran.`,
    );
  }
  return localNsg;
}

// ── Single-shot fetchers ──────────────────────────────────────────────

export interface WritShowResult {
  classification?: string;
  phase?: string;
  resolution?: string;
  resolvedAt?: string;
  // Other fields ignored.
}

/**
 * Fetch the current state of a writ in the test guild via one shellout.
 * Throws on shellout failure (transient — caller should treat as retryable).
 */
export async function fetchWritState(opts: {
  testGuildPath: string;
  writId: string;
  caller: string;
}): Promise<WritShowResult> {
  const localNsg = resolveLocalNsg(opts.testGuildPath, opts.caller);
  // `writ show` is a sub-subcommand of the `writ` group.
  const { stdout } = await exec(localNsg, [
    '--guild-root',
    opts.testGuildPath,
    'writ',
    'show',
    '--id',
    opts.writId,
    '--format',
    'json',
  ]);

  const parsed = parseJsonTolerant(stdout, opts.caller, `writ ${opts.writId}`);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(
      `[${opts.caller}] writ-show response was not an object for writ ${opts.writId}.`,
    );
  }
  return parsed as WritShowResult;
}

/**
 * Fetch the rig id (if any) currently bound to a writ. Returns `null`
 * when no rig has been dispatched yet — that's the wait condition for
 * rig discovery.
 */
export async function fetchRigForWrit(opts: {
  testGuildPath: string;
  writId: string;
  caller: string;
}): Promise<string | null> {
  const localNsg = resolveLocalNsg(opts.testGuildPath, opts.caller);
  const { stdout } = await exec(localNsg, [
    '--guild-root',
    opts.testGuildPath,
    'rig',
    'for-writ',
    opts.writId,
  ]);

  const trimmed = stdout.trim();
  if (!trimmed || trimmed === 'null') return null;

  const parsed = parseJsonTolerant(trimmed, opts.caller, `rig for-writ ${opts.writId}`);
  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.id === 'string' && obj.id.length > 0) {
      return obj.id;
    }
  }
  return null;
}

export interface RigShowResult {
  status?: string;
  resolvedAt?: string;
  // Other fields ignored.
}

/**
 * Fetch the current state of a rig in the test guild via one shellout.
 */
export async function fetchRigState(opts: {
  testGuildPath: string;
  rigId: string;
  caller: string;
}): Promise<RigShowResult> {
  const localNsg = resolveLocalNsg(opts.testGuildPath, opts.caller);
  const { stdout } = await exec(localNsg, [
    '--guild-root',
    opts.testGuildPath,
    'rig',
    'show',
    '--id',
    opts.rigId,
    '--format',
    'json',
  ]);

  const parsed = parseJsonTolerant(stdout, opts.caller, `rig ${opts.rigId}`);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(
      `[${opts.caller}] rig show response was not an object for rig ${opts.rigId}.`,
    );
  }
  return parsed as RigShowResult;
}
