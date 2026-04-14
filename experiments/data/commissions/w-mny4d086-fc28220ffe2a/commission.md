# Detached Sessions — Handler Idempotency & Tool Manifest Consolidation

A small, bounded cleanup pass on the detached-session code path in the `animator` and `claude-code` plugins. Three independent items, grouped because each is too small to commission alone:

1. `session-running` tool handler idempotency.
2. DLQ-drain-before-reconciler ordering pinned by a test.
3. The `callableBy` filter and infrastructure tools are consolidated into a single tool-manifest computation call site in the `claude-code` provider.

No protocol changes. No schema changes. No new surface area.

## Changes

### 1. `session-running` handler idempotency against `running` and terminal states

**Current:** The `session-running` tool handler (in `packages/plugins/animator/src/tools/session-running.ts`) transitions a session from `pending` to `running`. Its behaviour when the session is *already* in `running` is unverified, and nothing stops a late ready-report from regressing a session that has already reached a terminal state.

The `session-record` handler already enforces terminal-state immutability (it rejects writes to any terminal state and returns `ok` with the existing status). The `session-running` handler must adopt the same discipline for ready reports.

**Required:**

- If the session is in `pending`, transition to `running` as today, stamping `lastActivityAt` with guild wall-clock time. Unchanged.
- If the session is in `running`, re-apply the payload as a no-op: refresh `lastActivityAt`, update the `cancelHandle` if the ready report is re-delivering it, but do **not** overwrite other fields with a stale payload. Return `ok` with the existing status.
- If the session is in any terminal state (`completed`, `failed`, `cancelled`), reject the write: do **not** regress the state, log a warning with the session id and incoming payload, and return `ok` with the existing status so the client does not keep retrying. Mirror the shape of the terminal-state-immutability handling already in `session-record-handler.ts`.
- Add targeted tests in the closest existing lifecycle test file (`session-lifecycle.test.ts` or `animator.test.ts`):
  - "ready report against already-running session is idempotent"
  - "ready report against completed session does not regress state"
  - "ready report against failed session does not regress state"
  - "ready report against cancelled session does not regress state"

### 2. DLQ-drain-before-reconciler ordering test

**Current:** The Animator's `start()` path calls `drainDlq` before the reconciler. This ordering is load-bearing: if the reconciler ran first, a DLQ'd terminal report arriving on the next startup could race the reconciler and lose (the reconciler would mark the session `failed` by staleness before the real terminal report was drained). Today the ordering is a hidden invariant, enforced only by the order of two calls in `startup.ts`.

**Required:**

- Add an explicit comment in `startup.ts` above the two calls that names the invariant: "DLQ drain must run before reconciliation so that DLQ'd terminal reports take precedence over staleness-based failure transitions."
- Add a test in `startup.test.ts` (or the closest existing suite) that exercises the race:
  1. Seed a session in `running` with a `lastActivityAt` far enough in the past that the reconciler would mark it `failed`.
  2. Seed the DLQ with a terminal `completed` report for that session.
  3. Run the Animator's `start()` phase.
  4. Assert the session ends up `completed`, not `failed`. The DLQ result wins.
- No production-code changes are required for this item — the test exists to lock the ordering in place so a future refactor cannot silently break it.

### 3. `callableBy` filter and infrastructure tools at manifest-computation time

**Current:** After attached mode was deleted, the `callableBy` filter that used to live in `mcp-server.ts` is gone. The babysitter's MCP proxy (`babysitter.ts`) now trusts its config blindly, so a tool with `callableBy` not including `'anima'` would still be advertised to the anima process. Similarly, the three infrastructure tools (`session-running`, `session-record`, `session-heartbeat`) are added to the authorized set as a post-hoc step in `detached.ts` rather than as part of the manifest computation itself.

These are both shape issues: the manifest should be computed **once, authoritatively, in one place**, and everything that needs it (the session record's `authorizedTools`, the babysitter's tool-proxy config) should read the same computed value.

**Required:**

- Introduce a single function (in `detached.ts` or a small helper module in `packages/plugins/claude-code/src/`) — name it `computeToolManifest(opts)` — that takes the incoming session tools plus the session's infrastructure-tool set and returns the final manifest the session will see.
- The function applies the `callableBy` filter: any tool whose `callableBy` is defined and does not include `'anima'` is dropped. (Tools with no `callableBy` field are included, matching the previous `mcp-server.ts` default.)
- The function adds the infrastructure tools (`session-running`, `session-record`, `session-heartbeat`) as a final step. Infrastructure tools are not subject to the `callableBy` filter — they are added by the guild, not by the caller who initiated the session, and their `callableBy` set does not include `'anima'` by design.
- Both the `SessionDoc.authorizedTools` pre-write and the `BabysitterConfig.tools` serialization read from this single computed manifest. There must be exactly one call site that knows how to build the manifest; everything else consumes its output.
- Delete the post-hoc infrastructure-tool addition in `detached.ts` and any ad-hoc filtering in the babysitter config path.
- Add tests:
  - "tool with callableBy not including 'anima' is filtered from manifest"
  - "tool with no callableBy field is included in manifest"
  - "infrastructure tools are always added to manifest regardless of callableBy"
  - "authorizedTools in session record matches tool list in babysitter config byte-for-byte"

## Out of scope

- **Session host logging independence** (stderr redirect to an owned log sink). Tracked separately; do not touch `babysitter.ts` stderr handling, the spawn `stdio` configuration in `detached.ts`, or add any log-sink fields to `BabysitterConfig` in this commission.
- **Transcript store abstraction.** The babysitter's direct SQLite access for transcripts is out of scope here.
- **Any change to the heartbeat protocol, reconciler rule, `lastActivityAt` semantics, or `cancelHandle` shape.** Those landed in earlier commissions and must not be touched.
- **Broader tool-manifest redesign** (e.g., a dedicated apparatus for manifest computation, or integration with a future unified capability registry). This commission builds a local helper in `claude-code/`, not a cross-plugin apparatus.

## Constraints

- Two packages only: `packages/plugins/animator/` and `packages/plugins/claude-code/`.
- No changes to `SessionDoc` schema, `cancelHandle` shape, or `lastActivityAt` semantics.
- `pnpm -w lint && pnpm -w test` must pass. New tests added per each item above.
- The three items are independent and may land as three sub-commits if that makes the diff easier to review, but should all land in one commission.

## Exit criteria

- `session-running` handler is idempotent against `running` and refuses to regress terminal states, with tests.
- Startup-phase DLQ-before-reconciler ordering is pinned by a test and documented by an inline comment.
- There is exactly one call site in the provider that knows how to compute the tool manifest, and both `authorizedTools` and the babysitter's tool list consume it.
- All new and existing tests pass.