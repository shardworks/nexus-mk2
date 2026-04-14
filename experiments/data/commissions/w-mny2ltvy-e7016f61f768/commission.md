<!-- Live body for this quest is a file in the vibers guild. See .claude/skills/quests/SKILL.md. -->
<!-- Do not edit this row body while the quest is live. -->

## Goal

Decide and ship a design where agent-backed engine stages (notably astrolabe's anima-session stages — reader, spec-writer, and similar) declare the MCP tools their session depends on, and the runtime verifies those tools are actually reachable before starting the session. "Reachable" means more than "the plugin is registered" — it means the service backing the tool (e.g., a running guild daemon for tools that call the guild HTTP API) is alive and responding. Engines whose preconditions fail should refuse to start (or fail loudly with a precondition error) rather than spawning a session that will silently no-op its writes and still exit 0.