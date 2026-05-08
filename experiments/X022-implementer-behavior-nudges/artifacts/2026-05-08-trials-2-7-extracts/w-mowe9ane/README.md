# Trial extract — X022 — rig-moj12h4o (substantive, Reckoner periodic tick) combined-nudges variant

- **Trial id**: `w-mowe9ane-0616cca6f53d`
- **Archive id**: `lar-mowkx3ah-baf24e79c73c`
- **Archived at**: 2026-05-08T07:14:00.041Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-08T07:14:00.129Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mowe9ane-0616cca6f53d
rigId: rig-mowjdpaf-91ac6799
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
  slug: x022-rig-moj12h4o-combined
  frameworkVersion: 0.1.304
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/nexus
        baseSha: 0e1e81f4a219179fd264625b869e12bd00778365
    - id: codex-checkout
      engineId: lab.codex-checkout
      givens:
        bareLocalPath: ${yields.fixture-codex-setup.bareLocalPath}
        baseSha: 0e1e81f4a219179fd264625b869e12bd00778365
        codexName: ${yields.fixture-codex-setup.codexName}
      dependsOn:
        - codex
  scenario:
    engineId: spider.graft-rig-template
    givens:
      template: laboratory.claude-direct-monolithic
      givens:
        rolePath: /workspace/nexus-mk2/experiments/X022-implementer-behavior-nudges/fixtures/test-guild/roles/artificer-combined-nudges.md
        briefPath: /workspace/nexus-mk2/experiments/X022-implementer-behavior-nudges/briefs/rig-moj12h4o-baseline.md
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
  manifestPath: /workspace/nexus-mk2/experiments/X022-implementer-behavior-nudges/manifests/rig-moj12h4o-combined.yaml
capturedAt: 2026-05-08T07:13:59.978Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x022-rig-moj12h4o-combined-0616cca6
baseSha: 0e1e81f4a219179fd264625b869e12bd00778365
headSha: ecd9dc0a1d4e61dc56182a8877dfd9ff8d746b24
commitCount: 1
totalDiffBytes: 188882
capturedAt: 2026-05-08T07:14:00.027Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-08T07:14:00.038Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
