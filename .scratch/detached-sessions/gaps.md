# Detached Sessions — Gaps Analysis

This document compares the current implementation of detached sessions against the clean-room spec (`spec.md`). It has three parts:

1. **Gaps** — places where the implementation does not satisfy the spec. Each gap is a work item.
2. **Deliberate omissions** — places where the spec intentionally does not mention a detail from the current implementation, because the detail only made sense in the context of how it was built.
3. **Migration plan** — step-by-step instructions for bringing the implementation into alignment with the spec.

The current implementation lives in:
- `packages/plugins/claude-code/src/index.ts` — provider façade + attached-mode launch
- `packages/plugins/claude-code/src/detached.ts` — detached launch path
- `packages/plugins/claude-code/src/babysitter.ts` — the session host
- `packages/plugins/claude-code/src/mcp-server.ts` — attached-mode MCP server
- `packages/plugins/animator/src/startup.ts` — DLQ drain + orphan recovery

---

## Part 1: Gaps

### G1. `pending` is invisible to reconciliation; no heartbeat mechanism exists

**Spec:** The reconciler scans records in both `pending` and `running` states. Liveness is tracked via an explicit heartbeat from the session host that updates `last_activity_at` on a fixed interval. The reconciler transitions any session whose heartbeat is older than a staleness threshold (minus guild-downtime credit) to `failed`.

**Current:** `recoverOrphans` (`startup.ts` line 87-89) scans only `status === 'running'`. There is no heartbeat mechanism at all: the session record has no `last_activity_at` field, the babysitter never pings the guild outside of the ready/terminal reports, and the only liveness check is `process.kill(pid, 0)` against a PID that may not exist. Sessions whose babysitter dies before calling `session-running` stay in `pending` forever, across any number of guild restarts.

**Severity:** High. This is the literal zombie-session mechanism ("spider says running, but no session ID or logs").

**Evidence this fires in practice:** A babysitter crash during MCP proxy init, SQLite init, or claude spawn produces exactly this state. Nothing in the current protocol would ever surface this session as stale.

---

### G2. Pre-write of `pending` is fire-and-forget

**Spec:** The `pending` record must exist before the session host is spawned, because the tool API's authorization consults the record. The guild must not spawn the host before the record is committed.

**Current:** `detached.ts` line 327-343 wraps the `put` in a detached async IIFE and proceeds immediately to spawn. The comment acknowledges the race and argues that the babysitter's retry budget (60s) covers it. If the put fails, we `console.warn` and keep going — the babysitter is now guaranteed to fail authorization.

**Severity:** Medium. The race is narrow, but the failure is silent and the failure mode (auth-error for a session that should have worked) is misleading.

---

### G3. Reconciler runs only at guild startup; no guild self-heartbeat

**Spec:** The reconciler runs at startup *and* periodically during uptime (cadence comparable to the heartbeat interval). The guild maintains a `guild_alive_at` timestamp, updated on a timer, so the startup reconciler can compute a downtime credit and avoid unfairly reconciling sessions that went silent while the guild itself was down.

**Current:** `recoverOrphans` is called once during the Animator's start() phase. There is no periodic reconciler. There is no `guild_alive_at` — the guild does not record its own liveness anywhere, so even once heartbeats exist, there is no way to distinguish "host was silent because it died" from "host was silent because the guild wasn't listening." A babysitter that dies mid-run in a long-lived guild stays `running` in the books until the next Animator restart — potentially days.

**Severity:** High. This is the second half of the zombie problem: even if G1 is fixed, stale state persists until restart without a periodic sweep, and the startup sweep itself is unsafe without a downtime credit.

---

### G4. Liveness is checked by PID instead of heartbeat

**Spec:** Reconciliation is heartbeat-based. The reconciler does not probe the host's platform directly — no PID checks, no container queries, no network pings. A session that has not heartbeated within the staleness threshold is treated as dead, uniformly across all host types.

**Current:** `recoverOrphans` calls `process.kill(cancelMetadata.pid, 0)` against the **claude** PID reported by the babysitter via `session-running` (`babysitter.ts` line 435 `cancelMetadata: { pid: claudePid }`). This has two separate problems:

