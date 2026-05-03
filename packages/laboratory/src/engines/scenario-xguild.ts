/**
 * lab.commission-post-xguild / lab.wait-for-writ-terminal-xguild /
 * lab.wait-for-rig-terminal-xguild — cross-guild scenario engines for
 * trial workloads.
 *
 * The canonical trial scenario is "post a commission to the test guild
 * and wait for it to complete." `lab.commission-post-xguild` does both
 * inline by default (single engine fits the rig template's single-
 * scenario-engine slot). The two standalone wait engines are the
 * detached building blocks.
 *
 * **Two waiter modes — writ vs rig.** For full-pipeline trials the writ
 * reaches a terminal classification when `seal` runs and transitions
 * the mandate to `completed`. For spec-only / planning-only rigs (no
 * seal stage), the writ stays in `open` indefinitely; the rig itself
 * is the only signal that the trial is done. `waitForRigTerminal`
 * selects the rig waiter; `waitForTerminal` selects the writ waiter.
 * Exactly one wait mode runs per invocation (mutually exclusive).
 *
 * v1 cross-guild surface is shell-out via
 * `<testGuild>/node_modules/.bin/nsg --guild-root <test-guild> ...` —
 * the test guild's locally-installed CLI, version-matched to the
 * test guild's `nexus` field. lab.guild-setup bootstraps that
 * install via `npx -p @shardworks/nexus@<spec> nsg init …`. The
 * real cross-guild engine surface is parked at click c-mom9vm3n for
 * v2.
 *
 * COMMISSION-POST FLOW
 * ────────────────────
 * 1. Validate givens (briefPath absolute or manifest-relative; type
 *    defaults to 'mandate').
 * 2. Discover the target test guild from `context.upstream` — duck-type
 *    detection: any upstream yield with `{guildName: string, guildPath:
 *    string}` (the guild-fixture's yield shape).
 * 3. Read brief content from briefPath. Title defaults to the brief's
 *    first markdown H1 if present, else "Commission from <basename>".
 * 4. Shell out: `nsg --guild-root <testGuild> commission-post --title
 *    <title> --body <body> --type <type> [--parent-id <parentId>]`.
 *    Parse JSON response, extract writ id.
 * 5. Choose wait mode:
 *    - `waitForRigTerminal: true` → poll the spider rig dispatched
 *      from the writ until it reaches a terminal RigStatus
 *      (`completed`/`failed`/`cancelled`). Use this for spec-only
 *      and other rigs whose writ never seals.
 *    - `waitForTerminal !== false` (default true) → poll the writ
 *      until it reaches a terminal classification. Use this for
 *      full-pipeline rigs where seal transitions the writ.
 *    - Both false → return immediately after post.
 *
 * GIVENS (commission-post)
 * ────────────────────────
 *   briefPath          : string  — path to the brief markdown.
 *                                   Absolute is used as-is; relative is
 *                                   resolved against `_trial.manifestDir`
 *                                   (the directory of the manifest file
 *                                   at trial-post time).
 *   title              : string? — optional explicit title; defaults to
 *                                  first H1 of the brief, or
 *                                  "Commission from <basename>".
 *   type               : string? — writ type, default 'mandate'.
 *   parentId           : string? — optional parent writ id (in the test
 *                                  guild's namespace).
 *   waitForTerminal    : bool?   — default true. When true and
 *                                  waitForRigTerminal is not set,
 *                                  polls the writ until terminal. When
 *                                  false, returns immediately after
 *                                  post (unless waitForRigTerminal is
 *                                  set, in which case the rig waiter
 *                                  runs instead).
 *   waitForRigTerminal : bool?   — default false. When true, polls the
 *                                  spider rig dispatched from the writ
 *                                  until terminal. Mutually exclusive
 *                                  with waitForTerminal=true (engine
 *                                  throws if both true).
 *   pollIntervalMs     : number? — only meaningful when waiting; default
 *                                  5000.
 *   timeoutMs          : number? — only meaningful when waiting; default
 *                                  1_800_000 (30 minutes).
 *   rigDiscoveryTimeoutMs : number? — only meaningful when
 *                                  waitForRigTerminal=true; how long to
 *                                  wait for the rig to appear after post
 *                                  (rig dispatch is async); default
 *                                  60_000 (1 minute).
 *
 * YIELDS (commission-post)
 * ────────────────────────
 *   waitForTerminal=true (default):
 *     { writId, postedAt, finalState, resolution, resolvedAt }
 *   waitForRigTerminal=true:
 *     { writId, postedAt, rigId, rigStatus, rigResolvedAt }
 *   neither (early return):
 *     { writId, postedAt }
 *
 * GIVENS (wait-for-writ-terminal — standalone)
 * ────────────────────────────────────────────
 *   writId           : string  — the writ id to poll.
 *   pollIntervalMs   : number? — default 5000.
 *   timeoutMs        : number? — default 1_800_000 (30 minutes).
 *
 * YIELDS (wait-for-writ-terminal)
 * ───────────────────────────────
 *   { writId, finalState, resolution, resolvedAt }
 *
 * GIVENS (wait-for-rig-terminal — standalone)
 * ───────────────────────────────────────────
 *   writId                : string  — the writ id whose rig to poll.
 *   pollIntervalMs        : number? — default 5000.
 *   timeoutMs             : number? — default 1_800_000 (30 minutes).
 *   rigDiscoveryTimeoutMs : number? — default 60_000 (1 minute).
 *
 * YIELDS (wait-for-rig-terminal)
 * ──────────────────────────────
 *   { writId, rigId, rigStatus, rigResolvedAt }
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  EngineDesign,
  EngineRunContext,
  EngineRunResult,
} from '@shardworks/fabricator-apparatus';
import type { InjectedTrialContext } from './phases.ts';

const execFile = promisify(execFileCb);

// ── Defaults ──────────────────────────────────────────────────────────

export const DEFAULT_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1_000; // 30 minutes
export const DEFAULT_RIG_DISCOVERY_TIMEOUT_MS = 60_000; // 1 minute
const TERMINAL_CLASSIFICATION = 'terminal';
const RIG_TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

// ── Types ─────────────────────────────────────────────────────────────

export interface DiscoveredTestGuild {
  guildName: string;
  guildPath: string;
}

interface PostedWrit {
  writId: string;
  postedAt: string;
}

interface TerminalSnapshot {
  writId: string;
  finalState: string;
  resolution: string | null;
  resolvedAt: string;
}

interface RigTerminalSnapshot {
  writId: string;
  rigId: string;
  rigStatus: 'completed' | 'failed' | 'cancelled';
  rigResolvedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Walk upstream yields and find every entry that looks like a
 * guild-fixture's output (has both `guildName` and `guildPath` strings).
 * Same duck-typing pattern as the codex discovery in guild-fixture.
 */
