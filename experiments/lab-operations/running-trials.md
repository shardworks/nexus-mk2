# Laboratory Operations

Operational guidance for running trials through the Laboratory
apparatus (`packages/laboratory/`). This directory captures the
reusable how-to and gotchas — things that recur across experiments
and shouldn't be restated in every spec.

Experiment specs reference this directory; they don't repeat it.

---

## Trial shapes

A "trial shape" is the rig and engine selection used by a manifest.
Different shapes exercise different parts of the system and have
different cost profiles.

### Implement-only

Test guild has the implement pipeline but no planning. Brief is
posted as a `mandate` writ; the Spider's default `mandate → default`
fallback dispatches to `implement`. No astrolabe engines run.

- **Plugin set:** stacks, tools, codexes, clerk, fabricator,
  animator, loom, claude-code, spider, clockworks
- **Engines that run:** draft, implement, review, revise, seal
  (≈5 quick-engine sessions, plus clockwork engines)
- **Cost expectation:** $0.20–$15/trial depending on brief
  complexity (X016 phase 2b ran multiplySafely at $0.28; phase 2c
  ran reckoner-tick at ~$6.50)
- **Used by:** X016 (orientation suppression)

### Spec-only (planning-only)

Test guild has the planning pipeline but stops before
implementation. Brief is posted as a `mandate` writ; astrolabe's
plan-and-ship rig runs through reader-analyst → spec-writer →
plan-finalize. The implement/review/revise/seal stages are
skipped.

- **Status:** not yet exercised. Used first by X018.
- **Plugin set:** implement-only set + astrolabe
- **Engines that run:** plan-init, draft, reader-analyst,
  inventory-check, patron-anima (no-op without patronRole),
  decision-review, spec-writer, plan-finalize
