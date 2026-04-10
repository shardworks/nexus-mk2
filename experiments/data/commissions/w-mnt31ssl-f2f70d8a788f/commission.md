# Brief: Writ cancellation should cascade to its rig

## Problem

When a writ is transitioned to `cancelled` via the Clerk, the spider's rig for that writ is left untouched. The rig and all its engines stay in whatever status they were in — commonly `running` with one or more `running`/`pending` engines. This creates an incoherent system state:

- The writ is terminal but the rig is live.
- The rig's `running` engines continue counting against the spider's `maxConcurrentEngines` global throttle.
- Any babysitter subprocesses keep executing, burning model spend on work that is no longer wanted.
- `nsg rig cancel` refuses to operate on the rig because the writ is already in a terminal state (`Cannot transition writ ... to "cancelled": status is "cancelled"`), so the patron has no clean CLI path to reconcile.

The downstream effect is "mystery throttle saturation" — the patron thinks N engines are running but really M engines are running and (N-M) are zombies locked behind cancelled writs.

## Observed incident

On 2026-04-10, writ `w-mnrpc5cb-8af970211086` ("Update Astrolabe Sage Instructions") was cancelled at some point between 2026-04-09 and 2026-04-10. Its rig `rig-mnrpc8xr-3234956c` remained in `status: running`, with engine `inventory-check` still marked `running` (`startedAt: 2026-04-09T16:48:13.830Z`). The rig was eating a throttle slot for ~22 hours until Coco manually reaped it with a direct books edit.

## Desired behavior

When a writ is transitioned to `cancelled` (via any path — CLI, tool, Clerk API), the Clerk should either:

1. Emit a domain event that the spider listens for and responds to by cancelling the associated rig, or
2. Directly invoke the spider's `cancel(rigId)` API as part of the writ-cancel transition.

Rig cancellation should do the usual things: mark the rig `cancelled`, transition all running engines to `cancelled` (or `failed`), signal any babysitter subprocesses to stop, set `completedAt`, and record a `cancelReason` that references the writ cancellation as the cause.

## Open questions for Astrolabe

- **Mechanism: event-driven or direct call.** The Stacks CDC layer exists for exactly this kind of cross-plugin reaction. Event-driven is the natural fit, but comes with the usual eventual-consistency concerns (tick latency before the rig is cancelled, possible race with a mid-flight engine transition). A direct call from Clerk into Spider is simpler but couples the two plugins. Which does Astrolabe prefer?
- **Scope of cascade.** Does writ-cancel cascade to every writ in the subtree (children), and should those children's rigs also be cancelled? The parent/child writ relationship already exists; deciding whether cancellation follows it is a separable question.
- **Babysitter signalling.** When the spider cancels a rig mid-engine, how does it stop the live claude subprocess? Does it signal the babysitter to exit gracefully, hard-kill the subprocess, or let the engine finish and discard the result? The existing `nsg rig cancel` tool probably has an answer — this brief should reuse whatever it does.
- **Ordering and idempotence.** If the spider cancels the rig *before* the writ transition is finalized, and the writ transition then fails, we're in a weird half-state. Likewise, if a rig-cancel handler fires multiple times due to replay. The design should be idempotent both ways.
- **Reverse cascade.** Should rig-cancel also cascade upward to cancel the writ? Currently that's what `nsg rig cancel` does (see the "Cannot transition writ" error above — it attempts to cancel the writ as part of the rig cancel). The relationship is currently one-way and in the wrong direction.

## Non-goals

- Detecting and reaping zombies whose writ is already cancelled but whose rig is orphaned — that's handled by the separate "zombie engine reaping" brief. This brief is about *preventing* that state by closing the cascade loop at the point of cancellation.
- Reworking the rig/writ lifecycle more broadly. The goal is to patch a specific hole, not redesign the lifecycle.

## Pointers

- `packages/plugins/clerk/src/clerk.ts` — the transition logic for writ status changes. This is where a cascade hook or event emission would live.
- `packages/plugins/spider/src/spider.ts` — the `cancel()` API on `SpiderApi`, and the rig-cancel tool handler.
- `packages/plugins/spider/src/tools/rig-cancel.ts` (or wherever the tool lives) — current path that attempts to cancel writ + rig together. The error surface from that tool is the mirror-image of this bug.
- Related: the "zombie engine reaping" brief (separate commission) handles the cleanup side; this brief handles the prevention side.