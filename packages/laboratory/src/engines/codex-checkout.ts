/**
 * lab.codex-checkout / lab.codex-checkout-teardown — clone a working dir
 * from a codex bare repo for claude-direct trials.
 *
 * MOTIVATION
 * ──────────
 * The codex-setup engine creates only a bare repo (the per-trial
 * "upstream"). Production xguild trials get their working dir from the
 * test guild's `draft` engine, which clones the bare into a worktree.
 * Claude-direct trials don't have a draft engine — they need a working
 * dir directly so claude can operate against committable source.
 *
 * This engine fills that gap. It clones the bare repo into a per-trial
 * working dir under `<labHost>/.nexus/laboratory/checkouts/<codexName>/`,
 * checks out `baseSha`, and yields `{ workdir }` for downstream stages
 * to reference via `${yields.codex.workdir}`.
 *
 * SETUP FLOW
 * ──────────
 * 1. Validate givens (bareLocalPath, baseSha; codexName auto from upstream).
 * 2. Resolve workdir path:
 *      <labHostGuild>/.nexus/laboratory/checkouts/<codexName>/
 *    Refuse if it already exists (idempotency / safety).
 * 3. `git clone <bareLocalPath> <workdir>`. The clone preserves the bare
 *    as `origin`, so claude's commits stay local until something pushes.
 * 4. `git checkout <baseSha>` in the workdir.
 * 5. Yield `{ workdir, baseSha, codexName }`.
 *
 * TEARDOWN FLOW
 * ─────────────
 * Removes the workdir under the standard archive-presence guard. No
 * push of work commits to the bare — the codex itself is also being
 * torn down.
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { guild } from '@shardworks/nexus-core';
import type {
  EngineDesign,
  EngineRunContext,
  EngineRunResult,
} from '@shardworks/fabricator-apparatus';
import {
  assertArchiveRowExists,
  resolveTrialIdForTeardown,
} from '../archive/presence.ts';

const execFile = promisify(execFileCb);

const SETUP_ID = 'lab.codex-checkout';
const TEARDOWN_ID = 'lab.codex-checkout-teardown';

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

interface CheckoutGivens {
  bareLocalPath: string;
  baseSha: string;
  codexName: string;
}

function validateGivens(rawGivens: Record<string, unknown>, designId: string): CheckoutGivens {
  const bareLocalPath = rawGivens.bareLocalPath;
  if (typeof bareLocalPath !== 'string' || bareLocalPath.length === 0 || !path.isAbsolute(bareLocalPath)) {
    throw new Error(
      `[${designId}] givens.bareLocalPath is required and must be an absolute path ` +
        `(got ${JSON.stringify(bareLocalPath)}). Set it to '\${yields.<codex-fixture-id>.bareLocalPath}'.`,
    );
  }
  const baseSha = rawGivens.baseSha;
  if (typeof baseSha !== 'string' || !SHA_PATTERN.test(baseSha)) {
    throw new Error(
      `[${designId}] givens.baseSha must be a 40-char hex SHA; got "${String(baseSha)}".`,
    );
  }
  const codexName = rawGivens.codexName;
  if (typeof codexName !== 'string' || codexName.length === 0) {
    throw new Error(
      `[${designId}] givens.codexName is required (set it to '\${yields.<codex-fixture-id>.codexName}').`,
    );
  }
  return { bareLocalPath, baseSha, codexName };
}

/**
 * Resolve the workdir path under the lab-host guild's filesystem.
 * Namespaced to avoid collision with the bare repo dir
 * (`.nexus/laboratory/codexes/<name>.git`) and the Scriptorium's
 * cache (`.nexus/codexes/<name>.git`).
 */
export function checkoutWorkdirPath(labHostGuildHome: string, codexName: string): string {
  return path.join(labHostGuildHome, '.nexus', 'laboratory', 'checkouts', codexName);
}

// ── Setup ────────────────────────────────────────────────────────────

async function runSetup(
  rawGivens: Record<string, unknown>,
  _context: EngineRunContext,
): Promise<EngineRunResult> {
  const { bareLocalPath, baseSha, codexName } = validateGivens(rawGivens, SETUP_ID);
  const labHost = guild().home;
  const workdir = checkoutWorkdirPath(labHost, codexName);

  if (existsSync(workdir)) {
    throw new Error(
      `[${SETUP_ID}] checkout workdir already exists at ${workdir}; refusing to overwrite. ` +
        `If a prior trial's teardown was interrupted, remove the directory manually before re-posting.`,
    );
  }

  if (!existsSync(bareLocalPath)) {
    throw new Error(
      `[${SETUP_ID}] codex bare not found at ${bareLocalPath}. ` +
        `Verify the codex-setup fixture ran successfully upstream.`,
    );
  }

  // Ensure the parent (.nexus/laboratory/checkouts/) exists.
  await mkdir(path.dirname(workdir), { recursive: true });

  // Clone the bare into the workdir.
  try {
    await execFile('git', ['clone', bareLocalPath, workdir]);
  } catch (err) {
    // Best-effort cleanup on partial clone failure.
    await rm(workdir, { recursive: true, force: true });
    throw new Error(
      `[${SETUP_ID}] git clone failed: ${(err as Error).message}`,
    );
  }

  // Checkout baseSha. Use detached HEAD — claude's commits will live on
  // a detached HEAD by default; the verify command can `git log` directly.
  try {
    await execFile('git', ['checkout', '--quiet', baseSha], { cwd: workdir });
  } catch (err) {
    await rm(workdir, { recursive: true, force: true });
    throw new Error(
      `[${SETUP_ID}] git checkout ${baseSha} failed: ${(err as Error).message}`,
    );
  }

  return {
    status: 'completed',
    yields: {
      workdir,
      baseSha,
      codexName,
    },
  };
}

// ── Teardown ─────────────────────────────────────────────────────────

async function runTeardown(
  rawGivens: Record<string, unknown>,
  context: EngineRunContext,
): Promise<EngineRunResult> {
  const trialId = resolveTrialIdForTeardown(rawGivens, TEARDOWN_ID);
  await assertArchiveRowExists(trialId, TEARDOWN_ID, 'codex-checkout');

  const codexName = rawGivens.codexName;
  if (typeof codexName !== 'string' || codexName.length === 0) {
    throw new Error(
      `[${TEARDOWN_ID}] givens.codexName is required (set it to '\${yields.<codex-fixture-id>.codexName}').`,
    );
  }

  const labHost = guild().home;
  const workdir = checkoutWorkdirPath(labHost, codexName);

  await rm(workdir, { recursive: true, force: true });

  return {
    status: 'completed',
    yields: {
      removed: true,
      workdir,
      codexName,
    },
  };
}

export const codexCheckoutSetupEngine: EngineDesign = {
  id: SETUP_ID,
  run: runSetup,
};

export const codexCheckoutTeardownEngine: EngineDesign = {
  id: TEARDOWN_ID,
  run: runTeardown,
};
