<task id="t2">
    <name>Update clerk.md cascade documentation</name>
    <files>docs/architecture/apparatus/clerk.md</files>
    <action>Update the "CDC Cascade Behavior" section so the downward cascade description (a) quotes the new resolution message and (b) describes the new parent-completed branch (warn for non-terminal children rather than cancelling them). Keep the upward-cascade description as-is. Audit nearby sections for any other references to the old message and update them in the same pass.</action>
    <verify>grep -n "sibling failure" docs/architecture/apparatus/clerk.md && grep -n "parent termination" docs/architecture/apparatus/clerk.md</verify>
    <done>The clerk.md cascade section accurately describes both branches of handleParentTerminal and quotes the new resolution string; no stale "sibling failure" wording remains in the file.</done>
  </task>