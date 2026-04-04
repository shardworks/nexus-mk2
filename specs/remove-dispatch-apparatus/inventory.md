# Inventory: Remove Dispatch Apparatus

## Summary

The Dispatch apparatus (`@shardworks/dispatch-apparatus`) is an interim work runner that bridges the Clerk and Animator. Its own docs label it "temporary rigging" — designed to be retired once the Spider is live. Spider is now live. This commission removes the entire Dispatch package and all references to it.

---

## Affected Code — Files to Delete

The entire `packages/plugins/dispatch/` directory:

| File | Role |
|------|------|
| `/workspace/nexus/packages/plugins/dispatch/package.json` | Package manifest — `@shardworks/dispatch-apparatus` |
| `/workspace/nexus/packages/plugins/dispatch/tsconfig.json` | TS config |
| `/workspace/nexus/packages/plugins/dispatch/README.md` | Package readme |
| `/workspace/nexus/packages/plugins/dispatch/src/index.ts` | Barrel — exports `DispatchApi`, `DispatchRequest`, `DispatchResult`, `createDispatch`, default plugin |
| `/workspace/nexus/packages/plugins/dispatch/src/dispatch.ts` | Core implementation — `createDispatch()` factory, `assemblePrompt()`, `next()` orchestration |
| `/workspace/nexus/packages/plugins/dispatch/src/types.ts` | Public types — `DispatchApi`, `DispatchRequest`, `DispatchResult` |
| `/workspace/nexus/packages/plugins/dispatch/src/tools/index.ts` | Tool barrel — re-exports `dispatchNext` |
| `/workspace/nexus/packages/plugins/dispatch/src/tools/dispatch-next.ts` | CLI tool — `dispatch-next` (`nsg dispatch-next`) |
| `/workspace/nexus/packages/plugins/dispatch/src/dispatch.test.ts` | Test file — full lifecycle tests |
| `/workspace/nexus/packages/plugins/dispatch/dist/` | Build output |
| `/workspace/nexus/packages/plugins/dispatch/node_modules/` | Local deps |

---

## Affected Code — Files to Modify

### Live guild (vibers)

| File | Change |
|------|--------|
| `/workspace/vibers/guild.json` | Remove `"dispatch"` from `plugins` array (line 15) |
| `/workspace/vibers/package.json` | Remove `"@shardworks/dispatch-apparatus": "file:../nexus/packages/plugins/dispatch"` dependency (line 11) |
| `/workspace/vibers/package-lock.json` | Regenerated after removing dependency |

### Framework documentation

| File | Change |
|------|--------|
| `/workspace/nexus/docs/architecture/apparatus/dispatch.md` | Delete entirely — the apparatus-specific doc |
| `/workspace/nexus/docs/architecture/apparatus/review-loop.md` | Heavy references to Dispatch. ~30 mentions including "Dispatch-level wrapper (MVP path)", "MVP: Dispatch-Level Review Loop", etc. The review loop MVP was never implemented; the Spider engine design (Option B) is the current path. This doc needs its Dispatch references updated or the doc archived if the Spider-level review loop is the canonical design now. |
| `/workspace/nexus/docs/architecture/apparatus/spider.md` | Line 13: "It replaces the Dispatch apparatus, which ran one writ in one session with no review." — update to past tense / remove reference to removed apparatus |
| `/workspace/nexus/docs/architecture/apparatus/clerk.md` | Line 15: "Connecting writs to sessions is the job of the dispatch layer — currently [The Dispatch](dispatch.md), eventually the full rigging system (Spider, Executor, Fabricator)." — update; the Spider is now canonical. Line 350: reference to Dispatch. Line 408+: "Dispatch Integration" section references Dispatch. |
| `/workspace/nexus/docs/architecture/apparatus/scriptorium.md` | Line 494: "Orchestrator (dispatch script, rig engine, standing order)" — generic "dispatch" usage (may be fine). Lines 529+: "Interim Dispatch Pattern" section — references interim dispatch pattern that is now superseded. |
| `/workspace/nexus/docs/architecture/apparatus/animator.md` | Line 449: "the Dispatch sets GIT_AUTHOR_EMAIL=w-{writId}@nexus.local" — update to reference Spider/implement engine |
| `/workspace/nexus/docs/architecture/index.md` | Line 155: "event and dispatch logs" — generic use of "dispatch" (Clockworks dispatch records, not the Dispatch apparatus; probably fine). No direct mention of the Dispatch apparatus in the Standard Guild table. |
| `/workspace/nexus/docs/reference/core-api.md` | References to `recordDispatch`, `listDispatches`, `DispatchRecord` — these are Clockworks dispatch records, NOT the Dispatch apparatus. Leave untouched. |
| `/workspace/nexus/docs/reference/event-catalog.md` | References to "dispatch" are about Clockworks event dispatch, not the apparatus. Leave untouched. |
| `/workspace/nexus/packages/framework/cli/README.md` | Line 187: `nsg dispatch list` in a table of commands — this was aspirational (nexus-stdlib), not from the Dispatch apparatus. May need checking. |
| `/workspace/nexus/docs/architecture/_agent-context.md` | Line 108: "Commission → mandate writ → dispatch flow" — generic use. Likely fine. |
| `/workspace/nexus/pnpm-lock.yaml` | Will be regenerated after removing the package |

