<task id="t1">
    <name>Extend click-tree tool with JSON output format</name>
    <files>packages/plugins/ratchet/src/tools/click-tree.ts; packages/plugins/ratchet/src/ratchet.test.ts (existing click-tree suite)</files>
    <action>Add an output-format parameter to the click-tree tool so callers can request structured ClickTree data instead of the rendered ASCII. Preserve the existing default so every current caller observes no behavior change. Mirror the shape used by click-extract's format parameter. Keep the underlying ratchet.tree() call intact — the change is only at the tool's output boundary. Update or add tests covering both the preserved default behavior and the new JSON path, including status/depth/rootId filter parity with the rendered path.</action>
    <verify>pnpm --filter @shardworks/nexus-plugin-ratchet test</verify>
    <done>click-tree accepts the new format option, returns structured ClickTree[] when requested, returns the exact same ASCII output as before when not requested, and the tool test suite passes.</done>
  </task>