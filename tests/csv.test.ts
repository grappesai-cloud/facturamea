import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/lib/csv';

describe('toCsv', () => {
  it('returns empty string for empty input without columns', () => {
    expect(toCsv([])).toBe('');
  });

  it('escapes commas, quotes and newlines', () => {
    const out = toCsv([{ a: 'hello, world', b: 'she said "hi"', c: 'line1\nline2' }]);
    expect(out).toContain('"hello, world"');
    expect(out).toContain('"she said ""hi"""');
    expect(out).toContain('"line1\nline2"');
  });

  it('honors explicit column order', () => {
    const out = toCsv([{ b: 2, a: 1 }], ['a', 'b']);
    const lines = out.replace(/^﻿/, '').trim().split('\n');
    expect(lines[0]).toBe('a,b');
    expect(lines[1]).toBe('1,2');
  });

  it('handles null/undefined as empty cells', () => {
    const out = toCsv([{ a: null, b: undefined, c: 0 }]);
    const lines = out.replace(/^﻿/, '').trim().split('\n');
    expect(lines[1]).toBe(',,0');
  });
});
