<task id="t8">
    <name>Final cross-cutting audit: search for stale references and verify rig templates inherit recovery cleanly</name>
    <files>monorepo-wide</files>
    <action>Grep across the monorepo for any consumer that branched on seal's throw as a control-flow signal (e.g. `catch` blocks around scriptorium.seal calls outside the seal engine itself, references to "Sealing seized" in non-test code, rig templates that wired engines downstream of seal). Confirm no such consumers exist or, if they do, that they are unaffected by the new completed-with-graft return path. Confirm Spider's standard mandate template, Astrolabe's two-phase-planning, and Astrolabe's three-phase-planning all still reach their terminal state in a smoke run (or via existing template tests) without changes to their rig template definitions.</action>
    <verify>grep -rn 'Sealing seized' packages/ docs/ ; grep -rn "engineId.*'seal'" packages/ ; pnpm -w typecheck ; pnpm -w test</verify>
    <done>No unexpected consumers of seal's throw exist; typecheck and tests pass repo-wide; the three rig templates that terminate in seal still type-check and pass their existing tests.</done>
  </task>