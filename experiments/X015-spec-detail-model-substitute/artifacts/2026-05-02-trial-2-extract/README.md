# Trial extract — X015 trial 2 — Sonnet implementer + Opus reviewer on Clerk refactor (N=1, full pipeline)

- **Trial id**: `w-moog09r2-838e74e03827`
- **Archive id**: `lar-mool4m7x-e4b90739b0fe`
- **Archived at**: 2026-05-02T16:57:41.757Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-02T16:57:42.375Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-moog09r2-838e74e03827
rigId: rig-moog2hhr-11c1e8d2
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
  slug: x015-trial-2-clerk-refactor-sonnet-n1
  frameworkVersion: 0.1.294
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/nexus
        baseSha: d871dd76cd56f9236a8866952081b22f8dbcfa30
    - id: test-guild
      engineId: lab.guild-setup
      givens:
        plugins:
          - name: "@shardworks/stacks-apparatus"
            version: 0.1.294
          - name: "@shardworks/tools-apparatus"
            version: 0.1.294
          - name: "@shardworks/codexes-apparatus"
            version: 0.1.294
          - name: "@shardworks/clerk-apparatus"
            version: 0.1.294
          - name: "@shardworks/fabricator-apparatus"
            version: 0.1.294
          - name: "@shardworks/animator-apparatus"
            version: 0.1.294
          - name: "@shardworks/loom-apparatus"
            version: 0.1.294
          - name: "@shardworks/claude-code-apparatus"
            version: 0.1.294
          - name: "@shardworks/spider-apparatus"
            version: 0.1.294
          - name: "@shardworks/clockworks-apparatus"
            version: 0.1.294
        config:
          loom:
            roles:
              artificer:
                model: sonnet
                permissions:
                  - clerk:read
                  - tools:*
              reviewer:
                model: opus
                permissions: []
          animator:
            sessionProvider: claude-code
          spider:
            variables:
              role: artificer
              buildCommand: pnpm -w typecheck
              testCommand: pnpm -w test
        files:
          - sourcePath: /workspace/nexus-mk2/experiments/X015-spec-detail-model-substitute/fixtures/test-guild/roles/artificer.md
            guildPath: roles/artificer.md
          - sourcePath: /workspace/nexus-mk2/experiments/X015-spec-detail-model-substitute/fixtures/test-guild/roles/patron.md
            guildPath: roles/patron.md
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
      briefPath: /workspace/nexus-mk2/experiments/X015-spec-detail-model-substitute/briefs/trial-1-clerk-refactor.md
      waitForTerminal: true
      timeoutMs: 10800000
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
capturedAt: 2026-05-02T16:57:41.218Z
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
capturedAt: 2026-05-02T16:57:41.226Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x015-trial-2-clerk-refactor-sonnet-n1-838e74e0
baseSha: d871dd76cd56f9236a8866952081b22f8dbcfa30
headSha: 2dd064de56c88d8896777945509b01984f66ba83
commitCount: 2
totalDiffBytes: 297135
capturedAt: 2026-05-02T16:57:41.754Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
