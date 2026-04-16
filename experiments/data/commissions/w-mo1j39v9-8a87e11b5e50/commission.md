<task id="t3">
    <name>Update §5 query type generics in specification.md</name>
    <files>packages/plugins/stacks/docs/specification.md</files>
    <action>Remove the generic type parameter &lt;T&gt; from all query type signatures in §5 — WhereCondition, WhereClause, and BookQuery. The prose explaining why generics were dropped should remain; only the type signatures in code blocks need updating to match the actual types.ts definitions.</action>
    <verify>grep -n "&lt;T&gt;" packages/plugins/stacks/docs/specification.md</verify>
    <done>No query type signatures in §5 use &lt;T&gt;. The prose rationale remains intact.</done>
  </task>