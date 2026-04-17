# Close the `transition()` Back-Door on the Writ Observation Slot

## Intent

Strip `status` from the caller-supplied body merged by `ClerkApi.transition()`, so the writ observation slot is writable only through the Clerk helper that performs transactional per-sub-slot read-modify-write. Restate the one-path invariant everywhere the spec/status convention is documented, so the contract reads the same in code, tests, and prose.

## Rationale

The observation slot (`Record<PluginId, unknown>`) is shaped so multiple plugins can own their own sub-slots. The only slot-write path that preserves sibling sub-slots under concurrent writers is the dedicated Clerk helper, which does transactional read-modify-write. `transition()`'s body-merge goes through a top-level shallow patch, so any `status` key in the body wholesale-replaces the slot and clobbers sibling sub-slots silently. Closing the back-door now — before any plugin starts writing sub-slots — keeps the "all slot writes go through the helper" invariant enforceable in documentation and uniform with how `phase` is already handled.

## Scope & Blast Radius

This change is narrow and self-contained; there are no cross-package consumers to migrate.

- **Clerk runtime — one strip-list extension.** The managed-field strip list inside `ClerkApi.transition()` gains `status` alongside the existing managed fields. Same silent drop, same runtime-only placement, same inline destructure style. The JSDoc directly above `transition()` — which today describes the pass-through behavior explicitly — must be rewritten in lockstep so the comment matches the code.

- **Clerk tests — two tests.** A dedicated pass-through test asserts the old contract and is inverted in place. The general managed-field strip-list test enumerates every stripped field and extends to include `status`.

- **Clerk prose — every surface that describes the spec/status convention or the transition() strip-list.** Three locations in `docs/architecture/apparatus/clerk.md` currently describe three subtly different stories (one already consistent with the new behavior, two still describing pass-through); all three are reconciled to a single coherent story. The README has two prose surfaces (the Spec/Status Convention section and the `transition()` section) that must match. The `WritDoc.status` field JSDoc in `types.ts` is tightened from best-practice advice to the one-path invariant.

- **No caller migration.** No non-test source file in the monorepo passes `status` to `transition()`'s body today — verify with grep across the monorepo. The compatibility surface is zero.

- **Not affected.** The `transition()` signature (`fields?: Partial<WritDoc>`) is unchanged. `ClerkApi.setWritStatus()`'s contract and signature are unchanged. Stacks' generic `put()`/`patch()` paths are unchanged. No transition-like API on any other runtime object (rigs, engines, sessions, input-requests) is touched — none of them carry an observation slot today.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | Should `transition()` silently drop a caller-supplied `status` field, or throw/warn? | Silently drop (same treatment as `phase`). | Uniform strip-list convention; no surprise to callers sharing a document shape across put/patch/transition. |
| D2 | Should the managed-field strip list be refactored into a named constant, or kept as inline destructuring? | Keep inline destructure. | Minimum change; matches the preceding commission's style; refactor-to-constant is a reversible follow-up that is listed in observations. |
| D3 | How should the existing pass-through test be handled — invert, delete, or relocate? | Invert in place — rename, flip the assertions (siblings preserved, caller-supplied sub-slot discarded), keep it in the `setWritStatus()` block. | The dedicated test documents the one-path contract in context; inverting preserves that signal. |
| D4 | Should the generic `strips managed fields` test be extended to include `status`? | Extend — add a `status` entry and assert it is stripped. | The test already enumerates every managed field; leaving `status` out would be the exact gap that enabled the original back-door. |
| D5 | Add a CDC-event test for transition() with `status` in its body? | Skip. | CDC reflects the stored document; strip-list tests cover this transitively. No new signal. |
| D6 | Which prose surfaces need updating to state the one-path invariant? | Update all: both Spec/Status Convention sections (arch doc + README), both `transition()` JSDocs (source + arch doc), the README `transition()` section, and the Implementation Notes line in the arch doc. | Leaving stale pass-through language in any of these would create the doc/code disagreement the commission exists to eliminate. |
| D7 | Should the `WritDoc.status` field JSDoc in `types.ts` be tightened, or left as best-practice advice? | Tighten — state the invariant plainly. | The same one-path invariant should read the same everywhere it appears; the field JSDoc is read by every API consumer. |
| D8 | Should the `transition()` `fields` type be narrowed to exclude `status` at compile time? | Keep `Partial<WritDoc>` — runtime strip only. | Consistency with the preceding commission's treatment of `phase`; the brief frames this as strip-list work, not API-shape work. |

