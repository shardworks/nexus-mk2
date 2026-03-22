# Commission: Anima Naming System

## Status: Draft

## What I Need

An automated name generator for animas. When creating an anima, the system should be able to generate a fitting name based on the anima's role or character, rather than requiring the human to invent one every time.

## Design Intent

Names should feel like they belong in a guild — evocative, natural-language, memorable. Not UUIDs, not slugs, not `agent-47`.

### Name Styles

Different roles call for different naming flavors:

| Style | Vibe | Example roots |
|-------|------|---------------|
| **Political / Administrative** | Faux-Roman, authoritative | Cassius, Aurelius, Marcellus, Octavia |
| **Mystical** | Wizardly, sagely, arcane | Thandril, Seraphine, Mordecai, Althea |
| **Craftsman** | Medieval/fantasy artisan | Aldric, Bramwell, Wren, Isolde |

The style could be selected explicitly (`--style mystical`) or inferred from the role (sages get mystical names, artificers get craftsman names).

### Entropy Layers

To handle uniqueness at scale, names are built in layers:

1. **Root name** — drawn from the style pool (e.g., "Cassius")
2. **Epithet** — Docker-style random adjective+noun pairing (e.g., "the Ardent Fox"). Adds entropy and personality.
3. **Ordinal suffix** — Roman numeral appended only if collision still occurs after epithet (e.g., "XI")

Full example: **Cassius the Ardent Fox, XI**

Most animas will only need root + epithet. Ordinals are a last resort for high-volume creation.

### CLI Integration

- `nexus anima create --generate` or `nexus anima create --generate --style mystical` — auto-generate a name
- `nexus anima create "Theodius"` — manual name (always available, never removed)
- The generator should be deterministic given a seed, or at minimum, collision-resistant

## Open Questions

- How large should the name pools be? Dozens? Hundreds?
- Should the epithet pool be role-aware (sages get different epithets than artificers)?
- Should there be a `nexus anima name` command that just generates a name without creating an anima? Useful for previewing.
- Where do the word lists live? Bundled in the CLI? A separate data file?
