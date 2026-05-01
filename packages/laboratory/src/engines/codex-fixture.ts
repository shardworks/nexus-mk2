/**
 * lab.codex-setup / lab.codex-teardown — fixture engines for a per-trial
 * "upstream" codex.
 *
 * MOTIVATION
 * ──────────
 * A trial wants a codex its test guild can read from and seal into —
 * pinned at a known base SHA, isolated per trial, disposable at the end.
 *
 * v1 uses a LOCAL bare repo per trial (no GitHub round-trip, no token
 * dependencies, no org permissions, simpler teardown). The codex is
 * registered with the lab-host guild's Scriptorium via its standard
 * `add(name, remoteUrl)` API; `remoteUrl` here is just the absolute
 * filesystem path to the bare repo, which `git clone --bare` accepts
 * natively.
 *
 * SETUP FLOW
 * ──────────
 * 1. Validate givens.
 * 2. Resolve the bare-repo path:
 *      <labHostGuild>/.nexus/laboratory/codexes/<codexName>.git
 *    Refuse if it already exists (idempotency / safety).
 * 3. Clone `upstreamRepo` to a temporary working dir.
 * 4. `git checkout <baseSha>` in the temp clone.
 * 5. `git init --bare <bare-path>`.
 * 6. From the temp clone, `git push <bare-path> HEAD:main`. The bare's
 *    `main` now points at `baseSha`.
 * 7. Remove the temp dir.
 * 8. Register the bare with the lab-host's Scriptorium via
 *    `scriptorium.add(codexName, bare-path)`. This clones the bare to
 *    `<labHostGuild>/.nexus/codexes/<codexName>.git` for guild use.
 * 9. Yield codexName, remoteUrl, baseSha, headSha (= baseSha at setup),
 *    bareLocalPath.
 *
 * Failure handling: any error mid-setup triggers best-effort rollback
 * (unregister codex, remove bare, remove temp) and re-throws. Setup is
 * all-or-nothing — either every side effect lands or every side effect
 * is undone.
 *
 * TEARDOWN FLOW
 * ─────────────
 * 1. Validate givens.
 * 2. Archive-safety check: refuse to teardown if `context.upstream.archive`
 *    is missing — structurally indicates the rig didn't reach the archive
 *    phase. Once the archive engine is real (click c-momaa5o9), this
 *    check tightens (e.g. checks `archived === true`).
 * 3. `scriptorium.remove(codexName)` — abandons drafts, removes the
 *    bare-clone at `.nexus/codexes/<name>.git`, removes the registry
 *    entry from `guild.json`. Tolerant of "codex not registered" — the
 *    setup engine may have failed before registering.
 * 4. `rm -rf <bareLocalPath>`. Tolerant of "path doesn't exist".
 * 5. Yield `{ removed: true, codexName, bareLocalPath }`.
 *
 * GIVENS (setup AND teardown — fixture givens are shared)
 * ───────────────────────────────────────────────────────
 *   upstreamRepo : string  — any git clone source (owner/name, URL, or
 *                            absolute path). Passed unchanged to git.
 *   baseSha      : string  — 40-char SHA to seed the codex at.
 *   codexName    : string  — OPTIONAL. Codex name within the lab-host
 *                            guild; also used as the bare-repo dir name.
 *                            Defaults to `<slug>-<writId-tail>` derived
 *                            from the framework-injected `_trial` context
 *                            (which the phase orchestrators populate from
 *                            the trial writ). Override when the default
 *                            isn't what you want.
 *
 * YIELDS (setup)
 * ──────────────
 *   {
 *     codexName: string,
 *     remoteUrl: string,        // absolute path to the bare; same as bareLocalPath
 *     bareLocalPath: string,    // explicit alias for clarity downstream
 *     baseSha: string,          // echoed
 *     headSha: string,          // = baseSha at setup; updated by trial work
 *   }
 *
 * YIELDS (teardown)
 * ─────────────────
 *   { removed: true, codexName: string, bareLocalPath: string }
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { guild } from '@shardworks/nexus-core';
import type {
  EngineDesign,
  EngineRunContext,
  EngineRunResult,
} from '@shardworks/fabricator-apparatus';
import type { ScriptoriumApi } from '@shardworks/codexes-apparatus';
import type { InjectedTrialContext } from './phases.ts';
import {
  assertArchiveRowExists,
  resolveTrialIdForTeardown,
} from '../archive/presence.ts';

const execFile = promisify(execFileCb);

// ── Givens validation ────────────────────────────────────────────────

interface CodexFixtureGivens {
  upstreamRepo: string;
  baseSha: string;
  codexName: string;
}

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

/**
 * Codex name rules — used both as the Scriptorium codex name AND as the
 * bare repo's directory name. Conservative: kebab-case, 1–60 chars.
 * Codex names are scoped to the lab-host guild and only need to be
 * unique among concurrent trials.
 */
