# Trial extract — X022 — rig-moj12h4o (substantive, Reckoner periodic tick) baseline (stock artificer.md)

- **Trial id**: `w-mowr4mri-457bfa87eac1`
- **Archive id**: `lar-mowydncn-bf6ff8316bf8`
- **Archived at**: 2026-05-08T13:30:47.543Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-08T13:30:47.648Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mowr4mri-457bfa87eac1
rigId: rig-mowwxc2g-57a4dce8
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
  slug: x022-rig-moj12h4o-baseline
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
        rolePath: /workspace/nexus-mk2/experiments/X022-implementer-behavior-nudges/fixtures/test-guild/roles/artificer-baseline.md
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
  manifestPath: /workspace/nexus-mk2/experiments/X022-implementer-behavior-nudges/manifests/rig-moj12h4o-baseline.yaml
capturedAt: 2026-05-08T13:30:47.435Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x022-rig-moj12h4o-baseline-457bfa87
baseSha: 0e1e81f4a219179fd264625b869e12bd00778365
headSha: 85d9c4edbb0833a48aedd3f6ab3fdbe307779a37
commitCount: 1
totalDiffBytes: 248532
capturedAt: 2026-05-08T13:30:47.488Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-08T13:30:47.537Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
