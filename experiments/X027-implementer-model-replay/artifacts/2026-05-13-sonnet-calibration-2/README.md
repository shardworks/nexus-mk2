# Trial extract — X027 — Sonnet calibration trial 2 (Maxroll importer replay, sonnet implementer + opus reviewer)

- **Trial id**: `w-mp3xoqat-ce1467196fdc`
- **Archive id**: `lar-mp3yl47d-ef3c9eeec090`
- **Archived at**: 2026-05-13T11:10:59.209Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-13T11:10:59.648Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mp3xoqat-ce1467196fdc
rigId: rig-mp3xoqsj-4961e01c
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
  slug: x027-sonnet-calibration-2
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
  manifestPath: /workspace/nexus-mk2/experiments/X027-implementer-model-replay/manifests/sonnet-calibration-2.yaml
capturedAt: 2026-05-13T11:10:59.117Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x027-sonnet-calibration-2-ce146719
baseSha: 69f6a26f8a5499117ddc2478168383055409c851
headSha: 46ae6d11447ca8a88da7781469667c3d20d85669
commitCount: 1
totalDiffBytes: 104959
capturedAt: 2026-05-13T11:10:59.164Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 2
sourceBook: animator/sessions
capturedAt: 2026-05-13T11:10:59.206Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