export function discoverTestGuilds(
  upstream: Record<string, unknown>,
): DiscoveredTestGuild[] {
  const result: DiscoveredTestGuild[] = [];
  for (const value of Object.values(upstream)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const obj = value as Record<string, unknown>;
      if (typeof obj.guildName === 'string' && typeof obj.guildPath === 'string') {
        result.push({ guildName: obj.guildName, guildPath: obj.guildPath });
      }
    }
  }
  return result;
}

/**
 * Pull the first markdown H1 ("# Title") out of a brief, returning the
 * title text. Returns null when no H1 found.
 */
export function extractH1Title(briefContent: string): string | null {
  const match = briefContent.match(/^#\s+(.+?)\s*$/m);
  return match ? match[1]!.trim() : null;
}

async function exec(
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
 * Resolve the test guild's locally-installed `nsg` binstub.
 *
 * The cross-guild shellouts always run against the test guild's own
 * CLI — version-matched to the test guild's `nexus` field, no
 * dependency on whatever CLI happens to be on PATH. lab.guild-setup
 * bootstraps the install via `npx -p @shardworks/nexus@<spec> nsg
 * init …`, so the binstub exists by the time any scenario engine
 * runs.
 */
export function resolveLocalNsg(testGuildPath: string, designId: string): string {
  const localNsg = path.join(testGuildPath, 'node_modules', '.bin', 'nsg');
  if (!existsSync(localNsg)) {
    throw new Error(
      `[${designId}] no local nsg at ${localNsg}. The test guild must have been ` +
        `bootstrapped via lab.guild-setup (which installs @shardworks/nexus locally). ` +
        `If you're invoking this engine outside the laboratory's standard rig, ensure ` +
        `the test guild's package.json declares @shardworks/nexus and that npm install ran.`,
    );
  }
  return localNsg;
}

/**
 * Resolve the single test guild from upstream yields. Throws when zero
 * or multiple test guilds are present — explicit selection is future
 * work (v2).
 */
function resolveTestGuild(
  upstream: Record<string, unknown>,
  designId: string,
): DiscoveredTestGuild {
  const guilds = discoverTestGuilds(upstream);
  if (guilds.length === 0) {
    throw new Error(
      `[${designId}] no test guild found in context.upstream — the engine ` +
        `expects at least one upstream yield with {guildName: string, guildPath: string} ` +
        `(the guild-fixture's yield shape).`,
    );
  }
  if (guilds.length > 1) {
    const names = guilds.map((g) => g.guildName).join(', ');
    throw new Error(
      `[${designId}] multiple test guilds found in context.upstream (${names}); ` +
        `explicit selection is not yet supported in v1.`,
    );
  }
  return guilds[0]!;
}

/**
 * Poll until the target writ reaches a terminal-classification state.
 * Throws on timeout. Each poll shells out `nsg --guild-root <test-guild>
 * writ show --id <writId> --format json`.
 *
 * Exposed as a standalone helper so both engines (the post-and-wait
 * happy path, and the standalone wait engine) share its behavior.
 */
export async function waitForWritTerminal(opts: {
  testGuildPath: string;
  writId: string;
  pollIntervalMs: number;
  timeoutMs: number;
  designId: string;
}): Promise<TerminalSnapshot> {
  const startedAt = Date.now();
  while (true) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > opts.timeoutMs) {
      throw new Error(
        `[${opts.designId}] timed out after ${opts.timeoutMs}ms waiting for writ ` +
          `${opts.writId} (test guild ${opts.testGuildPath}) to reach a terminal state.`,
      );
    }

    const localNsg = resolveLocalNsg(opts.testGuildPath, opts.designId);
    // `writ show` is a sub-subcommand of the `writ` group in the
    // published 0.1.292 CLI surface — there is no top-level
    // `writ-show` command. Earlier drafts of this engine (and a
    // few of the engine docstrings) referred to `writ-show`; that
    // was always wrong and only escaped notice because phase-1/2a
    // trials all ran with `waitForTerminal: false` and never
    // exercised this poll path. Phase 2b is the first trial to
    // hit it and surfaced the typo.
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch (err) {
      throw new Error(
        `[${opts.designId}] writ-show JSON parse failed for writ ${opts.writId}: ` +
          `${(err as Error).message}; stdout=${stdout.slice(0, 200)}`,
      );
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(
        `[${opts.designId}] writ-show response was not an object for writ ${opts.writId}.`,
      );
    }

    const obj = parsed as Record<string, unknown>;
    const classification = obj.classification;
    if (classification === TERMINAL_CLASSIFICATION) {
      return {
        writId: opts.writId,
        finalState: typeof obj.phase === 'string' ? obj.phase : 'unknown',
        resolution: typeof obj.resolution === 'string' ? obj.resolution : null,
        resolvedAt:
          typeof obj.resolvedAt === 'string' ? obj.resolvedAt : new Date().toISOString(),
      };
    }

    await new Promise((resolve) => setTimeout(resolve, opts.pollIntervalMs));
  }
}

