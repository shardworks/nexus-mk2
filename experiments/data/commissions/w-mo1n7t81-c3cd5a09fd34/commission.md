<task id="t3">
    <name>Update Clerk cascade tests to use the constant and cover the completion branch</name>
    <files>packages/plugins/clerk/src/clerk.test.ts</files>
    <action>Replace every assertion that references the old `'Automatically cancelled due to sibling failure'` literal with a reference to the newly exported constant from clerk.ts. Audit the entire file — do not trust the inventory's enumeration; grep within the file for any further occurrences. Add coverage for the new D4 branching: a test where the parent reaches `completed` with at least one non-terminal child should assert the children remain non-terminal AND that a warning was emitted (or otherwise observable). Existing tests for the `failed`/`cancelled` parent path should continue to pass against the new constant.</action>
    <verify>pnpm -w test --filter clerk</verify>
    <done>All clerk.test.ts assertions reference the exported constant; new tests cover both branches of handleParentTerminal (parent failed/cancelled cancels children; parent completed warns, doesn't cancel); the suite passes.</done>
  </task>