const CODEX_NAME_PATTERN = /^[a-z][a-z0-9-]{0,59}$/;

/**
 * Derive the suffix used in the auto-generated codex name. The trial
 * writ id is shaped `w-<timestamp>-<hash>` (e.g.
 * `w-momen904-e8cd1359f754`); we take the trailing hash and slice 8
 * chars. Falls back to the first 8 chars of the id when no hyphens.
 */
export function writIdTail(writId: string): string {
  const trailing = writId.split('-').pop() ?? writId;
  return trailing.slice(0, 8);
}

/**
 * Compute the default codex name from the framework-injected `_trial`
 * context: `<slug>-<writIdTail>`. Returns null when `_trial` is missing
 * or malformed (caller throws with a clear message rather than silently
 * picking a meaningless default).
 */
function defaultCodexName(givens: Record<string, unknown>): string | null {
  const trial = givens._trial as InjectedTrialContext | undefined;
  if (!trial || typeof trial.slug !== 'string' || typeof trial.writId !== 'string') {
    return null;
  }
  return `${trial.slug}-${writIdTail(trial.writId)}`;
}

function validateGivens(
  givens: Record<string, unknown>,
  designId: string,
): CodexFixtureGivens {
  const upstreamRepo = givens.upstreamRepo;
  const baseSha = givens.baseSha;
  let codexName = givens.codexName;

  if (typeof upstreamRepo !== 'string' || upstreamRepo.length === 0) {
    throw new Error(
      `[${designId}] givens.upstreamRepo is required and must be a non-empty string ` +
        `(any git clone source: owner/name, URL, or absolute path).`,
    );
  }
  if (typeof baseSha !== 'string' || !SHA_PATTERN.test(baseSha)) {
    throw new Error(
      `[${designId}] givens.baseSha must be a 40-char hex SHA; got "${String(baseSha)}".`,
    );
  }

  // Default codexName from injected trial context when not supplied.
  if (codexName === undefined || codexName === null) {
    const fallback = defaultCodexName(givens);
    if (fallback === null) {
      throw new Error(
        `[${designId}] givens.codexName is missing and no _trial context was injected. ` +
          `Either author codexName explicitly, or ensure the engine runs under the ` +
          `Laboratory phase orchestrators (which inject _trial automatically).`,
      );
    }
    codexName = fallback;
  }

  if (typeof codexName !== 'string' || !CODEX_NAME_PATTERN.test(codexName)) {
    throw new Error(
      `[${designId}] codexName must be kebab-case (start with a letter; ` +
        `alphanumeric and hyphens; ≤60 chars); got "${String(codexName)}".`,
    );
  }

  return { upstreamRepo, baseSha, codexName };
}

// ── Path helpers ─────────────────────────────────────────────────────

/**
 * Resolve the bare-repo path for a trial codex inside the lab-host
 * guild's filesystem. Namespaced under `.nexus/laboratory/codexes/` —
 * adjacent to the codexes plugin's own `.nexus/codexes/` (which holds
 * the auto-clone the Scriptorium creates from this bare) but distinct
 * from it.
 */
export function bareRepoPath(labHostGuildHome: string, codexName: string): string {
  return path.join(labHostGuildHome, '.nexus', 'laboratory', 'codexes', `${codexName}.git`);
}

// ── Git ──────────────────────────────────────────────────────────────

/**
 * Lightweight git wrapper — execFile-based (no shell), trims output.
 * Mirrors the codexes plugin's internal helper but we keep our own copy
 * to avoid coupling to a non-exported symbol.
 */
async function git(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFile('git', args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(`git ${args[0]} failed: ${e.stderr || e.message || 'unknown error'}`);
  }
}

// ── Setup engine ─────────────────────────────────────────────────────

