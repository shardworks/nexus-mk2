Spot-check across the workspace: some plugins have a `description` field (`reckoner-apparatus`'s description currently reads 'The Reckoner — observer that emits...') and some likely do not. The field is patron-visible (npm registry, IDE tooltips, `pnpm view`) but not load-bearing. There is no in-repo enforcement of description-field shape.

Follow-up: a small audit pass to either populate descriptions consistently across all plugin packages or document the convention. Either step makes the rename's D5 decision (update the description) feel less ad-hoc by establishing the broader convention.

Out of scope for this rename. Lifting because the question 'should we update the description here?' implicitly raises 'what is the convention?' and there is no documented answer today.