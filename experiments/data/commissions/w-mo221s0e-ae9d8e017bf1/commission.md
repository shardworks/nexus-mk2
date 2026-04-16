<task id="t2">
    <name>Drop parseTaskManifest export from engines index</name>
    <files>packages/plugins/astrolabe/src/engines/index.ts</files>
    <action>Remove the parseTaskManifest re-export so the module no longer advertises a symbol that has been deleted. Before committing, verify no consumer outside of engines.test.ts imports parseTaskManifest from anywhere in the monorepo.</action>
    <verify>grep -rn "parseTaskManifest" packages/ --include="*.ts" | grep -v "engines.test.ts"</verify>
    <done>engines/index.ts no longer exports parseTaskManifest. The grep above returns no matches (the engines.test.ts hits are addressed in t3).</done>
  </task>