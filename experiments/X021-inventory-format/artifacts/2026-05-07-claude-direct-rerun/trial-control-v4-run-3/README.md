# Trial extract — X021 control v4 — vision-keeper deletion (combined

- **Trial id**: `w-mow6ffq2-a53d9de443f2`
- **Archive id**: `lar-mow7bja4-eb68d6e7eea6`
- **Archived at**: 2026-05-08T00:53:19.324Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-08T00:53:19.426Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mow6ffq2-a53d9de443f2
rigId: rig-mow6fjei-13e827d8
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
  slug: x021-rig-moji64hs-v4-combined
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
        briefPath: /workspace/nexus-mk2/experiments/X021-inventory-format/briefs/rig-moji64hs-v4-combined.md
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
  manifestPath: /workspace/nexus-mk2/experiments/X021-inventory-format/manifests/rig-moji64hs-v4-combined.yaml
capturedAt: 2026-05-08T00:53:19.213Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x021-rig-moji64hs-v4-combined-a53d9de4
baseSha: d6e34097f698df66d595f81f928320eafde8276f
headSha: 6045e267e7fc43153a697e9cd7c62365d021cd93
commitCount: 4
totalDiffBytes: 155447
capturedAt: 2026-05-08T00:53:19.311Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-08T00:53:19.321Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
