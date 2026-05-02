# Triage knip's unused-export findings — agent instructions

You are an autonomous agent picking up the knip dead-code triage workstream
left open at the end of session `b22fa587-51c2-41b8-9565-5c27eb79f3d3`
(2026-05-02). The Stage 1 cleanup (TypeScript `noUnusedLocals` /
`noUnusedParameters` enabled, 12 in-file violations fixed) and the
Stage 2 setup (knip installed via `pnpm dlx`, `knip.json` ignores for
`static/**` / `pages/**` / `scripts/**`, the unused `clerk-apparatus`
dep removed from animator) are already committed.

What's left: **25 unused exports + 56 unused types** flagged by knip.
Each needs eyes-on review before deletion. This doc is the runbook.

## Background

- The framework has no external consumers outside `/workspace/nexus`
  and `/workspace/nexus-mk2`. Anything not imported by source in those
  two repos is genuinely dead — nothing offsite uses it.
- Plugins are loaded by package name from guild config at runtime, not
  via static import. Knip handles this correctly because each plugin's
  `package.json` declares `exports: { ".": "./src/index.ts" }`, which
  knip auto-treats as an entry point. Anything reachable from a plugin's
  `src/index.ts` stays alive.
- The remaining flags are exports from non-index source files that no
  in-graph importer pulls — but **some of these are intentional**:
  test hooks, reserved API surface, tools that are used via dynamic
  registration. Each needs a judgment call.

## Procedure

### 1. Generate the current triage list

```sh
cd /workspace/nexus
pnpm dlx knip --reporter json 2>&1 | tail -1 > /tmp/knip-report.json

# Render to a triage-friendly text form
jq -r '
  .issues[] |
  select((.exports | length) > 0 or (.types | length) > 0) |
  "\(.file)" +
  (if (.exports | length) > 0 then "\n  exports: " + ((.exports | map(.name)) | join(", ")) else "" end) +
  (if (.types | length) > 0 then "\n  types: " + ((.types | map(.name)) | join(", ")) else "" end)
' /tmp/knip-report.json > /tmp/knip-triage-list.txt
```

The list as of session b22fa587 is appended at the end of this doc as
**Snapshot A**. If your run produces a different list, work from yours.

### 2. Decision rule per finding

For each export/type, decide one of:

- **DELETE** — the symbol is genuinely dead. No source imports it; it
  doesn't appear in any test fixture, runtime registration, or external
  contract. Remove the `export` keyword and, if the symbol becomes
  internal-only-and-unused, remove it entirely.
- **KEEP** — the symbol is alive in a way knip can't see. Document
  why in the triage note (see step 3). Possible reasons:
  - **Test hook**: prefix `__internal` or `__test`, or a type whose name
    contains `TestHooks`. These are intentional escape hatches.
  - **CLI command export**: files in `packages/framework/cli/src/commands/`
    are loaded by name; their `runX` / Input / Output exports may be
    consumed by the command auto-loader (check `commands/index.ts`).
  - **Tool export**: files in `packages/plugins/*/src/tools/*.ts` are
    typically registered via the kit's `tools` field; the file is the
    contribution but individual `Type` exports may be vestigial.
  - **Schema export**: types describing on-the-wire payloads (e.g.,
    `*Input` / `*Output` / `BabysitterConfigSchema`) — used at runtime
    in JSON encoding / decoding via Zod. Easy to mistake as dead.
  - **Documented public API**: rare in this codebase, but check
    `docs/architecture/` for any reference to the symbol.
- **DEMOTE** — the symbol is used in the same file or in tests but
  shouldn't be exported. Drop the `export` keyword (keep the symbol).

### 3. Per-finding workflow

Open the file. Search the monorepo for the symbol:

```sh
cd /workspace/nexus
grep -rn "<SYMBOL>" packages/ scripts/ --include="*.ts" --include="*.js" | grep -v "\.test\.ts"
# Also check test usage:
grep -rn "<SYMBOL>" packages/ --include="*.test.ts"
# And check the sanctum side:
grep -rn "<SYMBOL>" /workspace/nexus-mk2/ --include="*.ts" --include="*.md" 2>/dev/null
```

