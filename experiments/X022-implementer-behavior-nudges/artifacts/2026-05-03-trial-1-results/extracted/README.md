# Trial extract — X022 — rig-moj12h4o (substantive, Reckoner periodic tick) baseline (stock artificer.md)

- **Trial id**: `w-mopuwdsp-a987a5570301`
- **Archive id**: `lar-mopzkrza-d47537a11aec`
- **Archived at**: 2026-05-03T16:29:56.518Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-03T16:29:57.089Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mopuwdsp-a987a5570301
rigId: rig-mopwu90z-600daf30
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
  slug: x022-rig-moj12h4o-baseline
  frameworkVersion: 0.1.301
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/nexus
        baseSha: 0e1e81f4a219179fd264625b869e12bd00778365
    - id: test-guild
      engineId: lab.guild-setup
      givens:
        plugins:
          - name: "@shardworks/stacks-apparatus"
            version: 0.1.301
          - name: "@shardworks/tools-apparatus"
            version: 0.1.301
          - name: "@shardworks/codexes-apparatus"
            version: 0.1.301
          - name: "@shardworks/clerk-apparatus"
            version: 0.1.301
          - name: "@shardworks/fabricator-apparatus"
            version: 0.1.301
          - name: "@shardworks/animator-apparatus"
            version: 0.1.301
          - name: "@shardworks/loom-apparatus"
            version: 0.1.301
          - name: "@shardworks/claude-code-apparatus"
            version: 0.1.301
          - name: "@shardworks/spider-apparatus"
            version: 0.1.301
          - name: "@shardworks/clockworks-apparatus"
            version: 0.1.301
        config:
          loom:
            roles:
              artificer:
                model: opus
                permissions:
                  - clerk:*
                  - tools:*
              reviewer:
                model: opus
                permissions: []
          animator:
            sessionProvider: claude-code
          spider:
            variables:
              role: artificer
              buildCommand: pnpm --filter @shardworks/reckoner-apparatus build && pnpm
                --filter @shardworks/clockworks-apparatus build
              testCommand: pnpm --filter @shardworks/reckoner-apparatus test && pnpm --filter
                @shardworks/clockworks-apparatus test
        files:
          - sourcePath: /workspace/nexus-mk2/experiments/X022-implementer-behavior-nudges/fixtures/test-guild/roles/artificer-baseline.md
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
      briefPath: /workspace/nexus-mk2/experiments/X022-implementer-behavior-nudges/briefs/rig-moj12h4o-baseline.md
      waitForTerminal: true
      timeoutMs: 5400000
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
  manifestPath: /workspace/nexus-mk2/experiments/X022-implementer-behavior-nudges/manifests/rig-moj12h4o-baseline.yaml
capturedAt: 2026-05-03T16:29:56.298Z
```

### stacks — `lab.probe-stacks-dump`

```yaml
bookCounts:
  animator/sessions: 4
  animator/state: 1
  animator/transcripts: 4
  clerk/links: 0
  clerk/writs: 1
  clockworks/event_dispatches: 0
  clockworks/events: 15
  spider/input-requests: 0
  spider/rigs: 1
totalRows: 26
capturedAt: 2026-05-03T16:29:56.308Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x022-rig-moj12h4o-baseline-a987a557
baseSha: 0e1e81f4a219179fd264625b869e12bd00778365
headSha: 7c810bb3f8b3c5650852be0805c93dbcbe1c3029
commitCount: 1
totalDiffBytes: 196336
capturedAt: 2026-05-03T16:29:56.516Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
