`packages/plugins/clerk/src/types.ts` has four JSDoc lines that hardcode the string `"mandate"` as the fallback default or example writ type:
- Line 106 (on `PostCommissionRequest.type`): `"Writ type. Defaults to the guild's configured defaultType, or \"mandate\""`
- Line 154 (on `WritTypeEntry.name`): `"The writ type name (e.g. \"mandate\", \"task\", \"bug\")."`
- Line 164 (on `ClerkConfig.writTypes`): `"Additional writ type declarations. The built-in type \"mandate\" is always valid."`
- Line 166 (on `ClerkConfig.defaultType`): `"Default writ type when commission-post is called without a type (default: \"mandate\")."`

These do not participate in enforcement — they are documentation only — but when the value is renamed they all diverge silently from the code. A future rename commission should sweep all of these (plus the README and the clerk.ts line 11 docstring) in one coordinated pass. Out of scope for the present commission.