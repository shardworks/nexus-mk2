# Combined planning+implementation rig for briefs

## Intent

Collapse the current two-writ brief→mandate pipeline into a single rig that carries a brief writ from patron-posted intent through planning, decision review, spec drafting, implementation, review, revise, and seal — without posting a mandate writ. Relocate the mandate-dispatch template and mapping out of `guild.json` into Spider as plugin-level defaults so both paths work with zero guild configuration.

## Rationale

Today a brief writ reaches `completed` when the planning rig's `seal(abandon)` finishes, which is before any implementation work happens. Any other writ that declares `blocked_by` on the brief unblocks too early — the feature isn't shipped yet. Collapsing the pipeline so the brief writ itself reaches `completed` only when the implementation phase's final seal succeeds restores correct dependency gating and is the motivating fix for this commission. The guild.json-to-plugin-default relocation is a parallel hygiene move that makes Spider self-sufficient for mandate dispatch and removes configuration that operators currently have to copy verbatim.

## Scope & Blast Radius

This commission touches three plugins plus the repository root and tests:

- **Astrolabe plugin** — contributes one new rig template `astrolabe.plan-and-ship` and one new engine `plan-finalize`. Its `supportKit.rigTemplateMappings.brief` entry flips from `astrolabe.two-phase-planning` to the new combined rig. The existing `spec-publish` engine and the `astrolabe.two-phase-planning` / `astrolabe.three-phase-planning` rig templates are unchanged — the old mandate-posting path must continue to work exactly as today.
- **Spider plugin** — contributes its first `supportKit.rigTemplates` entry (`default`, the current `draft → implement → review → revise → seal` template) and its first `supportKit.rigTemplateMappings` entry (`mandate → default`). The `implement` engine gains an optional `prompt` given that overrides its default `writ.body + EXECUTION_EPILOGUE` assembly.
- **Repository `guild.json`** — drops `spider.rigTemplates.default` and `spider.rigTemplateMappings.mandate`; `spider.variables` and operational tuning entries stay.

Cross-cutting concerns the implementer must audit independently:

- **Spider-to-Astrolabe spec handoff contract**: the combined rig wires `implement.givens.prompt` to `${yields.plan-finalize.spec}`. Verify the Fabricator's yields-interpolation handles a missing/empty spec case sensibly (fail-loud, consistent with D7). Confirm every engine in the combined rig's sequence reads from the single shared draft via `upstream['draft']` correctly.
- **No mandate writ posted on the combined-rig path**: audit every engine invoked by the combined rig for any `clerk.post` call that could land a mandate. Verify with `grep` across both plugins for `clerk.post` and `type: 'mandate'`.
- **Plugin-default precedence preservation**: guilds that still carry `spider.rigTemplates.default` or `spider.rigTemplateMappings.mandate` in their guild.json must continue to see their override win over Spider's new plugin default. Verify by reviewing `RigTemplateRegistry` precedence logic and confirming its test coverage still passes after Spider starts contributing defaults.
- **Zero-config dispatch paths**: both a brief writ (via Astrolabe's new default mapping) and a mandate writ (via Spider's new default mapping) must dispatch successfully in a guild whose `guild.json` declares only `spider.variables`. Verify with dedicated fixture-level tests.
- **Test-fixture cleanup surface**: the `buildFixture` helper in `packages/plugins/spider/src/spider.test.ts` injects `{mandate: 'default'}` into every test's guild config. Per D8 this injection is removed; the implementer must confirm every test that relied on that mapping either now works on Spider's plugin default or declares its own override explicitly.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | Combined rig template identifier | `astrolabe.plan-and-ship` | Semi-public operator vocabulary; emphasises the two-phase nature. |
| D2 | Engine sequence | plan-init → draft → reader-analyst → inventory-check → decision-review → spec-writer → plan-finalize → implement → review → revise → seal | Mirrors the current two-phase planning default; single shared draft; fused reader-analyst. |
| D3 | Spec handoff mechanism | `implement` engine gains optional `prompt` given; `plan-finalize` yields `spec`; template wires `prompt: '${yields.plan-finalize.spec}'` | Keeps Spider agnostic of Astrolabe; reuses existing yields-interpolation. |
| D4 | Planning-phase terminator | New `plan-finalize` engine in Astrolabe that reads `plandoc.spec`, yields it, and patches `plan.status` to `completed` without posting a mandate. `spec-publish` stays unchanged. | Old two-phase-planning rig behaviour is preserved; the new engine has a single responsibility. |
| D5 | Implementation-phase engine | `implement` (not `implement-loop`) | Briefs don't have piece children in the current model. |
| D6 | Worktree strategy | One shared draft engine at the start of the rig; every downstream engine reads the same `upstream['draft']`; final seal is real (not abandon). | Collapses worktree operations; matches one-writ-throughout principle. |
| D7 | Fallback defaults for `${vars.role}` / `${vars.buildCommand}` / `${vars.testCommand}` in Spider's plugin-default template | No fallbacks — the template throws if any var is undefined at dispatch. | Preserves current fail-loud behaviour; vars-missing is misconfiguration worth surfacing. |
| D8 | Test-fixture auto-injection of `{mandate: 'default'}` in `buildFixture` | Delete it. Tests rely on Spider's plugin default; tests that need an override declare their own. | Prefer removal to deprecation; keeping stale test machinery confuses future readers. |

