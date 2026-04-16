# v2: Task-Loop Implement Engine

## Summary

Replace the single-session implement engine with a task-loop model. Tasks from the planner's manifest become child writs of the mandate. The implement engine loops: pick the next open child task, spawn a fresh session to implement it, repeat until none remain, then run a final verification session. The anima has tools to add, reorder, or subdivide tasks as it discovers things the planner missed.

Depends on v1 (intent brief + task manifest format) being in place.

## Motivation

Even with intent briefs (v1), a single implement session accumulates context as it works through multiple tasks. For complex commissions this means:
- Late tasks get degraded attention (context window pressure)
- A failure mid-session may require replaying the entire session
- The agent can't easily checkpoint or resume
- Progress is invisible until the session completes

The task-loop model gives each task a fresh session that reads the codebase as it currently exists — more reliable than accumulated context, with natural checkpointing and observable progress.

## Design sketch

### Tasks as child writs

When Astrolabe produces a task manifest, each `<task>` becomes a child writ of the mandate (type TBD — possibly `task` as a new writ type, or just `mandate` children). The manifest's ordering and dependency information is preserved in the child writs.

### Implement engine loop

```
while mandate has open child tasks:
  task = next open child (by declared order)
  session = spawn(mandate_brief + task, on mandate's branch)
  if success → mark task completed
  if failure → mark task failed, decide retry/halt strategy
final_session = spawn("verify mandate as whole")
if passes → complete mandate
```

### Anima task tools

The implement anima gets tools to modify the task tree during execution:
- `task-add` — insert a new task (before X, after X, or at end)
- `task-reorder` — move a task in the sequence
- `task-split` — subdivide a task into smaller children

This handles the case where the planner missed something — the anima discovers during task 3 that an additional migration is needed and adds a task for it rather than silently handling it (or silently missing it).

### Session prompt design

Each task session receives:
- The mandate's implementation brief (decision-closure context)
- The current task's full description (name, action, verify, done)
- A summary of completed sibling tasks (what's already been done)
- Access to sibling task details via tools (not eagerly loaded)

### Commit granularity

Each task session commits to the mandate's branch. One commit per task is the default expectation, but the agent may make multiple commits within a task if the work warrants it.

## Open questions

- What writ type should tasks be? A new `task` type, or `mandate` children?
- How does the review engine interact? Does the final verification task replace it, complement it, or run before it?
- Retry strategy: on task failure, retry the same task? Add a remediation task? Halt and surface to patron?
- Should the engine support declaring task dependencies (DAG) or just linear ordering?
- How does this interact with the seal engine? Seal after each task, or seal once after all tasks?

## Constraints

- Must work with the existing Spider rig infrastructure (extend, not replace)
- Must be backward-compatible — mandates without child tasks still work as single-session implements
- The task-loop must be observable in Oculus (task status visible as child writs)

## References

- Quest: w-mo0v636y (decision-centric planner — task-loop design section)
- Prerequisite: v1 commission (Astrolabe output format)
- Related: w-mo0e31ca (concurrency control — task file footprints feed conflict detection)
- Related: w-mnsx8cz2 (writs as obligations, rigs as attempts — multi-rig refactor)