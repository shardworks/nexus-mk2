<task id="t4">
    <name>Full-repo verification</name>
    <files>repo-wide verification — no file edits expected</files>
    <action>Run the monorepo's full typecheck and test suite to confirm nothing downstream broke. Grep for any lingering references to parseTaskManifest across the repo. Confirm the piece-system infrastructure retained per D3 still typechecks and its tests still pass (spider/src/piece-pipeline.test.ts, clerk.test.ts piece-add tests, supportkit.test.ts piece-writ assertion).</action>
    <verify>pnpm -w typecheck &amp;&amp; pnpm -w test &amp;&amp; grep -rn "parseTaskManifest" packages/</verify>
    <done>Typecheck and full test suite pass. Grep returns no parseTaskManifest hits anywhere in packages/. piece-pipeline.test.ts, the piece-add tests in clerk.test.ts, and the piece writ-type assertion in supportkit.test.ts are untouched and passing.</done>
  </task>