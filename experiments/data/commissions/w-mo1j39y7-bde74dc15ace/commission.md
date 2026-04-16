<task id="t5">
    <name>Fix §6.3 configurability claim and delete §10</name>
    <files>packages/plugins/stacks/docs/specification.md</files>
    <action>In §6.3, remove the claim that MAX_CASCADE_DEPTH is configurable via guild.json. Replace with a statement that it is a hardcoded constant (16) and note that making it configurable is deferred. Also remove the resolved-question entry (§9 area) that references configurability. Delete §10 "Relationship to Existing Code" in its entirety.</action>
    <verify>grep -n "configurable\|Relationship to Existing Code\|§10" packages/plugins/stacks/docs/specification.md</verify>
    <done>No configurability claim remains in §6.3; §10 is gone; the resolved-question about cascade depth configurability is corrected to match.</done>
  </task>