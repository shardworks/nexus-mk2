# Trial extract — X021 v4 — Reckoner periodic-tick replay (combined

- **Trial id**: `w-mow0bdwn-c03ff528fba0`
- **Archive id**: `lar-mow1g8kb-74dc07aa4e01`
- **Archived at**: 2026-05-07T22:09:01.019Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-07T22:09:01.111Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mow0bdwn-c03ff528fba0
rigId: rig-mow0bey8-b511170b
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
capturedAt: 2026-05-07T22:09:00.957Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x021-rig-moj12h4o-v4-combined-c03ff528
baseSha: b92dc90502dc0e38a92012cbd238c9eae0e65b0d
headSha: 059ace9dccaec3fb7cd20bf5b3b681ef33997eb7
commitCount: 1
totalDiffBytes: 169048
capturedAt: 2026-05-07T22:09:01.005Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-07T22:09:01.016Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
