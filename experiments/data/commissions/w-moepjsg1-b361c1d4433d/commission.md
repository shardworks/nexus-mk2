The brief for this mandate (`w-modgu1ew`) cites specific line numbers that have drifted significantly:

- `clockworks.md:309,315,318,324` → actual lines 375,381,384,390 (~66-line shift; sections were re-organized between brief drafting and now)
- `plugins.md:43,50,153,154,205,207,305,309,513,517,528,544` → actual lines 43,50,159,160,211,213,311,315,521,525,536,552 (~5-8 line shift)
- `index.md:199-211` → the cited region no longer contains `nexus-clockworks` at all (file was partially updated since brief draft)

This is a process observation: briefs cite line numbers that go stale quickly, especially during periods of active doc revision. The current commission handles it by directing implementers to grep (D8). But the broader pattern is worth flagging — the brief author may want to consider citing search anchors (e.g. function/section names, distinctive phrases, or just `grep <pattern>` directives) rather than absolute line numbers in future docs-fix briefs.

Fix: tactical — update the briefing convention guidance, if any exists, to prefer grep-anchors over line numbers for prose docs. Strategic — consider whether the planning/primer pipeline can validate line-number references against current file state at commission-posting time and warn the patron when they're stale.