1. **Wrong PID.** The claude PID is the supervised process, not the supervisor. If the babysitter is alive but claude has exited and the babysitter hasn't reported `session-record` yet, the reconciler races the babysitter and may mark the session failed while it is being finalized. If the babysitter is dead but claude is somehow orphaned and still alive, the reconciler thinks the session is fine.
2. **Wrong mechanism.** Even a correct host-PID check is the wrong shape under the spec. The spec deliberately avoids platform probes so that local and container hosts are handled by the same rule. PID-based liveness does not generalize; heartbeat-based liveness does.

**Severity:** Medium. Under the spec, this whole code path disappears in favour of a `last_activity_at` comparison.

**Fix shape:** Delete the `process.kill(pid, 0)` check entirely. Add `last_activity_at` to the session record. Add a heartbeat endpoint and a host-side heartbeat timer. The reconciler's rule becomes the one-liner from the spec. The claude PID (and any host PID) are no longer needed for reconciliation — they are only needed for cancellation, and only locally.

---

### G5. Cancellation targets the claude PID, not the process group

**Spec:** Cancellation uses an opaque handle carried by the ready report. For a local-process host the handle is the session host's **process group identifier**, and cancellation signals the group so that both the host and the anima process receive the signal. This is robust against broken signal handling in the host.

**Current:** `provider.cancel()` in `index.ts` line 152 does `process.kill(pid, 'SIGTERM')` with a positive PID — the claude PID from `cancelMetadata`. This signals only claude. If the fallback branch in `detached.ts` line 416 is taken (babysitter PID returned instead), cancellation hits only the babysitter — and even then, without the negative-PID process-group semantics, orphaned children are left running.

**Severity:** Medium. The symptom is leaked child processes on cancel, which compounds slowly but is hard to notice in aggregate.

**Fix shape:** Record the babysitter's process group ID in the ready report (renamed from `cancelMetadata.pid` to something like `cancelHandle`). `provider.cancel()` signals the group: `process.kill(-pgid, 'SIGTERM')`.

---

### G6. Two tool-serialization pipelines

**Spec:** The tool manifest is generated from a single source. There is one serialization path from the guild's internal tool representation to the schema advertised to the anima process.

**Current:** Attached mode (`mcp-server.ts` line 68-91) passes the Zod schema's `.shape` directly to the MCP SDK. Detached mode (`detached.ts` line 48-62 → `babysitter.ts` line 235-244) round-trips through `z.toJSONSchema()`, strips `type` and `$schema`, and re-wraps. These can produce different schemas for the same tool.

**Severity:** Low. Originally suspected of causing the "animas not using MCP tools" symptom, but a diagnostic pass on real astrolabe transcripts ruled this out: the tools never reach the serialization step at all (see note below). The two pipelines still drift as a maintenance hazard, but no current symptom depends on them.

**Fix shape:** Delete attached mode entirely; detached is the only path; tool serialization happens once, in the provider, and the result is carried in the session host config. This remains worth doing for maintenance reasons (G8) but is no longer urgent.

**Diagnostic finding:** Grepping 51 astrolabe anima transcripts (reader, analyst, spec-writer) turned up **zero** `mcp__nexus-guild__*` tool calls. Multiple transcripts contain assistant prose explicitly stating that the astrolabe tools "aren't available as deferred tools" or "aren't available as an MCP tool in this environment," followed by the anima routing around the missing tools by opening `better-sqlite3` directly and writing to the guild database. The tools are not arriving at the session provider in the first place — the bug lives upstream in the role resolution chain (engine → animator → loom → instrumentarium), not in the claude-code provider. See Migration Plan, Commission C1, for the revised investigation scope.

---

### G7. Authorization filter is applied inconsistently

**Spec:** The tool manifest in the session record is the authorization anchor. The manifest delivered to the host is the same set.

**Current:** `mcp-server.ts` line 62-66 filters out tools whose `callableBy` doesn't include `'anima'`. `detached.ts`'s `serializeTools` does not apply this filter. The babysitter's proxy (`babysitter.ts` line 235) trusts its config blindly. So attached and detached modes disagree on which tools are exposed to an anima.

**Severity:** Medium. Drifts across modes and likely contributes to G6.

---

### G8. Launch mode is configurable but one branch is unsupported

**Spec:** One session launch mode. Detached is the protocol; attached is not a mode, it is a different architecture.

