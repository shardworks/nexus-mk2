`packages/plugins/clerk/pages/writs/index.html:1670-1828` carries a duplicate codex policy: load /api/codex/list, require selection, auto-select on length === 1. With the server now defaulting the single-codex case, the form's auto-select behavior is technically redundant (but still good UX) and the multi-codex required-selection check has a server-side mirror.

This is intentional defense in depth, not a duplication problem — but a future cleanup could:

- Replace the form's hand-rolled codex policy with a thin wrapper that surfaces the server's error response unchanged (the form already shows `errEl` based on backend errors elsewhere).
- Add an Oculus integration test that asserts the multi-codex 400/throw path is wired through the REST surface.