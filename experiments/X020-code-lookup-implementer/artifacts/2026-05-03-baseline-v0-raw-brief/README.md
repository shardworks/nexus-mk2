# Trial extract — X020 baseline — dropBook commission, production artificer (no code-lookup)

- **Trial id**: `w-mopib9cd-cff5af022e40`
- **Archive id**: `lar-mopvfp3p-d53d2c5a5411`
- **Archived at**: 2026-05-03T14:34:01.045Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-03T14:34:01.783Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mopib9cd-cff5af022e40
rigId: rig-mopuhati-3d6891cb
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
  slug: x020-baseline-dropbook
  frameworkVersion: 0.1.300-x019.0
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/nexus
        baseSha: 93f8ce5089e0a115775c166534ca46f7ec196b8d
    - id: test-guild
      engineId: lab.guild-setup
      givens:
        plugins:
          - name: "@shardworks/stacks-apparatus"
            version: 0.1.300-x019.0
          - name: "@shardworks/tools-apparatus"
            version: 0.1.300-x019.0
          - name: "@shardworks/codexes-apparatus"
            version: 0.1.300-x019.0
          - name: "@shardworks/clerk-apparatus"
            version: 0.1.300-x019.0
          - name: "@shardworks/ratchet-apparatus"
            version: 0.1.300-x019.0
          - name: "@shardworks/fabricator-apparatus"
            version: 0.1.300-x019.0
          - name: "@shardworks/animator-apparatus"
            version: 0.1.300-x019.0
          - name: "@shardworks/loom-apparatus"
            version: 0.1.300-x019.0
          - name: "@shardworks/claude-code-apparatus"
            version: 0.1.300-x019.0
          - name: "@shardworks/spider-apparatus"
            version: 0.1.300-x019.0
          - name: "@shardworks/clockworks-apparatus"
            version: 0.1.300-x019.0
        config:
          settings:
            model: opus
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
              buildCommand: pnpm --filter @shardworks/stacks-apparatus --filter
                @shardworks/clockworks-stacks-signals-apparatus --filter
                @shardworks/lattice-apparatus --filter
                @shardworks/cartograph-apparatus build
              testCommand: pnpm --filter @shardworks/stacks-apparatus --filter
                @shardworks/clockworks-stacks-signals-apparatus --filter
                @shardworks/lattice-apparatus --filter
                @shardworks/cartograph-apparatus test
        files:
          - sourcePath: /workspace/nexus-mk2/experiments/X020-code-lookup-implementer/variants/artificer-baseline.md
            guildPath: roles/artificer.md
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
      briefPath: ../briefs/dropbook-replay.md
      waitForRigTerminal: true
      timeoutMs: 3600000
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
  manifestPath: /workspace/nexus-mk2/experiments/X020-code-lookup-implementer/manifests/baseline-dropbook.yaml
capturedAt: 2026-05-03T14:34:00.953Z
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
  ratchet/click_links: 0
  ratchet/clicks: 0
  spider/input-requests: 0
  spider/rigs: 1
totalRows: 21
capturedAt: 2026-05-03T14:34:00.961Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x020-baseline-dropbook-cff5af02
baseSha: 93f8ce5089e0a115775c166534ca46f7ec196b8d
headSha: a2931c6ea0a0144707711ace9f82c14038eb0c67
commitCount: 1
totalDiffBytes: 43191
capturedAt: 2026-05-03T14:34:01.042Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
