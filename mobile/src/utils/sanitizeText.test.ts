import { describe, expect, it } from 'vitest';

import { prepareOutgoingText, sanitizeText, truncateText } from './sanitizeText';

/** The exact set the backend refuses (backend/src/services/roadmap.ts). */
const BACKEND_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

describe('sanitizeText', () => {
  it('strips every character the backend rejects', () => {
    const everyControl = Array.from({ length: 0x80 }, (_, code) => String.fromCharCode(code)).join('');
    expect(BACKEND_CONTROL.test(sanitizeText(`a${everyControl}b`))).toBe(false);
  });

  it('keeps newline and tab, and plain text untouched', () => {
    expect(sanitizeText('Built APIs.\n\tUsed SQL.')).toBe('Built APIs.\n\tUsed SQL.');
  });

  it('turns carriage returns into newlines rather than dropping the line break', () => {
    expect(sanitizeText('one\r\ntwo\rthree')).toBe('one\ntwo\nthree');
  });

  it('removes the form feeds and NULs that pasted PDF text carries', () => {
    expect(sanitizeText('Skills\u000cPython\u0000SQL')).toBe('SkillsPythonSQL');
  });

  it('removes C1 controls too', () => {
    expect(sanitizeText('a\u0085b\u009fc')).toBe('abc');
  });

  it('leaves emoji, accents, RTL text and digits alone', () => {
    const text = 'Built 3 apps 🚀 café مرحبا שלום 日本語';
    expect(sanitizeText(text)).toBe(text);
  });

  it('can empty a string made only of control characters', () => {
    expect(sanitizeText('\u0000\u000c').trim()).toBe('');
  });
});

describe('truncateText', () => {
  it('returns short text unchanged', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  it('cuts plain text at the limit', () => {
    expect(truncateText('abcdef', 3)).toBe('abc');
  });

  it('never splits an emoji: keeps it whole or drops it whole', () => {
    expect(truncateText('ab🚀cd', 3)).toBe('ab'); // 🚀 is two units; cutting at 3 would halve it
    expect(truncateText('ab🚀cd', 4)).toBe('ab🚀');
  });

  it('never leaves a lone surrogate, wherever the cut falls', () => {
    const text = '🚀'.repeat(50);
    for (let max = 1; max < 60; max += 1) {
      const cut = truncateText(text, max);
      expect(cut.length).toBeLessThanOrEqual(max);
      // A string is well formed when it survives a UTF-16 round trip through encodeURIComponent.
      expect(() => encodeURIComponent(cut)).not.toThrow();
    }
  });

  it('removes a dangling joiner left by cutting a multi-part emoji', () => {
    const family = '👨‍👩‍👧'; // man ZWJ woman ZWJ girl
    const cut = truncateText(`a${family}`, 6); // a + man + ZWJ + the pair of woman's surrogates cut off
    expect(cut.endsWith('‍')).toBe(false);
    expect(() => encodeURIComponent(cut)).not.toThrow();
  });

  it('counts in UTF-16 units, the unit the backend limits in', () => {
    expect(truncateText('🚀🚀🚀', 4)).toBe('🚀🚀');
  });

  it('handles RTL and combining marks without throwing', () => {
    expect(() => truncateText('مرحبا'.repeat(100), 7)).not.toThrow();
    expect(truncateText('é'.repeat(10), 5).length).toBeLessThanOrEqual(5);
  });
});

describe('prepareOutgoingText', () => {
  it('sanitises, then truncates, so removed characters do not count toward the limit', () => {
    expect(prepareOutgoingText('ab\u000ccd', 4)).toBe('abcd');
  });
});