/**
 * Resolve the spider rig dispatched from a writ. Polls
 * `nsg rig for-writ <writId>` until a rig appears or the discovery
 * timeout elapses — rig dispatch is async after writ creation, so
 * the rig may not exist for a few seconds after `commission-post`
 * returns. Returns the rig id once found.
 *
 * The Spider's `rig for-writ` command returns `null` when no rig is
 * yet bound to the writ; that's the wait condition.
 */
export async function discoverRigForWrit(opts: {
  testGuildPath: string;
  writId: string;
  pollIntervalMs: number;
  timeoutMs: number;
  designId: string;
}): Promise<string> {
  const startedAt = Date.now();
  const localNsg = resolveLocalNsg(opts.testGuildPath, opts.designId);

  while (true) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > opts.timeoutMs) {
      throw new Error(
        `[${opts.designId}] timed out after ${opts.timeoutMs}ms waiting for a rig ` +
          `to be dispatched from writ ${opts.writId} (test guild ${opts.testGuildPath}).`,
      );
    }

    // `nsg rig for-writ` requires the FULL writ id (no prefix resolution
    // in the rig book today). Caller must pass the full id.
    const { stdout } = await exec(localNsg, [
      '--guild-root',
      opts.testGuildPath,
      'rig',
      'for-writ',
      opts.writId,
    ]);

    const trimmed = stdout.trim();
    if (trimmed && trimmed !== 'null') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch (err) {
        throw new Error(
          `[${opts.designId}] rig for-writ JSON parse failed for writ ${opts.writId}: ` +
            `${(err as Error).message}; stdout=${trimmed.slice(0, 200)}`,
        );
      }
      if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.id === 'string' && obj.id.length > 0) {
          return obj.id;
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, opts.pollIntervalMs));
  }
}

