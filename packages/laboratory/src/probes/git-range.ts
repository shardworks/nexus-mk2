/**
 * lab.probe-git-range — captures every commit between a codex's
 * recorded base SHA and its current head, writes one row per commit
 * to `lab-trial-codex-commits`. Big-diff tripwire: any single diff
 * over 10MB fails the probe (and thus the trial).
 *
 * The probe runs in the lab-host process and discovers the trial's
 * codex via duck-typing on `context.upstream` — any yield with the
 * `{codexName, bareLocalPath, baseSha}` shape (the codex-fixture's
 * yield form) is a candidate. A single matching codex is required
 * unless an explicit `codexName` given is supplied.
 *
 * Head SHA resolution: we read the bare repo's `main` ref, since the
 * bare is the canonical write target — the test guild seals into the
 * bare via the codexes plugin's seal flow. The codex-fixture's yield
 * carries `headSha = baseSha` at setup time; that field is not
 * updated as the trial progresses, so we re-read from the bare.
 *
 * GIVENS
 * ──────
 *   trialId    : string?  — Optional; falls back to `_trial.writId`.
 *   codexName  : string?  — Optional explicit codex selector. Required
 *                          when more than one codex is present in
 *                          upstream.
 *
 * SUMMARY (yields → archive row)
 * ──────────────────────────────
 *   {
 *     codexName       : string,
 *     baseSha         : string,
 *     headSha         : string,
 *     commitCount     : number,
 *     totalDiffBytes  : number,
 *     capturedAt      : string,
 *   }
 *
 * EXTRACT
 * ───────
 *   `<targetDir>/codex-history/`
 *     ├── commits-manifest.yaml      // ordered metadata
 *     └── NNNN-<sha-12>.patch        // one file per commit
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import { guild, generateId } from '@shardworks/nexus-core';
import type {
  EngineRunContext,
  EngineRunResult,
} from '@shardworks/fabricator-apparatus';
import type {
  Book,
  ReadOnlyBook,
  StacksApi,
} from '@shardworks/stacks-apparatus';
import type { InjectedTrialContext } from '../engines/phases.ts';
import {
  LAB_TRIAL_CODEX_COMMITS_BOOK,
  PER_DIFF_BYTE_CAP,
  type LabTrialCodexCommit,
} from '../archive/codex-commits-book.ts';
import type {
  ProbeEngineDesign,
  ProbeExtractArgs,
  ProbeExtractResult,
} from './types.ts';

const execFile = promisify(execFileCb);

const DESIGN_ID = 'lab.probe-git-range';
const EXTRACT_SUBDIR = 'codex-history';
const COMMITS_MANIFEST_FILE = 'commits-manifest.yaml';

// ── Givens ────────────────────────────────────────────────────────────

interface ResolvedGivens {
  trialId: string;
  codexName?: string;
}

function validateGivens(rawGivens: Record<string, unknown>): ResolvedGivens {
  let trialId = rawGivens.trialId;
  if (trialId === undefined || trialId === null) {
    const trial = rawGivens._trial as InjectedTrialContext | undefined;
    if (trial && typeof trial.writId === 'string' && trial.writId.length > 0) {
      trialId = trial.writId;
    }
  }
  if (typeof trialId !== 'string' || trialId.length === 0) {
    throw new Error(
      `[${DESIGN_ID}] trialId is required (givens.trialId or framework-injected _trial.writId).`,
    );
  }

  let codexName: string | undefined;
  if (rawGivens.codexName !== undefined && rawGivens.codexName !== null) {
    if (typeof rawGivens.codexName !== 'string' || rawGivens.codexName.length === 0) {
      throw new Error(`[${DESIGN_ID}] givens.codexName must be a non-empty string when provided.`);
    }
    codexName = rawGivens.codexName;
  }

  return { trialId, codexName };
}

// ── Codex discovery from upstream ────────────────────────────────────

export interface DiscoveredCodexFixture {
  codexName: string;
  bareLocalPath: string;
  baseSha: string;
}

/**
 * Walk upstream yields and find every entry that looks like a
 * codex-fixture's setup yield (has `codexName`, `bareLocalPath`,
 * `baseSha`). Same duck-typing pattern other engines use.
 */
export function discoverCodexFixtures(
  upstream: Record<string, unknown>,
): DiscoveredCodexFixture[] {
  const result: DiscoveredCodexFixture[] = [];
  for (const value of Object.values(upstream)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const obj = value as Record<string, unknown>;
      if (
        typeof obj.codexName === 'string' &&
        typeof obj.bareLocalPath === 'string' &&
        typeof obj.baseSha === 'string'
      ) {
        result.push({
          codexName: obj.codexName,
          bareLocalPath: obj.bareLocalPath,
          baseSha: obj.baseSha,
        });
      }
    }
  }
  return result;
}