**Current:** `index.ts` line 173-182 reads `guild.json["animator"]["detached"]` and routes to `launchAttached` if set to `false`. `launchAttached` is simultaneously annotated as "Not currently wired into the provider" (line 193) — the comment and the wiring contradict each other. The attached path exists as ~140 lines of async bridge code (line 205-301) that is difficult to reason about and has no regular test coverage against live claude.

**Severity:** Low functionally, high for maintenance cost. The surface area is large and load-bearing on "just in case" logic.

---

### G9. Transcript store is not a first-class contract

**Spec:** The transcript store is a guild-level contract: readers discover it through a known location and known schema, independent of the session host.

**Current:** The babysitter opens the guild's SQLite database directly (`babysitter.ts` line 362-401), creates the table if missing, and writes JSON blobs. The table name (`books_animator_transcripts`) and schema are baked into both the babysitter and whatever reads it. There is no abstraction layer; the "contract" is an implicit agreement between two files. If the transcript store ever moves or changes shape, both sides must be updated in lockstep.

**Severity:** Low today, high if the store ever needs to change (e.g. for container hosts, where direct SQLite access isn't possible).

**Fix shape:** Transcript writes should go through a well-defined writer interface (probably a guild-side HTTP endpoint or a shared writer library), not direct database access. For the local case, a thin wrapper is fine; the point is to have a named contract.

---

### G10. No idempotency guarantee on lifecycle reports

**Spec:** Lifecycle reports are at-least-once delivered. Terminal states are immutable to make duplicates safe. Ready reports are idempotent against `running` (rewriting `running` is a no-op).

**Current:** The session-record handler doesn't appear to enforce terminal-state immutability. If a DLQ'd report arrives on the next startup after the reconciler has already marked the session `failed`, the DLQ'd report may overwrite the reconciled state (or vice versa, depending on order of operations).

**Severity:** Medium. Produces confusing session records where the final state doesn't match what actually happened.

**Note:** `drainDlq` runs before `recoverOrphans` in startup, which mitigates this somewhat — but the ordering is a hidden invariant, not an enforced contract.

---

### G11. System-prompt temp directory leaks

**Spec:** This is not a spec concern per se, but cleanup is. Any per-session temp resources must be cleaned up deterministically.

**Current:** `detached.ts` line 147-155 creates a temp dir for the system prompt and never deletes it. The comment says "OS tmp cleanup handles it," which is not true on most dev and CI machines.

**Severity:** Low. Cosmetic but compounds.

---

### G12. Session host's stderr lifetime is tied to the spawning process

**Spec:** The session host is operationally independent from the guild. Nothing the guild does (including exit) can affect the host's ability to run or log.

**Current:** The babysitter is spawned with `stdio: ['pipe', 'ignore', 'inherit']` (`detached.ts` line 357). The inherited stderr points to the guild's stderr fd. When the guild restarts, that fd becomes dead; subsequent stderr writes from the babysitter produce EPIPE and can crash Node depending on signal handling. The babysitter, which is supposed to be the *reason* we can survive guild restarts, is coupled to the guild's stderr lifetime by its own stdio configuration.

**Severity:** High and possibly the mechanism behind some silent babysitter deaths. Needs direct investigation.

**Fix shape:** Session host opens its own log sink (a file, a syslog socket, a store write — any durable target) before beginning work, and writes to that sink instead of an inherited fd.

---

## Part 2: Deliberate Omissions

The spec intentionally leaves these details unspecified, because the current implementation's choices only make sense in the context of how the code is written, not as protocol elements.

### Storage technology (SQLite, better-sqlite3, WAL mode)

The spec says "durable store visible to concurrent readers." It does not name SQLite, better-sqlite3, or WAL mode. These are local-mode implementation choices. A container-hosted session host cannot open the guild's SQLite database directly; it needs a different mechanism. Baking SQLite into the spec would preclude that path.

### Dead-letter store layout (`.nexus/dlq/`, JSON files)

The spec says "durable dead-letter store local to the host machine." It does not name the directory, the file format, or the filename scheme. These are pragmatic local-mode choices — JSON files in a known directory are cheap and debuggable. A container host might use a different mechanism (a volume mount, a shared store, an event log).

### Configuration delivery mechanism (stdin JSON)

The spec says "delivered in one atomic unit." It does not specify stdin, JSON, or any particular transport. The current choice (JSON over stdin, because args are bounded and observable, and envvars leak) is sensible for local process spawn. A container host will likely use a mount or an API call. Baking stdin into the spec would constrain this unnecessarily.

### MCP transport (SSE, specific port, ephemeral binding)

The spec says the session host "hosts the tool proxy" and that the anima process is "configured to reach tools via the Session Host." It does not specify MCP, SSE, ephemeral ports, or the promise-gated transport handshake. These are dictated by the current anima technology (Claude Code) and its current MCP transport requirements. If Claude Code switches to Streamable HTTP, or if a different anima technology appears, the spec should still apply.

### Tool schema format (JSON Schema, Zod conversion)

The spec says "metadata sufficient to advertise tools to the anima process." It does not specify JSON Schema, nor `z.toJSONSchema`, nor any particular Zod version. The format is whatever the anima process's tool advertisement mechanism requires. The *requirement* — that the guild produce a manifest and the host carry it unchanged — is spec-level. The *format* is implementation.

### Specific retry budgets (60s, 5s poll interval, 24h result timeout)

The spec says "bounded exponential backoff." It names orders of magnitude (seconds to a minute for the reconciler) where protocol correctness depends on timing, and leaves the rest unspecified. Specific numbers are tuning parameters, not contracts.

### Polling in the provider for result/processInfo

The spec says the provider receives the session's terminal state. It does not specify how. The current implementation polls the sessions book every 5 seconds for 24 hours, which is a workaround for not having a push notification. A future implementation might subscribe to CDC events, use a condition variable, or have the session host HTTP-notify the provider directly. These are architecturally different but protocol-equivalent.

### Process identifier semantics (PIDs vs container IDs vs handles)

The spec says "a handle the reconciler can use to check liveness." The current implementation uses Unix PIDs because everything is a local process. A container host would use container IDs; a remote host would use a remote query. The reconciler's check is "is this session host still alive," and the mechanism is a parameter of the host type, not the protocol.

### Two-tool lifecycle interface (`session-running` + `session-record`)

The spec says the host reports a ready transition and a terminal transition. It does not require these to be two separate tools, nor that they be shaped like any particular tool. A future implementation could combine them into a single endpoint with a state field, or replace both with a CDC-style subscription. The *transitions* are the contract; the *shape of the API* is implementation.

### Attached mode

Attached mode is not mentioned in the spec at all. It is a testing and debugging convenience that predates detached mode; it is not part of the protocol. Under the spec, there is exactly one mode: detached. Tooling that needs to inspect sessions interactively should do so by other means (attaching a debugger to the session host, instrumenting the anima process directly) rather than running a fundamentally different architecture.

---

## Part 3: Migration Plan

These steps bring the implementation into alignment with the spec. They are ordered to minimize risk — each step leaves the system in a working state and can be landed independently.

### Phase 0: Find where astrolabe tools are being dropped in the role resolution chain

**Rationale:** The "animas not using MCP tools" symptom turns out to be an empty tool set arriving at the session provider, not a serialization bug. The tools are being dropped somewhere between the engine's `animator.summon({ role: 'astrolabe.sage' })` call and the provider's `config.tools`. This is a different bug in a different layer, and it does not block the session-provider rewrite at all — but it's the most user-visible failure right now and should be fixed first regardless.

**Diagnostic step (one-line, ~10 minutes):**

Add a single stderr log at the top of `launchDetached` in `detached.ts`:

```ts
process.stderr.write(
  `[claude-code] session ${config.sessionId} received ${config.tools?.length ?? 'undefined'} tools: ${(config.tools ?? []).map((rt) => rt.definition.name).join(', ')}\n`
);
```

Run one astrolabe planning commission. Read the guild stderr. Two outcomes:

- **`received 0 tools` or `received undefined tools`:** the provider is innocent. The bug is upstream. Walk the chain (see below).
- **`received 5 tools: plan-show, inventory-write, …`:** the provider is not innocent after all. Tools arrived but something in serialization or MCP wiring dropped them. Revisit G6.

**If the log says empty/undefined — walk the chain:**

The chain is: astrolabe engine → `animator.summon({ role: 'astrolabe.sage' })` → `loom.weave({ role: 'astrolabe.sage' })` → Instrumentarium role resolution → returns `context.tools`. Instrument each link in order:

1. **Loom.** Log `loom.listRoles()` once at guild startup. Confirm `astrolabe.sage` is registered under that exact qualified name (not `astrolabe:sage`, not `sage`, not mis-namespaced by plugin ID).
2. **Role definition.** Inspect the role's declared permissions and strict-mode flag. For `astrolabe.sage`, permissions are `['astrolabe:read', 'astrolabe:write', 'clerk:read']` and the role is `strict: true`.
3. **Tool registration.** Inspect the astrolabe tools' registered `permission` strings. If they don't match the role's declared permissions character-for-character (namespace separator, case, typos), strict-mode filtering drops them all silently.
4. **Instrumentarium resolver.** Log `loom.weave({ role: 'astrolabe.sage' }).tools.map(rt => rt.definition.name)` from inside the animator before it passes tools to the provider. Confirms whether the empty set originates at the resolver or is being dropped after.
5. **`callableBy`.** Check each astrolabe tool definition for a `callableBy` field. If any are set to something that doesn't include `'anima'`, the filter in `mcp-server.ts` (attached mode only) would drop them — but since we're in detached mode, this is ruled out unless a *second* `callableBy` filter exists upstream. `grep -r callableBy packages/` to check.

**Ranked suspicion** (based on the symptom shape):

1. **Strict-mode permission mismatch** (H2). Silent total-drop with no error, matches the symptom perfectly. Most likely.
2. **Role qualification typo** (H1). Also silent, also common. Close second.
3. **`callableBy` filter upstream of the MCP server** (H3). Only possible if a second filter exists that I haven't seen.
4. **Role returns tools but something between Loom and the provider drops them** (H4). Least likely given how direct the chain is, but possible.

**Exit criteria:** A single test commission dispatches astrolabe.sage and the resulting session's stderr log shows `received N tools: plan-show, …` with N > 0. An anima transcript from the same run contains at least one `mcp__nexus-guild__*` tool_use block. Findings written to `experiments/` with the root cause and the fix applied.

**What this phase is NOT:** This is not a session-provider fix. The provider code is fine (modulo the other gaps in this doc). Whatever fix this phase produces will live in the astrolabe plugin, the Loom, or the Instrumentarium — not in `claude-code/`.

### Phase 1: Fix the pre-write race (G2)

**Rationale:** One-line fix, high-impact. Eliminates a failure mode. Safe to land without the rest of the rewrite.

**Work:**

1. In `detached.ts`, replace the fire-and-forget async IIFE (lines 327-343) with an `await` before the spawn. The pre-write must commit before the babysitter is spawned, because the tool API's authorization reads this record.
2. If the put fails, do not spawn. Return a failed result to the caller.
3. The pre-written `pending` record also seeds `last_activity_at` with the wall-clock time at pre-write; this gives the reconciler a fair starting point for the staleness calculation (see Phase 2).

**Exit criteria:** No more silent auth-errors from pending records not being committed. Every pending record has a `last_activity_at` timestamp by the time the provider returns control.

### Phase 2: Heartbeat-based reconciliation (G1, G3, G4)

**Rationale:** Replaces the PID-based liveness check with the spec's heartbeat model. Closes the zombie-session class of failures uniformly across `pending` and `running`, with a periodic sweep and correct handling of guild downtime. Also obsoletes the `process.kill(pid, 0)` check, which was targeting the wrong PID anyway.

**Work:**

1. **Session record schema.** Add `last_activity_at: string` (ISO timestamp) to `SessionDoc`. Populated at pre-write (Phase 1), updated on every heartbeat, ready report, and terminal report via the guild's session handlers.
2. **Heartbeat endpoint.** Add a new `session-heartbeat` tool (or extend the existing `session-running` handler — the shape is a single-field update). Payload is just `{ sessionId }`. The handler updates `last_activity_at` to the guild's wall-clock time and returns.
3. **Host heartbeat timer.** In the babysitter, start a periodic timer (30s) right after the ready report and stop it before the terminal report. The timer calls `session-heartbeat` via the same HTTP path used for other lifecycle calls. Heartbeat failures are retried briefly and then dropped — a stale heartbeat has no replay value.
4. **Guild self-heartbeat.** Add a `guild_alive_at: string` field to the guild's state (a dedicated single-row table or a well-known key in the existing store). Register a timer in the Arbor startup phase (or wherever `phase:started` handlers land) that updates this timestamp every 30s. Timer must be unref'd.
5. **Downtime credit.** At guild startup, read the previous `guild_alive_at` before overwriting it. Compute `downtime_credit = max(0, now - previous_guild_alive_at - update_interval)`. Pass this credit into the first reconciler run.
6. **Reconciler rewrite.** Replace `recoverOrphans`'s PID check with the heartbeat rule: for each non-terminal session, compute `silence = now - last_activity_at`, subtract the downtime credit (once, on the startup run only), and if the remainder exceeds `staleness_threshold` (e.g. 3× heartbeat interval = 90s), transition to `failed` with error `"No heartbeat received for <silence>s — session host presumed dead (reconciled)"`. Scan both `pending` and `running`.
7. **Periodic reconciler.** Register a timer in the Animator's `start()` that runs `recoverOrphans` every 30s. Unref the timer. Add a single-flight guard so overlapping runs don't race.
8. **Legacy records.** Session records predating the heartbeat field should be given a `last_activity_at` of `now` on first sight by the reconciler (treat them as fresh) so the deployment doesn't nuke in-flight sessions. Log a warning for each legacy fix-up.

**Exit criteria:** A killed babysitter is reflected in the session book within ~90s (one missed heartbeat + one reconciler tick), with no guild restart required. A guild restart that takes 10 minutes does not mark any previously-healthy session as failed. The reconciler contains no `process.kill` call.

### Phase 3: Cancel via process group (G5)

**Rationale:** Fixes cancellation correctness. Under the new reconciliation model, Phase 2 already obsoletes the PID-based liveness path — this phase handles only the cancellation half of the old dual-use PID.

**Work:**

1. Extend the session record schema: replace `cancelMetadata.pid` (claude PID only) with `cancelHandle: { kind: 'local-pgid'; pgid: number }`. The field is an opaque, host-type-tagged structure, so a future container host can add `{ kind: 'container'; containerId: string }` without a schema churn.
2. The babysitter writes the cancel handle in the ready report, using its own process group ID (which is itself under `detached: true` on Linux — `process.pid` on the group leader).
3. Update `session-running` handler to accept the new shape without breaking old clients during the migration window (tolerate and warn on old `cancelMetadata.pid`).
4. Update `provider.cancel()` to dispatch on `cancelHandle.kind`. For `local-pgid`, signal the group: `process.kill(-pgid, 'SIGTERM')`.
5. Update the babysitter's signal handler to propagate SIGTERM to the anima process and report the terminal state as `cancelled`. The current babysitter has no explicit signal handling — it relies on the child dying when the parent dies, which is implementation-dependent.

**Exit criteria:** Cancellation reliably kills both the host and the anima process. The cancellation mechanism is dispatch-on-handle-kind, ready to accept a container variant without a second schema change.

### Phase 4: Delete attached mode; single tool pipeline (G6, G7, G8)

**Rationale:** Deletes ~140 lines of load-bearing complexity and forces one authoritative tool-serialization path. No longer a prerequisite for fixing the astrolabe-tools symptom (that turned out to be upstream), but still worth doing for maintenance reasons: the two pipelines will drift silently otherwise, and the contradictory comments in `launchAttached` ("Not currently wired into the provider" while simultaneously being reachable via a config flag) are a maintenance hazard on their own.

**Work:**

1. Pick the winning serialization approach. Prior: use the attached-mode approach (`.shape` directly with the MCP SDK) because it's what historically worked and what the SDK is designed for. Move the logic into the provider so it runs once before host launch.
2. Delete `launchAttached` from `index.ts`. Delete the `animator.detached` config flag and its handling.
3. Delete `mcp-server.ts`. The babysitter becomes the only MCP server.
4. Move any surviving helpers (e.g., `callableBy` filtering) into the provider's tool-manifest computation step, which is now the single source of truth.
5. Update the manifest to include the infrastructure tools (`session-running`, `session-record`) at manifest-computation time, not as a post-hoc addition in `detached.ts` line 310-314.
6. Update all tests that exercised attached mode to exercise detached mode instead, or delete them if they were attached-only.

**Exit criteria:** `mcp-server.ts` does not exist. `launchAttached` does not exist. There is exactly one function in the codebase that turns a Zod-schema tool definition into the JSON Schema sent to claude. The MCP tools regression is either fixed or has a clear next step from Phase 0 findings.

### Phase 5: Idempotency and DLQ ordering (G10)

**Rationale:** Hardens the reconciliation/DLQ interaction. Cheap relative to its value.

**Work:**

1. Update the `session-record` handler to reject writes against sessions already in a terminal state. Log and drop the duplicate — don't error, because the client is (legitimately) retrying.
2. Update the `session-running` handler to be idempotent against `running`: if the session is already in `running`, re-apply the payload (PID update, metadata) but do not regress from terminal states.
3. Explicitly document the DLQ-drain-before-reconciler ordering in `startup.ts`, and add a test that exercises: DLQ contains a result for a session the reconciler would mark failed. Verify the DLQ result wins.

**Exit criteria:** Duplicate delivery is safe. DLQ and reconciliation cannot race to produce inconsistent state.

### Phase 6: Session host logging independence (G12)

**Rationale:** Fixes a potentially-critical but poorly-understood class of silent babysitter deaths.

**Work:**

1. Before the session host begins any other work, open a log sink it controls: a file in a known location (e.g., `<guild-home>/logs/sessions/<sessionId>.log`) opened for append.
2. Redirect the host's stderr to this file for the remainder of its lifetime. The host writes to its own stderr for all logging; the inherited fd is replaced.
3. Update the provider's spawn to use `'ignore'` for the host's stderr (no inheritance) now that the host manages its own sink.
4. Add a guild-side convention for reading these logs (dashboard link, CLI command, etc.) — they're the best debugging signal we have for host-side failures.

**Exit criteria:** A guild restart cannot crash the session host via EPIPE on an inherited fd. Host-side logs survive for post-hoc inspection.

### Phase 7: Transcript store contract (G9)

**Rationale:** Deferred until last because it's architecturally the largest change and has no urgent symptom. Required before the container extension path is viable.

**Work:**

1. Define a `TranscriptWriter` interface in the animator apparatus: `write(sessionId, messages)`, `close()`.
2. Provide a local implementation that writes to the same SQLite location the current code uses, but through the interface.
3. Pass the writer into the session host at launch (conceptually — practically, pass a config that tells the host how to construct one).
4. Delete the babysitter's direct SQLite-open code. The host uses the writer interface.
5. Document the transcript table schema as a guild-level contract in the animator README, not an implementation detail of the babysitter.

**Exit criteria:** The babysitter does not mention SQLite. Transcript storage is behind an interface that could be swapped out for a remote implementation.

### Phase 8: Temp directory cleanup (G11)

**Rationale:** Trivial. Bundle into whichever phase is convenient.

**Work:** Pass the system-prompt temp-dir path through `BabysitterConfig` and clean it up in the host's `finally` block alongside the MCP tmpDir.

---

## Suggested Commission Sequence

These phases map to the following commission plan:

| Commission | Phases | Scope |
|---|---|---|
| **C1. Astrolabe tool resolution fix** | Phase 0 | Standalone investigation + fix of the upstream role resolution chain. Does not touch the claude-code provider. |
| **C2. Pre-write race + heartbeat-based reconciliation** | Phases 1, 2, 5, 8 | Cohesive "fix the zombies" work. Introduces `last_activity_at`, `guild_alive_at`, host heartbeat timer, downtime credit, and the new one-line reconciler rule. Lands behind tests. |
| **C3. Cancellation correctness** | Phase 3 | Depends on C2 for the session-record schema split (cancelHandle vs heartbeat fields) so the two changes don't stomp on each other. |
| **C4. Delete attached mode** | Phase 4 | Independent. Can proceed any time. |
| **C5. Host logging independence** | Phase 6 | Independent of the above; can land any time. |
| **C6. Transcript store abstraction** | Phase 7 | Deferred. Needed for Docker extension, not urgent. |

C1 is now fully independent of the session-provider work — it's a different bug in a different layer. C2, C4, and C5 can proceed in parallel with C1 and with each other. C3 waits on C2. C6 can be deferred indefinitely until the container extension is in scope.
