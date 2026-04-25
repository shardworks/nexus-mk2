`packages/plugins/animator/README.md` § Session Provider Interface and § Cancellation document `cancelHandle` shapes including `{ kind: 'container', containerId: string }` and `{ kind: 'remote', jobId: string, host: string }`. Today only `local-pgid` is implemented:

- `tools/session-running.ts:34` Zod schema for `cancelHandle` is `z.union([z.object({ kind: z.literal('local-pgid'), pgid: z.number() })])` — a one-member union (so the `union` adds no value).
- `packages/plugins/claude-code/src/index.ts:117 provider.cancel` only handles `kind === 'local-pgid'` and warns on any other kind.
- `docs/architecture/detached-sessions.md` § Cancellation Handles describes container and remote handles aspirationally.

The forward-looking shape is fine, but the gap between "documented shapes" and "runtime-honored shapes" is a trap for the next implementer (they may add a container provider expecting the apparatus already routes by kind). Two options:

1. Tighten the README/types to match what's actually implemented today, and note that container/remote shapes are aspirational and require apparatus changes to land.
2. Implement the dispatch (`AnimatorSessionProvider.cancel` could take a discriminator and route to a registered handler per kind) so the documented shapes are real.

Option 1 is small and lands today; option 2 is medium and unblocks future host types. Either is fine as long as the doc / code / runtime story stops drifting.