### Sanctum (nexus-mk2)

No source code changes needed. Future docs reference Dispatch in `/workspace/nexus-mk2/docs/future/outdated-architecture/` but those are already in the "outdated" folder and document historical designs.

---

## Types and Interfaces (Current Signatures)

All from `/workspace/nexus/packages/plugins/dispatch/src/types.ts`:

```typescript
export interface DispatchApi {
  next(request?: DispatchRequest): Promise<DispatchResult | null>;
}

export interface DispatchRequest {
  role?: string;
  dryRun?: boolean;
}

export interface DispatchResult {
  writId: string;
  sessionId?: string;
  outcome?: 'completed' | 'failed';
  resolution?: string;
  dryRun: boolean;
}
```

From `/workspace/nexus/packages/plugins/dispatch/src/dispatch.ts`:

```typescript
function assemblePrompt(writ: WritDoc): string  // private
export function createDispatch(): Plugin
```

The `createDispatch()` returns a `Plugin` with:
- `apparatus.requires: ['clerk', 'codexes', 'animator']`
- `apparatus.recommends: ['loom']`
- `apparatus.provides: DispatchApi`
- `apparatus.supportKit.tools: [dispatchNext]`

No other package imports from `@shardworks/dispatch-apparatus`. The Dispatch is a pure consumer of Clerk, Scriptorium, Animator, and Loom APIs. It provides nothing that other packages depend on.

---

## Test Files

**Only test file:** `/workspace/nexus/packages/plugins/dispatch/src/dispatch.test.ts`

- Uses `node:test` (`describe`, `it`, `beforeEach`, `afterEach`)
- Uses `node:assert/strict`
- Creates a fake guild with `setGuild`/`clearGuild` from `@shardworks/nexus-core`
- Uses `MemoryBackend` from `@shardworks/stacks-apparatus/testing`
- Creates fake session providers and fake Scriptorium
- Tests: empty queue, dry run, success (no codex), success (with codex), session failure, FIFO ordering, draft open failure, seal/push failure, idempotency, non-ready writ skipping, git identity environment

This entire file is deleted with the package. No other test files reference the Dispatch.

---

## Adjacent Patterns — How Other Apparatus Were Removed

No prior apparatus removal exists in the codebase history. This is the first. However, the `packages-deprecated/` directory in a vibers worktree snapshot (`/workspace/vibers/.nexus/worktrees/nexus/draft-mnjq2j9g-d50cb9ad/packages-deprecated/`) suggests deprecated packages have been moved to a `packages-deprecated` dir before. The current codebase has no such directory at the framework root.

