<!-- Live body for this quest is a file in the vibers guild. See .claude/skills/quests/SKILL.md. -->
<!-- Do not edit this row body while the quest is live. -->

## Goal

Find the root cause of a recurring failure mode in which a baseline astrolabe reader session starts with the MCP tool server healthy, successfully makes multiple MCP tool calls, and then mid-session every `inventory-write` (and other astrolabe tool) call starts returning HTTP 500 for the remainder of the session. The session's last-ditch retry loop burns several dollars and exits 0 without a usable inventory. We want to know *why the tool server stops responding mid-session*, not just defend against the symptom — this is distinct from the engine-precondition quest (`w-mny2ltvy`), which addresses the case where the tool is never reachable at start.