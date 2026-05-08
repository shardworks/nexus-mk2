# Trial extract — X021 control baseline — vision-keeper deletion (verbatim spec)

- **Trial id**: `w-mow2tft9-7c494df0582c`
- **Archive id**: `lar-mow3m91g-adfa874a5446`
- **Archived at**: 2026-05-07T23:09:40.804Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-07T23:09:40.907Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mow2tft9-7c494df0582c
rigId: rig-mow2tj17-8b1409bc
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
  slug: x021-rig-moji64hs-baseline
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
        rolePath: /workspace/nexus-mk2/experiments/X021-inventory-format/fixtures/test-guild/roles/artificer.md
        briefPath: /workspace/nexus-mk2/experiments/X021-inventory-format/briefs/rig-moji64hs-baseline.md
        model: opus
        executionWrap: production
        cwd: ${yields.fixture-codex-checkout-setup.workdir}
        verifyCommand: |
          set -e
          # vision-keeper deletion is workspace-wide; typecheck is the
          # affordable proxy for "did the deletion leave dangling refs".
          # Test runs trade off too long for a Tier-1 mechanical check.
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
  manifestPath: /workspace/nexus-mk2/experiments/X021-inventory-format/manifests/rig-moji64hs-baseline.yaml
capturedAt: 2026-05-07T23:09:40.658Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x021-rig-moji64hs-baseline-7c494df0
baseSha: d6e34097f698df66d595f81f928320eafde8276f
headSha: 12b5b4e7e3eaa83407f1bbb9add2a165a37635de
commitCount: 6
totalDiffBytes: 154990
capturedAt: 2026-05-07T23:09:40.788Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-07T23:09:40.800Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
