/**
 * dispatch — core logic for posting commissions to the guild.
 *
 * Creates a commission record in the Ledger and optionally assigns it to an anima.
 * The dispatch implement and CLI both call this function.
 */
import Database from 'better-sqlite3';
import { ledgerPath } from './nexus-home.ts';
import { readGuildConfig } from './guild-config.ts';

export interface DispatchOptions {
  /** Absolute path to the guild root. */
  home: string;
  /** Commission specification — what needs to be done. */
  spec: string;
  /** Target workshop for the commission. */
  workshop: string;
  /** Target anima name. If provided, the commission is assigned immediately. */
  anima?: string;
}

export interface DispatchResult {
  /** The ID of the created commission. */
  commissionId: number;
  /** Whether the commission was assigned to an anima. */
  assigned: boolean;
  /** The anima name if assigned. */
  assignedTo?: string;
}

/**
 * Post a commission to the guild.
 *
 * Creates a commission in the Ledger. If an anima is specified, validates that
 * the anima exists and is active, then creates an assignment record.
 */
export function dispatch(opts: DispatchOptions): DispatchResult {
  const { home, spec, workshop, anima } = opts;

  // Validate workshop exists in guild.json
  const config = readGuildConfig(home);
  if (!config.workshops.includes(workshop)) {
    throw new Error(
      `Workshop "${workshop}" not found in guild.json. Available workshops: ${config.workshops.join(', ') || '(none)'}`,
    );
  }

  const db = new Database(ledgerPath(home));
  db.pragma('foreign_keys = ON');

  try {
    const initialStatus = anima ? 'assigned' : 'posted';

    // Create commission
    const insertCommission = db.prepare(
      `INSERT INTO commissions (content, status, workshop) VALUES (?, ?, ?)`,
    );
    const commissionResult = insertCommission.run(spec, initialStatus, workshop);
    const commissionId = Number(commissionResult.lastInsertRowid);

    let assigned = false;
    let assignedTo: string | undefined;

    if (anima) {
      // Validate anima exists and is active
      const animaRow = db.prepare(
        `SELECT id, status FROM animas WHERE name = ?`,
      ).get(anima) as { id: number; status: string } | undefined;

      if (!animaRow) {
        throw new Error(`Anima "${anima}" not found in the Ledger.`);
      }
      if (animaRow.status !== 'active') {
        throw new Error(`Anima "${anima}" is not active (status: ${animaRow.status}).`);
      }

      // Create assignment
      db.prepare(
        `INSERT INTO commission_assignments (commission_id, anima_id) VALUES (?, ?)`,
      ).run(commissionId, animaRow.id);

      assigned = true;
      assignedTo = anima;
    }

    // Audit log
    db.prepare(
      `INSERT INTO audit_log (actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'dispatch',
      assigned ? 'commission_dispatched_and_assigned' : 'commission_dispatched',
      'commission',
      commissionId,
      JSON.stringify({ workshop, anima: assignedTo }),
    );

    return { commissionId, assigned, assignedTo };
  } finally {
    db.close();
  }
}
