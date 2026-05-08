# Trial extract — X022 — rig-moji64hs (control, vision-keeper deletion) combined-nudges variant

- **Trial id**: `w-mowe90mm-77d25087058c`
- **Archive id**: `lar-mowgxixb-227d25eb45ae`
- **Archived at**: 2026-05-08T05:22:21.839Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-08T05:22:21.936Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mowe90mm-77d25087058c
rigId: rig-mowg9fbm-fceb42d2
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
  slug: x022-rig-moji64hs-combined
  frameworkVersion: 0.1.304
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/nexus
        baseSha: d6e34097f698df66d595f81f928320eafde8276f
    - id: codex-checkout
      engineId: lab.codex-checkout
      givens:
        bareLocalPath: ${yields.fixture-codex-setup.bareLocalPath}
        baseSha: d6e34097f698df66d595f81f928320eafde8276f
        codexName: ${yields.fixture-codex-setup.codexName}
      dependsOn:
        - codex
  scenario:
    engineId: spider.graft-rig-template
    givens:
      template: laboratory.claude-direct-monolithic
      givens:
        rolePath: /workspace/nexus-mk2/experiments/X022-implementer-behavior-nudges/fixtures/test-guild/roles/artificer-combined-nudges.md
        briefPath: /workspace/nexus-mk2/experiments/X022-implementer-behavior-nudges/briefs/rig-moji64hs-baseline.md
        model: opus
        executionWrap: production
        cwd: ${yields.fixture-codex-checkout-setup.workdir}
        verifyCommand: |
          set -e
          pnpm -w typecheck
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
  manifestPath: /workspace/nexus-mk2/experiments/X022-implementer-behavior-nudges/manifests/rig-moji64hs-combined.yaml
capturedAt: 2026-05-08T05:22:21.778Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x022-rig-moji64hs-combined-77d25087
baseSha: d6e34097f698df66d595f81f928320eafde8276f
headSha: d354c89eea9a9733cc0c67ff38ea44c2dc77f075
commitCount: 1
totalDiffBytes: 155395
capturedAt: 2026-05-08T05:22:21.826Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-08T05:22:21.837Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
