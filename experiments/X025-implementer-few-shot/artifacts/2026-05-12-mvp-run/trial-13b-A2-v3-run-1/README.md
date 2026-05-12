# Trial extract — X025 — A2 Reckoner apparatus skeleton v3 combined (both example blocks prepended to Sonnet-era artificer.md)

- **Trial id**: `w-mp2w1379-09d40f580d49`
- **Archive id**: `lar-mp2wkgg6-17da4db5845d`
- **Archived at**: 2026-05-12T17:26:43.014Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-12T17:26:43.121Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mp2w1379-09d40f580d49
rigId: rig-mp2w16if-b62f7ea1
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
  slug: x025-a2-v3-combined
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
        rolePath: /workspace/nexus-mk2/experiments/X025-implementer-few-shot/fixtures/roles/artificer-v3-combined.md
        briefPath: /workspace/nexus-mk2/experiments/X025-implementer-few-shot/briefs/A2-reckoner-apparatus-skeleton.md
        model: sonnet
        executionWrap: production
        cwd: ${yields.fixture-codex-checkout-setup.workdir}
        verifyCommand: >
          set +e  # never implicitly abort

          echo "[verify] step=START"


          echo "[verify] step=typecheck"

          pnpm -w typecheck > /tmp/x025-tc.log 2>&1

          echo "[verify] typecheck exit=$? log_lines=$(wc -l <
          /tmp/x025-tc.log)"


          echo "[verify] step=build"

          pnpm -w build > /tmp/x025-build.log 2>&1

          echo "[verify] build exit=$? log_lines=$(wc -l < /tmp/x025-build.log)"


          echo "[verify] step=test"

          pnpm -w test > /tmp/x025-test.log 2>&1

          echo "[verify] test exit=$? log_lines=$(wc -l < /tmp/x025-test.log)"


          echo "[verify] step=typecheck-check"

          grep -qE "error TS[0-9]+" /tmp/x025-tc.log /tmp/x025-build.log

          if [ $? -eq 0 ]; then
            echo "[verify] FAIL: typecheck/build errors present"
            grep -E "error TS[0-9]+" /tmp/x025-tc.log /tmp/x025-build.log | head -20
            exit 1
          fi


          echo "[verify] step=test-failure-check"

          # Allow-listed sentinel failures present at baseSha (and inherited at
          sealed):

          UNEXPECTED=$(grep -E "test: ✖ " /tmp/x025-test.log 2>/dev/null \
            | grep -v "failing tests:" \
            | grep -v "orphan child blocks drain past parent cancellation" \
            | grep -v "Reckoner — multi-type guild" \
            | grep -v "src/engine-context.integration.test.ts" \
            || true)
          echo "[verify] UNEXPECTED has $(echo "$UNEXPECTED" | grep -c .) lines"

          if [ -n "$UNEXPECTED" ]; then
            echo "[verify] FAIL: variant introduced new test failures beyond baseline:"
            echo "$UNEXPECTED"
            exit 1
          fi


          echo "[verify] step=discrimination"

          INSERTIONS=$(git diff --shortstat
          89fb1ab35ecc6084283173611b9ccbce857b1da9..HEAD --
          packages/plugins/reckoner 2>/dev/null | grep -oP '\d+(?= insertion)'
          2>/dev/null)

          [ -z "$INSERTIONS" ] && INSERTIONS=0

          FILES=$(git diff --name-only
          89fb1ab35ecc6084283173611b9ccbce857b1da9..HEAD --
          packages/plugins/reckoner 2>/dev/null | wc -l)

          echo "[verify] INSERTIONS=$INSERTIONS FILES=$FILES"


          if [ "$INSERTIONS" -lt 800 ]; then
            echo "[verify] FAIL: discrimination: $INSERTIONS insertions (need >=800)"
            exit 1
          fi

          if [ "$FILES" -lt 5 ]; then
            echo "[verify] FAIL: discrimination: $FILES files (need >=5)"
            exit 1
          fi


          echo "[verify] step=push"

          git push origin HEAD:main

          echo "[verify] push exit=$?"


          echo "[verify] step=END"
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
  manifestPath: /workspace/nexus-mk2/experiments/X025-implementer-few-shot/manifests/A2-v3-combined.yaml
capturedAt: 2026-05-12T17:26:42.928Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x025-a2-v3-combined-09d40f58
baseSha: 89fb1ab35ecc6084283173611b9ccbce857b1da9
headSha: 9294cda808afc135427dd077f2219ecad80f4a11
commitCount: 1
totalDiffBytes: 83493
capturedAt: 2026-05-12T17:26:42.973Z
```

### sessions — `lab.probe-trial-sessions`

```yaml
sessionCount: 1
sourceBook: animator/sessions
capturedAt: 2026-05-12T17:26:43.011Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