---

## Upstream/Downstream Pipeline

The Dispatch sits in this chain:

```
Patron → commission.sh → Clerk.post() → [writ.ready event] → Spider.crawl() → engines → Animator.summon()
                                                              ↑
                                              (Dispatch was an alternative to Spider here)
```

The Spider now handles the full pipeline that Dispatch previously covered. The Spider's implement engine does: accept writ → open draft → summon anima → seal on success / abandon on failure. This is the same lifecycle Dispatch's `next()` ran, but structured as engines within a rig.

**No apparatus depends on the Dispatch.** Confirmed by:
- No package in `packages/plugins/` or `packages/framework/` imports `@shardworks/dispatch-apparatus`
- The Dispatch's `provides` API (`DispatchApi.next()`) is only consumed by its own `dispatch-next` tool
- The `dispatch-next` tool resolves `dispatch` via `guild().apparatus<DispatchApi>('dispatch')` — only called from CLI

The vibers guild currently lists `dispatch` in its plugins array but also has `spider`. Both can coexist (Dispatch registers as an apparatus but Spider doesn't call it). Removing Dispatch from the plugins list is the only guild-side change.

---

## Existing Context

### Prior commissions touching this code

- The `sealing-an-inscription-should-push` spec (scope item S4) proposed "Dispatch cleanup: remove the now-redundant explicit push() call from the Dispatch apparatus" but marked it `included: false` — deferred since the whole apparatus was headed for removal.

### Spider doc explicitly calls out replacement

From `/workspace/nexus/docs/architecture/apparatus/spider.md` line 13:
> "The Spider is the spine of the guild's rigging system. It replaces the Dispatch apparatus, which ran one writ in one session with no review."

### Dispatch doc's own "Future: Retirement" section

From `/workspace/nexus/docs/architecture/apparatus/dispatch.md` lines 211-219:
> When the full rigging system (Spider, Fabricator, Executor) is implemented, the Dispatch apparatus is retired:
> - The Spider takes over rig spawning and engine traversal
> - The summon relay handles anima dispatch from standing orders
> - The Fabricator resolves engine chains
> - `dispatch-next` is replaced by the Clockworks processing `mandate.ready` events
> The Dispatch is designed to be removable with zero impact on the Clerk, Scriptorium, Animator, or Loom.

### commission.sh already uses Spider

`/workspace/nexus-mk2/bin/commission.sh` documents:
> "What the Spider handles: Picking up ready writs and dispatching to an anima"

The script posts to the Clerk; the Spider picks up writs via standing orders. No reference to Dispatch apparatus.

---

## Doc/Code Discrepancies

1. **Clerk doc references Dispatch as current:** `/workspace/nexus/docs/architecture/apparatus/clerk.md` line 15 says "Connecting writs to sessions is the job of the dispatch layer — currently [The Dispatch](dispatch.md), eventually the full rigging system." — The Spider is now live, so Dispatch is no longer "current." This is stale.

2. **Review loop doc assumes Dispatch MVP:** `/workspace/nexus/docs/architecture/apparatus/review-loop.md` has an extensive "MVP: Dispatch-Level Review Loop" section. This was never implemented — the review loop was built as Spider engine designs instead. The doc's Dispatch references are stale.

3. **Scriptorium doc's "Interim Dispatch Pattern":** `/workspace/nexus/docs/architecture/apparatus/scriptorium.md` lines 529+ describe an "Interim Dispatch Pattern" that references the old dispatch script approach. Stale now that Spider handles this.

4. **vibers guild still lists dispatch:** `/workspace/vibers/guild.json` and `/workspace/vibers/package.json` still include the Dispatch plugin despite Spider being the active dispatcher.

5. **CLI README lists `nsg dispatch list`:** `/workspace/nexus/packages/framework/cli/README.md` line 187 — this was an aspirational command from nexus-stdlib, never from the Dispatch apparatus itself. May be stale regardless.
