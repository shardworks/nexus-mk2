/**
 * lab.probe-stacks-dump — captures every row in every book of the
 * test guild and writes them to `lab-trial-stacks-dumps`. Generic
 * JSON-bodied storage; querying via SQLite JSON1 expressions.
 *
 * The probe runs in the lab-host process. It discovers the test
 * guild via duck-typing on `context.upstream` (any yield with
 * `{guildName: string, guildPath: string}` — the guild-fixture's
 * yield shape) and opens the test guild's SQLite DB read-only with
 * better-sqlite3. Tables are enumerated from `sqlite_master` filtered
 * to the `books_…` prefix the Stacks backend uses for every book it
 * provisions; for each table the probe streams rows into the lab
 * guild's `lab-trial-stacks-dumps`.
 *
 * Source-book naming: the SQLite table name is `books_<owner>_<book>`
 * with the owner normalized (`/` → `__`, other non-alphanumeric → `_`).
 * For human-friendly summaries, the probe attempts to recover
 * `<ownerId>/<bookName>` by matching the table's prefix against the
 * test guild's installed plugin list (read from its guild.json).
 * When no plugin matches (e.g. a book contributed by the framework
 * itself, or a newly-installed plugin that isn't in `guildConfig.plugins`
 * yet), the raw table name is used as a fall-back.
 *
 * GIVENS
 * ──────
 *   trialId : string?  — Optional; falls back to `_trial.writId`.
 *   skipBooks : string[]?  — Optional. Source-book identifiers
 *     (raw table name or `<owner>/<bookName>`) to omit from the dump.
 *     Useful for test-only books or books known to be
 *     uninteresting / huge for a given trial.
 *
 * SUMMARY (yields → archive row)
 * ──────────────────────────────
 *   {
 *     bookCounts: { '<source-book>': number, ... },
 *     totalRows: number,
 *     capturedAt: string,
 *   }
 *
 * EXTRACT
 * ───────
 *   Materializes one JSON file per source book under
 *   `<targetDir>/stacks-export/<safe-name>.json`. Each file is a JSON
 *   array of source-row bodies, sorted by sourceRowId.
 */

import { existsSync, readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Database as DB } from 'better-sqlite3';
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
import { discoverTestGuilds } from '../engines/scenario-xguild.ts';
import type { InjectedTrialContext } from '../engines/phases.ts';
import {
  LAB_TRIAL_ARCHIVES_BOOK,
  type LabTrialArchive,
} from '../archive/book.ts';
import {
  LAB_TRIAL_STACKS_DUMPS_BOOK,
  type LabTrialStacksDump,
} from '../archive/stacks-dumps-book.ts';
import type {
  ProbeEngineDesign,
  ProbeExtractArgs,
  ProbeExtractResult,
} from './types.ts';

const DESIGN_ID = 'lab.probe-stacks-dump';
const EXTRACT_SUBDIR = 'stacks-export';

interface ResolvedGivens {
  trialId: string;
  skipBooks: Set<string>;
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

  const rawSkip = rawGivens.skipBooks ?? [];
  if (!Array.isArray(rawSkip) || rawSkip.some((v) => typeof v !== 'string')) {
    throw new Error(
      `[${DESIGN_ID}] givens.skipBooks must be an array of strings when provided.`,
    );
  }
  return { trialId, skipBooks: new Set(rawSkip as string[]) };
}

// ── Source-book name resolution ──────────────────────────────────────

/**
 * Mirror of the Stacks backend's owner-id normalization. Folded here
 * (rather than imported from a non-public seam) because the probe
 * only needs the forward direction for the prefix-match heuristic.
 */
