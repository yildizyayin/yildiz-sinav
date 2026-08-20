import { describe, expect, it } from 'vitest';
import { analyzeFixedWidthSample, parseAnswerKeyText } from '../src/lib/guidedDefinitions';

const subjects = [
  { id: 'sub_mat', code: 'MAT', name: 'Matematik' },
  { id: 'sub_tur', code: 'TUR', name: 'Türkçe' },
  { id: 'sub_fen', code: 'FEN', name: 'Fen Bilimleri' },
];

describe('guided answer key parser', () => {
  it('infers subject counts from a simple answer key', () => {
    const result = parseAnswerKeyText('MAT: ABCDE\nTUR;ABCDEABCDE\nFEN,ABCDE', subjects);
    expect(result.entries).toHaveLength(3);
    expect(result.questionCounts.sub_mat).toBe(5);
    expect(result.questionCounts.sub_tur).toBe(10);
    expect(result.detectedBooklets).toEqual(['A']);
  });

  it('supports booklet blocks', () => {
    const result = parseAnswerKeyText('[A]\nMAT: ABCDE\n[B]\nMAT: EDCBA', subjects);
    expect(result.entries.map((x) => x.bookletCode)).toEqual(['A', 'B']);
    expect(result.detectedBooklets).toEqual(['A', 'B']);
  });
});

describe('fixed width sample analysis', () => {
  it('returns conservative field suggestions', () => {
    const sample = [
      '1001AHMET YILMAZ        ABCDEABCDE',
      '1002AYSE DEMIR          EDCBAABCDE',
      '1003MEHMET KAYA         ABCDEEDCBA',
    ].join('\n');
    const result = analyzeFixedWidthSample(sample);
    expect(result?.recordLength).toBe(sample.split('\n')[0].length);
    expect(result?.studentNumber?.start).toBe(0);
    expect((result?.answerBlocks.length || 0)).toBeGreaterThan(0);
  });
});
