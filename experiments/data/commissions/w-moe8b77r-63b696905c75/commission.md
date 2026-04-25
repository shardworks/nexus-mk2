`docs/reference/event-catalog.md` still uses the dropped `summon:` sugar form in many examples (notably L19, L48, L160, L173, L181, L188, L195, L210, L212, L230, L231). Multiple sections describe `summon`/`brief` as first-class verbs alongside `run`, and the dispatch-flow narrative (L181) still reads 'Execute the action (`run` engine, or `summon`/`brief` anima)'.

The doc-refresh commission for `clockworks.md` explicitly de-scopes other reference docs (out-of-scope clause: 'Reference-doc updates outside `clockworks.md` ... are separate concerns and tracked separately if needed'). This is the separate concern.

Follow-up commission should:
- Rewrite every standing-order example in event-catalog.md to use `{ on, run, with? }`
- Update the dispatch-flow narrative to drop the `summon`/`brief` verb references
- Refresh the writ-lifecycle event examples (L19, L48) to use `run: 'summon-relay'` invocation form
- Cross-check against `packages/plugins/clockworks/README.md` for the canonical phrasing