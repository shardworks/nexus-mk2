# Trial extract — X021 v3 — Reckoner periodic-tick replay (do-not-Read list, idea

- **Trial id**: `w-mow8oq5x-091f9a9f4cfc`
- **Archive id**: `lar-mowa35w9-5609989f12a0`
- **Archived at**: 2026-05-08T02:10:47.577Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-08T02:10:47.667Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mow8oq5x-091f9a9f4cfc
rigId: rig-mow8otgd-5ff60366
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
capturedAt: 2026-05-08T02:10:47.514Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x021-rig-moj12h4o-v3-do-not-read-091f9a9f
baseSha: b92dc90502dc0e38a92012cbd238c9eae0e65b0d
headSha: 09e781847b4306c1020785ae5861769a60c7f63e
commitCount: 1
totalDiffBytes: 178691
capturedAt: 2026-05-08T02:10:47.562Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-08T02:10:47.573Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
