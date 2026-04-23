`docs/architecture/index.md` describes The Clockworks (§7, line 505 onward), The Surveyor (§2 mention, table row), and The Executor (table row) as named apparatus. None exist as packages in `packages/plugins/`. The same pattern recurs in:

- `packages/plugins/codexes/README.md:5` — 'that's the Surveyor's domain'
- `docs/architecture/plugins.md:530` — lists `nexus-surveyor` in an example `requires` array
- `docs/architecture/rigging.md:35–37` — describes The Executor as the substrate abstraction the Spider calls into

This brief's table refresh removes them from the *Default Apparatus* row list (per D4) but leaves the body references untouched. A follow-up commission should either (a) extract the missing plugins, or (b) explicitly mark these apparatus as 'planned / framework concepts' wherever they're cited, so the doc stops promising apparatus the reader can't install.