# Trial extract — X021 v3 — Reckoner periodic-tick replay (do-not-Read list, idea

- **Trial id**: `w-mowa4fzj-2b756ca1e9d0`
- **Archive id**: `lar-mowbbols-9bcd222b1dff`
- **Archived at**: 2026-05-08T02:45:24.688Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-08T02:45:24.781Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mowa4fzj-2b756ca1e9d0
rigId: rig-mowa4gab-d0d23a2b
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
  slug: x021-rig-moj12h4o-v3-do-not-read
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
        briefPath: /workspace/nexus-mk2/experiments/X021-inventory-format/briefs/rig-moj12h4o-v3-do-not-read.md
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
  manifestPath: /workspace/nexus-mk2/experiments/X021-inventory-format/manifests/rig-moj12h4o-v3-do-not-read.yaml
capturedAt: 2026-05-08T02:45:24.625Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x021-rig-moj12h4o-v3-do-not-read-2b756ca1
baseSha: b92dc90502dc0e38a92012cbd238c9eae0e65b0d
headSha: 0019001c979df05c7350a5d60b6ebb98c9d3eac5
commitCount: 1
totalDiffBytes: 203989
capturedAt: 2026-05-08T02:45:24.674Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-08T02:45:24.685Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
