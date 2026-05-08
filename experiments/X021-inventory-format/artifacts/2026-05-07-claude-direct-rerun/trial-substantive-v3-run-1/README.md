# Trial extract — X021 v3 — Reckoner periodic-tick replay (do-not-Read list, idea

- **Trial id**: `w-mow7cssa-62da514aaac8`
- **Archive id**: `lar-mow8n7hm-0a7d5effd510`
- **Archived at**: 2026-05-08T01:30:23.530Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-08T01:30:23.618Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mow7cssa-62da514aaac8
rigId: rig-mow7ctpi-43d400af
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
capturedAt: 2026-05-08T01:30:23.472Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x021-rig-moj12h4o-v3-do-not-read-62da514a
baseSha: b92dc90502dc0e38a92012cbd238c9eae0e65b0d
headSha: d800c837fdbfe4770947d82342289f0f98ea62e7
commitCount: 1
totalDiffBytes: 177629
capturedAt: 2026-05-08T01:30:23.517Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-08T01:30:23.528Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
