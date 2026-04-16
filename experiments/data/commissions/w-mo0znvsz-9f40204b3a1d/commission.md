# Task session handoff notes

## Goal

Design and implement a structured handoff mechanism for passing context from one task session to the next in the task-loop engine (v2). Each task session writes a short structured note at completion; the engine injects only the previous task's note into the next session's prompt.

## Design sketch

The handoff note is structured and short — not free-form prose:

```yaml
completed: "Added session-heartbeat tool endpoint"
changed:
  - packages/plugins/animator/src/tools/session-heartbeat.ts (new)
  - packages/plugins/animator/src/tools/index.ts  
  - packages/plugins/animator/src/animator.ts
note: "Registered in supportKit.tools array. Endpoint uses guild wall-clock time, not host-supplied timestamp."
```

Key properties:
- **Only the previous task's note** is injected into the next session prompt — no accumulation chain
- **`changed` field** tells the next session what files are different from the codebase inventory, saving re-discovery time
- **`note` field** captures non-obvious details the next session should know (e.g., naming choices, conventions followed, gotchas encountered)
- If the anima needs context from earlier tasks, it reads the codebase — which is the point of fresh sessions

## Mechanism options

1. **Tool-based** — the anima calls a `task-handoff` tool at session end with the structured note. Engine stores it on the child writ or a dedicated field.
2. **Convention-based** — the anima writes the note in a known format in its last message. The engine parses it out.
3. **Implicit** — the engine captures the last assistant message wholesale. (Rejected: too noisy, no structure guarantees.)

## Open questions

- Where is the handoff stored? On the task writ? On the session record? In a dedicated handoff book?
- Should the engine validate the handoff structure or accept best-effort?
- Does the implement anima need explicit instructions to write handoff notes, or is it a tool the engine always calls at session end?
- Should handoff notes from ALL previous tasks be available via a query tool (pull model) in addition to the previous note being pushed? Deferred unless single-previous-note proves insufficient.

## Dependencies

- v2: Task-loop implement engine (w-mo0yqdyr) — handoff notes are meaningless without the loop engine

## References

- Quest: w-mo0v636y (parent — decision-centric planner)
- Design conversation: session ed5d3df5-4b4a-45fc-9f4c-5be7a5aaad1a