/**
 * Poll until the target writ's dispatched spider rig reaches a terminal
 * RigStatus (`completed` | `failed` | `cancelled`). Throws on timeout.
 *
 * Use this for rigs whose mandate writ never seals — spec-only /
 * planning-only trials, etc. — where the rig itself is the only
 * "trial done" signal. Each poll shells out
 * `nsg --guild-root <test-guild> rig show --id <rigId> --format json`.
 */
export async function waitForRigTerminal(opts: {
  testGuildPath: string;
  writId: string;
  pollIntervalMs: number;
  timeoutMs: number;
  rigDiscoveryTimeoutMs: number;
  designId: string;
}): Promise<RigTerminalSnapshot> {
  // First find the rig (may not exist immediately after writ creation).
  const rigId = await discoverRigForWrit({
    testGuildPath: opts.testGuildPath,
    writId: opts.writId,
    pollIntervalMs: opts.pollIntervalMs,
    timeoutMs: opts.rigDiscoveryTimeoutMs,
    designId: opts.designId,
  });

  const startedAt = Date.now();
  const localNsg = resolveLocalNsg(opts.testGuildPath, opts.designId);

  while (true) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > opts.timeoutMs) {
      throw new Error(
        `[${opts.designId}] timed out after ${opts.timeoutMs}ms waiting for rig ` +
          `${rigId} (writ ${opts.writId}, test guild ${opts.testGuildPath}) to ` +
          `reach a terminal RigStatus.`,
      );
    }

    const { stdout } = await exec(localNsg, [
      '--guild-root',
      opts.testGuildPath,
      'rig',
      'show',
      '--id',
      rigId,
      '--format',
      'json',
    ]);

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch (err) {
      throw new Error(
        `[${opts.designId}] rig show JSON parse failed for rig ${rigId}: ` +
          `${(err as Error).message}; stdout=${stdout.slice(0, 200)}`,
      );
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(
        `[${opts.designId}] rig show response was not an object for rig ${rigId}.`,
      );
    }

    const obj = parsed as Record<string, unknown>;
    const status = obj.status;
    if (typeof status === 'string' && RIG_TERMINAL_STATUSES.has(status)) {
      return {
        writId: opts.writId,
        rigId,
        rigStatus: status as RigTerminalSnapshot['rigStatus'],
        rigResolvedAt:
          typeof obj.resolvedAt === 'string' ? obj.resolvedAt : new Date().toISOString(),
      };
    }

    await new Promise((resolve) => setTimeout(resolve, opts.pollIntervalMs));
  }
}

// ── Validation helpers ────────────────────────────────────────────────

/**
 * Resolve a path-typed given. Absolute paths are taken as-is; relative
 * paths are resolved against `manifestDir` when available. Falls back
 * to fail-loud when the path is relative and `manifestDir` is absent
 * (legacy writs posted without the manifestPath stamp).
 */
function resolvePathGiven(
  value: unknown,
  designId: string,
  fieldName: string,
  manifestDir: string | undefined,
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `[${designId}] givens.${fieldName} must be a non-empty string; got "${String(value)}".`,
    );
  }
  if (path.isAbsolute(value)) return value;
  if (manifestDir === undefined) {
    throw new Error(
      `[${designId}] givens.${fieldName} is relative ("${value}") but no manifest directory ` +
        `is available — _trial.manifestDir was not injected. Either pass an absolute path ` +
        `or post the trial via lab-trial-post (which stamps the manifest path on the writ).`,
    );
  }
  return path.resolve(manifestDir, value);
}

