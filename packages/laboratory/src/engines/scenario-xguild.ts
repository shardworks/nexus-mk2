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
 * BLOCK-TYPE GATING (vs. inline polling)
 * ──────────────────────────────────────
 * Wait modes are implemented by returning `{status: 'blocked'}` with
 * a registered BlockType (`lab.xguild-writ-terminal` or
 * `lab.xguild-rig-terminal`). The Spider's dispatch predicate polls
 * the BlockType's `check()` between crawl ticks, leaving the parent
 * guild's spider crawl loop free to run other engines in the
 * meantime. When the gate clears, the Spider re-dispatches this
 * engine; we detect the resume via `context.priorBlock` and shell
 * out once to read the final state, then return `{status: 'completed'}`.
 *
 * COMMISSION-POST FLOW
 * ────────────────────
 * First dispatch (no priorBlock):
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
 *    - `waitForRigTerminal: true` → return blocked with
 *      `lab.xguild-rig-terminal`. Use this for spec-only and other
 *      rigs whose writ never seals.
 *    - `waitForTerminal !== false` (default true) → return blocked
 *      with `lab.xguild-writ-terminal`. Use this for full-pipeline
 *      rigs where seal transitions the writ.
 *    - Both false → return completed immediately.
 *
 * Resume dispatch (priorBlock present): shell out to read the final
 * writ/rig state and return `{status: 'completed', yields}`.
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
 *                                  blocks on `lab.xguild-writ-terminal`.
 *                                  When false, returns immediately
 *                                  after post (unless waitForRigTerminal
 *                                  is set).
 *   waitForRigTerminal : bool?   — default false. When true, blocks on
 *                                  `lab.xguild-rig-terminal`. Mutually
 *                                  exclusive with waitForTerminal=true
 *                                  (engine throws if both true).
 *   pollIntervalMs     : number? — accepted for back-compat; ignored.
 *                                  The BlockType's poll interval (5s)
 *                                  governs check frequency.
 *   timeoutMs          : number? — only meaningful when waiting; default
 *                                  1_800_000 (30 minutes). Encoded as
 *                                  the BlockType condition's deadline.
 *   rigDiscoveryTimeoutMs : number? — only meaningful when
 *                                  waitForRigTerminal=true; default
 *                                  60_000 (1 minute). Added to
 *                                  `timeoutMs` to form the combined
 *                                  rig-terminal deadline.
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
 *   pollIntervalMs   : number? — accepted for back-compat; ignored.
 *   timeoutMs        : number? — default 1_800_000 (30 minutes).
 *
 * YIELDS (wait-for-writ-terminal)
 * ───────────────────────────────
 *   { writId, finalState, resolution, resolvedAt }
 *
 * GIVENS (wait-for-rig-terminal — standalone)
 * ───────────────────────────────────────────
 *   writId                : string  — the writ id whose rig to poll.
 *   pollIntervalMs        : number? — accepted for back-compat; ignored.
 *   timeoutMs             : number? — default 1_800_000 (30 minutes).
 *   rigDiscoveryTimeoutMs : number? — default 60_000 (1 minute).
 *
 * YIELDS (wait-for-rig-terminal)
 * ──────────────────────────────
 *   { writId, rigId, rigStatus, rigResolvedAt }
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  EngineDesign,
  EngineRunContext,
  EngineRunResult,
} from '@shardworks/fabricator-apparatus';
import type { InjectedTrialContext } from './phases.ts';
import { exec, fetchRigForWrit, fetchRigState, fetchWritState, resolveLocalNsg } from './xguild-shell.ts';

// Re-export for back-compat — these were public exports of this module
// before the block-type refactor.
export { exec, resolveLocalNsg } from './xguild-shell.ts';

// ── Defaults ──────────────────────────────────────────────────────────

export const DEFAULT_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1_000; // 30 minutes
export const DEFAULT_RIG_DISCOVERY_TIMEOUT_MS = 60_000; // 1 minute
const TERMINAL_CLASSIFICATION = 'terminal';
const RIG_TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const WRIT_TERMINAL_BLOCK_TYPE = 'lab.xguild-writ-terminal';
const RIG_TERMINAL_BLOCK_TYPE = 'lab.xguild-rig-terminal';

// ── Types ─────────────────────────────────────────────────────────────

export interface DiscoveredTestGuild {
  guildName: string;
  guildPath: string;
}

interface PostedWrit {
  writId: string;
  postedAt: string;
}

/**
 * Condition payload carried on the engine's hold while it waits for
 * the test guild's writ or rig to reach terminal. The engine's resume
 * path reads `priorBlock.condition` and uses these fields to fetch
 * the final state without re-posting the commission.
 */
