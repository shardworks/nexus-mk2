# Add a multiplySafely utility to nexus-core

Add a TypeScript function `multiplySafely(a: number, b: number):
number | null` that returns `null` when the multiplication would
overflow `Number.MAX_SAFE_INTEGER`, and otherwise returns
`a * b`.

## Acceptance criteria

- Function lives in
  `packages/framework/core/src/util/numeric.ts` (create the
  file and the `util/` directory if they don't exist).
- Function exported from `packages/framework/core/src/util/numeric.ts`.
- One unit test file at
  `packages/framework/core/src/util/numeric.test.ts` covering:
  a typical successful multiplication, an overflow case, and
  the boundary case where the result is exactly
  `Number.MAX_SAFE_INTEGER`.
- Tests pass under
  `pnpm --filter @shardworks/nexus-core test`.
- Build passes under
  `pnpm --filter @shardworks/nexus-core build`.

## Context

This is a small bounded task chosen for the Laboratory
apparatus's first real implementer-driven trial run (X016 phase
2b). The trial codex is the nexus framework monorepo, so the
file targets the smallest, dependency-light package
(`@shardworks/nexus-core`) and the build/test commands are
package-scoped via pnpm filters to keep the implementer out of
the recursive `pnpm -r` path.

The brief is small enough to complete quickly in an implementer
session and large enough to produce a real animator session
record + at least one codex commit. Phase 2c will extend this
into the actual orientation-suppression A/B (baseline vs
strong-prompt brief variants).

## Notes for the implementer

- The package's existing tests use Node's built-in test runner
  (`node --test`) — see `id.test.ts` and `pid-helpers.test.ts`
  in the same `src/` directory for the test style.
- The package has zero runtime dependencies; do not add any.
- No need to update `index.ts` exports unless you want
  `multiplySafely` available as part of the public SDK surface
  — the brief only requires the function be exported from its
  own file.
