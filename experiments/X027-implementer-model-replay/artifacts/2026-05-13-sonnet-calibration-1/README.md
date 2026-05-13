# Trial extract — X027 — Sonnet calibration trial 1 (Maxroll importer replay, sonnet implementer + opus reviewer)

- **Trial id**: `w-mp3io8m8-67b8d7027521`
- **Archive id**: `lar-mp3jtqhl-6b67484a5b39`
- **Archived at**: 2026-05-13T04:17:47.097Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-13T04:17:47.544Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mp3io8m8-67b8d7027521
rigId: rig-mp3ioaxj-3e20226f
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
  slug: x027-sonnet-calibration-1
  frameworkVersion: 0.1.309
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/d4-tools
        baseSha: 69f6a26f8a5499117ddc2478168383055409c851
    - id: codex-checkout
      engineId: lab.codex-checkout
      givens:
        bareLocalPath: ${yields.fixture-codex-setup.bareLocalPath}
        baseSha: 69f6a26f8a5499117ddc2478168383055409c851
        codexName: ${yields.fixture-codex-setup.codexName}
      dependsOn:
        - codex
  scenario:
    engineId: spider.graft-rig-template
    givens:
      template: laboratory.claude-direct-with-review
      givens:
        rolePath: /workspace/nexus-mk2/experiments/X027-implementer-model-replay/fixtures/roles/artificer.md
        briefPath: /workspace/nexus-mk2/experiments/X027-implementer-model-replay/briefs/maxroll-importer-spec.md
        model: sonnet
        executionWrap: production
        reviewerRolePath: /workspace/nexus-mk2/experiments/X027-implementer-model-replay/fixtures/roles/reviewer.md
        reviewerModel: opus
        cwd: ${yields.fixture-codex-checkout-setup.workdir}
        verifyCommand: >
          set -e

          # Confirm a commit landed (implementer produced output).

          git log -1 --pretty=%s | grep -qE '.+'

          # Confirm the lib/import/maxroll/ subsystem was created at minimum.

          # This is a weak smoke check — does NOT validate correctness, which

          # is scored post-hoc. The production seal also satisfied this check.

          test -d lib/import/maxroll || { echo "VERIFY FAIL: lib/import/maxroll/
          not created"; exit 1; }

          # Next build (includes typecheck via tsc --noEmit). Production

          # sealed commit passed this; calibration trial must too.

          pnpm build

          # Push HEAD back to the codex bare so lab.probe-git-range captures it.

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
  manifestPath: /workspace/nexus-mk2/experiments/X027-implementer-model-replay/manifests/sonnet-calibration-1.yaml
capturedAt: 2026-05-13T04:17:47.010Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x027-sonnet-calibration-1-67b8d702
baseSha: 69f6a26f8a5499117ddc2478168383055409c851
headSha: 1fb5ff65e90242bf2228ed47e14dad0de166a7b1
commitCount: 1
totalDiffBytes: 100644
capturedAt: 2026-05-13T04:17:47.054Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 2
sourceBook: animator/sessions
capturedAt: 2026-05-13T04:17:47.094Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
