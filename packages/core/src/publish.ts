/**
 * publish — core logic for completing commissions.
 *
 * Marks a commission as completed in the Ledger. The publish implement
 * and CLI both call this function.
 */
import Database from 'better-sqlite3';
import { ledgerPath } from './nexus-home.ts';

export interface PublishOptions {
  /** Absolute path to the guild root. */
  home: string;
  /** Commission ID to publish. */
  commissionId: number;
  /** Brief summary of what was accomplished. */
  summary?: string;
}

export interface PublishResult {
  commissionId: number;
  previousStatus: string;
}

/**
 * Publish a completed commission.
 *
 * Validates the commission exists and is in an assignable state (assigned or
 * in_progress), then marks it as completed. Records the event in the audit log.
 */
export function publish(opts: PublishOptions): PublishResult {
  const { home, commissionId, summary } = opts;

  const db = new Database(ledgerPath(home));
  db.pragma('foreign_keys = ON');

  try {
    // Read current commission state
    const commission = db.prepare(
      `SELECT id, status FROM commissions WHERE id = ?`,
    ).get(commissionId) as { id: number; status: string } | undefined;

    if (!commission) {
      throw new Error(`Commission ${commissionId} not found in the Ledger.`);
    }

    const completableStatuses = ['assigned', 'in_progress'];
    if (!completableStatuses.includes(commission.status)) {
      throw new Error(
        `Commission ${commissionId} cannot be published — current status is "${commission.status}". ` +
        `Must be one of: ${completableStatuses.join(', ')}.`,
      );
    }

    const previousStatus = commission.status;

    // Mark as completed
    db.prepare(
      `UPDATE commissions SET status = 'completed', updated_at = datetime('now') WHERE id = ?`,
    ).run(commissionId);

    // Audit log
    db.prepare(
      `INSERT INTO audit_log (actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'publish',
      'commission_published',
      'commission',
      commissionId,
      JSON.stringify({ previousStatus, summary: summary ?? null }),
    );

    return { commissionId, previousStatus };
  } finally {
    db.close();
  }
}
