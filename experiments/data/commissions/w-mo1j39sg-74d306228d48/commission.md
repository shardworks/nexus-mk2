<task id="t1">
    <name>Refactor firePhase2() to use getPhase2Handlers()</name>
    <files>packages/plugins/stacks/src/cdc.ts</files>
    <action>Refactor the firePhase2() method to delegate handler filtering to getPhase2Handlers(), mirroring how firePhase1() delegates to getPhase1Handlers(). The method must still iterate over events, resolve the ownerId/book from each event, get filtered handlers, and call each one in a try/catch that logs errors. The behavioral contract (errors logged not thrown, phase 2 semantics) must be preserved exactly.</action>
    <verify>pnpm --filter @shardworks/stacks-apparatus test</verify>
    <done>firePhase2() delegates to getPhase2Handlers() for handler filtering; the inline filter logic is removed; all tests pass.</done>
  </task>