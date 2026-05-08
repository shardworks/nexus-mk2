# Trial extract — X024 — rig-moj12h4o (substantive, Reckoner periodic tick) turn-discipline variant

- **Trial id**: `w-mox34okl-6a632565eb7c`
- **Archive id**: `lar-moxd4euf-5b41ed27f1f7`
- **Archived at**: 2026-05-08T20:23:30.856Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-08T20:23:31.033Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mox34okl-6a632565eb7c
rigId: rig-mox6cifk-832bd6fc
rigTemplate: null
labHostFrameworkVersion: 0.0.0
labHostPluginsInstalled:
  - animator
  - astrolabe
  - claude-code
  - clerk
  - clockworks
  - codexes
  - fabricator
  - laboratory
  - lattice
  - lattice-discord
  - loom
  - oculus
  - parlour
  - ratchet
  - spider
  - stacks
  - tools
manifestSnapshot:
  slug: x024-rig-moj12h4o-turn-discipline
  frameworkVersion: 0.1.304
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/nexus
        baseSha: 0e1e81f4a219179fd264625b869e12bd00778365
    - id: codex-checkout
      engineId: lab.codex-checkout
      givens:
        bareLocalPath: ${yields.fixture-codex-setup.bareLocalPath}
        baseSha: 0e1e81f4a219179fd264625b869e12bd00778365
        codexName: ${yields.fixture-codex-setup.codexName}
      dependsOn:
        - codex
  scenario:
    engineId: spider.graft-rig-template
    givens:
      template: laboratory.claude-direct-monolithic
      givens:
        rolePath: /workspace/nexus-mk2/experiments/X024-implementer-turn-discipline/fixtures/test-guild/roles/artificer-turn-discipline.md
        briefPath: /workspace/nexus-mk2/experiments/X022-implementer-behavior-nudges/briefs/rig-moj12h4o-baseline.md
        model: opus
        executionWrap: production
        cwd: ${yields.fixture-codex-checkout-setup.workdir}
        verifyCommand: >
          set -e

          pnpm --filter @shardworks/reckoner-apparatus --filter
          @shardworks/clockworks-apparatus build

          pnpm --filter @shardworks/reckoner-apparatus --filter
          @shardworks/clockworks-apparatus test

          git push origin HEAD:main
        verifyTimeoutMs: 600000
  probes:
    - id: context
      engineId: lab.probe-trial-context
      givens: {}
    - id: commits
      engineId: lab.probe-git-range
      givens: {}
    - id: sessions
      engineId: lab.probe-trial-sessions
      givens: {}
  archive:
    engineId: lab.archive
    givens: {}
  manifestPath: /workspace/nexus-mk2/experiments/X024-implementer-turn-discipline/manifests/rig-moj12h4o-turn-discipline.yaml
capturedAt: 2026-05-08T20:23:30.689Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x024-rig-moj12h4o-turn-discipline-6a632565
baseSha: 0e1e81f4a219179fd264625b869e12bd00778365
headSha: 21a842a93ec2c4f78f9d14272ab444ae321f6f90
commitCount: 1
totalDiffBytes: 233399
capturedAt: 2026-05-08T20:23:30.745Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-08T20:23:30.851Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
