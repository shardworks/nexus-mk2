# Coco's Pre-Dispatch Expectations

> Written before the first real commission dispatch (guild monitor v1). These predictions are meant to be compared against actual results — no retroactive editing.

## Commission

Guild Monitor — a local web dashboard showing guild configuration data, built in a separate workshop repo, importing `@shardworks/nexus-core` as a library.

## What I Think Will Go Well

- **The agent will understand the spec.** It's clear, bounded, and concrete. "Read config, show it on a web page" is well within single-session capability.
- **Framework selection will be reasonable.** The codex NFRs (TypeScript, mature, lightweight, permissive license) constrain the space enough that any choice should be acceptable.
- **The exported function contract is simple enough to get right.** `startMonitor({ home, port? })` — hard to mess up.

## Where I Think It'll Stumble

- **Orientation will be expensive.** The workshop repo starts empty. The agent has to figure out `@shardworks/nexus-core`'s API from npm — reading type definitions, maybe published docs, maybe just guessing. It won't have the benefit of having *built* the core. I'd bet 30-40% of turns are orientation, which would confirm X007:H2.
- **The `readGuildConfig` import will cause friction.** Installing `@shardworks/nexus-core` from npm, importing it correctly, dealing with potential ESM/CJS issues, and realizing it needs a real guild path to test against. I expect at least one false start here.
- **The dev harness will be an afterthought.** Agents tend to build the main thing and tack on the developer experience. The "pass a guild path as an argument" UX will probably be clunky.
- **Layout and information hierarchy will be flat.** The agent will probably dump every section in a vertical stack with equal visual weight. Functional but not *navigable*. It'll meet "readable" but strain "navigable without explanation."

## Genuine Uncertainties

- Whether it commits cleanly and atomically, or dumps everything in one big commit at the end.
- Whether it writes tests at all. The codex will say "tests are required" — does it actually do that for a web UI project?
- Whether it stays in scope. The commission says "not in scope: SQLite data." Will it resist the urge to go further?
- Whether the commission spec we carefully crafted actually produces better output than a lazy "build me a guild dashboard" would have.

## Overall Prediction

The agent will produce **something that runs and shows the right data, but feels rough.** Functional, not polished. The kind of output where you say "yeah, that works" but immediately start thinking about what to fix. One major friction point (probably the core import or dev harness), zero showstoppers.

I trust the agent to try hard and produce something that runs. I don't trust it to produce something I'd be proud of on the first pass.

## What I'm Most Curious About

The orientation cost. If 30-40% of the session is spent figuring out a codebase the agent has never seen, that's a concrete, measurable tax — and it validates the warm-session optimization (X007:H2) as worth building.
