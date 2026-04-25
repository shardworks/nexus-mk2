`LoomApi.weave` is permissive: an unknown role returns an `AnimaWeave` with no tools (`packages/plugins/loom/src/loom.ts:285-306`). That meant the Animator's `summon()` could quietly launch sessions against undefined roles — the system relied on every caller doing its own pre-check. The summon relay now has to do exactly that pre-check (decision D3 here) by walking `loom.listRoles()`, which:

1. Re-implements role-existence logic at every caller.
2. Loses the chance to emit a single, consistent error message at the Loom layer.
3. Hides the silent-fall-through that already affects the existing `summon` CLI tool (animator/src/tools/summon.ts) — an operator typing `nsg summon --role artificier` (typo) gets a session with no tools, not an error.

A follow-up should consider making `loom.weave({ role })` throw on unknown roles by default, with `weave({ role, allowUnknown: true })` (or similar) for the rare callers that want the permissive behavior. The Animator's `summon()` would then naturally surface the throw to its callers; the summon relay's preflight check (D3) collapses into trusting the Loom; the `loom-weave` tool stays usable for `--allow-unknown` previews.

Three Defaults #2 (`prefer fail-loud to silent fallback`) explicitly applies.