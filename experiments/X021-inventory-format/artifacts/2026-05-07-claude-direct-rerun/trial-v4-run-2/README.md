# Trial extract — X021 v4 — Reckoner periodic-tick replay (combined

- **Trial id**: `w-movyxblt-36cb197a0292`
- **Archive id**: `lar-mow09wtc-f8d2a55c138d`
- **Archived at**: 2026-05-07T21:36:06.240Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-07T21:36:06.346Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-movyxblt-36cb197a0292
rigId: rig-movyxdue-c4431d5f
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
  slug: x021-rig-moj12h4o-v4-combined
  frameworkVersion: 0.1.304
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/nexus
        baseSha: b92dc90502dc0e38a92012cbd238c9eae0e65b0d
    - id: codex-checkout
      engineId: lab.codex-checkout
      givens:
        bareLocalPath: ${yields.fixture-codex-setup.bareLocalPath}
        baseSha: b92dc90502dc0e38a92012cbd238c9eae0e65b0d
        codexName: ${yields.fixture-codex-setup.codexName}
      dependsOn:
        - codex
  scenario:
    engineId: spider.graft-rig-template
    givens:
      template: laboratory.claude-direct-monolithic
      givens:
        rolePath: /workspace/nexus-mk2/experiments/X021-inventory-format/fixtures/test-guild/roles/artificer.md
        briefPath: /workspace/nexus-mk2/experiments/X021-inventory-format/briefs/rig-moj12h4o-v4-combined.md
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
  manifestPath: /workspace/nexus-mk2/experiments/X021-inventory-format/manifests/rig-moj12h4o-v4-combined.yaml
capturedAt: 2026-05-07T21:36:06.171Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x021-rig-moj12h4o-v4-combined-36cb197a
baseSha: b92dc90502dc0e38a92012cbd238c9eae0e65b0d
headSha: 54aa5fca9bf3a559b27dac1d0842912138b08993
commitCount: 1
totalDiffBytes: 188759
capturedAt: 2026-05-07T21:36:06.222Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-07T21:36:06.235Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
