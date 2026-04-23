`packages/plugins/clerk/README.md` mentions `summon` as a built-in writ type in two places, but `BUILTIN_TYPES` in `packages/plugins/clerk/src/clerk.ts:74` contains only `'mandate'`. No `summon` type is registered anywhere in the Clerk today.

Stale-doc sites:
- `README.md:62` — `"Throws if the writ type is not declared in the guild config and is not a built-in type (\`mandate\`, \`summon\`)."`
- `README.md:335` — `"The built-in types \`mandate\` and \`summon\` are always available without declaration."`

These appear to be leftovers from an earlier vocabulary (possibly when `summon` was a separate builtin, or when the README was drafted ahead of implementation). The fix is a two-word edit per location — drop `, \`summon\`` and change `types` to `type` / adjust plural-to-singular agreement — but it is outside the scope of the present hardcoded-literal cleanup commission and belongs in a separate docs correction.