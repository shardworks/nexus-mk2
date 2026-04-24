The Oculus click detail page at `packages/plugins/ratchet/pages/clicks/index.html` currently lacks any UI affordance for the supersede operation. Sibling commission `w-moc29uyp-2afae97a32cb` already covers the analogous gap for `amend` (Amend button + 'has history' hint). Once `nsg click supersede` ships, the same surface will need:

- A Supersede button in the click detail action bar (visible in any status, since supersede accepts any target status — see decision D6).
- A POST `/api/click/supersede` endpoint mirroring the new tool.
- A 'Superseded by' / 'Supersedes' panel in the detail view, fed from `links.inbound.filter(l => l.linkType === 'supersedes')` (and outbound for the reverse direction).

This is out of scope here, mirroring the amend brief's UI carve-out. Likely promotable as a sibling of `w-moc29uyp-2afae97a32cb` so both UI gaps land in one pass.