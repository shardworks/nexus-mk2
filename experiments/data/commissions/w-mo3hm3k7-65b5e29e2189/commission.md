# Spider Dispatch Gating via `spider.follows`

## Intent

Wire Spider so that writ dispatch is gated on outbound `spider.follows` links. A writ is held while any of its declared dependencies is non-terminal; a failed blocker cascades the dependent into `stuck`; recovery auto-unsticks; cycles in the dependency graph are detected during gate evaluation and surfaced as stuck. This is the first live consumer of the link-kind registry and the first writer of any `status.<pluginId>` sub-slot.

## Rationale

The link-kind substrate (renamed to expose `kind` alongside `label`, with `listKinds()` and the dot-form id convention) and the per-plugin status slot on writs (`WritDoc.status` plus `ClerkApi.setWritStatus`) both landed in prior commissions but neither has a live consumer. Spider is the natural first consumer because it already owns the dispatch decision and an existing engine-cascade stuck path. The pattern Spider uses for `status.spider` becomes the de facto precedent the next plugin will mirror, so the chosen shape (D1) is load-bearing for future readers — most immediately, the parked Oculus gate-state column.

## Scope & Blast Radius

Three packages are affected:

- **Spider plugin (`packages/plugins/spider`).** Registers the new kind through `supportKit.linkKinds`. Adds gate evaluation, cycle detection, stuck cascade, auto-unstick, and `status.spider` provenance writes inside the existing crawl loop. Owns nearly all of the new behavior.
- **Clerk plugin (`packages/plugins/clerk`).** No source changes. Clerk consumes the new kit contribution through the already-built kit substrate; its existing `link()` validator, `listKinds()`, and `setWritStatus(writId, 'spider', value)` APIs are the integration points.
- **Oculus writ page (`packages/plugins/clerk/pages/writs/index.html`).** Adds a `kind` dropdown to the inline add-link form, fetches the kind list once at page init, includes the chosen kind in the submission, and surfaces Clerk rejections inline on the form.

Cross-cutting concerns the implementer must verify independently:

- **First live writer of `status.<pluginId>`.** The shape this commission writes is the precedent every subsequent writer will follow. Audit the only supported writer path (`ClerkApi.setWritStatus`) and confirm Spider does not bypass it. Verify by grep: no other writes to `status.spider` should exist.
- **First load-bearing consumer of the link-kind registry.** The end-to-end flow — Spider's `supportKit.linkKinds` → Clerk's kit-registry validator → consumer behavior keyed on `kind` — runs for the first time. Verify the kind is round-trippable: register → `listKinds()` returns it → `link()` accepts it → outbound walk finds it.
- **Two coexisting Spider→stuck transitions with distinct provenance conventions.** The pre-existing engine-cascade path (rig CDC writing only `resolution`) and the new gating path (writing `resolution` plus `status.spider.stuckCause`) live side-by-side in `spider.ts`. Auto-unstick relies on **absence** of `status.spider.stuckCause` to decide which stuck writs are not Spider's to touch. Verify: a writ stuck by engine cascade is never visited by the auto-unstick pass.
- **Polling semantics.** The same crawl tick that picks new dispatchable writs also re-evaluates currently-gated and currently-stuck writs. No new scheduler, no new tick substrate, no event-dispatch layer.
- **Direction convention.** Source → target means "source depends on target." Spider reads **outbound** links on the candidate, not inbound on the target. Audit both the kind's verbatim description and the read site for consistency.
- **No DB migration, no guild config change, no new apparatus, no new HTTP route, no new tool.** Verify by grep that no migrations directory, no guild.json, and no new route or tool registrations were touched.

## Decisions

