<task id="t5">
    <name>Register `manual-merge` in Spider's supportKit and confirm `seal` registration carries through</name>
    <files>packages/plugins/spider/src/spider.ts (supportKit.engines)</files>
    <action>Add the `manual-merge` engine to Spider's `supportKit.engines` alongside the existing entries (`draft`, `implement`, `implement-loop`, `piece-session`, `review`, `revise`, `seal`, `anima-session`). The retry engine reuses the existing `seal` design (per D3 and D5) so no separate registration is needed for it. Confirm the existing `seal` entry continues to be reachable.</action>
    <verify>pnpm -w --filter @nexus/spider typecheck</verify>
    <done>Spider's supportKit lists `manual-merge`; spawning the supportKit produces engine designs for both `manual-merge` and `seal`.</done>
  </task>