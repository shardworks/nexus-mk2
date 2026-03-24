/**
 * Summon handler — wires the Clockworks summon verb to the session launcher.
 *
 * When a standing order fires with `summon: "roleName"`, the Clockworks
 * runner calls this handler. It:
 *   1. Resolves the role to an active anima
 *   2. Reads the commission content from the event payload
 *   3. Manifests the anima (system prompt + MCP config)
 *   4. Launches a claude session in the worktree directory
 *   5. Signals commission.session.ended when the session exits
 *
 * This lives in the CLI package (not core) because it depends on
 * engine-manifest and the session launcher, which are CLI-layer concerns.
 */
import Database from 'better-sqlite3';
import { manifest } from '@shardworks/engine-manifest';
import {
  ledgerPath,
  signalEvent,
  updateCommissionStatus,
  readCommission,
} from '@shardworks/nexus-core';
import type { GuildEvent, SummonHandler } from '@shardworks/nexus-core';
import { resolveAnimaByRole } from './commands/consult.ts';
import { launchSession } from './session.ts';

/**
 * Create a summon handler that can be registered with the Clockworks runner.
 */
export function createSummonHandler(): SummonHandler {
  return async (
    home: string,
    event: GuildEvent,
    roleName: string,
    _noticeType: 'summon' | 'brief',
  ): Promise<{ animaName: string; exitCode: number }> => {
    const payload = event.payload as Record<string, unknown> | null;

    if (!payload || typeof payload.commissionId !== 'number') {
      throw new Error(
        `Summon handler expected event payload with commissionId, got: ${JSON.stringify(payload)}`,
      );
    }

    const commissionId = payload.commissionId as number;
    const workshop = payload.workshop as string;
    const worktreePath = payload.worktreePath as string;

    // Read commission content from the Ledger
    const commissionRecord = readCommission(home, commissionId);
    if (!commissionRecord) {
      throw new Error(`Commission #${commissionId} not found in the Ledger.`);
    }

    // Resolve role to a specific anima
    const animaName = resolveAnimaByRole(home, roleName);

    // Write commission assignment
    const db = new Database(ledgerPath(home));
    db.pragma('foreign_keys = ON');
    try {
      const animaRow = db.prepare(
        `SELECT id FROM animas WHERE name = ?`,
      ).get(animaName) as { id: number } | undefined;

      if (animaRow) {
        db.prepare(
          `INSERT OR IGNORE INTO commission_assignments (commission_id, anima_id) VALUES (?, ?)`,
        ).run(commissionId, animaRow.id);
      }
    } finally {
      db.close();
    }

    // Update commission status
    updateCommissionStatus(
      home,
      commissionId,
      'in_progress',
      `summoned ${animaName} (${roleName})`,
    );

    // Manifest the anima
    const manifestResult = await manifest(home, animaName);

    // Launch session in the worktree
    const sessionResult = launchSession({
      home,
      cwd: worktreePath,
      manifest: manifestResult,
      mode: { print: commissionRecord.content },
      name: `commission-${commissionId}`,
    });

    // Signal session ended for the next standing order (workshop-merge)
    signalEvent(
      home,
      'commission.session.ended',
      { commissionId, workshop, exitCode: sessionResult.exitCode },
      'framework',
    );

    return { animaName, exitCode: sessionResult.exitCode };
  };
}