export function normalizeOwnerId(ownerId: string): string {
  return ownerId.replace(/\//g, '__').replace(/[^a-z0-9_]/g, '_');
}

/**
 * Try to recover `<ownerId>/<bookName>` from a `books_…` SQLite table
 * name by matching the prefix against the supplied owner-id list.
 * Returns null when no owner matches (caller falls back to the raw
 * table name).
 */
export function resolveSourceBook(
  tableName: string,
  knownOwnerIds: string[],
): string | null {
  if (!tableName.startsWith('books_')) return null;
  const remainder = tableName.slice('books_'.length);
  // Sort by normalized length descending so longer plugin ids win
  // when one is a prefix of another (e.g. `clockworks` vs
  // `clockworks_stacks_signals`).
  const owners = knownOwnerIds
    .map((id) => ({ id, normalized: normalizeOwnerId(id) }))
    .sort((a, b) => b.normalized.length - a.normalized.length);
  for (const { id, normalized } of owners) {
    const prefix = `${normalized}_`;
    if (remainder.startsWith(prefix)) {
      const book = remainder.slice(prefix.length);
      if (book.length > 0) {
        return `${id}/${book}`;
      }
    }
  }
  return null;
}

// ── Core probe ───────────────────────────────────────────────────────

interface PluginsJsonShape {
  plugins?: string[];
}

/**
 * Read the test guild's installed plugin ids from its guild.json
 * synchronously. Returns an empty array if the file is missing or
 * malformed — the source-book resolver tolerates the empty case
 * (falls back to raw table names).
 *
 * Synchronous on purpose: the caller is enumerating books_* tables
 * via better-sqlite3's sync API; mixing async here would just add
 * await chains for no benefit.
 */
function readTestGuildPluginIds(testGuildPath: string): string[] {
  const guildJsonPath = path.join(testGuildPath, 'guild.json');
  if (!existsSync(guildJsonPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(guildJsonPath, 'utf8')) as PluginsJsonShape;
    return Array.isArray(raw.plugins) ? raw.plugins.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

interface SourceBookCursor {
  /** Raw SQLite table name (`books_…`). */
  tableName: string;
  /** Resolved `<owner>/<book>` form, or the raw table name when unresolved. */
  sourceBook: string;
}

function listSourceBooks(db: DB, knownOwnerIds: string[]): SourceBookCursor[] {
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'books_%' ORDER BY name`,
    )
    .all() as Array<{ name: string }>;
  return rows.map((row) => {
    const resolved = resolveSourceBook(row.name, knownOwnerIds);
    return {
      tableName: row.name,
      sourceBook: resolved ?? row.name,
    };
  });
}

interface SourceRow {
  id: string;
  body: Record<string, unknown>;
}

function readBookRows(db: DB, tableName: string): SourceRow[] {
  const stmt = db.prepare(`SELECT id, content FROM "${tableName}" ORDER BY id`);
  const rows = stmt.all() as Array<{ id: string; content: string }>;
  return rows.map((row) => ({
    id: row.id,
    body: JSON.parse(row.content) as Record<string, unknown>,
  }));
}

// ── run() ────────────────────────────────────────────────────────────

async function runStacksDump(
  rawGivens: Record<string, unknown>,
  context: EngineRunContext,
): Promise<EngineRunResult> {
  const { trialId, skipBooks } = validateGivens(rawGivens);

  // Discover test guild from upstream — same duck-typing as scenario-xguild.
  const guilds = discoverTestGuilds(context.upstream);
  if (guilds.length === 0) {
    throw new Error(
      `[${DESIGN_ID}] no test guild found in context.upstream — expected at least one ` +
        `upstream yield with {guildName: string, guildPath: string} (the guild-fixture's yield shape).`,
    );
  }
  if (guilds.length > 1) {
    throw new Error(
      `[${DESIGN_ID}] multiple test guilds found in context.upstream (${guilds
        .map((g) => g.guildName)
        .join(', ')}); explicit selection is not yet supported in v1.`,
    );
  }
  const testGuild = guilds[0]!;
  const dbPath = path.join(testGuild.guildPath, '.nexus', 'nexus.db');

  // Read-only attach. better-sqlite3's readonly mode declines to create
  // a missing DB, which is what we want.
  let db: DB;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    throw new Error(
      `[${DESIGN_ID}] failed to open test guild stacks DB at ${dbPath}: ${(err as Error).message}`,
    );
  }

  try {
    const knownOwnerIds = readTestGuildPluginIds(testGuild.guildPath);
    const sourceBooks = listSourceBooks(db, knownOwnerIds);

    const stacks = guild().apparatus<StacksApi>('stacks');
    const dumpBook: Book<LabTrialStacksDump> = stacks.book<LabTrialStacksDump>(
      'laboratory',
      LAB_TRIAL_STACKS_DUMPS_BOOK,
    );

    const bookCounts: Record<string, number> = {};
    let totalRows = 0;
    const capturedAt = new Date().toISOString();

    for (const cursor of sourceBooks) {
      if (skipBooks.has(cursor.tableName) || skipBooks.has(cursor.sourceBook)) {
        continue;
      }
      const rows = readBookRows(db, cursor.tableName);
      for (const row of rows) {
        const dump: LabTrialStacksDump = {
          id: generateId('lsd', 6),
          trialId,
          sourceBook: cursor.sourceBook,
          sourceRowId: row.id,
          capturedAt,
          body: row.body,
        };
        // One row per put — Stacks runs each in its own transaction,
        // matching the per-engine atomicity model.
        await dumpBook.put(dump);
        totalRows += 1;
      }
      bookCounts[cursor.sourceBook] = (bookCounts[cursor.sourceBook] ?? 0) + rows.length;
    }

    return {
      status: 'completed',
      yields: {
        bookCounts,
        totalRows,
        capturedAt,
      },
    };
  } finally {
    db.close();
  }
}

// ── extract() ────────────────────────────────────────────────────────

/**
 * Strip the source-book name down to a single-segment filesystem-safe
 * stem. `clerk/writs` → `clerk-writs`; raw `books_clerk_writs` →
 * `books_clerk_writs`. Conservative: alphanumeric, dot, hyphen,
 * underscore.
 */
export function safeFileStem(sourceBook: string): string {
  return sourceBook.replace(/\//g, '-').replace(/[^A-Za-z0-9._-]/g, '_');
}

async function extractStacksDump(args: ProbeExtractArgs): Promise<ProbeExtractResult> {
  const stacks = guild().apparatus<StacksApi>('stacks');
  const dumpBook: ReadOnlyBook<LabTrialStacksDump> = stacks.readBook<LabTrialStacksDump>(
    'laboratory',
    LAB_TRIAL_STACKS_DUMPS_BOOK,
  );

  // Stream by source-book to avoid sorting all rows in memory.
  const allForTrial = await dumpBook.find({
    where: [['trialId', '=', args.trialId]],
    orderBy: [
      ['sourceBook', 'asc'],
      ['sourceRowId', 'asc'],
    ],
  });

  if (allForTrial.length === 0) {
    return { files: [] };
  }

  const exportDir = path.join(args.targetDir, EXTRACT_SUBDIR);
  await mkdir(exportDir, { recursive: true });

  const grouped = new Map<string, LabTrialStacksDump[]>();
  for (const row of allForTrial) {
    const list = grouped.get(row.sourceBook) ?? [];
    list.push(row);
    grouped.set(row.sourceBook, list);
  }

  const files: ProbeExtractResult['files'] = [];
  for (const [sourceBook, rows] of grouped) {
    const stem = safeFileStem(sourceBook);
    const relPath = path.join(EXTRACT_SUBDIR, `${stem}.json`);
    const fullPath = path.join(args.targetDir, relPath);
    const bodies = rows.map((r) => r.body);
    const json = JSON.stringify(bodies, null, 2);
    await writeFile(fullPath, json, 'utf8');
    files.push({ path: relPath, bytes: Buffer.byteLength(json, 'utf8') });
  }

  return { files };
}

export const stacksDumpEngine: ProbeEngineDesign = {
  id: DESIGN_ID,
  run: runStacksDump,
  extract: extractStacksDump,
};
