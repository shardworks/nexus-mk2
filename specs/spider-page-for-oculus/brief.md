# Spider page for Oculus

The spider should have a 'recommends' dependency on Oculus, and contribute a page for managing its configuration and runtime state. 

## Runtime Ui

There should be a display of rigs and their key metadata, including links back to the writ on the clerk's page. Sorting and filtering should be possible, particularly by status or by writ.

It should be possible to click a single rig to see a detail status of its execution progress. This should include all engines in the rigs, and their status (such as completed, pending, blocked, etc.) It should be possible to see the relationships between engines, and click on a particular engine to see its configuration details, status, etc.

## Config UI

The new page should allow users to see:

- Configured rig templates, and their structure (via readonly JSON text areas)
- Registered engine designs, their contributing plugin, and useful details for each
- Registered block types, their contributing plugin, and useful details for each
