import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION } from './index.ts';

describe('index', () => {
  it('exports a version string', () => {
    assert.equal(typeof VERSION, 'string');
    assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  });
});
