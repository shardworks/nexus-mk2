# Trial extract — X016 Phase 2c — baseline variant N=1 calibration

- **Trial id**: `w-monu86fr-3edda6b0f251`
- **Archive id**: `lar-monv9733-90dc4035e280`
- **Archived at**: 2026-05-02T04:53:25.407Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-02T04:53:26.009Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-monu86fr-3edda6b0f251
rigId: rig-monu89oy-1533cfce
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
  slug: x016-baseline-2c-baseline-n1
  frameworkVersion: 0.1.292
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/nexus
        baseSha: c047e29e331c65dba47338045d0ba91291e9eece
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
              buildCommand: pnpm --filter @shardworks/reckoner-apparatus build && pnpm
                --filter @shardworks/vision-keeper-apparatus build
              testCommand: pnpm --filter @shardworks/reckoner-apparatus test && pnpm --filter
                @shardworks/vision-keeper-apparatus test
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
      briefPath: /workspace/nexus-mk2/experiments/X016-orientation-suppression/briefs/phase-2c-baseline.md
      waitForTerminal: true
      timeoutMs: 1800000
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
capturedAt: 2026-05-02T04:53:25.258Z
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
capturedAt: 2026-05-02T04:53:25.261Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x016-baseline-2c-baseline-n1-3edda6b0
baseSha: c047e29e331c65dba47338045d0ba91291e9eece
headSha: 735db69448fa8b275435149a6e56dd15ad1d556b
commitCount: 1
totalDiffBytes: 62347
capturedAt: 2026-05-02T04:53:25.404Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
