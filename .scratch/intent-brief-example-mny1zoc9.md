# Intent Brief Example: w-mny1zoc9

## Purpose

This document contrasts what Astrolabe *actually produced* for commission w-mny1zoc9 ("Update detached-session implementation") against what an intent-focused Implementation Brief would look like under the decision-centric planner model. The goal is to make the proposed planner output format concrete and stress-test it against a real case.

## What Astrolabe actually produced

A 764-line prescriptive spec containing:
- Full TypeScript code blocks for every new function and type change
- A file-by-file rename table for the `cancelMetadata → cancelHandle` migration
- Exact function signatures, Zod schemas, and handler implementations
- 20 numbered requirements (R1–R20)
- 13 validation checks
- 30+ test case descriptions with expected behaviors

The anima's role was essentially transcription — copy the code from the spec into the codebase.

### What went wrong

The rename table for `cancelMetadata → cancelHandle` listed 8 files that needed updating. It was presented as exhaustive. The anima followed it faithfully.

**But the table missed the spider zombie reaper** (`packages/plugins/spider/src/spider.ts`), which reads `cancelMetadata.pid` in both its periodic reap path and its startup recovery path. After the rename, every running engine session looked like a zombie after 5 minutes and got reaped — cascading its rig to failed.

The failure mode: the spec's exhaustive presentation *suppressed implementer judgment*. The anima had no reason to grep beyond the table because the table said "here are all the files." An intent-focused brief would have named the concern ("every consumer of cancelMetadata across all plugins must be updated") and left the enumeration to the implementer, who would have done their own audit.

From the commission log: *"The brief should have required a consumer audit (grep for cancelMetadata.pid across all plugins) before being marked success."*

---

## What an Intent Brief would look like

### Implementation Brief — Heartbeat-Based Session Reconciliation & Cancel Handle

#### Intent

Replace the PID-based orphan recovery model with heartbeat-based reconciliation, and migrate the cancellation mechanism from bare-PID to tagged cancel handles with process-group semantics. After this change: dead sessions are detected within ~120s regardless of host type, cancellation reliably kills both babysitter and anima, and the system is extensible to non-local session hosts (containers, remote).

#### Rationale

The current orphan recovery runs once at startup and relies on `process.kill(pid, 0)` to detect dead sessions — this only works for local processes and only at startup. Sessions that die between startups are invisible. The bare-PID cancellation targets only the claude process, not the babysitter, and can't extend to non-local hosts. Both problems block the path to production-grade detached sessions.

#### Scope & Blast Radius

**Packages touched:**
- `packages/plugins/animator/` — session lifecycle, reconciliation, new heartbeat endpoint
- `packages/plugins/claude-code/` — babysitter heartbeat emission, cancel handle shape, SIGTERM handling
- `packages/plugins/spider/` — ⚠️ any code that reads session cancel metadata for zombie detection

**Critical migration:** The `cancelMetadata` field on `SessionDoc` is being renamed to `cancelHandle` and its shape is changing from `{ pid: number }` to a tagged union (`{ kind: 'local-pgid', pgid: number }`). **Every consumer of `cancelMetadata` across all plugins must be audited and updated.** This is a cross-cutting rename — do not rely on a static list; grep for `cancelMetadata` across the entire monorepo.

#### Decisions

| # | Decision | Tier | Default | Rationale |
|---|----------|------|---------|-----------|
| D1 | Heartbeat interval | 1 | 30s | Standard liveness interval; 3 missed = 90s detection |
| D2 | Staleness threshold | 1 | 90s (3× interval) | Tolerates one dropped heartbeat + network jitter |
| D3 | Cancel handle shape: tagged union vs bare record | 2 | Tagged union with `kind` discriminator | Extensible to future host types (container, remote) without breaking existing code |
| D4 | Guild downtime credit for reconciler | 2 | Credit = gap between last guild heartbeat and now, minus one interval | Prevents mass-reaping sessions that were healthy when the guild went down |
| D5 | Terminal-state immutability in session-record handler | 1 | Reject status writes to terminal sessions; still accept transcript writes | Prevents reconciler-then-babysitter race from overwriting the reconciler's verdict |
| D6 | SIGTERM handler in babysitter | 1 | Propagate to claude process, report `cancelled` status | Clean cancellation path instead of relying on default Node behavior |
| D7 | System-prompt temp dir cleanup | 1 | Babysitter cleans up in finally block | Currently leaked; obvious fix |

#### Acceptance Signal

1. A guild restart during an in-flight session does not strand the session — the reconciler detects it within ~120s
2. `kill <babysitter-pid>` results in `cancelled` status (not `failed`)
3. No consumer of `cancelMetadata` remains anywhere in the codebase after the migration — verified by grep
4. The spider's zombie reaper works correctly with the new cancel handle shape
5. `pnpm -w lint && pnpm -w test` pass

#### Existing Patterns

- Session lifecycle events follow the existing HTTP tool-call pattern (see `session-running`, `session-record` endpoints)
- Stacks book patterns for the new `state` book: follow existing `sessions` book setup in animator
- The babysitter already has a retry-with-timeout pattern for guild HTTP calls — reuse for heartbeats

#### What NOT to do

- Do not restructure the session lifecycle protocol beyond what's needed for heartbeats
- Do not add log rotation, structured logging, or transcript changes
- Do not rename the `AnimatorSessionProvider.cancel()` parameter name yet — that's a separate migration

---

## Comparison

| Dimension | Astrolabe Spec (764 lines) | Intent Brief (~80 lines) |
|-----------|---------------------------|--------------------------|
| **Implementer's role** | Transcription — copy code from spec | Engineering — design the solution within constraints |
| **Blast radius** | Static file table (missed spider) | Named concern + "grep the monorepo" instruction |
| **Decisions** | Implicit in code (reader must infer) | Explicit table with tiers and rationale |
| **What vs How** | Specifies both exhaustively | Specifies what + why; implementer owns how |
| **Failure mode** | False completeness — anima trusts the list | Implementer must do their own audit |
| **Acceptance** | 13 validation checks + 30 test descriptions | 5 outcome-level acceptance signals |
| **Extensibility** | Brittle — any missed file is a silent bug | Robust — the audit instruction catches unknown consumers |

### The key insight

The prescriptive spec's rename table was **wrong by omission** — it missed the spider. But the anima had no way to know it was incomplete because the spec presented it as the authoritative list. The intent brief doesn't try to enumerate — it names the *concern* (every consumer must be updated) and the *verification method* (grep the monorepo), which is more robust than any static list the planner could produce.

This is the core argument for intent specs: **the planner doesn't have better information than the implementer about the codebase.** The planner reads the same code. Its enumeration is no more reliable than the implementer's would be. But by presenting its enumeration as authoritative, it actively suppresses the implementer's own audit instinct.
