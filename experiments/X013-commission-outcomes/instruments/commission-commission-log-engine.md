# Commission: Commission Log Engine

Add a guild engine that automatically stubs an entry in the sanctum's
commission log when a patron-sourced commission is posted.

## Motivation

X013 requires a commission log entry for every patron commission,
populated at dispatch time. Currently Coco creates stubs manually at
session start (checking for missing entries). A standing engine removes
that friction: the stub exists before the session starts, and Sean can
fill in dispatch-time fields immediately after posting.

## Scope

- A standing order binding to `writ.ready` (or `writ.posted`) for
  patron-sourced writs — i.e., writs where `sourceType === 'patron'`
  or the writ has no parent (top-level commissions only; not child writs)
- When triggered, append a stub entry to
  `experiments/ethnography/commission-log.yaml` in the nexus-mk2
  sanctum with the following fields populated:
  - `writ_id` — from the writ record
  - `date_posted` — current timestamp
  - `title` — from the writ title/summary
  - `anima` — assigned anima if determinable at this point, else null
- All other fields left null (patron fills dispatch-time fields;
  remaining fields accumulate later)

## Key Decisions for the Artificer

- The commission log lives in the nexus-mk2 sanctum repo, not in
  shardworks. The engine needs write access to
  `/workspace/nexus-mk2/experiments/ethnography/commission-log.yaml`.
  Confirm this is accessible from the guild environment before
  proceeding; if not, surface the constraint and propose an alternative
  (e.g., a stub file in shardworks that Coco syncs).
- Do not create duplicate entries. If a `writ_id` already exists in
  the log, skip it.
- The engine writes YAML — preserve the file's existing structure and
  append to the `commissions` list.
- Commit the updated log file after writing; include the writ id in
  the commit message.

## Acceptance Criteria

- Dispatching a patron commission triggers the engine and appends a
  stub entry to the commission log within the same session
- The stub contains writ_id, date_posted, title; anima if available
- Re-dispatching or re-triggering the same writ_id does not create
  a duplicate
- Existing log entries are not modified
