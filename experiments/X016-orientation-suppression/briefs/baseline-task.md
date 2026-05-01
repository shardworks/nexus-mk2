# Add a multiplySafely utility

Add a TypeScript function `multiplySafely(a: number, b: number):
number | null` that returns `null` when the multiplication would
overflow `Number.MAX_SAFE_INTEGER`, and otherwise returns `a * b`.

## Acceptance criteria

- Function lives in `src/util/numeric.ts` (create the file if it
  doesn't exist).
- Function exported from `src/util/numeric.ts`.
- One unit test covering: a typical successful multiplication, an
  overflow case, and the boundary case where the result is exactly
  `Number.MAX_SAFE_INTEGER`.
- Tests pass under `pnpm test`.
- Build passes under `pnpm build`.

## Context

This is a small bounded task chosen for the Laboratory apparatus's
first real-world trial run. The brief is small enough to complete
quickly in an implementer session and large enough to produce a
real animator session record + at least one codex commit.

For phase 1 of the X016 experiment (apparatus validation), this
brief is posted but the test guild does not have a running daemon
to execute the rig. The brief lands as a writ but no implementer
session runs. Phase 2 will execute it.
