docs/architecture/apparatus/spider.md still reads as the MVP scope:
- "MVP scope" callout describes a static rig graph; reality has rig templates with kit contributions, grafts for dynamic extension, conditional execution via `when`, etc.
- Operational model lists only `nsg crawl-continual` and `nsg crawl-one`; ~17 tools now ship.
- BlockType registry not described as a first-class concept (it is, with five built-ins).
- Grafts and SpiderEngineRunResult shape not documented.
- Rig templates, kit contributions, and template precedence not documented.
- Implement-loop, step-session, manual-merge, anima-session engines not mentioned.
- Configuration section documents only `pollIntervalMs` and `variables`; missing concurrency throttles.
- Cross-reference to scriptorium recovery uses pre-engine-retry "rig goes stuck" prose.
- Worktree-state preconditions are implicit (detached-HEAD bug surfaced one).

This is essentially a comprehensive rewrite to match shipped reality.

DO NOT DISPATCH until engine-retry / cascade-engine / scriptorium reattach work all settle.