## Acceptance Signal

- `pnpm -w test --filter @astrolabe/clerk` passes — the inverted pass-through test asserts sibling sub-slots survive and the caller-supplied sub-slot is discarded; the enumerated strip-list test covers `status` alongside the other managed fields.
- `pnpm -w typecheck` passes.
- A repo-wide grep — `rg -n "transition\s*\(" packages/ | rg status` — returns no non-test source hits where `status` appears inside the `fields` body argument of a `transition()` call. (Expected result today; this is a regression check.)
- Every Spec/Status Convention surface (architecture doc section, README section, source JSDoc on `transition()`, architecture-doc JSDoc on `transition()`, architecture-doc Implementation Notes line, `WritDoc.status` field JSDoc) states the same one-path invariant: the observation slot is writable only via the Clerk helper; `transition()` silently drops `status` from the body; the generic `put()`/`patch()` paths are not supported slot-write mechanisms.
- `docs/architecture/apparatus/clerk.md` is internally consistent end-to-end — the `transition()` JSDoc, the Spec/Status Convention section, and the Implementation Notes line describe the same strip behavior and the same one-path contract.

## Existing Patterns

- The existing `phase` strip in `ClerkApi.transition()` (the inline destructure inside `transition()` in `packages/plugins/clerk/src/clerk.ts`) is the exact precedent — same silent drop, same runtime-only enforcement, same inline destructure position. Extend that destructure; do not introduce a new mechanism.
- The existing "strips managed fields" test in `packages/plugins/clerk/src/clerk.test.ts` already enumerates every stripped field and confirms `resolution` passes through. Add a `status` case following the same assertion shape.
- `ClerkApi.setWritStatus()` in `packages/plugins/clerk/src/clerk.ts` is the canonical slot-write path — its JSDoc, transactional shape, and the CDC-event test that accompanies it are the model the inverted pass-through test's comment should reference as the "one sanctioned path."
- The preceding commission (`w-mo38j057-bc074810ff6c`) landed the `status` field, `setWritStatus()`, and the original Spec/Status Convention prose; the phrasing and section layout of the new invariant statement should match the voice and structure of that section, just with the one-path contract made explicit.

## What NOT To Do

- **Do not extract a named managed-field constant.** Extend the inline destructure only (D2). The observations note this as a deferred follow-up.
- **Do not throw, warn, or log on a caller-supplied `status`.** Silent drop (D1).
- **Do not narrow `transition()`'s `fields` type.** The signature stays `Partial<WritDoc>` (D8). Compile-time enforcement of managed fields is a separate commission if the guild wants it.
- **Do not add a CDC-event test for transition() with a `status` body.** Skipped per D5.
- **Do not change `setWritStatus()`'s contract, shape, or name.** Out of scope per the brief.
- **Do not add runtime enforcement on the generic `put()`/`patch()` paths.** The one-path contract is documented, not enforced. Out of scope per the brief.
- **Do not touch transition-like APIs on rigs, engines, sessions, or input-requests.** Those runtime objects do not carry an observation slot today; the back-door question is moot there. Out of scope per the brief.
- **Do not preserve "D15" or planner-decision-id references in the inverted test's comment.** The new behavior is no longer anomalous and should be documented on its own terms.
- **Do not leave any surface describing the pass-through behavior.** Every prose surface listed in D6 must be updated — partial updates recreate the exact doc/code disagreement this commission eliminates.

