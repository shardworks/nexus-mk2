<task id="t6">
    <name>Fix conformance test spec paths and annotations</name>
    <files>packages/plugins/stacks/docs/specification-conformance-tests.md</files>
    <action>Update the implementation notes path from packages/stacks/src/conformance/ to packages/plugins/stacks/src/conformance/. Add a "(not yet implemented)" annotation to the conformance.sqlite.test.ts reference.</action>
    <verify>grep -n "packages/stacks/src\|conformance.sqlite" packages/plugins/stacks/docs/specification-conformance-tests.md</verify>
    <done>All paths use packages/plugins/stacks/src; the SQLite test reference is annotated as not yet implemented.</done>
  </task>