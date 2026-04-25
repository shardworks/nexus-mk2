`packages/plugins/animator/src/types.ts:659` declares `[key: string]: unknown` on `AnimatorStatusDoc` so the type satisfies `BookEntry`. Side effect: any extra field (typo, accidental include, schema drift) parses cleanly into the type at runtime and at the type checker. The persisted shape's invariants are not enforced by TS.

After D6 (`dispatchable` lives only on the *response*, not on the persisted doc), this becomes more salient — a future change that accidentally adds `dispatchable` to the persisted row would not be caught at the type level. A schema-validation pass at write time (or a stricter `Pick`-shaped reader type) would protect the persisted shape from drift.

No concrete bug today, just a brittleness latent in the type.