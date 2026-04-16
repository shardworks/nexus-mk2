<task id="t2">
    <name>Register the clicks page in Ratchet's supportKit and publish the directory</name>
    <files>packages/plugins/ratchet/src/ratchet.ts; packages/plugins/ratchet/package.json; packages/plugins/ratchet/src/ratchet.test.ts</files>
    <action>Add a pages entry to Ratchet's supportKit contribution with the id/title/dir values per D25. Extend the package.json files array so the new pages directory is published — match Clerk's shape. Add a test asserting the supportKit.pages contribution matches the expected entry, modeled on the Clerk precedent.</action>
    <verify>pnpm --filter @shardworks/nexus-plugin-ratchet test &amp;&amp; pnpm -w typecheck</verify>
    <done>supportKit exposes the clicks page contribution, package.json publishes the pages directory, the new test passes, and types check cleanly.</done>
  </task>