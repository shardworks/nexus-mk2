# Trial extract — X025 — A2 Reckoner apparatus skeleton baseline (stock Sonnet-era artificer.md)

- **Trial id**: `w-mp2o068y-659a62c6d0dc`
- **Archive id**: `lar-mp2omrgj-e6ecd224ada4`
- **Archived at**: 2026-05-12T13:44:33.667Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-12T13:44:33.772Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mp2o068y-659a62c6d0dc
rigId: rig-mp2o07rn-c8790556
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
  slug: x025-a2-baseline
  frameworkVersion: 0.1.304
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/nexus
        baseSha: 89fb1ab35ecc6084283173611b9ccbce857b1da9
    - id: codex-checkout
      engineId: lab.codex-checkout
      givens:
        bareLocalPath: ${yields.fixture-codex-setup.bareLocalPath}
        baseSha: 89fb1ab35ecc6084283173611b9ccbce857b1da9
        codexName: ${yields.fixture-codex-setup.codexName}
      dependsOn:
        - codex
  scenario:
    engineId: spider.graft-rig-template
    givens:
      template: laboratory.claude-direct-monolithic
      givens:
        rolePath: /workspace/nexus-mk2/experiments/X025-implementer-few-shot/fixtures/roles/artificer-baseline.md
        briefPath: /workspace/nexus-mk2/experiments/X025-implementer-few-shot/briefs/A2-reckoner-apparatus-skeleton.md
        model: sonnet
        executionWrap: production
        cwd: ${yields.fixture-codex-checkout-setup.workdir}
        verifyCommand: >
          set +e

          pnpm -w typecheck > /tmp/x025-tc.log 2>&1

          pnpm -w build > /tmp/x025-build.log 2>&1

          pnpm -w test > /tmp/x025-test.log 2>&1

          set -e


          # Typecheck and build must be clean for A2 (clean typecheck baseline)

          if grep -qE "error TS[0-9]+" /tmp/x025-tc.log /tmp/x025-build.log;
          then
            echo "Variant introduced typecheck/build errors:"
            grep -E "error TS[0-9]+" /tmp/x025-tc.log /tmp/x025-build.log | head -20
            exit 1
          fi


          # Test failures: variant may reproduce the 3 sentinel-apparatus
          failures

          # known to exist at A2's sealed state, but no others.

          UNEXPECTED=$(grep -E "test: ✖ " /tmp/x025-test.log \
            | grep -v "failing tests:" \
            | grep -v "orphan child blocks drain past parent cancellation" \
            | grep -v "Reckoner — multi-type guild" \
            | grep -v "src/engine-context.integration.test.ts")
          if [ -n "$UNEXPECTED" ]; then
            echo "Variant introduced new test failures beyond baseline:"
            echo "$UNEXPECTED"
            exit 1
          fi


          # Discrimination: confirm meaningful work in expected package

          INSERTIONS=$(git diff --shortstat
          89fb1ab35ecc6084283173611b9ccbce857b1da9..HEAD --
          packages/plugins/reckoner | grep -oP '\d+(?= insertion)' || echo 0)

          FILES=$(git diff --name-only
          89fb1ab35ecc6084283173611b9ccbce857b1da9..HEAD --
          packages/plugins/reckoner | wc -l)

          test "$INSERTIONS" -ge 1000 || { echo "Discrimination FAIL:
          $INSERTIONS insertions (need ≥1000)"; exit 1; }

          test "$FILES" -ge 10 || { echo "Discrimination FAIL: $FILES files
          (need ≥10)"; exit 1; }


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
  manifestPath: /workspace/nexus-mk2/experiments/X025-implementer-few-shot/manifests/A2-baseline.yaml
capturedAt: 2026-05-12T13:44:33.610Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x025-a2-baseline-659a62c6
baseSha: 89fb1ab35ecc6084283173611b9ccbce857b1da9
headSha: 89fb1ab35ecc6084283173611b9ccbce857b1da9
commitCount: 0
totalDiffBytes: 0
capturedAt: 2026-05-12T13:44:33.620Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-12T13:44:33.662Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
