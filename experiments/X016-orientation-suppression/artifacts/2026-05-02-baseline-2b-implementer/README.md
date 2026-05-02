# Trial extract — X016 Phase 2b — first implementer-driven trial

- **Trial id**: `w-monnnuqw-c998a09d0e9f`
- **Archive id**: `lar-monnr5zx-7868fa26482d`
- **Archived at**: 2026-05-02T01:23:26.877Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-02T01:23:27.466Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-monnnuqw-c998a09d0e9f
rigId: rig-monnny9h-786e0be8
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
  slug: x016-baseline-2b-implementer
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
          - name: "@shardworks/fabricator-apparatus"
            version: 0.1.292
          - name: "@shardworks/animator-apparatus"
            version: 0.1.292
          - name: "@shardworks/loom-apparatus"
            version: 0.1.292
          - name: "@shardworks/claude-code-apparatus"
            version: 0.1.292
          - name: "@shardworks/spider-apparatus"
            version: 0.1.292
          - name: "@shardworks/clockworks-apparatus"
            version: 0.1.292
        config:
          loom:
            roles:
              artificer:
                permissions:
                  - clerk:*
                  - tools:*
          animator:
            sessionProvider: claude-code
          spider:
            variables:
              role: artificer
              buildCommand: pnpm --filter @shardworks/nexus-core build
              testCommand: pnpm --filter @shardworks/nexus-core test
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
      briefPath: /workspace/nexus-mk2/experiments/X016-orientation-suppression/briefs/baseline-task-core.md
      waitForTerminal: true
      timeoutMs: 900000
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
capturedAt: 2026-05-02T01:23:26.834Z
```

### stacks — `lab.probe-stacks-dump`

```yaml
bookCounts:
  animator/sessions: 3
  animator/state: 1
  animator/transcripts: 3
  clerk/links: 0
  clerk/writs: 1
  clockworks/event_dispatches: 0
  clockworks/events: 12
  spider/input-requests: 0
  spider/rigs: 1
totalRows: 21
capturedAt: 2026-05-02T01:23:26.839Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x016-baseline-2b-implementer-c998a09d
baseSha: 3c307a20a7afc33df96c87c1a2d694edfb951c05
headSha: 7b984d611010971d9f188b83fb31875adf34ecd4
commitCount: 1
totalDiffBytes: 1562
capturedAt: 2026-05-02T01:23:26.874Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
