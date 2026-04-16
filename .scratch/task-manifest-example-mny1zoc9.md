# Task Manifest Example: w-mny1zoc9

Companion to the intent brief example. This is the GSD-style decomposition of the same commission — what the planner would produce alongside (or embedded in) the implementation brief.

## Task Manifest

```xml
<mandate id="w-mny1zoc9">
  <brief>
    Replace PID-based orphan recovery with heartbeat-based reconciliation.
    Migrate cancelMetadata to tagged cancel handles with process-group semantics.
    See implementation brief for full intent, decisions, and blast radius.
  </brief>

  <task id="t1" type="implement">
    <name>Session heartbeat endpoint</name>
    <files>
      packages/plugins/animator/src/tools/session-heartbeat.ts (new)
      packages/plugins/animator/src/tools/index.ts
      packages/plugins/animator/src/animator.ts
    </files>
    <action>
      Create a session-heartbeat tool endpoint on the Animator.
      Accepts { sessionId }, updates lastActivityAt to guild wall-clock time.
      No-op for terminal sessions. Register in tool index and supportKit.
      Follow the existing session-running/session-record tool patterns.
    </action>
    <verify>pnpm -w typecheck passes. New tool appears in tool index exports.</verify>
    <done>Animator exposes a session-heartbeat tool that refreshes lastActivityAt for non-terminal sessions.</done>
  </task>

  <task id="t2" type="implement">
    <name>Babysitter heartbeat emission</name>
    <files>
      packages/plugins/claude-code/src/babysitter.ts
    </files>
    <action>
      After the ready report completes, start a recurring heartbeat call
      to the session-heartbeat endpoint every 30s. Use the existing
      guild HTTP call pattern (callGuildHttpApi). Heartbeat failures are
      silent (staleness threshold tolerates drops). Stop the timer before
      terminal report, on SIGTERM, and in error paths.
    </action>
    <verify>pnpm -w typecheck passes. Manually trace that all exit paths clear the timer.</verify>
    <done>Running babysitters emit heartbeats every 30s. Timer is cleaned up on all exit paths.</done>
  </task>

  <task id="t3" type="implement">
    <name>Guild self-heartbeat and downtime credit</name>
    <files>
      packages/plugins/animator/src/types.ts
      packages/plugins/animator/src/animator.ts
    </files>
    <action>
      Add a 'state' book to the Animator's supportKit. On startup, read the
      previous guild_alive_at timestamp, compute downtime credit (gap minus
      one interval), and write a fresh timestamp. Start an unref'd 30s timer
      that updates guild_alive_at periodically. The downtime credit is passed
      to the reconciler's startup pass only (periodic passes get zero credit).
    </action>
    <verify>pnpm -w typecheck passes. State book declared in supportKit.</verify>
    <done>Guild tracks its own liveness. Downtime credit is available for reconciler startup pass.</done>
  </task>

  <task id="t4" type="implement">
    <name>Heartbeat-based reconciler</name>
    <files>
      packages/plugins/animator/src/startup.ts
      packages/plugins/animator/src/animator.ts
    </files>
    <action>
      Replace recoverOrphans with heartbeat-based reconciliation. Delete
      isProcessAlive. New logic: scan pending+running sessions, compare
      lastActivityAt against now (minus downtime credit), fail sessions
      silent for >90s. Backfill lastActivityAt for legacy records (skip
      them for one pass). Run at startup (with credit) and periodically
      every 30s (no credit) with single-flight guard.
    </action>
    <verify>pnpm -w typecheck passes. grep -r 'isProcessAlive' returns nothing.</verify>
    <done>Dead sessions detected within ~120s via heartbeat staleness. No PID-based detection remains.</done>
  </task>

  <task id="t5" type="implement">
    <name>Cancel handle migration</name>
    <files>
      packages/plugins/animator/src/types.ts
      packages/plugins/animator/src/tools/session-running.ts
      packages/plugins/animator/src/session-record-handler.ts
      packages/plugins/animator/src/animator.ts
      packages/plugins/claude-code/src/babysitter.ts
      packages/plugins/claude-code/src/detached.ts
      packages/plugins/claude-code/src/index.ts
    </files>
    <action>
      Rename cancelMetadata → cancelHandle on SessionDoc. Change shape to
      tagged union: { kind: 'local-pgid', pgid: number }. Update EVERY
      consumer — the file list above is the planner's best guess but DO YOUR
      OWN AUDIT: grep for cancelMetadata across the entire monorepo and
      update every hit. Add Zod validation on session-running to enforce
      the tagged shape. Update provider cancel() to dispatch on kind,
      using process-group kill (-pgid) for local-pgid.
    </action>
    <verify>
      pnpm -w typecheck passes.
      grep -r 'cancelMetadata' packages/ returns zero hits (excluding test snapshots and comments documenting the migration).
    </verify>
    <done>All cancel metadata uses the tagged cancelHandle shape. No residual cancelMetadata consumers remain anywhere.</done>
  </task>

  <task id="t6" type="implement">
    <name>Babysitter SIGTERM handler and terminal-state immutability</name>
    <files>
      packages/plugins/claude-code/src/babysitter.ts
      packages/plugins/animator/src/session-record-handler.ts
    </files>
    <action>
      Add SIGTERM handler in babysitter: set cancelled flag, stop heartbeat,
      propagate SIGTERM to claude process. Terminal report uses 'cancelled'
      status when flag is set. In session-record handler, reject status
      writes to any terminal session (not just cancelled) — still accept
      transcript writes. Also: clean up systemPromptTmpDir in babysitter
      finally block (add field to BabysitterConfig, populate in
      buildBabysitterConfig).
    </action>
    <verify>pnpm -w typecheck passes.</verify>
    <done>SIGTERM → cancelled (not failed). Terminal sessions can't be overwritten. Temp dirs cleaned up.</done>
  </task>

  <task id="t7" type="verify">
    <name>Final verification</name>
    <files>packages/</files>
    <action>
      Run full test suite. Run grep audit for any residual cancelMetadata.
      Verify all new code has tests (heartbeat endpoint, reconciler,
      cancel handle validation, SIGTERM handler, terminal-state guard).
      Add any missing tests.
    </action>
    <verify>pnpm -w lint && pnpm -w test passes clean.</verify>
    <done>All tests pass. No residual cancelMetadata. Test coverage for all new behavior.</done>
  </task>
</mandate>
```

## Notes on this decomposition

**7 tasks instead of 20 requirements.** Each task is a coherent unit of work, not a single requirement. Tasks group related changes that must be consistent with each other (e.g., t5 groups the entire cancel handle migration because splitting it would leave the codebase in an inconsistent state between tasks).

**Task 5 is the critical one.** This is where the original commission failed. Note the explicit instruction: "the file list above is the planner's best guess but DO YOUR OWN AUDIT." The GSD format lets us declare files for scheduling purposes while still telling the implementer to verify independently.

**Task 7 is a verification-only pass.** In the original spec, verification was scattered across 13 checks. Here it's a single final task that runs the audit. If this were a separate session, it would have fresh eyes on the whole mandate.

**Ordering matters for some, not all.** t1 must precede t2 (endpoint must exist before babysitter can call it). t3 must precede t4 (downtime credit feeds reconciler). t5 is independent of t1-t4. t6 is independent. t7 must be last. A scheduler could parallelize {t1→t2, t3→t4, t5, t6} then run t7.
