# Trial extract — X021 control v4 — vision-keeper deletion (combined

- **Trial id**: `w-mow4muh0-2930afab7db3`
- **Archive id**: `lar-mow5mc2l-01ed7142481f`
- **Archived at**: 2026-05-08T00:05:43.965Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-08T00:05:44.067Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mow4muh0-2930afab7db3
rigId: rig-mow4mx4o-7a7e8c64
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
capturedAt: 2026-05-08T00:05:43.877Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x021-rig-moji64hs-v4-combined-2930afab
baseSha: d6e34097f698df66d595f81f928320eafde8276f
headSha: 8ed02624e6b93971cba30dfbbf982a7b9a986968
commitCount: 2
totalDiffBytes: 156829
capturedAt: 2026-05-08T00:05:43.948Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-08T00:05:43.961Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