| #   | Decision                                                                | Default                                                                                                                                                                       | Rationale                                                                                  |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| D1  | Shape of `status.spider` sub-slot                                       | On stuck: `{ stuckCause, blockerIds: string[], observedAt: string }` (cycle members listed in `blockerIds` for the cycle case). Absent when not Spider-authored. Nothing written while gated-but-not-stuck. | Future readers (Oculus column, debugging) get structured detail without per-poll write churn |
| D2  | Source of the short-id helper                                           | Inline a tiny three-line `shortId` helper inside Spider                                                                                                                       | Avoid a Spider→Ratchet dependency for a trivial utility                                    |
| D3  | Cycle-detection algorithm                                               | Iterative DFS per candidate with `visiting`/`visited` sets; cycle members reported as the path from back-edge target to current node                                          | Distinguishes cycles from diamonds; precise member set for resolution text                 |
| D4  | New `CrawlResult` variant for gating outcome                            | Add `{ kind: 'gated', writId, blockerIds }` alongside the existing `blocked` variant                                                                                          | Keeps rig-level blocks distinct from dispatch gating in logs and tests                     |
| D5  | Locating stuck writs eligible for auto-unstick                          | Read all stuck writs each crawl, filter in memory by presence of `status.spider?.stuckCause`                                                                                  | Stuck counts are bounded; in-memory sets and new indexes are unjustified now               |
| D6  | Crawl-loop position of auto-unstick                                     | Add a new `autoUnstick` phase before `trySpawn`; `trySpawn` then handles only `open` writs                                                                                    | `open→stuck` and `stuck→open` stay visibly distinct in code                                |
| D7  | Layout of the add-link form                                             | `[target] [kind▼] [label] [Link]`                                                                                                                                             | Kind qualifies the target and is more load-bearing than label                              |
| D8  | Empty-kind option label                                                 | `None`                                                                                                                                                                        | Patron choice                                                                              |
| D9  | When the page fetches the kind list                                     | Fetch once at page init                                                                                                                                                       | Registry is small and stable; zero-latency form interaction                                |
| D10 | Description text registered for `spider.follows`                        | Use the brief's prescribed text verbatim (see Existing Patterns for the exact string)                                                                                         | Pre-empted by the brief                                                                    |
| D11 | Kind id form                                                            | `spider.follows` (dot separator)                                                                                                                                              | Pre-empted by the id-format decision                                                       |
| D12 | Composition rule for multiple outbound `spider.follows`                 | Conjunctive — all blockers must release                                                                                                                                       | Pre-empted by the brief                                                                    |
| D13 | Read direction                                                          | Read the candidate writ's outbound `spider.follows` links and inspect the target writs' phases                                                                                | Pre-empted by the brief; matches kind's directional semantics                              |
| D14 | Cascade scope on a failed blocker                                       | Stick only the direct dependent; the next poll handles transitive dependents through the same mechanism                                                                       | Pre-empted by the brief                                                                    |
| D15 | Recovery semantics                                                      | Spider auto-unsticks on the next poll when all causes are resolved                                                                                                            | Pre-empted by the brief                                                                    |
| D16 | `stuckCause` enum values                                                | `'failed-blocker' \| 'cycle'`                                                                                                                                                  | Pre-empted by the brief                                                                    |
| D17 | Treatment of `completed` and `cancelled` blockers                       | Both release the gate; `failed` cascades to stuck; non-terminal phases hold the gate                                                                                          | Pre-empted by the brief                                                                    |
| D18 | Re-evaluation mechanism                                                 | Existing crawl ticks; no event-dispatch substrate                                                                                                                             | Pre-empted by the brief                                                                    |
| D19 | Clerk's role in cycle detection                                         | Clerk stays kind-agnostic; cycles are detected by Spider at walk-time and surface as stuck conditions                                                                          | Pre-empted by the brief                                                                    |
| D20 | Engine-cascade stuck path                                               | Continues to write only `resolution`; no `status.spider` write                                                                                                                | Pre-empted by the brief; absence is the auto-unstick signal                                |
| D21 | Short-id form in resolution text                                        | Two-segment short id, e.g. `w-abc123`                                                                                                                                         | Pre-empted by the brief's worked examples                                                  |
| D22 | Endpoint feeding the Oculus dropdown                                    | Reuse the existing `GET /api/writ/link-kinds` route (auto-mapped from the `writ-link-kinds` tool)                                                                              | Returns exactly what the form needs; no parallel endpoint                                  |

## Acceptance Signal

