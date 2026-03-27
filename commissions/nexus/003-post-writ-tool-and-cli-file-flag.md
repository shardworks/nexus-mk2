## Title

Add `post-writ` tool for steward and `--file` flag to `nsg writ post` CLI

## Description

The steward currently has no tool to post a top-level writ that enters the Clockworks pipeline. `create-writ` is the wrong tool — it sets `sourceType: 'anima'` and does not signal `writ.posted`, so the pipeline never fires. The patron-side equivalent (`nsg writ post` CLI) is not available inside an anima session.

Add a `post-writ` tool to `@shardworks/nexus-stdlib` that:

- Creates a writ with `sourceType: 'patron'`
- Accepts `title`, `description` (optional), `workshop` (optional), `type` (optional, defaults to `'writ'`)
- Signals `writ.posted` after creation, with `writId` and `workshop` in the payload (matching what the CLI does)
- Returns the created writ record

This is the steward's mechanism for posting work on the patron's behalf — "translate intent into writs and post them."

### Also: `--file` flag for `nsg writ post`

The CLI `writ post` command takes `<spec>` as an inline string argument. There is no way to pass a file directly — patrons must resort to `$(cat spec.md)` shell workarounds for longer specs. Add a `--file <path>` option that reads the spec from a file instead:

```
nsg writ post --file my-commission.md --workshop nexus
```

When `--file` is provided, `<spec>` becomes optional (mutually exclusive). The file contents are read and used as the spec — first line becomes the title, full contents become the description, same as the inline path.

## Acceptance Criteria

- [ ] `post-writ` tool exists in `@shardworks/nexus-stdlib`
- [ ] Creates writ with `sourceType: 'patron'`
- [ ] Signals `writ.posted` event with `{ writId, workshop }` payload
- [ ] Accepts `title` (required), `description` (optional), `workshop` (optional), `type` (optional)
- [ ] Tool instructions explain that this is for top-level patron writs — not for child writ decomposition (use `create-writ` for that)
- [ ] `nexus-bundle.json` in `guild-starter-kit` updated: `post-writ` added to steward role, `create-writ` removed from steward role
- [ ] `guild.json` in shardworks guild updated to match
- [ ] `nsg writ post` accepts `--file <path>` as an alternative to the inline `<spec>` argument
- [ ] `--file` and inline `<spec>` are mutually exclusive; error if both provided or neither provided
- [ ] File contents are read and used as spec (first line → title, full contents → description)