## Acceptance Signal

- `pnpm -w typecheck` and `pnpm -w test` (or the repository's canonical equivalents — confirm by reading `package.json` scripts) both pass with no new warnings.
- A new end-to-end test for the combined rig exercises brief → seal in a single writ: no mandate writ is created anywhere in the test fixture's clerk, and the brief writ reaches `phase: 'completed'` only after the implementation-phase seal succeeds.
- A new end-to-end test for dependency gating: a second writ declaring `blocked_by` on a brief stays blocked until the brief reaches `completed`, and that completion only occurs after implementation seal.
- A new end-to-end test for the old `astrolabe.three-phase-planning` rig confirms it is still reachable via explicit mapping and still posts a mandate writ.
- A new forward-looking test constructs a guild fixture with no `spider.rigTemplates` or `spider.rigTemplateMappings` and confirms a posted mandate writ dispatches successfully against Spider's plugin-default `default` template.
- `grep -r` across both plugins shows no engine in the combined rig's sequence calls `clerk.post` with a mandate type.
- `guild.json` contains `spider.variables` and any operational tuning but no `spider.rigTemplates` or `spider.rigTemplateMappings` entries.

## Existing Patterns

- **Rig template contribution shape**: `packages/plugins/astrolabe/src/two-phase-planning.ts` and `three-phase-planning.ts` show the registered-template pattern — a single exported `RigTemplate` consumed by the plugin's `supportKit.rigTemplates` map.
- **Plugin-default mapping**: `packages/plugins/astrolabe/src/astrolabe.ts` currently contributes `rigTemplateMappings: { brief: 'astrolabe.two-phase-planning' }`. Spider's new mapping follows the same shape.
- **Engine reuse across rigs**: Spider's `draft`, `implement`, `review`, `revise`, `seal` engines are consumed by templates via engine-ids; the combined rig reuses them identically to the current `default` template. Astrolabe's `plan-init`, `inventory-check`, `decision-review`, `spec-writer` engines are consumed by the existing planning rigs and are reused by the combined rig.
- **Engine that reads plandoc and yields**: `packages/plugins/astrolabe/src/engines/spec-publish.ts` today reads `plandoc.spec` and mutates PlanDoc status; the new `plan-finalize` engine follows a similar read-and-patch pattern minus the `clerk.post` call, plus yields the spec for downstream consumption.
- **Upstream key contract**: `packages/plugins/spider/src/engines/implement.ts` (and `review`, `revise`, `seal`) read `context.upstream['draft']` by literal string key — the combined rig's draft engine must be named `'draft'` to match.
- **Yields-based prompt interpolation**: existing planning rigs already use `${yields.engineId.field}` interpolation (e.g., `spec-writer`'s prompt template references `${yields.plan-init.planId}` and `${yields.decision-review.decisionSummary}`) — the same mechanism wires the new `prompt` given.

## What NOT To Do

- Do **not** modify `astrolabe.two-phase-planning` or `astrolabe.three-phase-planning` rig templates. They must remain byte-identical to today so guilds that explicitly map to them continue to get the same mandate-posting behaviour.
- Do **not** modify `spec-publish.ts`. Its behaviour (unconditional mandate post, `refines` link, PlanDoc `completed` transition) must stay exactly as today.
- Do **not** delete or deprecate `AstrolabeConfig.generatedWritType` even though it becomes unreached for the default brief path — it's still used by the old two-phase rig, and cleanup is a separate commission.
- Do **not** register a `refines` link kind or change any link-creation logic; `refines` is out of scope per observations.
- Do **not** promote Spider from `recommends` to `requires` in Astrolabe's apparatus dependencies; the `anima-session` coupling is a known observation but outside this commission.
- Do **not** add configurability to the `upstream['draft']` contract; literal-key coupling stays per observations.
- Do **not** widen the `prompt` override surface to `review` or `revise`; only `implement` needs it for this commission.
- Do **not** introduce a `planId` given on Spider's `implement` engine that reaches into Astrolabe's books — D3 explicitly rejected the Spider→Astrolabe coupling option.
- Do **not** supply fallback defaults for `${vars.role}`, `${vars.buildCommand}`, or `${vars.testCommand}` in Spider's plugin-default template (D7).
- Do **not** migrate or touch in-flight brief writs; the old planning rig stays registered and existing rigs continue to run.

<task-manifest>
  <task id="t1">
    <name>Add plan-finalize engine to Astrolabe</name>
    <files>packages/plugins/astrolabe/src/engines/plan-finalize.ts (new); packages/plugins/astrolabe/src/astrolabe.ts (engine registration); packages/plugins/astrolabe/src/types.ts (if yields shape needs declaring)</files>
    <action>Introduce a new Astrolabe engine that asserts `plan.status === 'writing'`, reads `plandoc.spec`, yields the spec content under a clearly-named field, and patches the PlanDoc to `status: 'completed'`. It must not post any writ and must not create any clerk links. Follow the registration and export patterns used by the existing Astrolabe engines in `packages/plugins/astrolabe/src/engines/`. The engine's given signature should be minimal — a `planId` reference is the only input it needs (sourced from the plan-init yield in the rig template). Fail loudly if `plandoc.spec` is empty or missing rather than yielding an empty string.</action>
    <verify>pnpm -w typecheck</verify>
    <done>Engine is registered and typechecks; no existing tests regress.</done>
  </task>

  <task id="t2">
    <name>Add prompt override to Spider's implement engine</name>
    <files>packages/plugins/spider/src/engines/implement.ts; packages/plugins/spider/src/types.ts (if given shape is declared there)</files>
    <action>Extend the `implement` engine's givens to accept an optional `prompt` field. When `prompt` is provided, use it verbatim (still appending the existing `EXECUTION_EPILOGUE`) in place of `writ.body`. When absent, the engine's behaviour is byte-identical to today. Update any engine given type declarations accordingly. Do not extend `implement-loop`, `review`, or `revise`; only `implement` gets the override.</action>
    <verify>pnpm -w typecheck; pnpm -w test --filter spider</verify>
    <done>Existing spider implement tests still pass; the new optional given is exposed and respected.</done>
  </task>

  <task id="t3">
    <name>Register combined rig template in Astrolabe</name>
    <files>packages/plugins/astrolabe/src/plan-and-ship.ts (new — name matches the template's unqualified identifier); packages/plugins/astrolabe/src/astrolabe.ts (supportKit)</files>
    <action>Create the new rig template exporting the engine sequence from D2: plan-init → draft → reader-analyst → inventory-check → decision-review → spec-writer → plan-finalize → implement → review → revise → seal. The `draft` engine is shared across both phases (D6); every downstream engine's `upstream` references the single `'draft'` engine id. The `implement` engine's givens include `prompt: '${yields.plan-finalize.spec}'` (plus the existing `writ` and `role` givens that today's default template passes). The `seal` engine does NOT pass `abandon: true` — the seal is real. `resolutionEngine` should point to the engine whose yield is semantically the rig's result (follow the pattern of existing rigs). Register the template under Astrolabe's `supportKit.rigTemplates` so its fully-qualified name is `astrolabe.plan-and-ship`.</action>
    <verify>pnpm -w typecheck</verify>
    <done>The template is registered, the rig's engine sequence references only existing engine designIds (including the new plan-finalize), and typechecks.</done>
  </task>

  <task id="t4">
    <name>Flip Astrolabe's plugin-default brief mapping</name>
    <files>packages/plugins/astrolabe/src/astrolabe.ts</files>
    <action>In Astrolabe's `supportKit.rigTemplateMappings`, change the value for the `brief` key from `'astrolabe.two-phase-planning'` to `'astrolabe.plan-and-ship'`. Leave `astrolabe.two-phase-planning` and `astrolabe.three-phase-planning` registered in `rigTemplates` — they remain reachable via explicit guild-config mapping.</action>
    <verify>pnpm -w typecheck; pnpm -w test --filter astrolabe</verify>
    <done>Default brief dispatch points at the combined rig; existing two-phase and three-phase templates remain registered.</done>
  </task>

  <task id="t5">
    <name>Relocate Spider default template and mapping to plugin defaults</name>
    <files>packages/plugins/spider/src/spider.ts (supportKit); packages/plugins/spider/src/default-template.ts (new — optional, matches Astrolabe's per-template file convention); guild.json (at repo root)</files>
    <action>Add Spider's first `supportKit.rigTemplates` entry: the `default` template with engines `draft → implement → review → revise → seal`, identical in shape to today's `guild.json` inline version. Givens reference `${vars.role}`, `${vars.buildCommand}`, `${vars.testCommand}` directly with no fallbacks (D7). Add Spider's first `supportKit.rigTemplateMappings` entry: `{ mandate: 'default' }`. Then remove `spider.rigTemplates.default` and `spider.rigTemplateMappings.mandate` from the repository root's `guild.json`. Leave `spider.variables` and any operational tuning entries untouched.</action>
    <verify>pnpm -w typecheck; pnpm -w test --filter spider; grep -E '"rigTemplates"|"rigTemplateMappings"' guild.json (should return nothing under spider.*)</verify>
    <done>Spider contributes the default template and mandate mapping as plugin defaults; the repository guild.json no longer declares them.</done>
  </task>

  <task id="t6">
    <name>Clean up test fixture auto-injection</name>
    <files>packages/plugins/spider/src/spider.test.ts</files>
    <action>Remove the `{mandate: 'default'}` auto-injection from the `buildFixture` helper (around lines 146-176 per inventory). Any test that was implicitly relying on the injection must now either (a) work against Spider's plugin default — which it should, since the plugin default supplies the same mapping — or (b) declare its own explicit override if the test exercises a non-default mapping. Audit every call site of `buildFixture` to confirm the right outcome.</action>
    <verify>pnpm -w test --filter spider</verify>
    <done>buildFixture no longer injects rig-template mapping config; all existing spider tests still pass.</done>
  </task>

  <task id="t7">
    <name>End-to-end tests for the combined rig</name>
    <files>packages/plugins/astrolabe/src/plan-and-ship.test.ts (new); test fixtures under packages/plugins/astrolabe/ as needed</files>
    <action>Add end-to-end coverage for three scenarios: (1) happy path — post a brief writ, run the combined rig to completion, assert that the brief writ reaches `phase: 'completed'` only after implementation seal succeeds and that no mandate-type writ exists in the clerk at any point; (2) dependency gating — a second writ declares `blocked_by` on the brief, and that writ remains blocked until the brief completes; (3) three-phase-planning still reachable — a guild config explicitly maps `brief` to `astrolabe.three-phase-planning`, post a brief, confirm the old rig runs and produces a mandate writ. Follow the fixture and assertion patterns established in existing `two-phase-planning.test.ts`.</action>
    <verify>pnpm -w test --filter astrolabe</verify>
    <done>All three scenarios pass; the combined rig's happy path, its dependency gating, and the old rig's explicit-mapping reachability are all covered.</done>
  </task>

  <task id="t8">
    <name>Forward-looking test for zero-config mandate dispatch</name>
    <files>packages/plugins/spider/src/spider.test.ts (or a sibling file)</files>
    <action>Add a test that constructs a guild fixture whose config declares `spider.variables` but no `spider.rigTemplates` and no `spider.rigTemplateMappings`, then posts a mandate-type writ and asserts that Spider's plugin-default `default` template dispatches and runs to seal. Verify that removing the test-fixture auto-injection (t6) doesn't hide this scenario — this test must not depend on any injected mapping.</action>
    <verify>pnpm -w test --filter spider</verify>
    <done>Zero-config mandate dispatch is covered by a dedicated test that would fail if Spider's plugin defaults regress.</done>
  </task>

  <task id="t9">
    <name>Update operator docs and guild scratch notes</name>
    <files>nexus/guild/*.md (or equivalent); any README/operator-notes that reference `spider.rigTemplates` or `spider.rigTemplateMappings` as required guild.json configuration</files>
    <action>Audit guild-content scratch notes and any operator-facing documentation that describes `spider.rigTemplates.default` or `spider.rigTemplateMappings.mandate` as required guild.json configuration. Update to describe them as overrides over Spider's plugin defaults — guilds configure these entries only when they want to deviate from the default template or mapping. Also update any doc that asserts a brief writ's lifecycle ends at the planning rig's seal to reflect that briefs now complete at implementation seal under the new default mapping. Do not touch documentation that describes the old two-phase-planning rig's mandate-posting behaviour as a reachable option — that is still accurate.</action>
    <verify>grep -rE 'spider\.rigTemplates|spider\.rigTemplateMappings' nexus/guild/ docs/ README.md 2>/dev/null (review each hit and confirm it reflects override semantics, not required-configuration semantics)</verify>
    <done>No operator-facing doc describes the relocated entries as required; all references are framed as overrides over Spider's plugin defaults; brief-writ lifecycle descriptions align with the combined rig.</done>
  </task>
</task-manifest>