- The `spider.follows` kind appears in `listKinds()` output (and `GET /api/writ/link-kinds`) with the brief-prescribed description text exactly. Calling `link()` with `kind = 'spider.follows'` succeeds; calling it with `kind = 'spider:follows'` (colon form) is rejected by Clerk's existing validator.
- A writ with one outbound `spider.follows` link to a non-terminal target is not dispatched; once the target reaches `completed` or `cancelled`, the dependent dispatches on the next poll. Conjunctive composition holds: a writ with N outbound `spider.follows` blockers dispatches only when all N are in terminal-success states.
- A writ whose outbound `spider.follows` blocker reaches `failed` is transitioned `open → stuck` with `resolution = "Blocked by failed dependency: <short-id>"` (singular) or `"Blocked by failed dependencies: <short-id>, <short-id>, ..."` (plural), and `status.spider = { stuckCause: 'failed-blocker', blockerIds: [<id>, ...], observedAt: <iso-timestamp> }`.
- A cycle in the `spider.follows` graph is detected during gate evaluation; every cycle member is transitioned `open → stuck` with `resolution = "Cycle detected in spider.follows graph"` and `status.spider = { stuckCause: 'cycle', blockerIds: <cycle-members>, observedAt: <iso-timestamp> }`.
- When all causes recorded in `status.spider.stuckCause` resolve (failed blockers reach success, or the cycle is broken by external action), Spider auto-unsticks the writ on the next poll: phase returns to `open` and the `stuckCause` field is cleared from `status.spider`. A writ stuck by the engine-cascade path (no `status.spider` slot) is never visited by the auto-unstick pass.
- The Oculus writ page renders the add-link form as `[target] [kind▼] [label] [Link]`. The dropdown is populated from `/api/writ/link-kinds` at page init, includes a leading `None` option representing kind-less links, and otherwise lists every registered kind. Submitting a link includes the chosen kind (or omits the field when `None`); a Clerk rejection of the kind surfaces inline on the form rather than as a page-level error.
- `pnpm -w typecheck` and the relevant package test suites pass. `grep -r "status.spider" packages/` shows writes only from Spider's gating code paths and `setWritStatus` callers — no other writers, no engine-cascade write.

## Existing Patterns

- **Kit contributions of load-bearing metadata.** Spider already contributes `blockTypes`, `rigTemplates`, and `rigTemplateMappings` via `supportKit` (see `packages/plugins/spider/src/spider.ts` around line 2031). Clerk already contributes `writTypes`. The `linkKinds` field on `ClerkKit` (`packages/plugins/clerk/src/clerk.ts` around line 59) is the same shape. Registering `spider.follows` is a one-line addition to Spider's existing declaration.
- **The verbatim description text** for `spider.follows`: *"The source writ is a precedence-successor of the target: source cannot be dispatched until the target reaches a terminal state. Consumers define their own policy for what happens on each terminal state."*
- **Reading writs from Spider.** `packages/plugins/spider/src/block-types/writ-phase.ts` reads via `stacks.readBook<WritDoc>('clerk', 'writs').get(id)`. Use the same pattern when inspecting blocker phases during gate evaluation.
- **Phase transitions from Spider.** The existing engine-cascade CDC handler in `spider.ts` (around line 2172) calls `clerk.updateWritPhase(writId, 'stuck', { resolution })`. The new gating stuck transitions follow the same call shape, plus a `setWritStatus(writId, 'spider', { stuckCause, blockerIds, observedAt })` call for provenance. Auto-unstick uses `updateWritPhase(id, 'open')` plus a `setWritStatus(writId, 'spider', { /* cause cleared */ })`.
- **Single-writer status slot.** `ClerkApi.setWritStatus(writId, pluginId, value)` (`clerk.ts` around line 592) performs an atomic read-modify-write that preserves sibling sub-slots. It is the only supported writer for `status.<pluginId>`. Do not write the slot through any other path.
- **Short-id form.** `packages/plugins/ratchet/src/tools/click-tree.ts` line ~18 has the canonical implementation: `id.split('-').slice(0, 2).join('-')`. Replicate inline in Spider; do not introduce a Spider→Ratchet dependency.
- **The Oculus add-link form.** `packages/plugins/clerk/pages/writs/index.html` around line 504 has the existing target/label/Link form. The `doAddLink()` helper around line 758 posts to `/api/writ/link`. The page already has a fetch wrapper around line 158 with inline error surfacing — reuse it.
- **Tool-to-route mapping.** Clerk's `writ-link-kinds` tool is auto-routed to `GET /api/writ/link-kinds` via the Instrumentarium's first-hyphen split convention; no new route registration is needed.
- **Existing test rig.** `packages/plugins/spider/src/spider.test.ts` uses an in-memory fabricator and clerk; the gate-behavior tests should extend this same rig.

## What NOT To Do

