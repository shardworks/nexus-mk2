<task id="t6">
    <name>Add behavioral tests covering the four recovery-path variants</name>
    <files>packages/plugins/spider/src/spider.test.ts</files>
    <action>Add tests that exercise the recovery sequence end-to-end against a stubbed scriptorium and stubbed animator. Cover the four variants enumerated in Acceptance Signal: full successful recovery; manual-merge anima failure (marker FAILURE or absent → engine fails → rig stuck); seal called with `abandon: true` failing → no graft, rig stuck; seal called with `recover: false` and scriptorium throwing rebase conflict → no graft, engine fails by throw. Use the existing testing patterns in spider.test.ts for stubbing scriptorium / animator and for asserting rig terminal status.</action>
    <verify>pnpm -w --filter @nexus/spider test</verify>
    <done>The four variants pass, and the existing spider.test.ts suite continues to pass.</done>
  </task>