- **How to halt the rig before implement:** options under
  evaluation (see [Planning-only rig](#planning-only-rig) below)
- **Cost expectation:** $5–$15/trial — dominated by the
  reader-analyst session (~$6.50 at the two we measured); the
  spec-writer adds a smaller increment
- **Used by:** X018 (package surface map injection),
  X019 (reverse usage index)

### Plan-and-ship (full pipeline)

End-to-end trial with both planning and implementation. The
plan-and-ship rig runs as in production. Most expensive shape; use
when you need to measure end-to-end cost or quality, or when
planning and implementation interact in the variable being tested.

- **Plugin set:** implement-only set + astrolabe
- **Cost expectation:** sum of spec-only + implement-only
  ($10–$30/trial typical)
- **Used by:** none yet; reserved for future experiments measuring
  end-to-end planning impact

---

## Standard plugin sets

### Implement-only

```yaml
plugins:
  - { name: '@shardworks/stacks-apparatus', version: '<pinned>' }
  - { name: '@shardworks/tools-apparatus', version: '<pinned>' }
  - { name: '@shardworks/codexes-apparatus', version: '<pinned>' }
  - { name: '@shardworks/clerk-apparatus', version: '<pinned>' }
  - { name: '@shardworks/fabricator-apparatus', version: '<pinned>' }
  - { name: '@shardworks/animator-apparatus', version: '<pinned>' }
  - { name: '@shardworks/loom-apparatus', version: '<pinned>' }
  - { name: '@shardworks/claude-code-apparatus', version: '<pinned>' }
  - { name: '@shardworks/spider-apparatus', version: '<pinned>' }
  - { name: '@shardworks/clockworks-apparatus', version: '<pinned>' }
```

### Spec-only (planning)

Implement-only set + `@shardworks/astrolabe-apparatus`. Astrolabe
needs to come **after** clerk/stacks/spider in the topo (it
declares them as `requires`).

---

## Framework version pinning

Trials pin to a published `@shardworks/nexus` version on the test
guild. The lab-host (sanctum-side) runs from monorepo source.

**Version selection:** start from the most recently published
version that includes the engines and plugins your trial needs.
Don't pin to bleeding-edge unless your manifest specifically
exercises a feature only in that version.

**Recording the pin:** every manifest carries `frameworkVersion:
'<pin>'` at the top level. The `lab.probe-trial-context` probe
captures the resolved framework SHA at runtime so you know what
actually ran.

---

## Framework changes for experiments

When an experiment requires modifications to the nexus framework
itself — new engines, new plugin code, new tools, modified role
prompts that aren't reachable via test-guild config alone — the
canonical path is **manual prerelease publish to public npm from
an experiment branch.**

Local-file installs are explicitly **not** a path: trials must be
reproducible from the artifact alone, and a path on the author's
disk fails that bar.

### Why prerelease versions

The framework auto-publishes patch releases on every merge to
`main` (`.github/workflows/publish.yml`). Prerelease versions
(`0.1.295-x019.0`) are valid semver, install via the same
mechanisms, but never move npm's `latest` tag — so production
installs are unaffected. Once published, prereleases live on npm
permanently and can be cited from experiment artifacts.

### Branch and version conventions

- **Branch name:** `experimental/<experiment-id>-<short-desc>`
  (e.g., `experimental/x019-code-lookup`)
- **Prerelease version:** `<next-patch>-<experiment-id>.<n>`
  where `<next-patch>` is the version that *would* be released if
  the branch merged to main, and `<n>` increments per publish.
  Example: if latest tag is `v0.1.294`, prereleases for X019 are
  `0.1.295-x019.0`, `0.1.295-x019.1`, etc. When the branch later
  merges to main, the auto-publish workflow ships `0.1.295` as
  the production release; npm orders prereleases as strictly less
  than the release, so the prereleases remain installable as
  historical artifacts.
- **Dist-tag:** publish with `--tag experimental`. This keeps `latest` pointing at the production release.

### Publish workflow

Use `bin/publish-experimental.ts` in the sanctum repo. The script:

- Clones the nexus repo to a tmp directory at the requested branch
  (never touches `/workspace/nexus`'s working tree)
- Derives the experiment id from the branch name (or takes
  `--experiment <x###>` if branch parsing isn't viable)
- Queries npm for existing prereleases under the relevant base
  version + experiment id and picks the next increment
  automatically (no manual counter to track)
- Mirrors the CI publish workflow: injects the computed version
  into every workspace `package.json` in the tmp clone, runs
  install/build/typecheck/test, publishes with
  `--tag experimental`
- Cleans up the tmp clone on exit (use `--keep` to retain for
  debugging)
- Prints a ready-to-paste manifest snippet (frameworkVersion +
  full plugin list) on success

```bash
cd /workspace/nexus-mk2
npx tsx bin/publish-experimental.ts --branch experimental/x019-code-lookup
```

Flags:

- `--branch <name>` — (required) branch in the nexus repo to
  publish from
- `--experiment <x###>` — override the experiment id (default:
  derive from the branch name)
- `--skip-checks` — skip typecheck + test, still build (use only
  when you've just run them manually and want a faster republish)
- `--yes` / `-y` — skip the confirmation prompt
- `--keep` — keep the tmp clone dir on exit (for debugging)

Auth requirements:

- npm publish access to the `@shardworks` scope (request from
  the org owner if missing)
- `~/.npmrc` configured with
  `//registry.npmjs.org/:_authToken=<token>`
- `npm whoami` should succeed before running the script
- 2FA: use an automation token (`npm token create --automation`)
  if your account requires 2FA on publish

### Pinning in the trial manifest

The published prerelease version is what the manifest pins to:

```yaml
frameworkVersion: '0.1.295-x019.0'

fixtures:
  - id: test-guild
    engineId: lab.guild-setup
    givens:
      plugins:
        - { name: '@shardworks/stacks-apparatus', version: '0.1.295-x019.0' }
        - { name: '@shardworks/clerk-apparatus', version: '0.1.295-x019.0' }
        # ... all packages pin to the same prerelease version
```

All workspace packages publish in lockstep with the same version,
so all plugin pins should reference that single version. Mixing
production and prerelease versions across plugins is a recipe for
peer-dep mismatches.

### Iterating on a branch

Each push that needs a new published artifact gets a new
prerelease version. Increment `<n>`:

- First publish: `0.1.295-x019.0`
- Second publish: `0.1.295-x019.1`
- Third publish: `0.1.295-x019.2`

Update the manifest's pinned versions to match the latest publish.
Older prerelease versions remain installable indefinitely, which
is desirable — past trial runs can be reproduced exactly.

### After the experiment concludes

- **If the framework changes are worth keeping:** merge the
  experiment branch into `main` via the normal review process. The
  auto-publish workflow ships the next production release
  (`0.1.295`) which supersedes the prereleases.
- **If the framework changes are dropped:** delete the experiment
  branch. Prerelease versions remain on npm permanently — that's
  fine, they're cited by the experiment's published artifacts.

Do not `npm unpublish` prerelease versions after the fact. They
are part of the experiment's audit trail.

---

## Known gotchas

### Spider 0.1.292 ordering bomb

`spider.start()` calls `g.apparatus('animator')` but only declares
`requires=[stacks, clerk, fabricator]`. If the plugin list orders
spider before animator, startup fails.

**Workaround:** in 0.1.292 manifests, order plugins so animator
(and loom, claude-code) come **before** spider/clockworks.

**Status:** fixed upstream at framework `acd2037` (post-0.1.292).
Future framework pins should not need this workaround.

### `lab.probe-git-range` diff-stats bug

Pre-fix, the probe reported `filesChanged: 0, insertions: 0,
deletions: 0` even when commits had real content.

**Status:** fixed at sanctum `20b857ee`. Restart the daemon between
trials to pick up the fix in long-lived test environments.

### `lab.commission-post-xguild` poll loop

Pre-fix, this scenario engine called `nsg writ-show` (does not
exist) instead of `nsg writ show`. Only triggered by
`waitForTerminal: true`.

**Status:** fixed in scenario-xguild.ts. If you see "command not
found" errors in the scenario engine logs, you're on a stale
laboratory version.

---

## Codex selection

Two patterns for choosing the codex a trial runs against:

### Replay an existing rig

Pin the codex to a real commit history from a prior production
rig. Pros: real complexity, comparable behavior, ground-truth
costs to compare against. Cons: requires the production rig to
have produced clean intermediate states, or a synthesized
midpoint commit (X016 phase 2c partitioned a single mega-commit
into a synthetic checkpoint).

**Use when:** measuring an intervention against a known baseline,
or replaying behavior we've already studied.

### Synthetic / fresh commission

Author a small, focused brief specifically for the trial. Pros:
controllable size, easy to reason about, calibration-friendly.
Cons: doesn't exercise real complexity; results may not generalize.

**Use when:** apparatus calibration, sanity checks, or testing
against a deliberately small surface to control cost.

### Codex pin discipline

The local-bare codex flow tolerates unpushed commits — synthetic
checkpoint branches that exist only locally on `/workspace/nexus`
work fine for trials. **Do not delete** these branches if reruns
are wanted (cf. X016's `x016-phase-2c-checkpoint`).

---

## Planning-only rig

The Astrolabe `plan-and-ship` rig template is monolithic — it
runs through implement+review+revise+seal after planning
completes. For spec-only trials we override it with a custom
template scoped to stages 1–9 (plan-init through observation-lift,
omitting implement → seal).

The override goes in the trial manifest's `config.spider` block.
Spider's `rigTemplateMappings` from manifest config takes
precedence over the astrolabe plugin's kit-contributed
`mandate → astrolabe.plan-and-ship` mapping
(see `SpiderConfig` in `packages/plugins/spider/src/types.ts`),
so no upstream changes are needed.

### Recipe — copy this into the manifest's `config.spider` block

```yaml
config:
  spider:
    rigTemplates:
      lab.plan-only:
        engines:
          - id: plan-init
            designId: astrolabe.plan-init
            upstream: []
            givens:
              writ: '${writ}'
          - id: draft
            designId: draft
            upstream: [plan-init]
            givens:
              writ: '${writ}'
          - id: reader-analyst
            designId: astrolabe.reader-analyst
            upstream: [draft]
            givens:
              prompt: 'Plan ID: ${yields.plan-init.planId}'
              cwd: '${yields.draft.path}'
              writ: '${writ}'
              metadata:
                engineId: reader-analyst
          - id: inventory-check
            designId: astrolabe.inventory-check
            upstream: [reader-analyst]
            givens:
              planId: '${yields.plan-init.planId}'
          - id: patron-anima
            designId: astrolabe.patron-anima
            upstream: [inventory-check]
            givens:
              planId: '${yields.plan-init.planId}'
              cwd: '${yields.draft.path}'
              writ: '${writ}'
          - id: decision-review
            designId: astrolabe.decision-review
            upstream: [patron-anima]
            givens:
              planId: '${yields.plan-init.planId}'
          - id: spec-writer
            designId: anima-session
            upstream: [decision-review]
            givens:
              role: astrolabe.sage-writer
              prompt: |
                Plan ID: ${yields.plan-init.planId}

                Decision summary:
                ${yields.decision-review.decisionSummary}
              cwd: '${yields.draft.path}'
              writ: '${writ}'
              metadata:
                engineId: spec-writer
          - id: plan-finalize
            designId: astrolabe.plan-finalize
            upstream: [spec-writer]
            givens:
              planId: '${yields.plan-init.planId}'
          - id: observation-lift
            designId: astrolabe.observation-lift
            upstream: [plan-finalize]
            givens:
              planId: '${yields.plan-init.planId}'
        resolutionEngine: observation-lift
    rigTemplateMappings:
      mandate: lab.plan-only
```

### What this gets you

- A `mandate` writ posted into the test guild dispatches to
  `lab.plan-only` (config mapping wins over the kit-contributed
  `astrolabe.plan-and-ship`).
- Stages 1–9 run identically to plan-and-ship: PlanDoc populated,
  inventory + scope + decisions + observations written by the
  reader-analyst, patron-anima principle-checks, decision-review
  fast-paths or blocks, spec-writer produces the spec, plan-finalize
  closes the plan, observation-lift fans out draft observation
  writs.
- The rig completes when `observation-lift` succeeds. No
  implement/review/revise/seal runs. The mandate writ does **not**
  reach `completed` because `seal` is not in this template's
  resolutionEngine path — that's a deliberate trade-off for
  spec-only trials.

### Caveats

- **Mandate writ status.** Without `seal`, the originating
  `mandate` writ never transitions out of `open`. For trials this
  is fine (we only care about reader-analyst metrics), but it
  means the writ is left in a state that production lifecycle
  expectations would treat as "stalled." If a probe asserts
  terminal-state for the mandate writ, the assertion fails — use
  `waitForTerminal: false` or wait on the rig's terminal state
  instead of the writ's.
- **`patron-anima` no-ops without a configured patron role.** If
  the test guild does not set `astrolabe.patronRole`, the
  patron-anima engine no-ops cleanly and decision-review proceeds
  with primer-set selections. For spec-only trials this matches
  the production "primer pre-fills, no patron review" behavior
  from `sage-primer-solo`. To exercise the attended path
  (`sage-primer-attended` + patron-anima + decision-review block),
  configure `astrolabe.patronRole` in the test guild's astrolabe
  config and ensure the configured role is registered.
- **`decision-review` may block on patron input.** When the
  attended path is exercised and the patron-anima leaves
  decisions abstained, decision-review opens a `patron-input`
  block. The trial's scenario engine has to either (a) supply
  pre-canned answers via the input-requests book or (b) configure
  the test guild so all decisions are pre-decided (the fast-path
  closes decision-review without blocking). For initial trials,
  prefer (b) — supply a guild config that pre-decides everything.

### When to deviate from the recipe

- **Drop `observation-lift`** if your trial does not exercise
  observation fan-out. Update `resolutionEngine` to
  `plan-finalize` and remove the observation-lift engine entry.
- **Drop `patron-anima` and `decision-review`** if your trial
  uses the solo primer path and you want to skip the (no-op)
  patron-anima and the (fast-path) decision-review entirely.
  Wire `spec-writer.upstream` to `[inventory-check]` and remove
  the dropped engines.
- **Add custom engines** by inserting them in the chain with
  appropriate `upstream` references. The lab guild's spider
  validates the DAG at rig-spawn time.

---

## References

- `packages/laboratory/README.md` — apparatus authoring guide
- `experiments/X016-orientation-suppression/spec.md` —
  implement-only trial worked example
- `experiments/X018-*` — first spec-only trials
