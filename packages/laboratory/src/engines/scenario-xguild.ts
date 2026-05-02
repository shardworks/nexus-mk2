/**
 * lab.commission-post-xguild / lab.wait-for-writ-terminal-xguild —
 * cross-guild scenario engines for trial workloads.
 *
 * The canonical trial scenario is "post a commission to the test guild
 * and wait for it to complete." `lab.commission-post-xguild` does both
 * inline by default (single engine fits the rig template's single-
 * scenario-engine slot), and `lab.wait-for-writ-terminal-xguild` is the
 * standalone wait building block — useful for future multi-step
 * scenarios where post is detached from wait.
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
 * 1. Validate givens (briefPath absolute; type defaults to 'mandate').
 * 2. Discover the target test guild from `context.upstream` — duck-type
 *    detection: any upstream yield with `{guildName: string, guildPath:
 *    string}` (the guild-fixture's yield shape).
 * 3. Read brief content from briefPath. Title defaults to the brief's
 *    first markdown H1 if present, else "Commission from <basename>".
 * 4. Shell out: `nsg --guild-root <testGuild> commission-post --title
 *    <title> --body <body> --type <type> [--parent-id <parentId>]`.
 *    Parse JSON response, extract writ id.
 * 5. If `waitForTerminal !== false` (default true), poll until the writ
 *    reaches a terminal state. Otherwise return immediately after post.
 *
 * GIVENS (commission-post)
 * ────────────────────────
 *   briefPath        : string  — absolute path to the brief markdown.
 *   title            : string? — optional explicit title; defaults to
 *                                first H1 of the brief, or
 *                                "Commission from <basename>".
 *   type             : string? — writ type, default 'mandate'.
 *   parentId         : string? — optional parent writ id (in the test
 *                                guild's namespace).
 *   waitForTerminal  : bool?   — default true. When true, the engine
 *                                polls until writ terminal before
 *                                returning. When false, returns
 *                                immediately after post.
 *   pollIntervalMs   : number? — only meaningful when waiting; default
 *                                5000.
 *   timeoutMs        : number? — only meaningful when waiting; default
 *                                1_800_000 (30 minutes).
 *
 * YIELDS (commission-post)
 * ────────────────────────
 *   waitForTerminal=true:
 *     { writId, postedAt, finalState, resolution, resolvedAt }
 *   waitForTerminal=false:
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

const execFile = promisify(execFileCb);

// ── Defaults ──────────────────────────────────────────────────────────

export const DEFAULT_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1_000; // 30 minutes
const TERMINAL_CLASSIFICATION = 'terminal';

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

// ── Validation helpers ────────────────────────────────────────────────

function requireAbsolutePath(
  value: unknown,
  designId: string,
  fieldName: string,
): string {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error(
      `[${designId}] givens.${fieldName} must be an absolute path; got "${String(value)}".`,
    );
  }
  return value;
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
    const briefPath = requireAbsolutePath(rawGivens.briefPath, designId, 'briefPath');
    const explicitTitle = optionalString(rawGivens.title, designId, 'title');
    const type = optionalString(rawGivens.type, designId, 'type') ?? 'mandate';
    const parentId = optionalString(rawGivens.parentId, designId, 'parentId');
    const waitForTerminal = rawGivens.waitForTerminal !== false; // default true
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

    if (!waitForTerminal) {
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
