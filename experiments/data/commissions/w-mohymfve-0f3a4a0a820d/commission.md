`docs/architecture/clockworks.md` references the soon-to-be-renamed event family in several canonical examples:
- line 17: type sketch `name: string;       // e.g. "commission.sealed", "tool.installed"`
- line 101: standing-order example `{ "on": "commission.sealed", "run": "cleanup-worktree" }`
- lines 247–248: failure example using `commission.failed`
- line 281: "Animas cannot signal framework events (`anima.*`, `commission.*`, `tool.*`, `session.*`, etc.)"
- line 296: another `commission.sealed` standing-order example

C2 (Clockworks event surface migration, mandate `w-mohuowyh`) is the natural home for these renames — it owns the commission.* deletions and the `clockworks.md` doc refresh. Surfaced here so the C2 reading pass picks them up; out of scope for C4. Animator's piece (`session.ended` mentions) is mostly internal to clockworks.md (line 281 and any cookbook references) and could be touched by C4's doc refresh; default per decision D-readme is to keep edits focused and let C2 sweep clockworks.md.