export const codexSetupEngine: EngineDesign = {
  id: 'lab.codex-setup',
  async run(rawGivens, _context: EngineRunContext): Promise<EngineRunResult> {
    const { upstreamRepo, baseSha, codexName } = validateGivens(rawGivens, 'lab.codex-setup');
    const labHost = guild();
    const barePath = bareRepoPath(labHost.home, codexName);

    if (existsSync(barePath)) {
      throw new Error(
        `[lab.codex-setup] bare repo already exists at ${barePath}; ` +
          `refusing to clobber. Codex name "${codexName}" likely collides with ` +
          `an active trial — pick a unique name.`,
      );
    }

    const scriptorium = labHost.apparatus<ScriptoriumApi>('codexes');
    if ((await scriptorium.list()).some((c) => c.name === codexName)) {
      throw new Error(
        `[lab.codex-setup] codex name "${codexName}" already registered in lab-host guild; ` +
          `pick a unique name.`,
      );
    }

    // Side-effect tracking for rollback.
    let tempDir: string | undefined;
    let bareCreated = false;
    let codexAdded = false;

    try {
      // 1. Clone upstreamRepo to a temp dir.
      tempDir = await mkdtemp(path.join(os.tmpdir(), `lab-codex-${codexName}-`));
      await git(['clone', upstreamRepo, tempDir]);

      // 2. Checkout the requested base SHA. This detaches HEAD; that's
      //    fine — we only need HEAD to point at baseSha for the push.
      await git(['checkout', '--detach', baseSha], tempDir);

      // 3. Initialize the bare repo.
      await mkdir(path.dirname(barePath), { recursive: true });
      await git(['init', '--bare', '--initial-branch=main', barePath]);
      bareCreated = true;

      // 4. Push the detached HEAD to bare/main.
      await git(['push', barePath, 'HEAD:refs/heads/main'], tempDir);

      // 5. Remove temp dir.
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;

      // 6. Register with Scriptorium. `add` clones the bare (synchronously
      //    here, blocks until ready) into <labHost>/.nexus/codexes/<name>.git.
      await scriptorium.add(codexName, barePath);
      codexAdded = true;

      return {
        status: 'completed',
        yields: {
          codexName,
          remoteUrl: barePath,
          bareLocalPath: barePath,
          baseSha,
          headSha: baseSha,
        },
      };
    } catch (err) {
      // Best-effort rollback in reverse order.
      if (codexAdded) {
        try {
          await scriptorium.remove(codexName);
        } catch {
          // swallow — primary error is what we re-throw
        }
      }
      if (bareCreated) {
        try {
          await rm(barePath, { recursive: true, force: true });
        } catch {
          // swallow
        }
      }
      if (tempDir !== undefined) {
        try {
          await rm(tempDir, { recursive: true, force: true });
        } catch {
          // swallow
        }
      }
      throw err;
    }
  },
};

// ── Teardown engine ──────────────────────────────────────────────────

export const codexTeardownEngine: EngineDesign = {
  id: 'lab.codex-teardown',
  async run(rawGivens, _context: EngineRunContext): Promise<EngineRunResult> {
    const { codexName } = validateGivens(rawGivens, 'lab.codex-teardown');

    // Archive-presence safety check (tightened per c-momkqtn5):
    // confirm the archive engine actually wrote an index row for this
    // trial's id. Robust against any rig-assembly mistake that might
    // route teardowns around the archive engine — the source of truth
    // is the persisted archive row, not the upstream chain shape.
    const trialId = resolveTrialIdForTeardown(rawGivens, 'lab.codex-teardown');
    await assertArchiveRowExists(trialId, 'lab.codex-teardown', `codex "${codexName}"`);

    const labHost = guild();
    const barePath = bareRepoPath(labHost.home, codexName);

    // 1. Remove from Scriptorium. Tolerate "not registered" — setup may
    //    have failed before registering, leaving an orphan bare.
    const scriptorium = labHost.apparatus<ScriptoriumApi>('codexes');
    const registered = (await scriptorium.list()).some((c) => c.name === codexName);
    if (registered) {
      await scriptorium.remove(codexName);
    }

    // 2. Remove the trial bare. force:true is tolerant of "doesn't exist".
    await rm(barePath, { recursive: true, force: true });

    return {
      status: 'completed',
      yields: {
        removed: true,
        codexName,
        bareLocalPath: barePath,
      },
    };
  },
};