function selectCodex(
  upstream: Record<string, unknown>,
  explicitName: string | undefined,
): DiscoveredCodexFixture {
  const candidates = discoverCodexFixtures(upstream);
  if (candidates.length === 0) {
    throw new Error(
      `[${DESIGN_ID}] no codex fixture found in context.upstream — expected at least one ` +
        `upstream yield with {codexName, bareLocalPath, baseSha} (the codex-fixture's yield shape).`,
    );
  }
  if (explicitName !== undefined) {
    const match = candidates.find((c) => c.codexName === explicitName);
    if (!match) {
      throw new Error(
        `[${DESIGN_ID}] givens.codexName="${explicitName}" did not match any upstream codex ` +
          `(seen: ${candidates.map((c) => c.codexName).join(', ')}).`,
      );
    }
    return match;
  }
  if (candidates.length > 1) {
    throw new Error(
      `[${DESIGN_ID}] multiple codex fixtures found in context.upstream ` +
        `(${candidates.map((c) => c.codexName).join(', ')}); set givens.codexName to disambiguate.`,
    );
  }
  return candidates[0]!;
}

// ── Git helpers ──────────────────────────────────────────────────────

async function git(
  args: string[],
  cwd: string,
  maxBufferBytes: number,
): Promise<string> {
  try {
    const { stdout } = await execFile('git', args, { cwd, maxBuffer: maxBufferBytes });
    return stdout;
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(`git ${args[0]} failed: ${e.stderr || e.message || 'unknown error'}`);
  }
}

