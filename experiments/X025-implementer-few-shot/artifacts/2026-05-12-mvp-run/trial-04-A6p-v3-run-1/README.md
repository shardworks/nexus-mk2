# Trial extract — X025 — A6' Oculus click tree view v3 combined (both example blocks prepended to Sonnet-era artificer.md)

- **Trial id**: `w-mp2cr1ez-bb8454108bb6`
- **Archive id**: `lar-mp2dg7wk-7e1ddc5ea6ed`
- **Archived at**: 2026-05-12T08:31:32.612Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-12T08:31:32.698Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mp2cr1ez-bb8454108bb6
rigId: rig-mp2cr1k2-d9fabed4
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
capturedAt: 2026-05-12T08:31:32.536Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x025-a6p-v3-combined-bb845410
baseSha: 842744085a5a5202ee9f0b087ec451a6fe2360a9
headSha: 653171b88f9e81a55596144ca4d3f465d1bc909b
commitCount: 1
totalDiffBytes: 83306
capturedAt: 2026-05-12T08:31:32.572Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-12T08:31:32.609Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
