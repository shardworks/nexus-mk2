# Animator SessionDoc writeback reducer

## Intent

Replace the bespoke per-writer merge code at the nine in-package `SessionDoc` write sites with a single discriminated-union reducer. The reducer takes `(existingDoc, transition)` and returns the next `SessionDoc`, where `transition` is encoded as a tagged union covering the lifecycle entry points: attach-running, detached-ready, terminal, orphan-failed, cancel, heartbeat-touch, and pending-pre-write. Every call site funnels through the same shape: read existing, build a transition, call the reducer, write the result. The merge invariants — preserve `startedAt`/`provider` from existing, refresh `lastActivityAt` on lifecycle signals, deep-merge `metadata`/`cancelHandle`, reject terminal-state regression — become explicit in one place instead of implicit across nine.

## Motivation

The animator package today has at least nine in-package `SessionDoc` writers across six files (`animator.ts` recordRunning / recordSession terminal / cancel; `session-record-handler.ts`; `startup.ts` orphan-recovery and lastActivityAt patch; `tools/session-running.ts` already-running and pending-to-running; `tools/session-heartbeat.ts`), plus a tenth cross-package writer in `claude-code/src/detached.ts` (the pending pre-write). Every writer rebuilds the same merge: spread existing, conditionally preserve fields, conditionally write `lastActivityAt`, branch on existing status, guard against terminal regression. The number of writers is justified — the lifecycle has many real entry points — but the per-writer bespoke merge is not. Per the April 25 animator complexity audit ([`packages/plugins/animator/COMPLEXITY-AUDIT.md`](packages/plugins/animator/COMPLEXITY-AUDIT.md)), this fanout is the second-largest reading-cost driver in the package and the foundation for two further refactors (eliminate-attached-path and centralize-emission-via-CDC) that need a clean transition vocabulary to build on.

This is the highest-confidence smallest-effort intervention from the audit's three ranked candidates (Candidate A in the audit, ranked above the medium-effort retirement-of-attached-path and the medium-effort emission-centralization candidates).

## Non-negotiable decisions

