/**
 * The Laboratory — CDC handlers and file-writing logic.
 *
 * Registers Phase 2 (notification) CDC watchers on the Clerk's writs
 * book and the Animator's sessions book. Writes observational data to
 * the sanctum: commission log entries and session records. Triggers
 * quality assessments on writ completion. Purely passive — never
 * modifies guild state.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { StartupContext } from '@shardworks/nexus-core';
import { guild } from '@shardworks/nexus-core';
import type { StacksApi, ChangeEvent, BookEntry } from '@shardworks/stacks-apparatus';
import type {
  LaboratoryConfig,
  ResolvedConfig,
  WritLike,
  WritLinkLike,
  SessionLike,
} from './types.ts';
import {
  appendCommissionLogEntry,
  setCommissionOutcome,
  clearSuccessOutcome,
  markRevisionRequired,
  writeCommissionMd,
  writeReviewTemplate,
  writeSessionRecord,
} from './yaml-writer.ts';
import { autoCommit } from './git.ts';
import { triggerQualityReview } from './quality-trigger.ts';

// ── Config resolution ────────────────────────────────────────────────

export function resolveConfig(raw: LaboratoryConfig): ResolvedConfig {
  const sanctumHome = raw.sanctumHome;

  return {
    sanctumHome,
    commissionsDataDir: raw.commissionsDataDir
      ? path.resolve(sanctumHome, raw.commissionsDataDir)
      : path.join(sanctumHome, 'experiments', 'data', 'commissions'),
    commissionLogPath: raw.commissionLogPath
      ? path.resolve(sanctumHome, raw.commissionLogPath)
      : path.join(sanctumHome, 'experiments', 'data', 'commission-log.yaml'),
  };
}

// ── Apparatus startup ────────────────────────────────────────────────

export function startLaboratory(_ctx: StartupContext): void {
  const rawConfig = guild().guildConfig().laboratory;
  if (!rawConfig) {
    throw new Error('Laboratory apparatus requires "laboratory" config in guild.json');
  }

  const config = resolveConfig(rawConfig);
  const stacks = guild().apparatus<StacksApi>('stacks');
  const guildHome = guild().home;

  // Watch writs (owned by Clerk)
  stacks.watch('clerk', 'writs', (event: ChangeEvent<BookEntry>) => {
    handleWritEvent(config, guildHome, event);
  }, { failOnError: false });

  // Watch sessions (owned by Animator)
  stacks.watch('animator', 'sessions', (event: ChangeEvent<BookEntry>) => {
    handleSessionEvent(config, event);
  }, { failOnError: false });

  // Watch writ links (owned by Clerk)
  stacks.watch('clerk', 'links', (event: ChangeEvent<BookEntry>) => {
    handleLinkEvent(config, event);
  }, { failOnError: false });
}

// ── Writ CDC handler ─────────────────────────────────────────────────

function handleWritEvent(config: ResolvedConfig, guildHome: string, event: ChangeEvent<BookEntry>): void {
  if (event.type === 'create') {
    const writ = event.entry as unknown as WritLike;
    onWritCreated(config, writ);
    return;
  }

  if (event.type === 'update') {
    const writ = event.entry as unknown as WritLike;
    const prev = event.prev as unknown as WritLike;

    // Only act on status transitions
    if (writ.status === prev.status) return;

    onWritStatusChanged(config, guildHome, writ);
    return;
  }

  // delete events — nothing to do
}

function onWritCreated(config: ResolvedConfig, writ: WritLike): void {
  const dir = path.join(config.commissionsDataDir, writ.id);

  // 1. Create commission data directory
  fs.mkdirSync(dir, { recursive: true });

  // 2. Write commission.md — the writ body (spec/prompt) as permanent record
  writeCommissionMd(config.commissionsDataDir, writ);

  // 3. Write review.md template — placeholder for patron review
  writeReviewTemplate(config.commissionsDataDir, writ);

  // 4. Append skeleton entry to commission log
  appendCommissionLogEntry(config.commissionLogPath, {
    id: writ.id,
    title: writ.title,
    codex: writ.codex,
    body: writ.body,
  });

  // 5. Auto-commit
  const relDataDir = path.relative(config.sanctumHome, dir);
  const relLogPath = path.relative(config.sanctumHome, config.commissionLogPath);
  autoCommit(
    config.sanctumHome,
    `laboratory: record writ created for ${writ.id}`,
    [relDataDir, relLogPath],
  );
}

function onWritStatusChanged(
  config: ResolvedConfig,
  guildHome: string,
  writ: WritLike,
): void {
  const relLogPath = path.relative(config.sanctumHome, config.commissionLogPath);

  switch (writ.status) {
    case 'completed': {
      // Presume success — patron reviews and corrects if needed
      const updated = setCommissionOutcome(config.commissionLogPath, writ.id, 'success');
      if (updated) {
        autoCommit(
          config.sanctumHome,
          `laboratory: set outcome success for ${writ.id}`,
          [relLogPath],
        );
      }

      // DISABLED: instrument runs paused pending cache-prefix unification
      // (cost fix). All instrument inputs are back-fillable from git history
      // + commission.md — no data loss from skipping.
      // See: .scratch/todo/URGENT-unified-instrument-context.md
      //
      // triggerQualityReview(config, guildHome, writ);
      break;
    }

    case 'failed': {
      const updated = setCommissionOutcome(
        config.commissionLogPath, writ.id, 'abandoned', 'execution_error',
      );
      if (updated) {
        autoCommit(
          config.sanctumHome,
          `laboratory: set outcome abandoned for ${writ.id}`,
          [relLogPath],
        );
      }
      break;
    }

    case 'active':
    case 'cancelled':
      // No action needed — status is observable in the Stacks
      break;
  }
}

// ── Link CDC handler ────────────────────────────────────────────────

function handleLinkEvent(config: ResolvedConfig, event: ChangeEvent<BookEntry>): void {
  if (event.type !== 'create') return;

  const link = event.entry as unknown as WritLinkLike;

  // A "fixes" link means the source writ is a revision of the target writ
  if (link.type !== 'fixes') return;

  onFixesLinkCreated(config, link);
}

function onFixesLinkCreated(config: ResolvedConfig, link: WritLinkLike): void {
  const relLogPath = path.relative(config.sanctumHome, config.commissionLogPath);

  // Mark the original (target) writ as requiring revision
  const revisionUpdated = markRevisionRequired(config.commissionLogPath, link.targetId);

  // Withdraw presumption of success — a fixes link means the outcome
  // wasn't actually clean. Other outcomes (partial, wrong, etc.) are
  // left as-is since those were already patron-set.
  const outcomeCleared = clearSuccessOutcome(config.commissionLogPath, link.targetId);

  if (revisionUpdated || outcomeCleared) {
    autoCommit(
      config.sanctumHome,
      `laboratory: mark ${link.targetId} revision_required (fixed by ${link.sourceId})`,
      [relLogPath],
    );
  }
}

// ── Session CDC handler ──────────────────────────────────────────────

function handleSessionEvent(config: ResolvedConfig, event: ChangeEvent<BookEntry>): void {
  if (event.type === 'create') {
    const session = event.entry as unknown as SessionLike;
    onSessionCreated(config, session);
    return;
  }

  if (event.type === 'update') {
    const session = event.entry as unknown as SessionLike;
    const prev = event.prev as unknown as SessionLike;

    // Only act on status transitions (running → terminal)
    if (session.status === prev.status) return;

    onSessionEnded(config, session);
    return;
  }
}

function onSessionCreated(config: ResolvedConfig, session: SessionLike): void {
  const writId = extractWritId(session);
  if (!writId) return; // Not writ-bound — skip

  writeSessionRecord(config.commissionsDataDir, writId, {
    id: session.id,
    startedAt: session.startedAt,
    status: session.status,
    provider: session.provider,
  });

  const relPath = path.relative(
    config.sanctumHome,
    path.join(config.commissionsDataDir, writId, 'sessions'),
  );
  autoCommit(
    config.sanctumHome,
    `laboratory: record session ${session.id} started for ${writId}`,
    [relPath],
  );
}

function onSessionEnded(config: ResolvedConfig, session: SessionLike): void {
  const writId = extractWritId(session);
  if (!writId) return; // Not writ-bound — skip

  // Write/overwrite the session record with full data
  writeSessionRecord(config.commissionsDataDir, writId, {
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMs: session.durationMs,
    status: session.status,
    provider: session.provider,
    exitCode: session.exitCode,
    error: session.error,
    costUsd: session.costUsd,
    tokenUsage: session.tokenUsage,
  });

  const relPath = path.relative(
    config.sanctumHome,
    path.join(config.commissionsDataDir, writId, 'sessions'),
  );
  autoCommit(
    config.sanctumHome,
    `laboratory: record session ${session.id} ended for ${writId}`,
    [relPath],
  );
}

/**
 * Extract the writ ID from a session's metadata.
 * Sessions bound to writs have metadata.writId set by the Dispatch apparatus.
 */
function extractWritId(session: SessionLike): string | undefined {
  return session.metadata?.writId as string | undefined;
}
