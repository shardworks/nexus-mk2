<task id="t3">
    <name>Build the clicks page shell and data layer</name>
    <files>packages/plugins/ratchet/pages/clicks/index.html</files>
    <action>Create the page skeleton following the writs-page top-of-file chrome pattern (stylesheet link, nav markup, active-nav hint). Lay out the two regions per D4: a tree area and a persistent right-hand detail pane visible simultaneously. Establish the IIFE scaffolding: module state, api helper, error helpers, view containers, URL-param parsing for ?click and ?root (D19, D23), and the initial data load that calls the new JSON click-tree endpoint. Do not implement rendering details yet — just the wiring so that a load yields a parsed ClickTree[] and the deep-link params are captured in state.</action>
    <verify>Start Oculus locally and open /pages/clicks/; the page loads with the shared chrome, the Clicks nav entry is active, and the network tab shows a successful call to the JSON click-tree endpoint.</verify>
    <done>The page serves at /pages/clicks/, the shared chrome renders, a JSON fetch populates in-memory state, and URL params are parsed into state without errors.</done>
  </task>