- **One reducer module, one reducer function.** New file under `packages/plugins/animator/src/` (the implementer picks the name; `session-reducer.ts` is one option but not prescribed). Exports the reducer plus the transition tagged-union type. The reducer is a pure function — input `(existing: SessionDoc | null, transition: SessionTransition)`, output `SessionDoc`. No I/O inside the reducer; no async; no clock reads — `lastActivityAt` is supplied via the transition payload (the guild owns the clock; the reducer just records what's given).
- **Transition variants must cover every existing write site.** At minimum: `pending-pre-write` (creates the row from the cross-package detached launcher; supplied id, provider, metadata), `attach-running` (in-process attached path enters running), `detached-ready` (detached babysitter reports running via `session-running` tool), `heartbeat-touch` (lastActivityAt-only refresh from `session-heartbeat`), `terminal` (any normal terminal write — completed/failed/timeout/rate-limited; carries the terminal payload), `cancel` (operator-cancel path), `orphan-failed` (startup reconciler force-fails an orphan). The implementer enumerates the actual call sites and chooses the discriminator names; the requirement is full coverage.
- **Reducer enforces terminal-state immutability.** A transition that would change the status of a doc already in a terminal state must be a no-op (return the existing doc unchanged) or rejected (throw, depending on the call-site's expectation; the implementer makes this consistent and documents it). Today the immutability invariant is enforced at varying call sites with varying mechanisms; the reducer is its single home now.
- **Guild owns the clock.** Every transition that updates `lastActivityAt` must accept the timestamp from its caller (the guild), not generate it inside the reducer. This preserves the existing invariant that `lastActivityAt` is wall-clock-from-the-guild, never host-supplied.
- **Externally-cancelled guard preserved.** The `dispatchAnimate` success-and-error branches in `animator.ts` re-read the SessionDoc and skip the terminal overwrite if the doc is already `'cancelled'`. After this refactor the same guard remains — likely encoded as the reducer's terminal-immutability rule applied to the cancel-then-terminal sequence. The implementer chooses whether to encode it as a reducer rule or keep the call-site re-read; the contract stays.
- **No behavior change.** Test counts and pass/fail outcomes must be identical before and after. Existing tests at `tools/session-lifecycle.test.ts` (terminal-state immutability, ready-report-against-terminal cases), `animator.test.ts` (cancel(), subscribeToSession, eager-boot-reconciliation), and `session-emission.integration.test.ts` are the reference. New unit tests for the reducer itself are required, but they augment rather than replace existing coverage.
- **No public-API change.** The reducer is internal to the animator package. `AnimatorApi`, `SessionDoc`, `AnimatorSessionProvider`, and other public exports stay verbatim. Cross-package consumers (spider, parlour, astrolabe, copilot, oculus, claude-code, the CLI tools) see no contract change.
- **Cross-package writer.** The tenth writer at `claude-code/src/detached.ts:374` (the pending pre-write) is **out of scope** for this commission — claude-code has a parallel refactor planned (the babysitter-runtime toolkit extraction), and changing claude-code's writer here would tangle two commissions. The reducer's `pending-pre-write` transition variant is designed to be callable from claude-code in a future commission.

## Behavioral cases the design depends on

- A `pending-pre-write` transition against a null existing doc creates a `pending`-status row with the supplied id, provider, and metadata; `lastActivityAt` is set from the transition payload.
- An `attach-running` transition against an existing `pending` doc updates status to `running`, preserves the original `startedAt` and `provider`, refreshes `lastActivityAt` from the payload, leaves `metadata` and `cancelHandle` untouched if not in the transition payload.
- A `terminal` transition against a `running` doc writes the terminal payload (status, endedAt, durationMs, exitCode, costUsd, tokenUsage, output, providerSessionId, terminationTag — whichever fields the variant carries); preserves `startedAt` and `provider`; refreshes `lastActivityAt`.
- A `terminal` transition against a doc already in a terminal state is a no-op (or throws, per the implementer's documented choice). The status, endedAt, and other terminal fields stay as the first writer set them.
- A `heartbeat-touch` transition against a `running` doc updates `lastActivityAt` only; everything else is preserved.
- A `cancel` transition against a non-terminal doc writes status `cancelled` plus the cancellation payload; against a doc already terminal, it's a no-op (the operator-cancel test in `animator.test.ts` covers this).
- An `orphan-failed` transition against a `running` doc forces status to `failed` with the orphan-recovery diagnostic; preserves everything else.
- The reducer never writes `lastActivityAt` from its own clock; if a transition payload omits the field, the reducer preserves the existing value (or leaves it unset on initial creation, per the variant's semantics).

## Out of scope

- The cross-package pending pre-write at `claude-code/src/detached.ts:374`. The reducer must support a `pending-pre-write` transition shape, but the actual call-site change in claude-code is a separate future commission.
- The other two candidates from the animator audit (eliminate the in-process attached path; centralize lifecycle emission via CDC). Both depend on the reducer's transition vocabulary being in place but are not part of this commission.
- Modifying `dispatchAnimate`'s success/error cancel-check duplication (audit hotspot §3). The reducer reduces the *merge* duplication; the *result-construction* duplication is a different concern.
- Modifying the rate-limit back-off machine, the lifecycle event emission helpers, the broadcaster + activeSessions registry, or the startup IIFE ordering.
- Adding new fields to `SessionDoc` or changing the `SessionDoc['status']` union.
- Changes to the public type exports in `types.ts`.
- Any modifications under `packages/plugins/animator/src/static/` (UI assets are explicitly carved out by the audit).

## References

- Source click: `c-moe0m38e` — animator simplification candidate, top per-LOC density target.
- Audit document: [`packages/plugins/animator/COMPLEXITY-AUDIT.md`](packages/plugins/animator/COMPLEXITY-AUDIT.md) — Candidate A in the audit's ranked refactor list. The audit's "What NOT to refactor" section enumerates the load-bearing constraints any animator refactor must preserve; this brief reproduces the relevant ones above but the audit is the authoritative inventory.
- Cost-density context: April 25 per-package cost analysis identified animator at $0.018/LOC (1.8× the substrate-plugin average); three animator-focused sessions averaged $28.43 each.