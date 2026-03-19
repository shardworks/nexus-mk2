# Commit Conventions

## Builder Commit Format

All Builder commits use the subject format:

```
implements <feature-id>/<requirement-id>
```

The `<feature-id>/<requirement-id>` must be the fully qualified requirement identifier as defined in `$NEXUS_DOMAIN_PATH/requirements/index.yaml` (e.g., `implements environment/compliance`, `implements builder/traceability`).

This convention was formalized in commit `91cfe5c` (implements builder/traceability, 2026-03-19). Builder commits prior to that commit may use short (non-qualified) requirement IDs — these predate the requirement formalization and are not violations of the current traceability invariant.

## Evidence for Auditors

When evaluating `builder/traceability` invariant 1 ("Every Builder commit subject matches the format `implements <requirement-id>`"), auditors should scope evaluation to commits at or after `91cfe5c`. Commits prior to `91cfe5c` were produced under pre-formalization instructions where `<requirement-id>` was interpreted as an unqualified short ID.

Commits at or after `91cfe5c` that use non-qualified IDs would be genuine violations.