<task-manifest>
  <task id="t1">
    <name>Close the transition() back-door in runtime</name>
    <files>packages/plugins/clerk/src/clerk.ts — the managed-field destructure inside ClerkApi.transition() and the JSDoc directly above it.</files>
    <action>Extend the inline managed-field destructure inside transition() to include status, using the same silent-drop shape already applied to phase (D1, D2). Rewrite the JSDoc above transition() that currently describes status as a pass-through field; the new comment must state that status is a managed field stripped from the body, and that the sanctioned slot-write path is ClerkApi.setWritStatus(). Do not change the method signature. Do not introduce a named constant.</action>
    <verify>pnpm -w typecheck</verify>
    <done>transition() drops a caller-supplied status from the merged payload silently and the JSDoc describes the new behavior accurately; typecheck passes.</done>
  </task>

  <task id="t2">
    <name>Update Clerk tests to the new contract</name>
    <files>packages/plugins/clerk/src/clerk.test.ts — the dedicated pass-through test inside the setWritStatus() describe block (currently asserts status flows through and clobbers siblings), and the generic "strips managed fields" test that enumerates stripped fields.</files>
    <action>Invert the dedicated pass-through test in place per D3: rename it to reflect the new behavior, flip its assertions so sibling sub-slots are preserved and the caller-supplied sub-slot is discarded, keep its location in the setWritStatus() block so the one-path contract stays visible in context, and drop any reference to the auto-resolved planner decision id in the comment. Extend the "strips managed fields" test per D4 to include a status entry in the fields object and assert it was stripped. Do not add a CDC-event test for the transition() strip (D5).</action>
    <verify>pnpm -w test --filter @astrolabe/clerk</verify>
    <done>Both updated tests pass; the strip-list test covers status alongside the other managed fields; the inverted test documents the one-path contract inside the setWritStatus() block.</done>
  </task>

  <task id="t3">
    <name>Tighten the WritDoc.status field JSDoc</name>
    <files>packages/plugins/clerk/src/types.ts — the WritDoc.status field JSDoc.</files>
    <action>Rewrite the status field's JSDoc per D7 so it states the one-path invariant plainly: the slot is writable only via ClerkApi.setWritStatus(); transition() silently strips status from its body; the generic put()/patch() paths are not supported slot-write mechanisms. Keep the Record&lt;PluginId, unknown&gt; shape description. Do not change the type.</action>
    <verify>pnpm -w typecheck</verify>
    <done>The field-level JSDoc matches the one-path invariant read the same in every other convention surface.</done>
  </task>

  <task id="t4">
    <name>Reconcile the Clerk architecture doc</name>
    <files>docs/architecture/apparatus/clerk.md — the JSDoc block above transition(), the Spec/Status Convention section, and the Implementation Notes line describing the pass-through.</files>
    <action>Reconcile all three locations per D6 so the doc tells a single coherent story: the transition() JSDoc block describes the full managed-field strip list including status (today already claims this — verify wording matches the code exactly after t1); the Spec/Status Convention section gains an explicit one-path invariant statement and drops the clobber-hazard warning that described the old pass-through behavior; the Implementation Notes line is rewritten to describe the strip, not the pass-through. When finished, the three passages must describe the same behavior and the same contract.</action>
    <verify>grep -n "pass" docs/architecture/apparatus/clerk.md ; grep -n "clobber" docs/architecture/apparatus/clerk.md — confirm no residual references describe status as passing through or as a clobber hazard on the transition path.</verify>
    <done>The architecture doc is internally consistent; every surface that mentions status and transition() describes the strip and the one-path invariant.</done>
  </task>

  <task id="t5">
    <name>Update the Clerk README</name>
    <files>packages/plugins/clerk/README.md — the Spec/Status Convention section and the transition() section.</files>
    <action>Update both README prose surfaces per D6 to match the architecture doc: the Spec/Status Convention section states the one-path invariant; the transition() section describes status as a managed field stripped from the body, with no clobber-hazard warning on the transition path. Match the voice and structure already used in the surrounding README content.</action>
    <verify>grep -n "pass" packages/plugins/clerk/README.md ; grep -n "clobber" packages/plugins/clerk/README.md — confirm no residual pass-through or clobber-hazard language remains on the transition() path; the one-path invariant is stated.</verify>
    <done>The README and the architecture doc describe the same behavior and the same contract; every prose surface agrees with the runtime.</done>
  </task>

  <task id="t6">
    <name>Verify compatibility surface and whole-tree consistency</name>
    <files>Repo-wide grep; no file changes expected.</files>
    <action>Confirm no non-test source file passes status in transition()'s body today and that every convention surface states the same one-path invariant. If either check surfaces a site the earlier tasks missed, update that site to match and re-run.</action>
    <verify>rg -n "transition\s*\(" packages/ | rg status — expect only test-file hits; rg -n "setWritStatus" packages/ docs/ — expect the helper is named in every convention surface listed in D6.</verify>
    <done>No non-test caller of transition() passes status in its body; every documented convention surface names setWritStatus() as the one-path helper and describes the transition() strip consistently.</done>
  </task>
</task-manifest>
