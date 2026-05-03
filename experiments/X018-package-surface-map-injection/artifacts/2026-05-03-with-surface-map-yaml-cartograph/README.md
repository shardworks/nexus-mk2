# Trial extract — X018 variant 3 — cartograph commission, YAML surface map (full schema, restored prefixes)

- **Trial id**: `w-mopaxksh-b985c3a997aa`
- **Archive id**: `lar-mopbrduy-8fd0ac435e97`
- **Archived at**: 2026-05-03T05:23:14.026Z
- **Writ phase**: completed
- **Writ resolved at**: 2026-05-03T05:23:14.694Z

## Probes

### context — `lab.probe-trial-context`

```yaml
trialId: w-mopaxksh-b985c3a997aa
rigId: rig-mopaxn85-d84e6e06
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
  slug: x018-with-surface-map-yaml-cartograph
  frameworkVersion: 0.1.298
  fixtures:
    - id: codex
      engineId: lab.codex-setup
      givens:
        upstreamRepo: /workspace/nexus
        baseSha: aff280e75add02bd25e1af0e9467e8a81bfbcd41
    - id: test-guild
      engineId: lab.guild-setup
      givens:
        plugins:
          - name: "@shardworks/stacks-apparatus"
            version: 0.1.298
          - name: "@shardworks/tools-apparatus"
            version: 0.1.298
          - name: "@shardworks/codexes-apparatus"
            version: 0.1.298
          - name: "@shardworks/clerk-apparatus"
            version: 0.1.298
          - name: "@shardworks/ratchet-apparatus"
            version: 0.1.298
          - name: "@shardworks/fabricator-apparatus"
            version: 0.1.298
          - name: "@shardworks/animator-apparatus"
            version: 0.1.298
          - name: "@shardworks/loom-apparatus"
            version: 0.1.298
          - name: "@shardworks/claude-code-apparatus"
            version: 0.1.298
          - name: "@shardworks/spider-apparatus"
            version: 0.1.298
          - name: "@shardworks/clockworks-apparatus"
            version: 0.1.298
          - name: "@shardworks/astrolabe-apparatus"
            version: 0.1.298
        config:
          settings:
            model: opus
          loom:
            roles:
              artificer:
                permissions:
                  - clerk:*
                  - tools:*
              patron:
                permissions: []
              astrolabe.sage-primer-attended:
                permissions:
                  - astrolabe:read
                  - astrolabe:write
                  - clerk:read
                  - ratchet:read
                strict: true
              astrolabe.sage-primer-solo:
                permissions:
                  - astrolabe:read
                  - astrolabe:write
                  - clerk:read
                  - ratchet:read
                strict: true
              astrolabe.sage-writer:
                permissions:
                  - astrolabe:read
                  - astrolabe:write
                  - clerk:read
                  - ratchet:read
                strict: true
          animator:
            sessionProvider: claude-code
          astrolabe:
            patronRole: patron
          spider:
            variables:
              role: artificer
            rigTemplates:
              lab.plan-only:
                engines:
                  - id: plan-init
                    designId: astrolabe.plan-init
                    upstream: []
                    givens:
                      writ: ${writ}
                  - id: draft
                    designId: draft
                    upstream:
                      - plan-init
                    givens:
                      writ: ${writ}
                  - id: reader-analyst
                    designId: astrolabe.reader-analyst
                    upstream:
                      - draft
                    givens:
                      prompt: "Plan ID: ${yields.plan-init.planId}"
                      cwd: ${yields.draft.path}
                      writ: ${writ}
                      metadata:
                        engineId: reader-analyst
                  - id: inventory-check
                    designId: astrolabe.inventory-check
                    upstream:
                      - reader-analyst
                    givens:
                      planId: ${yields.plan-init.planId}
                  - id: patron-anima
                    designId: astrolabe.patron-anima
                    upstream:
                      - inventory-check
                    givens:
                      planId: ${yields.plan-init.planId}
                      cwd: ${yields.draft.path}
                      writ: ${writ}
                  - id: decision-review
                    designId: astrolabe.decision-review
                    upstream:
                      - patron-anima
                    givens:
                      planId: ${yields.plan-init.planId}
                  - id: spec-writer
                    designId: anima-session
                    upstream:
                      - decision-review
                    givens:
                      role: astrolabe.sage-writer
                      prompt: |
                        Plan ID: ${yields.plan-init.planId}

                        Decision summary:
                        ${yields.decision-review.decisionSummary}
                      cwd: ${yields.draft.path}
                      writ: ${writ}
                      metadata:
                        engineId: spec-writer
                  - id: plan-finalize
                    designId: astrolabe.plan-finalize
                    upstream:
                      - spec-writer
                    givens:
                      planId: ${yields.plan-init.planId}
                  - id: observation-lift
                    designId: astrolabe.observation-lift
                    upstream:
                      - plan-finalize
                    givens:
                      planId: ${yields.plan-init.planId}
                resolutionEngine: observation-lift
            rigTemplateMappings:
              mandate: lab.plan-only
        files:
          - sourcePath: /workspace/nexus-mk2/experiments/X018-package-surface-map-injection/variants/sage-primer-attended-with-surface-map-yaml-aff280e7.md
            guildPath: roles/astrolabe.sage-primer-attended.md
          - sourcePath: /workspace/nexus/packages/plugins/astrolabe/sage-primer-solo.md
            guildPath: roles/astrolabe.sage-primer-solo.md
          - sourcePath: /workspace/nexus/packages/plugins/astrolabe/sage-writer.md
            guildPath: roles/astrolabe.sage-writer.md
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
      briefPath: /workspace/nexus-mk2/experiments/X018-package-surface-map-injection/briefs/cartograph-replay.md
      waitForRigTerminal: true
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
  manifestPath: /workspace/nexus-mk2/experiments/X018-package-surface-map-injection/manifests/with-surface-map-yaml.yaml
capturedAt: 2026-05-03T05:23:13.963Z
```

### stacks — `lab.probe-stacks-dump`

```yaml
bookCounts:
  animator/sessions: 3
  animator/state: 1
  animator/transcripts: 3
  astrolabe/plans: 1
  clerk/links: 0
  clerk/writs: 1
  clockworks/event_dispatches: 0
  clockworks/events: 13
  ratchet/click_links: 0
  ratchet/clicks: 0
  spider/input-requests: 0
  spider/rigs: 1
totalRows: 23
capturedAt: 2026-05-03T05:23:13.970Z
```

### commits — `lab.probe-git-range`

```yaml
codexName: x018-with-surface-map-yaml-cartograph-b985c3a9
baseSha: aff280e75add02bd25e1af0e9467e8a81bfbcd41
headSha: aff280e75add02bd25e1af0e9467e8a81bfbcd41
commitCount: 0
totalDiffBytes: 0
capturedAt: 2026-05-03T05:23:14.020Z
```

## Layout

- `manifest.yaml` — `ext.laboratory.config` from the trial writ.
- `README.md` — this file.
- Per-probe subdirectories — see each probe's extractor.
