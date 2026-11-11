import { describe, expect, it } from 'vitest';
import { gradeItem, normalizeAnswer, parseNumber, validateContent } from '../worker/lib/learning-universe/grading';

/** Öğrenme Evreni PR-1 (owner, 11 Nov 2026): the server decides what is right, for all ten game kinds. */
describe('answer normalisation', () => {
  it('compares Turkish text the Turkish way', () => {
    expect(normalizeAnswer('  İSTANBUL. ')).toBe('istanbul');
    expect(normalizeAnswer('IĞDIR')).toBe(normalizeAnswer('ığdır'));
    expect(normalizeAnswer('“Fotosentez”')).toBe('fotosentez');
    expect(normalizeAnswer('su   döngüsü')).toBe('su döngüsü');
  });
  it('reads numbers as students write them', () => {
    expect(parseNumber('3,5')).toBe(3.5);
    expect(parseNumber('1/4')).toBe(0.25);
    expect(parseNumber('2³')).toBe(8);
    expect(parseNumber('(-2)³')).toBe(-8);
    expect(parseNumber('5⁻²')).toBeCloseTo(0.04);
    expect(parseNumber('3·10²')).toBe(300);
    expect(parseNumber('%25')).toBe(25);
    expect(parseNumber('1.250,5')).toBe(1250.5);
    expect(parseNumber('−7')).toBe(-7);
    expect(parseNumber('iki')).toBeNull();
    expect(parseNumber('2+')).toBeNull();
  });
});

describe('grading every kind on the server', () => {
  it('multiple choice and listening', () => {
    expect(gradeItem('QUESTION', { correct: 'B' }, { answer: 'b' })).toEqual({ correct: true, partial: 1 });
    expect(gradeItem('AUDIO_QUESTION', { correct: 'C' }, { answer: 'A' })).toEqual({ correct: false, partial: 0 });
    expect(gradeItem('QUESTION', { correct: 'B' }, {})).toEqual({ correct: false, partial: 0 });
  });
  it('pairs (matching and memory): a left card counts once, partial shown but not passed', () => {
    const key = { pairs: [['a', '1'], ['b', '2'], ['c', '3']] };
    expect(gradeItem('PAIRS', key, { pairs: [['a', '1'], ['b', '2'], ['c', '3']] }).correct).toBe(true);
    const half = gradeItem('PAIRS', key, { pairs: [['a', '1'], ['a', '2'], ['b', '3']] });
    expect(half.correct).toBe(false);
    expect(half.partial).toBeCloseTo(1 / 3);
  });
  it('ordering needs every item in place', () => {
    expect(gradeItem('SEQUENCE', { order: ['x', 'y', 'z'] }, { order: ['x', 'y', 'z'] }).correct).toBe(true);
    const r = gradeItem('SEQUENCE', { order: ['x', 'y', 'z'] }, { order: ['x', 'z', 'y'] });
    expect(r).toMatchObject({ correct: false });
    expect(r.partial).toBeCloseTo(1 / 3);
  });
  it('fill-in accepts equivalents and numbers', () => {
    const key = { blanks: { b1: { accept: ['güneş', 'Güneş enerjisi'] }, b2: { numeric: { value: 0.5 } } } };
    expect(gradeItem('CLOZE', key, { blanks: { b1: 'GÜNEŞ ', b2: '1/2' } }).correct).toBe(true);
    expect(gradeItem('CLOZE', key, { blanks: { b1: 'ay', b2: '0,5' } })).toMatchObject({ correct: false, partial: 0.5 });
  });
  it('math journey checks the steps, not only the result', () => {
    const key = { steps: { s1: { numeric: { value: 8 } }, s2: { numeric: { value: 4 } }, s3: { numeric: { value: 32 } } } };
    expect(gradeItem('STEPS', key, { steps: { s1: '2³', s2: '2²', s3: '32' } }).correct).toBe(true);
    expect(gradeItem('STEPS', key, { steps: { s1: '6', s2: '4', s3: '32' } }).correct).toBe(false); // right result, wrong step
  });
  it('visual discovery: a point inside the right region', () => {
    const key = { target: ['heart'], regions: [{ id: 'heart', x: 0.4, y: 0.3, w: 0.2, h: 0.2 }, { id: 'lung', cx: 0.2, cy: 0.4, r: 0.1 }] };
    expect(gradeItem('HOTSPOT', key, { x: 0.5, y: 0.4 }).correct).toBe(true);
    expect(gradeItem('HOTSPOT', key, { x: 0.2, y: 0.4 }).correct).toBe(false);
    expect(gradeItem('HOTSPOT', key, { x: 3, y: 0.4 }).correct).toBe(false);
  });
});

describe('teacher content checks before approval', () => {
  it('refuses malformed content and accepts a good one', () => {
    expect(validateContent('PAIRS', { left: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], right: [{ id: '1', text: 'p' }, { id: '2', text: 'q' }] }, { pairs: [['a', '1'], ['b', '2']] })).toEqual([]);
    expect(validateContent('PAIRS', { left: [{ id: 'a' }], right: [{ id: '1' }] }, { pairs: [['a', '1']] }).length).toBeGreaterThan(0);
    expect(validateContent('SEQUENCE', { items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, { order: ['a', 'b'] }).length).toBeGreaterThan(0);
    expect(validateContent('CLOZE', { blanks: [{ id: 'b1' }] }, { blanks: {} }).length).toBeGreaterThan(0);
    expect(validateContent('HOTSPOT', { image: { url: 'https://x/y.png', width: 10, height: 10 } }, { regions: [{ id: 'r' }], target: ['r'] })).toContain('Görsel için yazılı açıklama gerekli.');
    expect(validateContent('AUDIO_QUESTION', { options: ['a', 'b', 'c'] }, { correct: 'B' })).toContain('Ses yoksa da etkinlik çalışsın diye yazılı metin gerekli.');
  });
});
