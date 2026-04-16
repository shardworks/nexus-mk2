<task id="t3">
    <name>Update engines.test.ts to match canonical single-post behavior</name>
    <files>packages/plugins/astrolabe/src/engines.test.ts</files>
    <action>Delete the test that exercises the manifest-aware branch (the one asserting piece-writ creation and manifest-stripping). Delete the three parseTaskManifest unit tests and drop the parseTaskManifest import. Rename the existing 'falls back to legacy path when spec has no task-manifest' test to a name that describes the canonical behavior (e.g. 'publishes the spec verbatim as the mandate body'). In that renamed test — or in a sibling test at the same describe level — add an assertion that when the spec contains a &lt;task-manifest&gt; block, the published mandate body contains that block character-for-character. Keep the existing setup and mocking patterns from the current legacy-path test.</action>
    <verify>pnpm --filter @nexus/astrolabe test</verify>
    <done>engines.test.ts contains no references to parseTaskManifest and no test that expects piece-writ creation. The canonical test asserts single-post behavior and manifest-preservation. The astrolabe test suite passes.</done>
  </task>