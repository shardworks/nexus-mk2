# Trial extract — X015 trial 3 — Sonnet implementer + Opus reviewer on Rate-limit-aware scheduling (N=1, full pipeline, greenfield contrast)

- **Trial id**: `w-mop6gn5c-2ebbdb8c6eba`
- **Archive id**: `lar-mopevy1d-d3599fea2f74`
- **Archived at**: 2026-05-03T06:50:45.649Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-03T06:50:46.262Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mop6gn5c-2ebbdb8c6eba
rigId: rig-mop6gnui-d95fd002
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
  slug: x015-trial-3-rate-limit-n1
  frameworkVersion: 0.1.294
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/nexus
        baseSha: 03d36cb849c92d0ab434c9bd4a066716c8f50fbb
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
      briefPath: /workspace/nexus-mk2/experiments/X015-spec-detail-model-substitute/briefs/trial-3-rate-limit-aware-scheduling.md
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
capturedAt: 2026-05-03T06:50:45.020Z
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
capturedAt: 2026-05-03T06:50:45.024Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x015-trial-3-rate-limit-n1-2ebbdb8c
baseSha: 03d36cb849c92d0ab434c9bd4a066716c8f50fbb
headSha: 81479f75444fc2b943a4fe817849028639f01f44
commitCount: 2
totalDiffBytes: 151307
capturedAt: 2026-05-03T06:50:45.645Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