interface CommitMeta {
  sha: string;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

/**
 * Resolve the head SHA from the bare repo's `main` ref. The codex-
 * fixture pushes the base SHA there at setup; the test guild's seal
 * flow updates `main` as work commits land.
 */
async function resolveHeadSha(barePath: string): Promise<string> {
  const out = (await git(['rev-parse', 'main'], barePath, 1 * 1024 * 1024)).trim();
  if (!/^[0-9a-f]{40}$/i.test(out)) {
    throw new Error(`[${DESIGN_ID}] unexpected git rev-parse output: "${out.slice(0, 80)}"`);
  }
  return out;
}

/**
 * Enumerate commits in `<base>..<head>` ancestry order (oldest → newest).
 * Returns just the SHAs.
 */
async function listCommitShas(barePath: string, base: string, head: string): Promise<string[]> {
  if (base === head) return [];
  const out = await git(
    ['rev-list', '--reverse', `${base}..${head}`],
    barePath,
    10 * 1024 * 1024,
  );
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function readCommitMessage(barePath: string, sha: string): Promise<string> {
  // %B = full message (subject + body, no trailing newline).
  const out = await git(
    ['show', '--no-patch', '--format=%B', sha],
    barePath,
    5 * 1024 * 1024,
  );
  // Strip git's trailing newline; leave embedded newlines alone.
  return out.replace(/\n$/, '');
}

async function readShortStat(barePath: string, sha: string): Promise<{
  filesChanged: number;
  insertions: number;
  deletions: number;
}> {
  // `git show --shortstat --no-patch --format=` produces empty output: the
  // empty `--format=` swallows the shortstat line along with the commit
  // header. `git log -1 --shortstat --format=` gives just the shortstat,
  // which is what we want.
  const out = await git(
    ['log', '-1', '--shortstat', '--format=', sha],
    barePath,
    5 * 1024 * 1024,
  );
  return parseShortStat(out);
}

/**
 * Parse `git show --shortstat`'s short stat line:
 *   " 3 files changed, 12 insertions(+), 4 deletions(-)"
 * Tolerates singular/plural, missing-side variants, and extra whitespace.
 */
export function parseShortStat(line: string): {
  filesChanged: number;
  insertions: number;
  deletions: number;
} {
  const trimmed = line.trim();
  const filesMatch = /(\d+)\s+files?\s+changed/.exec(trimmed);
  const insMatch = /(\d+)\s+insertions?\(\+\)/.exec(trimmed);
  const delMatch = /(\d+)\s+deletions?\(-\)/.exec(trimmed);
  return {
    filesChanged: filesMatch ? Number(filesMatch[1]) : 0,
    insertions: insMatch ? Number(insMatch[1]) : 0,
    deletions: delMatch ? Number(delMatch[1]) : 0,
  };
}

async function readDiff(
  barePath: string,
  sha: string,
  maxBufferBytes: number,
): Promise<string> {
  // The 10MB cap is enforced after the buffer is in memory; we still
  // bound execFile's maxBuffer so a runaway diff doesn't OOM us before
  // we get a chance to fail loud.
  return git(['show', '--patch', '--format=%H%n', sha], barePath, maxBufferBytes);
}

// ── run() ────────────────────────────────────────────────────────────

async function runGitRange(
  rawGivens: Record<string, unknown>,
  context: EngineRunContext,
): Promise<EngineRunResult> {
  const { trialId, codexName: requestedName } = validateGivens(rawGivens);
  const codex = selectCodex(context.upstream, requestedName);

  const headSha = await resolveHeadSha(codex.bareLocalPath);
  const shas = await listCommitShas(codex.bareLocalPath, codex.baseSha, headSha);

  const stacks = guild().apparatus<StacksApi>('stacks');
  const commits: Book<LabTrialCodexCommit> = stacks.book<LabTrialCodexCommit>(
    'laboratory',
    LAB_TRIAL_CODEX_COMMITS_BOOK,
  );

  // execFile maxBuffer: must accommodate the cap plus some overhead
  // for `--format=%H%n` lead. Cap+1MB is plenty.
  const buffer = PER_DIFF_BYTE_CAP + 1 * 1024 * 1024;

  let totalDiffBytes = 0;
  let sequence = 0;
  for (const sha of shas) {
    const message = await readCommitMessage(codex.bareLocalPath, sha);
    const stat = await readShortStat(codex.bareLocalPath, sha);
    const diffWithHeader = await readDiff(codex.bareLocalPath, sha, buffer);

    // The diff output starts with `<sha>\n` (from --format=%H%n) — strip
    // it to keep `diff` purely the patch text.
    const diff = diffWithHeader.replace(new RegExp(`^${sha}\\n`), '');

    const diffBytes = Buffer.byteLength(diff, 'utf8');
    if (diffBytes > PER_DIFF_BYTE_CAP) {
      throw new Error(
        `[${DESIGN_ID}] commit ${sha} diff size ${diffBytes} bytes exceeds the per-diff ` +
          `cap of ${PER_DIFF_BYTE_CAP} bytes (10MB). Realistic diffs are <500KB; the cap is a ` +
          `tripwire, not a hard limit. Investigate the commit before raising the cap.`,
      );
    }
    totalDiffBytes += diffBytes;

    await commits.put({
      id: generateId('lcc', 6),
      trialId,
      sequence,
      sha,
      message,
      filesChanged: stat.filesChanged,
      insertions: stat.insertions,
      deletions: stat.deletions,
      diff,
    });
    sequence += 1;
  }

  return {
    status: 'completed',
    yields: {
      codexName: codex.codexName,
      baseSha: codex.baseSha,
      headSha,
      commitCount: shas.length,
      totalDiffBytes,
      capturedAt: new Date().toISOString(),
    },
  };
}

// ── extract() ────────────────────────────────────────────────────────

async function extractGitRange(args: ProbeExtractArgs): Promise<ProbeExtractResult> {
  const stacks = guild().apparatus<StacksApi>('stacks');
  const commits: ReadOnlyBook<LabTrialCodexCommit> = stacks.readBook<LabTrialCodexCommit>(
    'laboratory',
    LAB_TRIAL_CODEX_COMMITS_BOOK,
  );
  const rows = await commits.find({
    where: [['trialId', '=', args.trialId]],
    orderBy: [['sequence', 'asc']],
  });

  if (rows.length === 0) {
    return { files: [] };
  }

  const exportDir = path.join(args.targetDir, EXTRACT_SUBDIR);
  await mkdir(exportDir, { recursive: true });

  const manifest = {
    commits: rows.map((row) => ({
      sequence: row.sequence,
      sha: row.sha,
      message: row.message.split('\n')[0]!, // subject only in the manifest
      filesChanged: row.filesChanged,
      insertions: row.insertions,
      deletions: row.deletions,
      patchFile: patchFileName(row.sequence, row.sha),
    })),
  };
  const manifestText = yamlStringify(manifest);
  const manifestRel = path.join(EXTRACT_SUBDIR, COMMITS_MANIFEST_FILE);
  const manifestFull = path.join(args.targetDir, manifestRel);
  await writeFile(manifestFull, manifestText, 'utf8');

  const files: ProbeExtractResult['files'] = [
    { path: manifestRel, bytes: Buffer.byteLength(manifestText, 'utf8') },
  ];

  for (const row of rows) {
    const name = patchFileName(row.sequence, row.sha);
    const rel = path.join(EXTRACT_SUBDIR, name);
    const full = path.join(args.targetDir, rel);
    await writeFile(full, row.diff, 'utf8');
    files.push({ path: rel, bytes: Buffer.byteLength(row.diff, 'utf8') });
  }

  return { files };
}

/**
 * Patch file naming: zero-padded sequence + 12-char sha for sortable,
 * traceable filenames. `0001-a1b2c3d4e5f6.patch`.
 */
export function patchFileName(sequence: number, sha: string): string {
  return `${String(sequence).padStart(4, '0')}-${sha.slice(0, 12)}.patch`;
}

export const gitRangeEngine: ProbeEngineDesign = {
  id: DESIGN_ID,
  run: runGitRange,
  extract: extractGitRange,
};