function optionalString(
  value: unknown,
  designId: string,
  fieldName: string,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new Error(
      `[${designId}] givens.${fieldName} must be a string when provided; got ${typeof value}.`,
    );
  }
  return value;
}

function optionalPositiveNumber(
  value: unknown,
  designId: string,
  fieldName: string,
  fallback: number,
): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(
      `[${designId}] givens.${fieldName} must be a positive number when provided; got ${String(value)}.`,
    );
  }
  return value;
}

// ── Commission-post engine ────────────────────────────────────────────

export const commissionPostXguildEngine: EngineDesign = {
  id: 'lab.commission-post-xguild',
  async run(rawGivens, context: EngineRunContext): Promise<EngineRunResult> {
    const designId = 'lab.commission-post-xguild';
    const trial = rawGivens._trial as InjectedTrialContext | undefined;
    const briefPath = resolvePathGiven(
      rawGivens.briefPath,
      designId,
      'briefPath',
      trial?.manifestDir,
    );
    const explicitTitle = optionalString(rawGivens.title, designId, 'title');
    const type = optionalString(rawGivens.type, designId, 'type') ?? 'mandate';
    const parentId = optionalString(rawGivens.parentId, designId, 'parentId');
    const shouldWaitForRig = rawGivens.waitForRigTerminal === true;
    // waitForTerminal defaults to true ONLY when waitForRigTerminal is
    // not set — a manifest specifying just `waitForRigTerminal: true`
    // should not also implicitly run the writ waiter.
    const explicitWaitForTerminal = rawGivens.waitForTerminal;
    const shouldWaitForWrit =
      explicitWaitForTerminal === true ||
      (explicitWaitForTerminal !== false && !shouldWaitForRig);
    if (shouldWaitForRig && explicitWaitForTerminal === true) {
      throw new Error(
        `[${designId}] waitForTerminal and waitForRigTerminal are mutually exclusive; ` +
          `pick one wait mode (writ vs rig) per invocation.`,
      );
    }
    const pollIntervalMs = optionalPositiveNumber(
      rawGivens.pollIntervalMs,
      designId,
      'pollIntervalMs',
      DEFAULT_POLL_INTERVAL_MS,
    );
    const timeoutMs = optionalPositiveNumber(
      rawGivens.timeoutMs,
      designId,
      'timeoutMs',
      DEFAULT_TIMEOUT_MS,
    );
    const rigDiscoveryTimeoutMs = optionalPositiveNumber(
      rawGivens.rigDiscoveryTimeoutMs,
      designId,
      'rigDiscoveryTimeoutMs',
      DEFAULT_RIG_DISCOVERY_TIMEOUT_MS,
    );

    const testGuild = resolveTestGuild(context.upstream, designId);

    // Read brief.
    let briefContent: string;
    try {
      briefContent = await readFile(briefPath, 'utf8');
    } catch (err) {
      throw new Error(
        `[${designId}] failed to read brief at ${briefPath}: ${(err as Error).message}`,
      );
    }

    const title =
      explicitTitle ?? extractH1Title(briefContent) ?? `Commission from ${path.basename(briefPath)}`;

    // Post commission via shell-out.
    const args = [
      '--guild-root',
      testGuild.guildPath,
      'commission-post',
      '--title',
      title,
      '--body',
      briefContent,
      '--type',
      type,
    ];
    if (parentId !== undefined) {
      args.push('--parent-id', parentId);
    }

    const localNsg = resolveLocalNsg(testGuild.guildPath, designId);
    const { stdout } = await exec(localNsg, args);
    let writ: unknown;
    try {
      writ = JSON.parse(stdout);
    } catch (err) {
      throw new Error(
        `[${designId}] commission-post JSON parse failed: ${(err as Error).message}; ` +
          `stdout=${stdout.slice(0, 200)}`,
      );
    }
    if (typeof writ !== 'object' || writ === null) {
      throw new Error(
        `[${designId}] commission-post response was not an object: ${stdout.slice(0, 200)}`,
      );
    }
    const writObj = writ as Record<string, unknown>;
    if (typeof writObj.id !== 'string' || writObj.id.length === 0) {
      throw new Error(
        `[${designId}] commission-post response had no writ id; stdout=${stdout.slice(0, 200)}`,
      );
    }

    const posted: PostedWrit = {
      writId: writObj.id,
      postedAt: new Date().toISOString(),
    };

    if (shouldWaitForRig) {
      const rigTerminal = await waitForRigTerminal({
        testGuildPath: testGuild.guildPath,
        writId: posted.writId,
        pollIntervalMs,
        timeoutMs,
        rigDiscoveryTimeoutMs,
        designId,
      });
      return {
        status: 'completed',
        yields: { ...posted, ...rigTerminal },
      };
    }

    if (!shouldWaitForWrit) {
      return {
        status: 'completed',
        yields: posted,
      };
    }

    // Inline wait until terminal.
    const terminal = await waitForWritTerminal({
      testGuildPath: testGuild.guildPath,
      writId: posted.writId,
      pollIntervalMs,
      timeoutMs,
      designId,
    });

    return {
      status: 'completed',
      yields: { ...posted, ...terminal },
    };
  },
};

