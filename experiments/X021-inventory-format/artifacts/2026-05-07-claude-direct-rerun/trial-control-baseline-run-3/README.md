# Trial extract — X021 control baseline — vision-keeper deletion (verbatim spec)

- **Trial id**: `w-mow3n5ly-66613f9f04e2`
- **Archive id**: `lar-mow4luf3-b3ed9ab74ca8`
- **Archived at**: 2026-05-07T23:37:21.471Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-07T23:37:21.573Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mow3n5ly-66613f9f04e2
rigId: rig-mow3n7vu-4cf5b4c4
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
capturedAt: 2026-05-07T23:37:21.402Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x021-rig-moji64hs-baseline-66613f9f
baseSha: d6e34097f698df66d595f81f928320eafde8276f
headSha: 4320a4a2b4d1eb054885c54c02ddf1414d2f753c
commitCount: 1
totalDiffBytes: 156263
capturedAt: 2026-05-07T23:37:21.449Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-07T23:37:21.462Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
