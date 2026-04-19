When viewing a 'rig' details page in the Oculus, teh details table card at the top is fairly sparse. We should add additional fields:

- Completed Engines: X of Y (showing completed engines vs total in rig currently)
- Elapsed: total runtime of the rig, counting up dynamically while the rig is running, the same way the engine detail pane does
- Cost (`$x.yy (12,222 input, 12,223 output)`): total cost of all quick engines which have run so far. round dollar amount to 2 decimals and include token summary. should update as the rig progresses

Additions/fixes to engine details:

- only show transcript for anima engines, and make sure the correct transcript displays (we see transcripts on clockwork pages and its not always the right one)
- show cost on quick anima engines, same format as for rig details

Main spider page / rig table:

- Show the cost (rounded USD only, no tokens) for each row, to the left of the 'Engines' column