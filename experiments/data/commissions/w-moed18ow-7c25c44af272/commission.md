The parent click chain at `c-moe1bd71` describes a self-decomposing planner that, when predicted files exceed the gate, automatically partitions the manifest's tasks into groups whose collective file-touches fit under the limit and dispatches each as a child commission. v0 establishes the signal; auto-decomposition is the headline downstream consumer.

This is explicitly Out of Scope for v0 ("Future commissions handle gating, halting, or auto-decomposition"), but the commission to wire it up is a natural follow-up after v0 has been running long enough to validate the threshold. Substrate already exists: per-task `<files>` data, Spider follows-link wiring, parent-commission completion semantics from observation-lift's grouped mode.

Open design questions captured in `c-moe1bd71`:
- How does the patron see what got auto-decomposed?
- Does the original brief get a pointer to the spawned children?
- What if the partition produces unbalanced loads?

Not a blocker for v0; the v0 storage + event provides the trigger surface this future commission will wire to.