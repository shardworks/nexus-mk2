import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expandString } from './template.ts';

describe('expandString', () => {
  it('replaces solo placeholder lines with full value', () => {
    const template = 'before\n{{DIFF}}\nafter';
    const inputs = { DIFF: 'line1\nline2\nline3' };
    const result = expandString(template, inputs);
    assert.equal(result, 'before\nline1\nline2\nline3\nafter');
  });

  it('replaces inline placeholders within a line', () => {
    const template = 'The file is {{NAME}} with {{COUNT}} lines';
    const inputs = { NAME: 'foo.ts', COUNT: '42' };
    const result = expandString(template, inputs);
    assert.equal(result, 'The file is foo.ts with 42 lines');
  });

  it('replaces unknown variables with empty string', () => {
    const template = '{{KNOWN}} and {{UNKNOWN}}';
    const inputs = { KNOWN: 'hello' };
    const result = expandString(template, inputs);
    assert.equal(result, 'hello and ');
  });

  it('handles empty input values', () => {
    const template = 'before\n{{EMPTY}}\nafter';
    const inputs = { EMPTY: '' };
    const result = expandString(template, inputs);
    assert.equal(result, 'before\n\nafter');
  });

  it('handles multiple placeholders on the same line', () => {
    const template = '{{A}} + {{B}} = {{C}}';
    const inputs = { A: '1', B: '2', C: '3' };
    const result = expandString(template, inputs);
    assert.equal(result, '1 + 2 = 3');
  });

  it('preserves lines with no placeholders', () => {
    const template = 'no placeholders here\njust text';
    const result = expandString(template, {});
    assert.equal(result, 'no placeholders here\njust text');
  });
});