// ── Standalone wait engine ────────────────────────────────────────────

export const waitForWritTerminalXguildEngine: EngineDesign = {
  id: 'lab.wait-for-writ-terminal-xguild',
  async run(rawGivens, context: EngineRunContext): Promise<EngineRunResult> {
    const designId = 'lab.wait-for-writ-terminal-xguild';
    const writId = optionalString(rawGivens.writId, designId, 'writId');
    if (writId === undefined || writId.length === 0) {
      throw new Error(
        `[${designId}] givens.writId is required (the writ id to poll in the test guild).`,
      );
    }
    const pollIntervalMs = optionalPositiveNumber(
      rawGivens.pollIntervalMs,
      designId,
      'pollIntervalMs',
      DEFAULT_POLL_INTERVAL_MS,
    );
    const timeoutMs = optionalPositiveNumber(
      rawGivens.timeoutMs,
      designId,
      'timeoutMs',
      DEFAULT_TIMEOUT_MS,
    );

    const testGuild = resolveTestGuild(context.upstream, designId);
    const terminal = await waitForWritTerminal({
      testGuildPath: testGuild.guildPath,
      writId,
      pollIntervalMs,
      timeoutMs,
      designId,
    });

    return {
      status: 'completed',
      yields: terminal,
    };
  },
};

// ── Standalone rig-wait engine ────────────────────────────────────────

export const waitForRigTerminalXguildEngine: EngineDesign = {
  id: 'lab.wait-for-rig-terminal-xguild',
  async run(rawGivens, context: EngineRunContext): Promise<EngineRunResult> {
    const designId = 'lab.wait-for-rig-terminal-xguild';
    const writId = optionalString(rawGivens.writId, designId, 'writId');
    if (writId === undefined || writId.length === 0) {
      throw new Error(
        `[${designId}] givens.writId is required (the writ id whose dispatched rig to poll).`,
      );
    }
    const pollIntervalMs = optionalPositiveNumber(
      rawGivens.pollIntervalMs,
      designId,
      'pollIntervalMs',
      DEFAULT_POLL_INTERVAL_MS,
    );
    const timeoutMs = optionalPositiveNumber(
      rawGivens.timeoutMs,
      designId,
      'timeoutMs',
      DEFAULT_TIMEOUT_MS,
    );
    const rigDiscoveryTimeoutMs = optionalPositiveNumber(
      rawGivens.rigDiscoveryTimeoutMs,
      designId,
      'rigDiscoveryTimeoutMs',
      DEFAULT_RIG_DISCOVERY_TIMEOUT_MS,
    );

    const testGuild = resolveTestGuild(context.upstream, designId);
    const terminal = await waitForRigTerminal({
      testGuildPath: testGuild.guildPath,
      writId,
      pollIntervalMs,
      timeoutMs,
      rigDiscoveryTimeoutMs,
      designId,
    });

    return {
      status: 'completed',
      yields: terminal,
    };
  },
};
