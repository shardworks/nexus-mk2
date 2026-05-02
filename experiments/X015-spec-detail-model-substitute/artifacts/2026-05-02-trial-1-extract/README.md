# Trial extract — X015 trial 1 — Sonnet implementer + Opus reviewer on Clerk refactor (N=1)

- **Trial id**: `w-moocgkzf-3b7e3f651ec4`
- **Archive id**: `lar-mooes8sh-8cd45c48107e`
- **Archived at**: 2026-05-02T14:00:06.785Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-02T14:00:07.424Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-moocgkzf-3b7e3f651ec4
rigId: rig-moocjd2e-d0dec964
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
  slug: x015-trial-1-clerk-refactor-sonnet-n1
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
              buildCommand: pnpm -w typecheck
              testCommand: pnpm -w test
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
      timeoutMs: 7200000
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
capturedAt: 2026-05-02T14:00:06.567Z
```

### stacks — `lab.probe-stacks-dump`

```yaml
bookCounts:
  animator/sessions: 1
  animator/state: 1
  animator/transcripts: 1
  clerk/links: 0
  clerk/writs: 1
  clockworks/event_dispatches: 0
  clockworks/events: 4
  spider/input-requests: 0
  spider/rigs: 1
totalRows: 9
capturedAt: 2026-05-02T14:00:06.574Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x015-trial-1-clerk-refactor-sonnet-n1-3b7e3f65
baseSha: d871dd76cd56f9236a8866952081b22f8dbcfa30
headSha: d871dd76cd56f9236a8866952081b22f8dbcfa30
commitCount: 0
totalDiffBytes: 0
capturedAt: 2026-05-02T14:00:06.781Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
