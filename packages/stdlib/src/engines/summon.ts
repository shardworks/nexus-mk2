/**
 * Summon Engine — dispatches anima sessions in response to standing orders.
 *
 * This is the engine behind the `summon` verb in standing orders. When an
 * operator writes `{ "on": "mandate.ready", "summon": "artificer", "prompt": "..." }`,
 * the clockworks desugars it to `{ "run": "summon-engine", "role": "artificer", "prompt": "..." }`
 * and this engine handles the rest:
 *
 *   1. Resolve role to an active anima
 *   2. Bind or synthesize a writ for the session
 *   3. Circuit-breaker check (if maxSessions param is set)
 *   4. Manifest the anima
 *   5. Hydrate prompt template and build progress appendix
 *   6. Launch session via the session funnel
 *   7. Post-session writ lifecycle (completion, pending, interruption)
 *
 * Standing order params:
 *   - `role` (required) — the role to summon (set automatically by desugar)
 *   - `prompt` — prompt template with {{writ.title}}, {{writ.description}} etc.
 *   - `maxSessions` — circuit breaker: max session attempts per writ before auto-fail (default: 10)
 */
import Database from 'better-sqlite3';
import {
  engine,
  booksPath,
  resolveAnimaByRole,
  manifest,
  resolveWorkspace,
  getSessionProvider,
  launchSession,
  createWrit,
  readWrit,
  activateWrit,
  interruptWrit,
  failWrit,
  hydratePromptTemplate,
  buildProgressAppendix,
} from '@shardworks/nexus-core';

/** Protocol block injected into the system prompt for all writ-bound sessions. */
const WRIT_SESSION_PROTOCOL = `## Session Protocol

You are working on a writ (tracked work item). You MUST signal completion before your session ends:

- Call \`complete-session\` when you have finished your work. If you created child writs, the system will wait for them to complete automatically.
- Call \`fail-writ\` with a reason if the work cannot be completed.
- If your session ends without calling either tool, the system treats it as an interruption and will re-dispatch the work to a new session.`;

export default engine({
  name: 'summon-engine',
  handler: async (event, { home, params }) => {
    if (!event) {
      throw new Error('summon-engine requires an event (cannot be invoked directly).');
    }

    const role = params.role as string | undefined;
    if (!role) {
      throw new Error('summon-engine requires a "role" param (set via summon verb or explicit config).');
    }

    const promptTemplate = params.prompt as string | undefined;
    const maxSessions = (params.maxSessions as number | undefined) ?? 10;

    // Require a session provider
    if (!getSessionProvider()) {
      throw new Error('No session provider registered — cannot launch anima session.');
    }

    const payload = (event.payload as Record<string, unknown>) ?? {};

    // Step 1: Resolve role to a specific anima
    const animaName = resolveAnimaByRole(home, role);

    // Step 2: Bind or synthesize writ
    const existingWritId = payload.writId as string | undefined;
    let writId: string;

    if (existingWritId) {
      writId = existingWritId;
    } else {
      // Synthesize a summon writ for non-writ events
      const writ = createWrit(home, {
        type: 'summon',
        title: `Summon ${role}: ${event.name}`,
        description: JSON.stringify(event.payload),
      });
      writId = writ.id;
    }

    // Step 3: Circuit breaker — check session count for this writ
    if (maxSessions > 0) {
      const db = new Database(booksPath(home));
      db.pragma('foreign_keys = ON');
      try {
        const row = db.prepare(
          'SELECT COUNT(*) as n FROM sessions WHERE writ_id = ?',
        ).get(writId) as { n: number };
        if (row.n >= maxSessions) {
          failWrit(home, writId);
          return;
        }
      } finally {
        db.close();
      }
    }

    // Step 4: Manifest the anima
    const manifestResult = await manifest(home, animaName);

    // Step 5: Resolve workspace from event payload
    const workspace = resolveWorkspace(payload);

    // Step 6: Hydrate prompt template
    let userPrompt = hydratePromptTemplate(home, promptTemplate, payload, writId);

    // Append progress appendix for resumed sessions
    const appendix = buildProgressAppendix(home, writId);
    if (appendix && userPrompt) {
      userPrompt = `${userPrompt}\n\n---\n${appendix}`;
    } else if (appendix) {
      userPrompt = appendix;
    }

    // Step 7: Activate writ before launch
    activateWrit(home, writId, 'pending');

    // Set NEXUS_WRIT_ID for tools to read during the session
    const prevWritId = process.env.NEXUS_WRIT_ID;
    process.env.NEXUS_WRIT_ID = writId;

    let sessionResult;
    try {
      sessionResult = await launchSession({
        home,
        manifest: manifestResult,
        prompt: userPrompt,
        interactive: false,
        workspace,
        trigger: 'summon',
        writId,
        systemPromptAppendix: WRIT_SESSION_PROTOCOL,
      });
    } finally {
      if (prevWritId !== undefined) {
        process.env.NEXUS_WRIT_ID = prevWritId;
      } else {
        delete process.env.NEXUS_WRIT_ID;
      }
    }

    // Update writ with actual session ID (best effort)
    try {
      const db = new Database(booksPath(home));
      db.pragma('foreign_keys = ON');
      try {
        db.prepare(
          `UPDATE writs SET session_id = ? WHERE id = ? AND session_id = 'pending'`,
        ).run(sessionResult.sessionId, writId);
      } finally {
        db.close();
      }
    } catch { /* best effort */ }

    // Step 8: Handle session end — check writ status
    const finalWrit = readWrit(home, writId);
    if (finalWrit && finalWrit.status === 'active') {
      // Session ended without complete-session or fail-writ → interrupted
      interruptWrit(home, writId);
    }
    // If status is completed, pending, or failed — the tool already handled it
  },
});
