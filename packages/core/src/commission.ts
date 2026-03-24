/**
 * commission — core logic for posting commissions to the guild.
 *
 * Creates a commission record in the Ledger and signals commission.posted
 * for the Clockworks. Everything downstream (worktree setup, anima summoning,
 * post-session merge) is handled by standing orders.
 */
import Database from 'better-sqlite3';
import { ledgerPath } from './nexus-home.ts';
import { readGuildConfig } from './guild-config.ts';
import { signalEvent } from './events.ts';

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
  commissionId: number;
}

/**
 * Update a commission's status and reason in the Ledger.
 */
export function updateCommissionStatus(
  home: string,
  commissionId: number,
  status: string,
  reason: string,
): void {
  const db = new Database(ledgerPath(home));
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
  commissionId: number,
): { id: number; content: string; status: string; workshop: string; statusReason: string | null } | null {
  const db = new Database(ledgerPath(home));
  db.pragma('foreign_keys = ON');

  try {
    const row = db.prepare(
      `SELECT id, content, status, workshop, status_reason FROM commissions WHERE id = ?`,
    ).get(commissionId) as {
      id: number;
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

  const db = new Database(ledgerPath(home));
  db.pragma('foreign_keys = ON');

  try {
    const statusReason = 'posted by patron';

    // Create commission
    const insertCommission = db.prepare(
      `INSERT INTO commissions (content, status, status_reason, workshop) VALUES (?, ?, ?, ?)`,
    );
    const commissionResult = insertCommission.run(spec, 'posted', statusReason, workshop);
    const commissionId = Number(commissionResult.lastInsertRowid);

    // Audit log
    db.prepare(
      `INSERT INTO audit_log (actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)`,
    ).run(
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
