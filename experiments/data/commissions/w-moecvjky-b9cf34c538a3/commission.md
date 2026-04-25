**File:** `packages/plugins/spider/src/spider.test.ts`

**Symptom.** The top-level `describe('Spider — rig cancellation', ...)` (line 8647) contains five sub-describes that have nothing to do with cancellation:
- `countRunningEngines / countRunningEnginesInRig` (line 9242)
- `Concurrent engine throttle — tryRun` (line 9315)
- `Concurrent engine throttle — trySpawn` (line 9410)
- `Concurrent engine throttle — behavioral` (line 9481)
- `Concurrent engine throttle — regression` (line 9584)

**Why this matters.** A reader looking for concurrency-throttle behavior will not find it under a sensibly-named test file post-split unless the split commission explicitly violates verbatim relocation to fix it. The split commission is a relocation, not a re-organization, so it is bound to preserve the quirk.

**Suggested fix.** Lift the four `Concurrent engine throttle — *` sub-describes (and the `countRunningEngines / countRunningEnginesInRig` sub-describe) out of `describe('Spider — rig cancellation', ...)` into a new top-level `describe('Spider — concurrent engine throttle', ...)` either before or after the split commission. If after, this becomes a small follow-up: move ~430 lines of describe content from one file into a new sibling test file.