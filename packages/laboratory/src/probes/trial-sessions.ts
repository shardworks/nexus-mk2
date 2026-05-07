/**
 * lab.probe-trial-sessions — captures the lab guild's `animator/sessions`
 * rows whose `metadata.trialId` matches this trial, into the standard
 * `lab-trial-stacks-dumps` book.
 *
 * The claude-direct trial doctype runs its claude sessions on the lab
 * guild itself (no test guild). All sessions land in a single shared
 * `animator/sessions` book that also carries unrelated lab-host work.
 * This probe filters that book down to just the trial's rows so existing
 * extraction tooling (cost calculators, tool-use metrics, runlog scripts
 * that read `<extract-dir>/stacks-export/animator-sessions.json`) works
 * unchanged.
 *
 * Shape parity: the rows are written with `sourceBook = 'animator/sessions'`,
 * matching `lab.probe-stacks-dump`'s naming convention. The extract handler
 * materializes to `<targetDir>/stacks-export/animator-sessions.json` —
 * same path, same JSON-array-of-bodies shape.
 *
 * GIVENS
 * ──────
 *   trialId : string?  — Optional; falls back to `_trial.writId`.
 *
 * SUMMARY (yields → archive row)
 * ──────────────────────────────
 *   {
 *     sessionCount: number,
 *     sourceBook:   'animator/sessions',
 *     capturedAt:   string,
 *   }
 *
 * No per-stage cost aggregation in the summary by design — runlogs
 * aggregate from the materialized data sanctum-side. Easier to aggregate
 * later than to de-aggregate after the fact.
 *
 * EXTRACT
 * ───────
 *   Materializes a single JSON file at
 *   `<targetDir>/stacks-export/animator-sessions.json` (a JSON array of
 *   session bodies, sorted by sourceRowId). Same on-disk shape that
 *   `lab.probe-stacks-dump` produces for the test-guild's
 *   `animator/sessions` book.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
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
import type { SessionDoc } from '@shardworks/animator-apparatus';
import type { InjectedTrialContext } from '../engines/phases.ts';
import {
  LAB_TRIAL_STACKS_DUMPS_BOOK,
  type LabTrialStacksDump,
} from '../archive/stacks-dumps-book.ts';
import type {
  ProbeEngineDesign,
  ProbeExtractArgs,
  ProbeExtractResult,
} from './types.ts';

const DESIGN_ID = 'lab.probe-trial-sessions';
const SOURCE_BOOK = 'animator/sessions';
const EXTRACT_SUBDIR = 'stacks-export';
const EXTRACT_FILENAME = 'animator-sessions.json';

interface ResolvedGivens {
  trialId: string;
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
  return { trialId };
}

// ── run() ────────────────────────────────────────────────────────────

async function runTrialSessions(
  rawGivens: Record<string, unknown>,
  _context: EngineRunContext,
): Promise<EngineRunResult> {
  const { trialId } = validateGivens(rawGivens);

  const stacks = guild().apparatus<StacksApi>('stacks');

  // Read the lab guild's own animator/sessions book; filter by
  // metadata.trialId. Dot-notation for nested fields per the Stacks
  // BookQuery contract.
  const sessionsBook: ReadOnlyBook<SessionDoc> = stacks.readBook<SessionDoc>(
    'animator',
    'sessions',
  );
  const matches = await sessionsBook.find({
    where: [['metadata.trialId', '=', trialId]],
    orderBy: [['id', 'asc']],
  });

  // Write each row into lab-trial-stacks-dumps with sourceBook='animator/sessions'.
  const dumpBook: Book<LabTrialStacksDump> = stacks.book<LabTrialStacksDump>(
    'laboratory',
    LAB_TRIAL_STACKS_DUMPS_BOOK,
  );

  const capturedAt = new Date().toISOString();
  for (const session of matches) {
    const dump: LabTrialStacksDump = {
      id: generateId('lsd', 6),
      trialId,
      sourceBook: SOURCE_BOOK,
      sourceRowId: session.id,
      capturedAt,
      body: session as Record<string, unknown>,
    };
    await dumpBook.put(dump);
  }

  return {
    status: 'completed',
    yields: {
      sessionCount: matches.length,
      sourceBook: SOURCE_BOOK,
      capturedAt,
    },
  };
}

// ── extract() ────────────────────────────────────────────────────────

async function extractTrialSessions(args: ProbeExtractArgs): Promise<ProbeExtractResult> {
  const stacks = guild().apparatus<StacksApi>('stacks');
  const dumpBook: ReadOnlyBook<LabTrialStacksDump> = stacks.readBook<LabTrialStacksDump>(
    'laboratory',
    LAB_TRIAL_STACKS_DUMPS_BOOK,
  );

  const rows = await dumpBook.find({
    where: [
      ['trialId', '=', args.trialId],
      ['sourceBook', '=', SOURCE_BOOK],
    ],
    orderBy: [['sourceRowId', 'asc']],
  });

  if (rows.length === 0) {
    return { files: [] };
  }

  const exportDir = path.join(args.targetDir, EXTRACT_SUBDIR);
  await mkdir(exportDir, { recursive: true });

  const relPath = path.join(EXTRACT_SUBDIR, EXTRACT_FILENAME);
  const fullPath = path.join(args.targetDir, relPath);
  const bodies = rows.map((r) => r.body);
  const json = JSON.stringify(bodies, null, 2);
  await writeFile(fullPath, json, 'utf8');

  return { files: [{ path: relPath, bytes: Buffer.byteLength(json, 'utf8') }] };
}

export const trialSessionsEngine: ProbeEngineDesign = {
  id: DESIGN_ID,
  run: runTrialSessions,
  extract: extractTrialSessions,
};

export default trialSessionsEngine;
