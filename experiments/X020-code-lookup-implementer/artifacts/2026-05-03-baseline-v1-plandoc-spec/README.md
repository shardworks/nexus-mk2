# Trial extract — X020 baseline — dropBook commission, production artificer (no code-lookup)

- **Trial id**: `w-mopwwox1-618d422946da`
- **Archive id**: `lar-mopydq2q-3d82b086bdf9`
- **Archived at**: 2026-05-03T15:56:27.842Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-03T15:56:28.882Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mopwwox1-618d422946da
rigId: rig-mopwwuj7-54a8501d
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
capturedAt: 2026-05-03T15:56:27.676Z
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
capturedAt: 2026-05-03T15:56:27.693Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x020-baseline-dropbook-618d4229
baseSha: 93f8ce5089e0a115775c166534ca46f7ec196b8d
headSha: ed7d614a9dd183ca209013afc51adc1b75d549fd
commitCount: 3
totalDiffBytes: 59122
capturedAt: 2026-05-03T15:56:27.838Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
