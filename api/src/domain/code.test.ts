import { describe, it, expect } from 'vitest';
import {
  suggestClientCode,
  buildCode,
  nextSequence,
  isValidClientCode,
  yymmFromDate,
  pad2,
} from './code.js';

describe('code', () => {
  it('validates client codes', () => {
    expect(isValidClientCode('ALEKS')).toBe(true);
    expect(isValidClientCode('A1')).toBe(true);
    expect(isValidClientCode('a')).toBe(false);
    expect(isValidClientCode('TOO-LONG')).toBe(false);
    expect(isValidClientCode('1ABC')).toBe(false);
  });

  it('suggests codes from Cyrillic names', () => {
    expect(suggestClientCode('Алекс Дизајн')).toBe('ALEKSDIZ'.slice(0, 8));
    expect(suggestClientCode('Ѓорѓи')).toContain('GJ');
    expect(suggestClientCode('Çeljë')).toBe('CELJE'.slice(0, 8));
    expect(suggestClientCode('Салон24')).toBe('SALON24');
  });

  it('pads a too-short suggestion to at least two chars', () => {
    expect(suggestClientCode('.').length).toBeGreaterThanOrEqual(2);
    expect(suggestClientCode('Х')).toBe('HX');
    expect(suggestClientCode('')).toBe('XX');
  });

  it('builds a base code', () => {
    expect(buildCode({ clientCode: 'ALEKS', yymm: '2609', nn: 3 })).toBe('ALEKS-2609-03');
  });

  it('appends language suffix for BOTH clients', () => {
    expect(buildCode({ clientCode: 'ALEKS', yymm: '2609', nn: 3, language: 'MK' })).toBe('ALEKS-2609-03-MK');
    expect(buildCode({ clientCode: 'ALEKS', yymm: '2609', nn: 3, language: 'SQ' })).toBe('ALEKS-2609-03-SQ');
    expect(buildCode({ clientCode: 'ALEKS', yymm: '2609', nn: 3, language: 'BOTH' })).toBe('ALEKS-2609-03');
  });

  it('throws on invalid parts', () => {
    expect(() => buildCode({ clientCode: 'bad', yymm: '2609', nn: 1 })).toThrow();
    expect(() => buildCode({ clientCode: 'ALEKS', yymm: '99', nn: 1 })).toThrow();
  });

  it('finds the next free sequence', () => {
    const existing = ['ALEKS-2609-01', 'ALEKS-2609-02', 'ALEKS-2609-05-MK', 'OTHER-2609-09'];
    expect(nextSequence(existing, 'ALEKS', '2609')).toBe(6);
    expect(nextSequence([], 'ALEKS', '2609')).toBe(1);
    expect(nextSequence(['ALEKS-2610-01'], 'ALEKS', '2609')).toBe(1);
  });

  it('derives YYMM from a date (UTC)', () => {
    expect(yymmFromDate(new Date(Date.UTC(2026, 8, 5)))).toBe('2609');
    expect(pad2(3)).toBe('03');
  });
});
