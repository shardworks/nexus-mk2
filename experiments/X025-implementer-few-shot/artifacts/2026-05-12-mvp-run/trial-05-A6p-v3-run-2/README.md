# Trial extract — X025 — A6' Oculus click tree view v3 combined (both example blocks prepended to Sonnet-era artificer.md)

- **Trial id**: `w-mp2dhsj5-3a6bad52ad43`
- **Archive id**: `lar-mp2e5trj-0719fd865df1`
- **Archived at**: 2026-05-12T08:51:27.343Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-12T08:51:27.430Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mp2dhsj5-3a6bad52ad43
rigId: rig-mp2dhtv8-fa7319c1
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
  slug: x025-a6p-v3-combined
  frameworkVersion: 0.1.304
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/nexus
        baseSha: 842744085a5a5202ee9f0b087ec451a6fe2360a9
    - id: codex-checkout
      engineId: lab.codex-checkout
      givens:
        bareLocalPath: ${yields.fixture-codex-setup.bareLocalPath}
        baseSha: 842744085a5a5202ee9f0b087ec451a6fe2360a9
        codexName: ${yields.fixture-codex-setup.codexName}
      dependsOn:
        - codex
  scenario:
    engineId: spider.graft-rig-template
    givens:
      template: laboratory.claude-direct-monolithic
      givens:
        rolePath: /workspace/nexus-mk2/experiments/X025-implementer-few-shot/fixtures/roles/artificer-v3-combined.md
        briefPath: /workspace/nexus-mk2/experiments/X025-implementer-few-shot/briefs/A6p-oculus-click-tree-view.md
        model: sonnet
        executionWrap: production
        cwd: ${yields.fixture-codex-checkout-setup.workdir}
        verifyCommand: >
          set -e

          pnpm -w typecheck

          pnpm -w build

          pnpm -w test


          # Discrimination: confirm meaningful work in ratchet plugin

          INSERTIONS=$(git diff --shortstat
          842744085a5a5202ee9f0b087ec451a6fe2360a9..HEAD --
          packages/plugins/ratchet | grep -oP '\d+(?= insertion)' || echo 0)

          FILES=$(git diff --name-only
          842744085a5a5202ee9f0b087ec451a6fe2360a9..HEAD --
          packages/plugins/ratchet | wc -l)

          test "$INSERTIONS" -ge 800 || { echo "Discrimination FAIL: $INSERTIONS
          insertions (need ≥800)"; exit 1; }

          test "$FILES" -ge 4 || { echo "Discrimination FAIL: $FILES files (need
          ≥4)"; exit 1; }


          git push origin HEAD:main
        verifyTimeoutMs: 900000
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
  manifestPath: /workspace/nexus-mk2/experiments/X025-implementer-few-shot/manifests/A6p-v3-combined.yaml
capturedAt: 2026-05-12T08:51:27.267Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x025-a6p-v3-combined-3a6bad52
baseSha: 842744085a5a5202ee9f0b087ec451a6fe2360a9
headSha: b6f8854e400e58f758755e55724c09b335745e3e
commitCount: 1
totalDiffBytes: 89396
capturedAt: 2026-05-12T08:51:27.303Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-12T08:51:27.340Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
