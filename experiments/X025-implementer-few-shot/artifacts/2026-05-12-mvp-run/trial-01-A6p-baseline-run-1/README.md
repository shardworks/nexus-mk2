# Trial extract — X025 — A6' Oculus click tree view baseline (stock Sonnet-era artificer.md)

- **Trial id**: `w-mp29y8t1-06f830611102`
- **Archive id**: `lar-mp2b5591-330e1ec1cc80`
- **Archived at**: 2026-05-12T07:26:56.725Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-12T07:30:25.913Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mp29y8t1-06f830611102
rigId: rig-mp29y9os-f830d14a
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
  slug: x025-a6p-baseline
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
        rolePath: /workspace/nexus-mk2/experiments/X025-implementer-few-shot/fixtures/roles/artificer-baseline.md
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
  manifestPath: /workspace/nexus-mk2/experiments/X025-implementer-few-shot/manifests/A6p-baseline.yaml
capturedAt: 2026-05-12T07:25:30.385Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x025-a6p-baseline-06f83061
baseSha: 842744085a5a5202ee9f0b087ec451a6fe2360a9
headSha: 1eb6ec385c563f9078b2b62f3f66e352f106313e
commitCount: 1
totalDiffBytes: 69370
capturedAt: 2026-05-12T07:26:41.931Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-12T07:26:49.327Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