- Do not introduce any DB migration, schema sweep, or backfill. The status field is implicit in existing Stacks storage. No existing data carries `kind = 'spider.follows'`, so retroactive cycle scans are moot.
- Do not modify the engine-cascade stuck path (the rigs-book CDC handler that transitions a writ to `stuck` when its rig fails). It must continue to write only `resolution` and never touch `status.spider`. Absence-of-cause is the load-bearing auto-unstick signal.
- Do not introduce a new event-dispatch substrate, scheduler, or tick mechanism. Gating is evaluated on the existing crawl loop only.
- Do not add cycle prevention to Clerk's `link()`. Cycles are Spider's concern, evaluated at walk-time, and surface as stuck conditions.
- Do not transitively cascade stuck within a single poll. Stick only the direct dependent on a failed blocker; the next poll naturally handles writs that depend on the newly-stuck one.
- Do not add a new CLI command, new tool, or new endpoint. The existing `nsg writ link` already supports `--kind`, and `GET /api/writ/link-kinds` already returns the shape the form needs.
- Do not redesign the Oculus add-link form beyond inserting the `kind` dropdown in the prescribed position. Preserve the label input and its existing autocomplete datalist exactly.
- Do not implement the parked open-phase visibility gap (no Oculus writ-table column for gate or stuck state, no rendering of `status.spider` in the writ list). That is a separate future commission.
- Do not refactor `spider.ts` (currently ~2,262 lines) or `index.html` (currently ~1,291 lines). Add the new behavior cleanly within the existing structure; structural refactors are deferred.
- Do not rename Spider's existing `checkBlocked` priority. The naming collision with "gated" dispatch is noted but disambiguated by the new `gated` `CrawlResult` variant (D4).
- Do not change the `resolution` field on auto-unstick. The stale "Blocked by..." text remains on the released writ; this is a known follow-up captured in observations and explicitly out of scope here.
- Do not write `status.spider` while a writ is gated-but-not-stuck. The slot is written only on stuck transitions and cleared on auto-unstick (D1).

