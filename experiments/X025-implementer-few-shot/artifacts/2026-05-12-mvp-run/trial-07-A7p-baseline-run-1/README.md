# Trial extract — X025 — A7' d4-tools v2 manual character entry baseline (stock Sonnet-era artificer.md)

- **Trial id**: `w-mp2f1sbr-876219da6981`
- **Archive id**: `lar-mp2fw4jh-60c7f4c97a75`
- **Archived at**: 2026-05-12T09:39:53.981Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-12T09:39:54.458Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mp2f1sbr-876219da6981
rigId: rig-mp2f1vec-f358848f
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
  slug: x025-a7p-baseline
  frameworkVersion: 0.1.304
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/d4-tools
        baseSha: 3456aa8cdace7828121aa57f828175c3d0c6d1a4
    - id: codex-checkout
      engineId: lab.codex-checkout
      givens:
        bareLocalPath: ${yields.fixture-codex-setup.bareLocalPath}
        baseSha: 3456aa8cdace7828121aa57f828175c3d0c6d1a4
        codexName: ${yields.fixture-codex-setup.codexName}
      dependsOn:
        - codex
  scenario:
    engineId: spider.graft-rig-template
    givens:
      template: laboratory.claude-direct-monolithic
      givens:
        rolePath: /workspace/nexus-mk2/experiments/X025-implementer-few-shot/fixtures/roles/artificer-baseline.md
        briefPath: /workspace/nexus-mk2/experiments/X025-implementer-few-shot/briefs/A7p-d4-tools-v2-manual-character.md
        model: sonnet
        executionWrap: production
        cwd: ${yields.fixture-codex-checkout-setup.workdir}
        verifyCommand: >
          set -e

          pnpm typecheck

          pnpm lint

          pnpm build

          pnpm test


          # Discrimination: confirm meaningful work in expected paths

          INSERTIONS=$(git diff --shortstat
          3456aa8cdace7828121aa57f828175c3d0c6d1a4..HEAD -- lib/ components/
          app/ | grep -oP '\d+(?= insertion)' || echo 0)

          FILES=$(git diff --name-only
          3456aa8cdace7828121aa57f828175c3d0c6d1a4..HEAD -- lib/ components/
          app/ | wc -l)

          test "$INSERTIONS" -ge 4000 || { echo "Discrimination FAIL:
          $INSERTIONS insertions (need ≥4000)"; exit 1; }

          test "$FILES" -ge 25 || { echo "Discrimination FAIL: $FILES files
          (need ≥25)"; exit 1; }


          git push origin HEAD:main
        verifyTimeoutMs: 300000
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
  manifestPath: /workspace/nexus-mk2/experiments/X025-implementer-few-shot/manifests/A7p-baseline.yaml
capturedAt: 2026-05-12T09:39:53.936Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x025-a7p-baseline-876219da
baseSha: 3456aa8cdace7828121aa57f828175c3d0c6d1a4
headSha: 3456aa8cdace7828121aa57f828175c3d0c6d1a4
commitCount: 0
totalDiffBytes: 0
capturedAt: 2026-05-12T09:39:53.943Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-12T09:39:53.979Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
