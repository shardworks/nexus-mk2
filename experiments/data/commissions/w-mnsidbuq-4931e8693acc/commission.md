## Opened With

Historical scratch file preserved for the record. Originally drafted in `.scratch/animator-page-for-oculus.md`:

---

# Oculus: Spider Page Enhancements

## Rig Templates

Rig templates should display in a tabular format with key metadata (id, contributing plugin/guild config, # of engines, writ type mappings, resolution engine, that sort of thing.) Clicking an entry in this table should display the rig template graphically (the same way running rigs are displayed as a graph, just with the static config state for details and no runtime state). The expanded view should also include the template spec json for review.

## Rigs List

The rigs list should include the writ title as a column. Reorder columns as follows:

- Status
- Writ Title
- Engines
- Rig Id
- Writ Id
- Created

## Rigs Detail

### Writ Details

Details of the writ with which a rig is associated should be clearly visible at the top of the page. This should include the writ's title and the body of the writ spec, in a sufficiently large/resizable text area.

### Elapsed

For completed engines, the engine card should show the elapsed time (in a friendly format, such as 1h 13m 22s`) for engines which have completed. A placeholder, similar to what is show for the completed line while an engine is running can be used before it completes.

### Quick Engine Session Log

When viewing the details for a running quick engine (i.e. an engine with an anima session), the details view should include a large/resizable text area containing the message log from that session. If the session is still active, a spinner or other standard indicator of activity should be displayed and new messages should be displayed in real time as they are received.

### Quick Engine Costs

For quick engines which have completed, the card should also include a cost summary, both in terms of 'input tokens', 'output tokens', and 'usd'.

---

## Summary

Work shipped via writ w-mnp6ge2k-1c70c6e56b59. This quest exists as a historical record of the design thinking that fed the commission.

## Notes

- 2026-04-10: migrated from scratch file .scratch/animator-page-for-oculus.md to quest for historical preservation.
- 2026-04-10: marked complete and linked (fulfilled_by) to w-mnp6ge2k-1c70c6e56b59.