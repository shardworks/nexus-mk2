When our planning pipeline 'lifts' observations to writs, it currently makes them children of the original writ. This is somewhat incoherent:

- children are supposed to be completed BEFORE a parent, but these observations MUST be completed AFTER
- often times, observations aren't really related to the original pattern other than coincidentally or in terms of code proximity

Instead of this, we should do one of the following:

- lift all observations as standalone, top-level writs with an appropriate link back to the writ they came from for traceability
- or, if there are multiple observations (or >=N, possibly a configurable N), create a top-level parent to group them and make the observations childrens of that parent. (Linking the parent each child to the original writ with the appropriate link)