interface XguildHoldCondition {
  testGuildPath: string;
  writId: string;
  postedAt: string;
  deadline: string;
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

// ── Resume helpers ────────────────────────────────────────────────────

/**
 * Pull a typed XguildHoldCondition out of `context.priorBlock`. Throws
 * when the priorBlock is malformed — that's a Spider-side bug, not a
 * runtime condition the engine can recover from.
 */
function readHoldCondition(
  priorBlock: NonNullable<EngineRunContext['priorBlock']>,
  designId: string,
): XguildHoldCondition {
  const cond = priorBlock.condition as Record<string, unknown> | null | undefined;
  if (!cond || typeof cond !== 'object') {
    throw new Error(
      `[${designId}] priorBlock present but condition is not an object (resume after gate clear).`,
    );
  }
  const { testGuildPath, writId, postedAt, deadline } = cond as Record<string, unknown>;
  if (typeof testGuildPath !== 'string' || typeof writId !== 'string' ||
      typeof postedAt !== 'string' || typeof deadline !== 'string') {
    throw new Error(
      `[${designId}] priorBlock condition is missing required fields ` +
        `(testGuildPath, writId, postedAt, deadline).`,
    );
  }
  return { testGuildPath, writId, postedAt, deadline };
}

/**
 * On resume from `lab.xguild-writ-terminal`: read the writ's final
 * state and assemble the engine's yields.
 */
async function completeWritTerminal(
  hold: XguildHoldCondition,
  designId: string,
): Promise<EngineRunResult> {
  const writ = await fetchWritState({
    testGuildPath: hold.testGuildPath,
    writId: hold.writId,
    caller: designId,
  });
  if (writ.classification !== TERMINAL_CLASSIFICATION) {
    throw new Error(
      `[${designId}] gate cleared but writ ${hold.writId} is not in a terminal ` +
        `classification (got "${String(writ.classification)}"). This indicates a stale ` +
        `priorBlock or a writ-state regression in the test guild.`,
    );
  }
  return {
    status: 'completed',
    yields: {
      writId: hold.writId,
      postedAt: hold.postedAt,
      finalState: typeof writ.phase === 'string' ? writ.phase : 'unknown',
      resolution: typeof writ.resolution === 'string' ? writ.resolution : null,
      resolvedAt:
        typeof writ.resolvedAt === 'string' ? writ.resolvedAt : new Date().toISOString(),
    },
  };
}

/**
 * On resume from `lab.xguild-rig-terminal`: read the rig's final
 * state and assemble the engine's yields. The block type already
 * confirmed the rig is terminal before clearing.
 */
async function completeRigTerminal(
  hold: XguildHoldCondition,
  designId: string,
): Promise<EngineRunResult> {
  const rigId = await fetchRigForWrit({
    testGuildPath: hold.testGuildPath,
    writId: hold.writId,
    caller: designId,
  });
  if (rigId === null) {
    throw new Error(
      `[${designId}] gate cleared but no rig is bound to writ ${hold.writId}. ` +
        `This indicates a stale priorBlock or a rig-cancellation race in the test guild.`,
    );
  }
  const rig = await fetchRigState({
    testGuildPath: hold.testGuildPath,
    rigId,
    caller: designId,
  });
  if (typeof rig.status !== 'string' || !RIG_TERMINAL_STATUSES.has(rig.status)) {
    throw new Error(
      `[${designId}] gate cleared but rig ${rigId} is not in a terminal status ` +
        `(got "${String(rig.status)}"). Stale priorBlock or rig-state regression.`,
    );
  }
  return {
    status: 'completed',
    yields: {
      writId: hold.writId,
      postedAt: hold.postedAt,
      rigId,
      rigStatus: rig.status,
      rigResolvedAt:
        typeof rig.resolvedAt === 'string' ? rig.resolvedAt : new Date().toISOString(),
    },
  };
}

// ── Commission-post engine ────────────────────────────────────────────

export const commissionPostXguildEngine: EngineDesign = {
  id: 'lab.commission-post-xguild',
  async run(rawGivens, context: EngineRunContext): Promise<EngineRunResult> {
    const designId = 'lab.commission-post-xguild';

    // Resume path — gate cleared, fetch final state and complete.
    if (context.priorBlock) {
      const hold = readHoldCondition(context.priorBlock, designId);
      if (context.priorBlock.type === RIG_TERMINAL_BLOCK_TYPE) {
        return completeRigTerminal(hold, designId);
      }
      // Default to writ-terminal resume — covers the writ-terminal
      // block type and any legacy holds without an explicit type.
      return completeWritTerminal(hold, designId);
    }

    // Fresh dispatch — validate, post, decide wait mode.
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
    // pollIntervalMs is validated for back-compat but ignored — the
    // BlockType's pollIntervalMs governs check frequency.
    optionalPositiveNumber(
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
      // Combined deadline: discovery + terminal. Slightly more
      // permissive than the original two-phase semantics, but the
      // stateless gate model can't carry per-phase timing without
      // mutating the condition between checks.
      const deadline = new Date(Date.now() + rigDiscoveryTimeoutMs + timeoutMs).toISOString();
      return {
        status: 'blocked',
        blockType: RIG_TERMINAL_BLOCK_TYPE,
        condition: {
          testGuildPath: testGuild.guildPath,
          writId: posted.writId,
          postedAt: posted.postedAt,
          deadline,
        } satisfies XguildHoldCondition,
      };
    }

    if (!shouldWaitForWrit) {
      return {
        status: 'completed',
        yields: posted,
      };
    }

    return {
      status: 'blocked',
      blockType: WRIT_TERMINAL_BLOCK_TYPE,
      condition: {
        testGuildPath: testGuild.guildPath,
        writId: posted.writId,
        postedAt: posted.postedAt,
        deadline: new Date(Date.now() + timeoutMs).toISOString(),
      } satisfies XguildHoldCondition,
    };
  },
};

// ── Standalone wait engine ────────────────────────────────────────────

export const waitForWritTerminalXguildEngine: EngineDesign = {
  id: 'lab.wait-for-writ-terminal-xguild',
  async run(rawGivens, context: EngineRunContext): Promise<EngineRunResult> {
    const designId = 'lab.wait-for-writ-terminal-xguild';

    if (context.priorBlock) {
      const hold = readHoldCondition(context.priorBlock, designId);
      const writ = await fetchWritState({
        testGuildPath: hold.testGuildPath,
        writId: hold.writId,
        caller: designId,
      });
      return {
        status: 'completed',
        yields: {
          writId: hold.writId,
          finalState: typeof writ.phase === 'string' ? writ.phase : 'unknown',
          resolution: typeof writ.resolution === 'string' ? writ.resolution : null,
          resolvedAt:
            typeof writ.resolvedAt === 'string' ? writ.resolvedAt : new Date().toISOString(),
        },
      };
    }

    const writId = optionalString(rawGivens.writId, designId, 'writId');
    if (writId === undefined || writId.length === 0) {
      throw new Error(
        `[${designId}] givens.writId is required (the writ id to poll in the test guild).`,
      );
    }
    optionalPositiveNumber(
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

    return {
      status: 'blocked',
      blockType: WRIT_TERMINAL_BLOCK_TYPE,
      condition: {
        testGuildPath: testGuild.guildPath,
        writId,
        // No prior post-commission step here; record the resume entry
        // time so downstream consumers have a sensible timestamp.
        postedAt: new Date().toISOString(),
        deadline: new Date(Date.now() + timeoutMs).toISOString(),
      } satisfies XguildHoldCondition,
    };
  },
};

// ── Standalone rig-wait engine ────────────────────────────────────────

export const waitForRigTerminalXguildEngine: EngineDesign = {
  id: 'lab.wait-for-rig-terminal-xguild',
  async run(rawGivens, context: EngineRunContext): Promise<EngineRunResult> {
    const designId = 'lab.wait-for-rig-terminal-xguild';

    if (context.priorBlock) {
      const hold = readHoldCondition(context.priorBlock, designId);
      const rigId = await fetchRigForWrit({
        testGuildPath: hold.testGuildPath,
        writId: hold.writId,
        caller: designId,
      });
      if (rigId === null) {
        throw new Error(
          `[${designId}] gate cleared but no rig is bound to writ ${hold.writId}.`,
        );
      }
      const rig = await fetchRigState({
        testGuildPath: hold.testGuildPath,
        rigId,
        caller: designId,
      });
      if (typeof rig.status !== 'string' || !RIG_TERMINAL_STATUSES.has(rig.status)) {
        throw new Error(
          `[${designId}] gate cleared but rig ${rigId} is not in a terminal status ` +
            `(got "${String(rig.status)}").`,
        );
      }
      return {
        status: 'completed',
        yields: {
          writId: hold.writId,
          rigId,
          rigStatus: rig.status,
          rigResolvedAt:
            typeof rig.resolvedAt === 'string' ? rig.resolvedAt : new Date().toISOString(),
        },
      };
    }

    const writId = optionalString(rawGivens.writId, designId, 'writId');
    if (writId === undefined || writId.length === 0) {
      throw new Error(
        `[${designId}] givens.writId is required (the writ id whose dispatched rig to poll).`,
      );
    }
    optionalPositiveNumber(
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

    return {
      status: 'blocked',
      blockType: RIG_TERMINAL_BLOCK_TYPE,
      condition: {
        testGuildPath: testGuild.guildPath,
        writId,
        postedAt: new Date().toISOString(),
        deadline: new Date(Date.now() + rigDiscoveryTimeoutMs + timeoutMs).toISOString(),
      } satisfies XguildHoldCondition,
    };
  },
};
