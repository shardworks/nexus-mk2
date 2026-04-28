`packages/plugins/clockworks/README.md:718` references `validateSignal`, `RESERVED_EVENT_NAMESPACES`, etc. as part of the package's exports. After C1 these are gone, but the README still lists them.

The CLI's README (if any) has parallel risk — worth a grep for `RESERVED_EVENT_NAMESPACES`, `WRIT_LIFECYCLE_SUFFIXES`, `validateSignal` after the C1 diff to catch any string-literal references that grep doesn't catch as imports.

**Files**: `packages/plugins/clockworks/README.md`, plus any README files referencing the deleted symbols.
**Action**: After C1's deletes, run a final grep for the three deleted symbol names and update any README references.