<task-manifest>
  <task id="t1">
    <name>Register the spider.follows kind</name>
    <files>packages/plugins/spider/src/spider.ts (supportKit declaration around line 2031); possibly packages/plugins/spider/src/types.ts if a typed export is desired</files>
    <action>Add a `linkKinds` entry to Spider's existing `supportKit` declaration registering the kind id `spider.follows` (dot separator) with the brief's verbatim description. Use whatever shape Clerk's `LinkKindDoc`/`ClerkKit.linkKinds` expects — the implementer reads the existing kit-registry contract and follows it.</action>
    <verify>pnpm --filter @shardworks/plugin-spider typecheck && pnpm --filter @shardworks/plugin-clerk test</verify>
    <done>Booting the guild and calling `listKinds()` (or `GET /api/writ/link-kinds`) returns the new kind with the prescribed description; calling `link()` with `kind: 'spider.follows'` succeeds; the colon form `spider:follows` is rejected by Clerk's existing validator.</done>
  </task>

  <task id="t2">
    <name>Add gated CrawlResult variant and shortId helper</name>
    <files>packages/plugins/spider/src/types.ts (CrawlResult union); a new helper site inside Spider for shortId (location is the implementer's call — likely a small util module or top of the file that uses it)</files>
    <action>Extend the existing `CrawlResult` discriminated union with a new `gated` variant carrying the dependent writ id and the list of non-terminal blocker ids. Inline a three-line `shortId` helper that produces the two-segment form (split on `-`, take the first two segments, rejoin) for use in resolution text. Do not import from Ratchet.</action>
    <verify>pnpm --filter @shardworks/plugin-spider typecheck</verify>
    <done>The new variant is part of the union and exhaustiveness checks at all `CrawlResult` switch sites either remain exhaustive or surface as compile errors that the next task will resolve.</done>
  </task>

  <task id="t3">
    <name>Implement gate evaluation and failed-blocker stuck cascade in trySpawn</name>
    <files>packages/plugins/spider/src/spider.ts (trySpawn around line 1788 and any helpers it grows)</files>
    <action>In `trySpawn`, before invoking `fabricator.spawnRig` for each candidate `open` writ, read the writ's outbound `spider.follows` links and inspect each target's phase. Apply the conjunctive composition rule from D12 and the terminal-state table from D17. Outcomes: (a) all blockers in terminal-success states → fall through to existing dispatch; (b) any non-terminal blocker → emit the new `gated` CrawlResult and skip dispatch (no status write); (c) one or more `failed` blockers → transition the writ `open → stuck` via `clerk.updateWritPhase(id, 'stuck', { resolution })` with the human-readable resolution text per the singular/plural rule, and write `setWritStatus(id, 'spider', { stuckCause: 'failed-blocker', blockerIds, observedAt })`. Use the inline `shortId` helper for the resolution text. Stick only the direct dependent (D14).</action>
    <verify>pnpm --filter @shardworks/plugin-spider typecheck</verify>
    <done>Gate evaluation runs inside the existing crawl loop without changing the crawl priority order; the `gated` variant and the failed-blocker stuck path produce the expected resolution text and `status.spider` shape (verified by t6 tests).</done>
  </task>

  <task id="t4">
    <name>Add cycle detection during gate walk</name>
    <files>packages/plugins/spider/src/spider.ts (gate-evaluation site introduced in t3)</files>
    <action>Within the same per-candidate gate evaluation, run an iterative DFS over outbound `spider.follows` edges using `visiting` (in-stack) and `visited` (fully-explored) sets per D3. On any back-edge, identify the cycle members as the path from the back-edge target to the current node. Transition every cycle member `open → stuck` with `resolution = "Cycle detected in spider.follows graph"` and `setWritStatus(id, 'spider', { stuckCause: 'cycle', blockerIds: <cycle-members>, observedAt })`. The walk must distinguish cycles from diamonds (a diamond is a re-visit through `visited`, not a back-edge through `visiting`).</action>
    <verify>pnpm --filter @shardworks/plugin-spider typecheck</verify>
    <done>A cycle in the spider.follows graph stucks every member with `stuckCause = 'cycle'`; a diamond (multiple paths to the same blocker without a back-edge) does not trigger cycle detection (verified by t6 tests).</done>
  </task>

  <task id="t5">
    <name>Add the autoUnstick crawl phase</name>
    <files>packages/plugins/spider/src/spider.ts (crawl loop and the new phase implementation)</files>
    <action>Insert a new `autoUnstick` phase before `trySpawn` in the crawl loop. The phase reads all writs in `stuck` phase, filters in memory to those whose `status.spider?.stuckCause` is present, and re-evaluates each. For a writ with `stuckCause = 'failed-blocker'`: if every recorded `blockerId` is now in a terminal-success state, transition the writ `stuck → open` and clear the `stuckCause` field via `setWritStatus`. For a writ with `stuckCause = 'cycle'`: if any recorded cycle member has been transitioned out of the cycle (e.g. the cycle is broken by external action), transition the writ `stuck → open` and clear the cause; the next poll will re-evaluate the gate. Writs without `status.spider?.stuckCause` (engine-cascade stucks, operator stucks) are skipped entirely. After this phase runs, `trySpawn` handles only `open` writs.</action>
    <verify>pnpm --filter @shardworks/plugin-spider typecheck</verify>
    <done>A previously gating-stuck writ whose causes resolve transitions back to `open` on the next poll with `stuckCause` cleared; an engine-cascade-stuck writ is never visited by the phase (verified by t6 tests).</done>
  </task>

  <task id="t6">
    <name>Test gate behaviors end-to-end in Spider</name>
    <files>packages/plugins/spider/src/spider.test.ts (extending the existing in-memory fabricator/clerk rig)</files>
    <action>Add tests covering: single-blocker hold/release with `completed` and `cancelled`; conjunctive multi-blocker hold-then-release; failed-blocker stuck with correct singular and plural resolution text and the correct `status.spider` shape (including ISO timestamp and exact blocker ids); cycle detection sticking every cycle member with `stuckCause = 'cycle'`; diamond non-cycle (correctly not flagged as a cycle); auto-unstick on recovery clearing the cause and returning to `open`; the engine-cascade stuck path explicitly not touched by the auto-unstick pass (no `status.spider` slot, never visited); transitive cascade happening across two polls rather than one. Follow the existing test conventions in the file.</action>
    <verify>pnpm --filter @shardworks/plugin-spider test</verify>
    <done>All new tests pass alongside the existing suite; test names map clearly to the acceptance signals.</done>
  </task>

  <task id="t7">
    <name>Add kind dropdown to Oculus add-link form</name>
    <files>packages/plugins/clerk/pages/writs/index.html (form around line 504; doAddLink around line 758; page-init code)</files>
    <action>On page init, fetch `GET /api/writ/link-kinds` once and cache the resulting list. Render a `<select>` element in the add-link form ordered as `[target] [kind▼] [label] [Link]`, with a leading option labeled `None` whose value represents the absent-kind case, followed by one option per registered kind (option text is the kind id; the description is fine as a tooltip but not required). In `doAddLink()`, include the chosen kind id in the POST body when a non-`None` option is selected; omit the `kind` field entirely when `None` is selected. If Clerk responds with a kind-validation error, surface it inline on the form using the existing fetch-error affordance — not as a page-level failure. Preserve the existing label input and its autocomplete datalist exactly. Match the surrounding vanilla-JS style.</action>
    <verify>Boot the guild, open the writ page, and confirm: the dropdown populates with `None` plus the live registered kinds (including `spider.follows`); selecting a kind and submitting creates a link with that kind (verifiable via `nsg writ show <id>` or `GET /api/writ/<id>`); selecting `None` creates a kind-less link; submitting an invalid kind (if forced via dev tools) shows the inline error.</verify>
    <done>The Oculus add-link form supports the full label/kind matrix; the kind dropdown is the only structural change to the form; no broader UX changes were made.</done>
  </task>
</task-manifest>
