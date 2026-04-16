<task id="t4">
    <name>Update §8 backend signatures and count() in specification.md</name>
    <files>packages/plugins/stacks/docs/specification.md</files>
    <action>In §8, add a note explaining that the StacksBackend interface uses Promise signatures as the general contract, but the current better-sqlite3 implementation uses synchronous signatures throughout. Also update the count() signature to show count(ref: BookRef, query: CountQuery): number with the CountQuery type definition, matching the actual backend.ts interface.</action>
    <verify>grep -n "count(" packages/plugins/stacks/docs/specification.md</verify>
    <done>§8 includes the async/sync explanatory note and the count() signature matches the actual CountQuery pattern.</done>
  </task>