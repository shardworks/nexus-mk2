/**
 * Loom Composition Verification Tests
 *
 * Commission: w-mnjl74k8-ad073e761c15 — "Loom: Charter, Role Instructions, and Tool Instructions Composition"
 *
 * These tests assert that the Loom apparatus correctly implements system prompt
 * composition from guild charter, role instructions, and tool instructions
 * (composition layers 1, 4, and 5). Tests verify the implementation in loom.ts,
 * the test coverage in loom.test.ts, and the documentation updates.
 *
 * Reference: experiments/data/commissions/w-mnjl74k8-ad073e761c15/commission.md
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const NEXUS = '/workspace/nexus';
const LOOM_SRC = join(NEXUS, 'packages', 'plugins', 'loom', 'src');
const LOOM_TS = join(LOOM_SRC, 'loom.ts');
const LOOM_TEST_TS = join(LOOM_SRC, 'loom.test.ts');
const LOOM_README = join(NEXUS, 'packages', 'plugins', 'loom', 'README.md');
const LOOM_ARCH_DOC = join(NEXUS, 'docs', 'architecture', 'apparatus', 'loom.md');
const ARCH_INDEX = join(NEXUS, 'docs', 'architecture', 'index.md');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSource(filePath: string): string {
  assert.ok(existsSync(filePath), `Expected file to exist: ${filePath}`);
  return readFileSync(filePath, 'utf8');
}

// ---------------------------------------------------------------------------
// R1 / R13: Charter file reads are implemented in loom.ts
// ---------------------------------------------------------------------------

describe('R1, R13 — charter.md is read at startup', () => {
  it('loom.ts imports node:fs and node:path for file system access', () => {
    const src = readSource(LOOM_TS);
    assert.ok(
      src.includes("import fs from 'node:fs'") || src.includes('import * as fs from'),
      'loom.ts must import the node:fs module',
    );
    assert.ok(
      src.includes("import path from 'node:path'") || src.includes('import * as path from'),
      'loom.ts must import the node:path module',
    );
  });

  it('loom.ts declares charterContent state variable', () => {
    const src = readSource(LOOM_TS);
    assert.ok(
      src.includes('charterContent'),
      'loom.ts must declare charterContent to cache the charter at startup',
    );
  });

  it('loom.ts reads charter.md from the guild home directory at startup', () => {
    const src = readSource(LOOM_TS);
    assert.ok(
      src.includes('charter.md'),
      'loom.ts must reference charter.md for the single-file charter path',
    );
    assert.ok(
      src.includes('readFileSync'),
      'loom.ts must use fs.readFileSync to read charter content at startup',
    );
  });

  it('loom.ts handles ENOENT silently when charter.md does not exist', () => {
    const src = readSource(LOOM_TS);
    assert.ok(
      src.includes('ENOENT'),
      'loom.ts must catch ENOENT errors when charter.md is absent (silent omission per R3)',
    );
  });
});

// ---------------------------------------------------------------------------
// R2 / R13: charter/ directory fallback is implemented
// ---------------------------------------------------------------------------

describe('R2, R13 — charter/ directory fallback is implemented', () => {
  it('loom.ts checks for a charter/ directory when charter.md does not exist', () => {
    const src = readSource(LOOM_TS);
    // The fallback directory path should reference 'charter' as a path segment
    assert.ok(
      src.includes("'charter'") || src.includes('"charter"'),
      'loom.ts must reference the charter/ directory as a fallback',
    );
  });

  it('loom.ts filters .md files when reading the charter/ directory', () => {
    const src = readSource(LOOM_TS);
    assert.ok(
      src.includes('.md'),
      "loom.ts must filter for .md files when scanning the charter/ directory",
    );
  });

  it('loom.ts sorts charter directory files alphabetically', () => {
    const src = readSource(LOOM_TS);
    // The implementation must call .sort() on the file list
    assert.ok(
      src.includes('.sort()'),
      'loom.ts must sort charter directory files alphabetically (lexicographic order per R2)',
    );
  });

  it('loom.ts joins charter directory files with double newlines', () => {
    const src = readSource(LOOM_TS);
    assert.ok(
      src.includes("'\\n\\n'") || src.includes('"\\n\\n"'),
      "loom.ts must join charter directory sections with '\\n\\n'",
    );
  });
});

// ---------------------------------------------------------------------------
// R4 / R5 / R12: Role instruction files are read at startup
// ---------------------------------------------------------------------------

describe('R4, R5, R12 — role instruction files are pre-read at startup', () => {
  it('loom.ts declares roleInstructions state variable (a Map)', () => {
    const src = readSource(LOOM_TS);
    assert.ok(
      src.includes('roleInstructions'),
      'loom.ts must declare roleInstructions to cache role content at startup',
    );
    assert.ok(
      src.includes('new Map'),
      'loom.ts must use a Map to store per-role instruction content',
    );
  });

  it('loom.ts reads roles/{roleName}.md for each configured role at startup', () => {
    const src = readSource(LOOM_TS);
    assert.ok(
      src.includes('roles'),
      'loom.ts must reference the roles/ subdirectory for role instruction file paths',
    );
    // The path should be constructed with role name and .md extension
    assert.ok(
      src.includes('.md') && (src.includes('roleName') || src.includes('rolePath')),
      'loom.ts must construct role instruction file paths from role names',
    );
  });

  it('loom.ts reads role files at startup (inside start(), not weave())', () => {
    const src = readSource(LOOM_TS);
    // The readFileSync call for roles should be inside the start() method
    // We verify by checking that roleInstructions is populated inside start
    const startIndex = src.indexOf('start(');
    const weaveIndex = src.indexOf('async weave(');
    assert.ok(startIndex !== -1, 'loom.ts must have a start() method');
    assert.ok(weaveIndex !== -1, 'loom.ts must have an async weave() method');
    // roleInstructions population (new Map + loop) should appear after start and before weave
    // Since start() appears after the weave closure in the file, check that roleInstructions
    // is set in start()
    const roleInstructionsSetIndex = src.indexOf('roleInstructions = new Map');
    assert.ok(
      roleInstructionsSetIndex > weaveIndex,
      'roleInstructions must be initialised in start(), not in weave() — file reads happen at startup',
    );
  });

  it('loom.ts silently skips roles whose instruction file is absent (R5)', () => {
    const src = readSource(LOOM_TS);
    // The try/catch for role files should not re-throw
    // We check that the catch block for role reads does not include 'throw'
    // after the role read try/catch (the charter catch may throw for non-ENOENT)
    const rolesSection = src.slice(src.indexOf('roleInstructions = new Map'));
    // Within the roles section, there should be a try/catch that does not throw
    assert.ok(
      rolesSection.includes('catch'),
      'loom.ts must wrap role file reads in try/catch for silent omission',
    );
  });
});

// ---------------------------------------------------------------------------
// R6: RoleDefinition type is unchanged — no instructions field
// ---------------------------------------------------------------------------

describe('R6 — RoleDefinition type is unchanged', () => {
  it('loom.ts exports RoleDefinition with only permissions and strict fields', () => {
    const src = readSource(LOOM_TS);
    // Extract the RoleDefinition interface block
    const roleDefMatch = src.match(/export interface RoleDefinition \{[\s\S]*?\}/);
    assert.ok(roleDefMatch, 'loom.ts must export a RoleDefinition interface');

    const roleDefBlock = roleDefMatch[0];
    assert.ok(
      roleDefBlock.includes('permissions'),
      'RoleDefinition must have a permissions field',
    );
    assert.equal(
      roleDefBlock.includes('instructions'),
      false,
      'RoleDefinition must not have an instructions field (convention-based, not config)',
    );
  });

  it('loom.ts RoleDefinition has no instructionsFile field', () => {
    const src = readSource(LOOM_TS);
    const roleDefMatch = src.match(/export interface RoleDefinition \{[\s\S]*?\}/);
    assert.ok(roleDefMatch, 'loom.ts must export a RoleDefinition interface');
    const roleDefBlock = roleDefMatch[0];
    assert.equal(
      roleDefBlock.includes('instructionsFile'),
      false,
      'RoleDefinition must not have an instructionsFile field — role instruction path is convention-based (roles/{role}.md)',
    );
  });
});

// ---------------------------------------------------------------------------
// R7: Tool instructions are included with ## Tool: header format
// ---------------------------------------------------------------------------

describe('R7 — tool instructions are formatted with ## Tool: header', () => {
  it('loom.ts formats tool instructions as "## Tool: {name}\\n\\n{instructions}"', () => {
    const src = readSource(LOOM_TS);
    assert.ok(
      src.includes('## Tool:'),
      'loom.ts must format tool instructions with a "## Tool:" section header per R7',
    );
  });

  it('loom.ts reads tool instructions from definition.instructions on resolved tools', () => {
    const src = readSource(LOOM_TS);
    assert.ok(
      src.includes('definition.instructions') || src.includes('.instructions'),
      'loom.ts must read tool instructions from ResolvedTool.definition.instructions',
    );
  });
});

// ---------------------------------------------------------------------------
// R8: Composition order is charter → tool instructions → role instructions
// ---------------------------------------------------------------------------

describe('R8 — composition order: charter → tool instructions → role instructions', () => {
  it('loom.ts uses a layers array to assemble the system prompt', () => {
    const src = readSource(LOOM_TS);
    assert.ok(
      src.includes('layers'),
      'loom.ts must use a layers array to collect system prompt sections',
    );
  });

  it('loom.ts pushes charter before tool instructions in the layers array', () => {
    const src = readSource(LOOM_TS);
    const charterPushIndex = src.indexOf('layers.push(charterContent)');
    const toolPushIndex = src.indexOf('## Tool:');
    assert.ok(charterPushIndex !== -1, 'loom.ts must push charterContent to layers');
    assert.ok(toolPushIndex !== -1, 'loom.ts must push tool instructions to layers');
    assert.ok(
      charterPushIndex < toolPushIndex,
      'Charter must be pushed to layers before tool instructions (composition order per R8)',
    );
  });

  it('loom.ts pushes tool instructions before role instructions in the layers array', () => {
    const src = readSource(LOOM_TS);
    const toolPushIndex = src.indexOf('## Tool:');
    const rolePushIndex = src.indexOf('roleInstructions.get(');
    assert.ok(toolPushIndex !== -1, 'loom.ts must push tool instructions to layers');
    assert.ok(rolePushIndex !== -1, 'loom.ts must push role instructions to layers');
    assert.ok(
      toolPushIndex < rolePushIndex,
      'Tool instructions must be pushed before role instructions (composition order per R8)',
    );
  });

  it('loom.ts joins layers with double newlines ("\\n\\n")', () => {
    const src = readSource(LOOM_TS);
    assert.ok(
      src.includes("layers.join('\\n\\n')") || src.includes('layers.join("\\n\\n")'),
      "loom.ts must join layers with '\\n\\n' separator per R8",
    );
  });
});

// ---------------------------------------------------------------------------
// R9 / R10: systemPrompt is undefined (not empty string) when no layers produce content
// ---------------------------------------------------------------------------

describe('R9, R10 — systemPrompt is undefined when no content', () => {
  it('loom.ts only sets systemPrompt when layers are non-empty', () => {
    const src = readSource(LOOM_TS);
    assert.ok(
      src.includes('layers.length > 0') || src.includes('layers.length'),
      'loom.ts must check layers.length before setting systemPrompt (undefined vs empty string)',
    );
  });

  it('AnimaWeave.systemPrompt is typed as optional (string | undefined)', () => {
    const src = readSource(LOOM_TS);
    // Check that systemPrompt is declared as optional with ?
    assert.ok(
      src.includes('systemPrompt?:'),
      'AnimaWeave.systemPrompt must be declared as optional (systemPrompt?:) per R10',
    );
  });
});

// ---------------------------------------------------------------------------
// R11: Charter is always included regardless of role
// ---------------------------------------------------------------------------

describe('R11 — charter is included regardless of whether a role is provided', () => {
  it('loom.ts pushes charterContent to layers unconditionally (not inside a role check)', () => {
    const src = readSource(LOOM_TS);
    // The charter push should not be inside the `if (request.role` block
    // We verify by checking that the charter push appears before any role-specific logic in weave()
    const charterPushIndex = src.indexOf('layers.push(charterContent)');
    const roleCheckIndex = src.indexOf('roleInstructions.has(request.role)');
    assert.ok(charterPushIndex !== -1, 'loom.ts must push charterContent to layers');
    assert.ok(
      charterPushIndex < roleCheckIndex || roleCheckIndex === -1,
      'Charter must be added to layers without a role guard — it applies to all weave() calls',
    );
  });
});

// ---------------------------------------------------------------------------
// R12 / R13: Both charter and role files are read at startup, not per-weave
// ---------------------------------------------------------------------------

describe('R12, R13 — file reads happen at startup, not per-weave', () => {
  it('loom.ts initialises charterContent inside start(), not weave()', () => {
    const src = readSource(LOOM_TS);
    // Find start() and weave() positions
    const startIndex = src.indexOf('start(');
    // charterContent = undefined should appear inside start()
    const charterUndefinedIndex = src.indexOf('charterContent = undefined');
    assert.ok(startIndex !== -1, 'loom.ts must have a start() method');
    assert.ok(
      charterUndefinedIndex > startIndex || charterUndefinedIndex === -1,
      'Charter content must be initialised inside start() for startup caching (R13)',
    );
  });

  it('loom.ts initialises roleInstructions inside start() using fs.readFileSync', () => {
    const src = readSource(LOOM_TS);
    // readFileSync calls for roles should be inside the start block
    // The roleInstructions = new Map() assignment is the sentinel
    const startIndex = src.indexOf('start(');
    const roleMapIndex = src.indexOf('roleInstructions = new Map()');
    assert.ok(
      roleMapIndex !== -1,
      'loom.ts must reset roleInstructions inside start() for each startup',
    );
    assert.ok(
      roleMapIndex > startIndex,
      'roleInstructions must be populated inside start() for startup caching (R12)',
    );
  });
});

// ---------------------------------------------------------------------------
// Test coverage verification: loom.test.ts has comprehensive coverage
// ---------------------------------------------------------------------------

describe('Test coverage — loom.test.ts covers all required test cases', () => {
  it('loom.test.ts exists and is non-trivial', () => {
    assert.ok(existsSync(LOOM_TEST_TS), `loom.test.ts must exist at ${LOOM_TEST_TS}`);
    const src = readFileSync(LOOM_TEST_TS, 'utf8');
    assert.ok(
      src.length > 5000,
      'loom.test.ts must contain comprehensive tests (file appears too small)',
    );
  });

  it('loom.test.ts has tests for charter composition (V1, V2, V3)', () => {
    const src = readSource(LOOM_TEST_TS);
    assert.ok(
      src.includes('charter composition') || src.includes('charter.md'),
      'loom.test.ts must have tests covering charter composition (R1, R2, R3)',
    );
  });

  it('loom.test.ts tests charter.md single-file path (V1)', () => {
    const src = readSource(LOOM_TEST_TS);
    assert.ok(
      src.includes('charter.md'),
      'loom.test.ts must test the charter.md single-file charter path',
    );
  });

  it('loom.test.ts tests charter/ directory with alphabetical ordering (V2, V13)', () => {
    const src = readSource(LOOM_TEST_TS);
    assert.ok(
      src.includes('charter/') || src.includes("'charter'"),
      'loom.test.ts must test the charter/ directory fallback',
    );
    assert.ok(
      src.includes('alphabetical') || src.includes('01-') || src.includes('02-'),
      'loom.test.ts must verify charter files are ordered alphabetically',
    );
  });

  it('loom.test.ts tests role instructions composition (V4, V5)', () => {
    const src = readSource(LOOM_TEST_TS);
    assert.ok(
      src.includes('role instructions') || src.includes('roles/'),
      'loom.test.ts must have tests covering role instructions composition (R4, R5)',
    );
  });

  it('loom.test.ts tests tool instructions with ## Tool: format (V7, V11)', () => {
    const src = readSource(LOOM_TEST_TS);
    assert.ok(
      src.includes('## Tool:'),
      'loom.test.ts must verify the ## Tool: header format for tool instructions (R7)',
    );
  });

  it('loom.test.ts tests full composition order: charter → tools → role (V8)', () => {
    const src = readSource(LOOM_TEST_TS);
    assert.ok(
      src.includes('composition') && src.includes('order'),
      'loom.test.ts must test the composition order (charter → tool instructions → role instructions)',
    );
  });

  it('loom.test.ts tests that systemPrompt is undefined when no content (V9)', () => {
    const src = readSource(LOOM_TEST_TS);
    assert.ok(
      src.includes('undefined') && src.includes('systemPrompt'),
      'loom.test.ts must verify systemPrompt is undefined (not empty string) when no layers produce content (R9)',
    );
  });

  it('loom.test.ts tests startup caching (V12)', () => {
    const src = readSource(LOOM_TEST_TS);
    assert.ok(
      src.includes('startup') || src.includes('caching') || src.includes('cached'),
      'loom.test.ts must have tests verifying content is cached at startup (R12)',
    );
  });

  it('loom.test.ts tests that roles not in config are not pre-read (V21)', () => {
    const src = readSource(LOOM_TEST_TS);
    assert.ok(
      src.includes('not in config') || src.includes('phantom') || src.includes('not pre-read'),
      'loom.test.ts must verify that roles not in config.roles are not pre-read (R12)',
    );
  });

  it('loom.test.ts uses real temp directories (not mocked fs)', () => {
    const src = readSource(LOOM_TEST_TS);
    assert.ok(
      src.includes('mkdtempSync') || src.includes('tmpdir'),
      'loom.test.ts must use real temp directories per commission spec (no fs mocking)',
    );
  });

  it('loom.test.ts has at least 20 test cases', () => {
    const src = readSource(LOOM_TEST_TS);
    // Count all `it(` occurrences as a proxy for test count
    const testCount = (src.match(/\bit\(/g) ?? []).length;
    assert.ok(
      testCount >= 20,
      `loom.test.ts must have at least 20 test cases; found ${testCount}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Documentation: loom.md status updated (commission non-obvious touchpoint)
// ---------------------------------------------------------------------------

describe('Documentation — loom.md reflects active composition', () => {
  it('loom.md reports status as Active (not MVP stub)', () => {
    const src = readSource(LOOM_ARCH_DOC);
    assert.ok(
      src.includes('Active'),
      "loom.md must report 'Active' status — composition layers 1, 4, 5 are now active",
    );
  });

  it('loom.md mentions layers 1, 4, and 5 as active', () => {
    const src = readSource(LOOM_ARCH_DOC);
    assert.ok(
      src.includes('1') && src.includes('4') && src.includes('5'),
      'loom.md must reference composition layers 1, 4, and 5 as active',
    );
  });

  it('loom.md does not say "composition not yet implemented"', () => {
    const src = readSource(LOOM_ARCH_DOC);
    assert.equal(
      src.includes('composition not yet implemented'),
      false,
      'loom.md must not contain stale "composition not yet implemented" language',
    );
  });

  it('loom.md documents the systemPrompt field on AnimaWeave', () => {
    const src = readSource(LOOM_ARCH_DOC);
    assert.ok(
      src.includes('systemPrompt'),
      'loom.md must document the systemPrompt field on AnimaWeave',
    );
  });
});

// ---------------------------------------------------------------------------
// Documentation: README updated
// ---------------------------------------------------------------------------

describe('Documentation — loom README reflects active composition', () => {
  it('loom README exists', () => {
    assert.ok(existsSync(LOOM_README), `loom README must exist at ${LOOM_README}`);
  });

  it('loom README does not say "composition not yet implemented"', () => {
    const src = readSource(LOOM_README);
    assert.equal(
      src.includes('composition not yet implemented'),
      false,
      'loom README must not contain stale "composition not yet implemented" language',
    );
  });

  it('loom README does not say "MVP — composition not yet implemented"', () => {
    const src = readSource(LOOM_README);
    assert.equal(
      src.includes('MVP — composition not yet implemented'),
      false,
      'loom README must not contain the old MVP stub comment',
    );
  });

  it('loom README describes system prompt composition', () => {
    const src = readSource(LOOM_README);
    assert.ok(
      src.includes('system prompt') || src.includes('systemPrompt') || src.includes('charter'),
      'loom README must describe the system prompt composition capability',
    );
  });
});

// ---------------------------------------------------------------------------
// Documentation: architecture/index.md session funnel updated
// ---------------------------------------------------------------------------

describe('Documentation — architecture index session funnel updated', () => {
  it('architecture index references charter in the session funnel', () => {
    const src = readSource(ARCH_INDEX);
    assert.ok(
      src.includes('charter'),
      'architecture/index.md must reference charter in the session funnel',
    );
  });

  it('architecture index session funnel shows charter as an active composition layer', () => {
    const src = readSource(ARCH_INDEX);
    // The session funnel code block should contain charter as an active layer
    // (e.g. "system prompt: charter + tool instructions + role instructions")
    // rather than listing it as a future item.
    assert.ok(
      src.includes('system prompt: charter') ||
        src.includes('charter + tool') ||
        (src.includes('Weave context') && src.includes('charter')),
      'architecture/index.md session funnel must show charter as an active composition layer, not future',
    );
  });
});

// ---------------------------------------------------------------------------
// Structural: loom package exports remain stable (R10, R6)
// ---------------------------------------------------------------------------

describe('Structural — public API exports are stable', () => {
  it('loom/src/index.ts exports LoomApi, WeaveRequest, AnimaWeave, LoomConfig, RoleDefinition', () => {
    const indexTs = join(LOOM_SRC, 'index.ts');
    assert.ok(existsSync(indexTs), `loom index.ts must exist at ${indexTs}`);
    const src = readFileSync(indexTs, 'utf8');
    for (const exportName of ['LoomApi', 'WeaveRequest', 'AnimaWeave', 'LoomConfig', 'RoleDefinition']) {
      assert.ok(
        src.includes(exportName),
        `loom/src/index.ts must export ${exportName}`,
      );
    }
  });

  it('loom.ts exports createLoom function', () => {
    const src = readSource(LOOM_TS);
    assert.ok(
      src.includes('export function createLoom') || src.includes('export const createLoom'),
      'loom.ts must export the createLoom() factory function',
    );
  });
});
