# Trial extract — X016 Phase 2a — daemon-fixture smoke test

- **Trial id**: `w-monlfejq-2e343b788e0d`
- **Archive id**: `lar-monlfqir-a25da3488822`
- **Archived at**: 2026-05-02T00:18:34.371Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-02T00:18:34.893Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-monlfejq-2e343b788e0d
rigId: rig-monlffd3-d32f317e
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
  slug: x016-baseline-2a-daemon
  frameworkVersion: 0.1.292
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/nexus
        baseSha: 3c307a20a7afc33df96c87c1a2d694edfb951c05
    - id: test-guild
      engineId: lab.guild-setup
      givens:
        plugins:
          - name: "@shardworks/stacks-apparatus"
            version: 0.1.292
          - name: "@shardworks/tools-apparatus"
            version: 0.1.292
          - name: "@shardworks/codexes-apparatus"
            version: 0.1.292
          - name: "@shardworks/clerk-apparatus"
            version: 0.1.292
          - name: "@shardworks/spider-apparatus"
            version: 0.1.292
          - name: "@shardworks/clockworks-apparatus"
            version: 0.1.292
          - name: "@shardworks/fabricator-apparatus"
            version: 0.1.292
      dependsOn:
        - codex
    - id: daemon
      engineId: lab.daemon-setup
      givens: {}
      dependsOn:
        - test-guild
  scenario:
    engineId: lab.commission-post-xguild
    givens:
      briefPath: /workspace/nexus-mk2/experiments/X016-orientation-suppression/briefs/baseline-task.md
      waitForTerminal: false
  probes:
    - id: context
      engineId: lab.probe-trial-context
      givens: {}
    - id: stacks
      engineId: lab.probe-stacks-dump
      givens: {}
    - id: commits
      engineId: lab.probe-git-range
      givens: {}
  archive:
    engineId: lab.archive
    givens: {}
capturedAt: 2026-05-02T00:18:34.359Z
```

### stacks — `lab.probe-stacks-dump`

```yaml
bookCounts:
  clerk/links: 0
  clerk/writs: 1
  clockworks/event_dispatches: 0
  clockworks/events: 0
  spider/input-requests: 0
  spider/rigs: 0
totalRows: 1
capturedAt: 2026-05-02T00:18:34.363Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x016-baseline-2a-daemon-2e343b78
baseSha: 3c307a20a7afc33df96c87c1a2d694edfb951c05
headSha: 3c307a20a7afc33df96c87c1a2d694edfb951c05
commitCount: 0
totalDiffBytes: 0
capturedAt: 2026-05-02T00:18:34.370Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
