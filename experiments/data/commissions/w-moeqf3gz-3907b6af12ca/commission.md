The body of `w-modqps5m` references `packages/plugins/clerk/pages/writs/index.html` lines 84-92 hardcoding `All / new / open / completed / failed / cancelled` phase buttons. Post-T5, those lines (83-97 in the current draft) hold the classification buttons (`initial / active / terminal`) and an HTML comment explicitly notes that the legacy phase buttons were replaced. The body's premise is correct as a snapshot of the pre-T5 codebase but is misleading when read against the current draft.

This is a property of the observation-lift workflow rather than a bug: the observation was lifted from a planning pass that ran *before* T5 sealed, and `astrolabe.observation-lift` does not re-validate body text after dependent mandates land. Two ways to mitigate going forward:

1. Add a curator-side step that re-reads observation bodies after their `depends-on` mandate terminates, flagging any whose narrative is now stale.
2. Adopt a convention in observation bodies: when an observation is contingent on a sibling/parent mandate, phrase the body in the conditional ("if T5 selects option B, then ...") so the snapshot stays meaningful regardless of how the dependency lands.

This is a process observation, not a code change.