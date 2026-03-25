/**
 * commission — core logic for posting commissions to the guild.
 *
 * Creates a commission record in the Ledger and signals commission.posted
 * for the Clockworks. Everything downstream (worktree setup, anima summoning,
 * post-session merge) is handled by standing orders.
 */
import Database from 'better-sqlite3';
import { booksPath } from './nexus-home.ts';
import { readGuildConfig } from './guild-config.ts';
import { signalEvent } from './events.ts';
import { generateId } from './id.ts';

export interface CommissionOptions {
  /** Absolute path to the guild root. */
  home: string;
  /** Commission specification — what needs to be done. */
  spec: string;
  /** Target workshop for the commission. */
  workshop: string;
}

export interface CommissionResult {
  /** The ID of the created commission. */
  commissionId: string;
}

/**
 * Update a commission's status and reason in the Ledger.
 */
export function updateCommissionStatus(
  home: string,
  commissionId: string,
  status: string,
  reason: string,
): void {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');

  try {
    db.prepare(
      `UPDATE commissions SET status = ?, status_reason = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(status, reason, commissionId);
  } finally {
    db.close();
  }
}

/**
 * Read a commission record from the Ledger.
 */
export function readCommission(
  home: string,
  commissionId: string,
): { id: string; content: string; status: string; workshop: string; statusReason: string | null } | null {
  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');

  try {
    const row = db.prepare(
      `SELECT id, content, status, workshop, status_reason FROM commissions WHERE id = ?`,
    ).get(commissionId) as {
      id: string;
      content: string;
      status: string;
      workshop: string;
      status_reason: string | null;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      content: row.content,
      status: row.status,
      workshop: row.workshop,
      statusReason: row.status_reason,
    };
  } finally {
    db.close();
  }
}

/**
 * Post a commission to the guild.
 *
 * Creates a commission in the Ledger with status "posted" and signals
 * commission.posted for the Clockworks to pick up. Everything downstream
 * is driven by standing orders.
 */
export function commission(opts: CommissionOptions): CommissionResult {
  const { home, spec, workshop } = opts;

  // Validate workshop exists in guild.json
  const config = readGuildConfig(home);
  if (!(workshop in config.workshops)) {
    const available = Object.keys(config.workshops).join(', ') || '(none)';
    throw new Error(
      `Workshop "${workshop}" not found in guild.json. Available workshops: ${available}`,
    );
  }

  const db = new Database(booksPath(home));
  db.pragma('foreign_keys = ON');

  try {
    const statusReason = 'posted by patron';
    const commissionId = generateId('c');

    // Create commission
    db.prepare(
      `INSERT INTO commissions (id, content, status, status_reason, workshop) VALUES (?, ?, ?, ?, ?)`,
    ).run(commissionId, spec, 'posted', statusReason, workshop);

    // Audit log
    db.prepare(
      `INSERT INTO audit_log (id, actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      generateId('aud'),
      'patron',
      'commission_posted',
      'commission',
      commissionId,
      JSON.stringify({ workshop }),
    );

    // Signal for Clockworks
    signalEvent(home, 'commission.posted', { commissionId, workshop }, 'framework');

    return { commissionId };
  } finally {
    db.close();
  }
}
