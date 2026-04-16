<task id="t3">
    <name>Create the `manual-merge` purpose-built quick engine</name>
    <files>packages/plugins/spider/src/engines/manual-merge.ts, packages/plugins/spider/src/engines/index.ts</files>
    <action>Create a new engine module modeled on review.ts and revise.ts. Its givens take the writ, the draft yield (path + sha), and the target sha/branch needed to instruct the anima. Its run() composes a prompt from those givens and summons the anima under the `mender` role in the draft worktree. Its `collect()` reads the session's final output, parses the marker decided in D8 (`### Merge: SUCCESS` / `### Merge: FAILURE` on its own line, case-insensitive, mirroring review's regex style), and **throws** if the marker is `FAILURE` or absent (D12). On success, return a yield containing at minimum the sessionId and the parsed result. Export the engine from the engines barrel.</action>
    <verify>pnpm -w --filter @nexus/spider typecheck</verify>
    <done>manual-merge.ts compiles, exports an EngineDesign with engineId `manual-merge`, and is reachable from the engines index.</done>
  </task>