<task id="t2">
    <name>Fix lock() JSDoc</name>
    <files>packages/plugins/stacks/src/cdc.ts</files>
    <action>Replace the lock() method's JSDoc comment with the text specified in D2: "Seal the CDC registry — called by the Stacks core when arbor fires phase:started, after all apparatus start() methods complete."</action>
    <verify>grep -n "called on first write" packages/plugins/stacks/src/cdc.ts</verify>
    <done>The grep returns no matches — the stale "called on first write" text is gone and the correct description is in place.</done>
  </task>