If grep returns hits in non-test source: the symbol is alive (knip
missed something — possibly a re-export). **KEEP**, note the
re-export chain.

If grep returns hits only in tests of the same package: it's a test
hook. **KEEP** if it's clearly intentional (e.g. `__internal`); else
**DEMOTE** (drop the export, keep the symbol — it's package-local).

If grep returns hits in docs only: **KEEP** unless the doc reference
is itself stale. Documenting a symbol nothing uses is a smell, but
deleting it without updating the doc creates worse drift.

If no hits anywhere: **DELETE**.

### 4. Batch the edits

Group changes by file. Per file, do all DELETE/KEEP/DEMOTE actions in
one edit. Don't open the same file twice.

Suggested grouping by package, in roughly increasing risk:

1. **Low-risk: type-only deletions** — types only used as compile-time
   shapes. If grep confirms no usage, delete. Touches:
   `*/types.ts`, `*/conformance/*.ts`, intermediate type aliases.
2. **CLI command surface** — `framework/cli/src/commands/clock.ts`,
   `commands/signal.ts` etc. Look at `commands/index.ts` to see how
   commands are loaded; the `runX` exports may be entry points the
   command framework registers by name.
3. **Plugin internal surface** — `plugins/*/src/<file>.ts` exports.
   Most likely deletable; double-check via grep across the whole
   monorepo before each delete.
4. **Special-case: reckoner `__internal`** — almost certainly an
   intentional test hook. **KEEP** unless you find conclusive evidence
   the test it backed is also gone.

### 5. Verify

After each batch:

```sh
cd /workspace/nexus

# 1. Typecheck — must be clean (Stage 1's noUnused fence is in effect)
pnpm -r --workspace-concurrency=1 --no-bail typecheck 2>&1 | grep -E "error TS|Failed"
#    Expect: no output. (Any TS6133/TS6196 means an unused symbol you
#    introduced. Fix it.)

# 2. Coverage gate
pnpm coverage 2>&1 | tail -5
#    Expect: ✓ Coverage threshold check passed (≥ 67/80/53 L/B/F).

# 3. Re-run knip — expect the list to shrink by exactly the count you
#    deleted/demoted.
pnpm dlx knip --reporter json 2>&1 | tail -1 | jq '
  { exports: ([.issues[] | (.exports | length)] | add),
    types:   ([.issues[] | (.types | length)] | add) }'
```

### 6. Commit

One commit per package (or per logical batch). Use Coco's git identity
and the `Session:` trailer (replace with your own session id):

```sh
GIT_AUTHOR_NAME=Coco GIT_AUTHOR_EMAIL=coco@nexus.local \
git commit -m "$(cat <<'EOF'
<package>: drop N unused exports

- <symbol1>: <reason>
- <symbol2>: <reason>
...

Verification:
- typecheck clean
- pnpm coverage gate held: <line>/<branch>/<func>
- knip post: <X> exports, <Y> types remaining

Session: <your-session-id>
EOF
)"
```

If you KEEP a finding, you don't need to commit anything for it — the
knip output will continue to flag it, and that's fine. Knip is a hint,
not a gate. (If you want to permanently silence a KEEP, use a knip
`ignoreExportsUsedInFile` or a per-file `// eslint-disable`-style
comment. Both are heavy-handed; prefer leaving the warning unless you
expect the same agent to re-flag it endlessly.)

### 7. Update coco-log

Add an entry to `/workspace/nexus-mk2/experiments/data/coco-log.yaml`
on the **last** commit of your cluster:

```yaml
- session: <your-session-id>
  date: <today>
  item: "Knip triage pass: deleted N unused exports + M types across <packages>. Kept K (test hooks / CLI command exports / runtime-registered). Updated knip output: <before X exports, Y types> → <after X' exports, Y' types>."
  commissionable: false
  justification: sanctum
```

## Specific guidance per known finding

These are the guesses Coco recorded at handoff. Treat as priors, not gospel.

| File | Symbol | Coco's prior |
|---|---|---|
| `framework/cli/src/started-guild.ts` | `clearStartedGuild` | Probably needed for tests that reset between cases — grep for usage in test files first. |
| `framework/cli/src/commands/clock.ts` | `runStart`, `runStop` + 8 I/O types | Likely command-registry entry points. Check `commands/index.ts`. |
| `framework/cli/src/commands/signal.ts` | `SignalHandlerInput` | Same as clock.ts story. |
| `plugins/astrolabe/src/astrolabe.ts` | `resolveAstrolabeConfig` | Suspicious — config resolvers are often consumed by plugin start(). Grep first. |
| `plugins/astrolabe/src/engines/index.ts` | `selectPrimerRole`, `PRIMER_ATTENDED_ROLE`, `PRIMER_SOLO_ROLE` | Likely deletable if the primer role logic was inlined elsewhere, but verify. |
| `plugins/cartograph/src/cartograph.ts` | `VISION_CONFIG`, `CHARGE_CONFIG`, `PIECE_CONFIG`, `CARTOGRAPH_PLUGIN_ID` | Constants — usually safe to delete if grep is clean. |
| `plugins/cartograph/src/tools/render.ts` | `projectWrit` + 4 types | Tools file — check the kit registration. |
| `plugins/claude-code/src/runtime.ts` | `SerializedToolSchema`, `BabysitterConfigSchema`, `StatusOverride` | Schemas often consumed at runtime via Zod parsing in another file. Grep carefully. |
| `plugins/claude-code/src/detached.ts` | `resolveGuildToolUrl`, `resolveDbPath`, `resolveBabysitterPath` + `DetachedLaunchOptions` | Detached-launch helpers — possibly orphaned utilities. |
| `plugins/clockworks/src/dispatcher.ts` | `isStandingOrderFailedTrigger` + `DispatchSweepInputs` | Type guard — check if used in a switch. |
| `plugins/clockworks/src/writ-lifecycle-observer.ts` | `deriveCommissionId` + `WritLifecycleObserverDeps` | Pure helper — easy to verify dead via grep. |
| `plugins/reckoner/src/reckoner.ts` | `__internal`, `ReckonerTestHooks` | **KEEP** — name signals deliberate test hook. Confirm by grepping test files. |
| `plugins/spider/src/engines/index.ts` | `EXECUTION_EPILOGUE`, `STEP_EXECUTION_EPILOGUE` | String constants — likely orphaned after a prompt-template refactor. |
| `plugins/spider/src/template.ts` | `stringifyForInline`, `containsTemplate` | Helpers — verify with grep. |
| `plugins/stacks/src/sqlite-backend.ts` | `tableName` | Possibly an exported helper that became internal. |
| All animator/clerk/clockworks/codexes/tools/stacks `*Deps`, `*Input`, `*Output`, `*Transition` types | Usually internal-to-file dependency-injection types. **DEMOTE** (drop export) most often. |

## Stop conditions

- If the typecheck breaks unexpectedly: don't suppress, investigate.
  Likely a re-export chain you missed. Restore and re-grep.
- If `pnpm coverage` drops below floor: you removed something tests
  depend on. Restore and look harder — probably a `*TestHooks` symbol
  imported by a test you didn't grep.
- If knip's count doesn't shrink by exactly the number you
  deleted/demoted: knip cached or you missed a file. Run with
  `--no-cache` and re-check.
- If the unused-export count is lower than expected on the first
  knip run, someone else may have started this work. Check the most
  recent commits on `main` before proceeding.

## Snapshot A — knip findings as of 2026-05-02 (session b22fa587)

```
packages/plugins/astrolabe/src/astrolabe.ts
  exports: resolveAstrolabeConfig
packages/plugins/astrolabe/src/engines/index.ts
  exports: selectPrimerRole, PRIMER_ATTENDED_ROLE, PRIMER_SOLO_ROLE
packages/plugins/claude-code/src/runtime.ts
  exports: SerializedToolSchema, BabysitterConfigSchema
  types: StatusOverride
packages/plugins/claude-code/src/detached.ts
  exports: resolveGuildToolUrl, resolveDbPath, resolveBabysitterPath
  types: DetachedLaunchOptions
packages/plugins/reckoner/src/reckoner.ts
  exports: __internal
  types: ReckonerTestHooks
packages/framework/cli/src/commands/clock.ts
  exports: runStart, runStop
  types: ListInput, ListOutput, TickInput, TickOutput, RunOutput,
         StartInput, StartOutput, StopOutput, StatusInput, StatusOutput
packages/plugins/cartograph/src/cartograph.ts
  exports: VISION_CONFIG, CHARGE_CONFIG, PIECE_CONFIG, CARTOGRAPH_PLUGIN_ID
  types: ChargeStage, PieceStage, VisionStage, WritPhase
packages/plugins/clockworks/src/dispatcher.ts
  exports: isStandingOrderFailedTrigger
  types: DispatchSweepInputs
packages/plugins/clockworks/src/writ-lifecycle-observer.ts
  exports: deriveCommissionId
  types: WritLifecycleObserverDeps
packages/framework/cli/src/started-guild.ts
  exports: clearStartedGuild
packages/plugins/spider/src/engines/index.ts
  exports: EXECUTION_EPILOGUE, STEP_EXECUTION_EPILOGUE
packages/plugins/spider/src/template.ts
  exports: stringifyForInline, containsTemplate
packages/plugins/stacks/src/sqlite-backend.ts
  exports: tableName
packages/plugins/cartograph/src/tools/render.ts
  exports: projectWrit
  types: WritProjection, WritReference, CartographShowResult, ListRow
packages/plugins/astrolabe/src/engines/patron-anima.ts
  types: RawVerdict
packages/plugins/spider/src/types.ts
  types: ImplementYields, ReviseYields
packages/plugins/animator/src/rate-limit-backoff.ts
  types: BackoffReadConfig, NowFn, ResumeProbeTracker
packages/plugins/animator/src/session-record-handler.ts
  types: BackoffObserver, SessionLifecycleEmitter
packages/plugins/animator/src/session-emission.ts
  types: SessionRecordFailurePhase
packages/plugins/animator/src/session-reducer.ts
  types: PendingPreWriteTransition, AttachRunningTransition,
         DetachedReadyTransition, HeartbeatTouchTransition,
         TerminalTransition, CancelTransition, OrphanFailedTransition
packages/plugins/reckoner/src/staleness-snapshot.ts
  types: StalenessHandlerDeps
packages/framework/cli/src/commands/signal.ts
  types: SignalHandlerInput
packages/plugins/clockworks/src/types.ts
  types: ProcessEventsOptions, ProcessSchedulesOptions
packages/plugins/clockworks/src/relay.ts
  types: RelayInput
packages/plugins/clockworks/src/schedule-parser.ts
  types: ParseResult
packages/plugins/clockworks/src/scheduler.ts
  types: ScheduleSweepInputs
packages/plugins/codexes/src/git.ts
  types: GitResult
packages/plugins/clerk/src/types.ts
  types: WritTypeStateInfo
packages/plugins/clerk/src/children-behavior-engine.ts
  types: ChildrenBehaviorEngineDeps
packages/plugins/clerk/src/writ-presentation.ts
  types: WritPresentation, StateIndicator
packages/plugins/tools/src/tools/tools-list.ts
  types: ToolSummary
packages/plugins/tools/src/tools/tools-show.ts
  types: ParamInfo, ToolDetail
packages/plugins/stacks/src/conformance/helpers.ts
  types: PutCall
packages/plugins/stacks/src/conformance/testable-stacks.ts
  types: TestableStacks
```

Total: **25 exports + 56 types across 34 files**.

When you're done, delete this doc from `.scratch/` and add a brief note
to the cluster's last commit body.
