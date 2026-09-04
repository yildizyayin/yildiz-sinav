import { describe, expect, it } from 'vitest';
import { parseUploadedText, type ParserTemplate } from '../worker/lib/parse';
import { decodeUploadedText } from '../worker/lib/sekonic-upload';

const parser129 = {
  type: 'fixed-width',
  recordLength: 222,
  signature: '129',
  fields: {
    student_number: { start: 11, end: 16 },
    name: { start: 16, end: 36 },
    class: { start: 48, end: 51 },
    booklet: { start: 55, end: 56 },
  },
  answers: {
    TUR: { start: 56, end: 96 },
    SOS: { start: 96, end: 142 },
    MAT: { start: 142, end: 182 },
    FEN: { start: 182, end: 222 },
  },
};

const parser7108 = {
  type: 'fixed-width',
  recordLength: 171,
  signature: '7108',
  fields: {
    student_number: { start: 10, end: 15 },
    name: { start: 15, end: 35 },
    class: { start: 35, end: 37 },
    booklet: { start: 50, end: 51 },
  },
  answers: {
    TUR: { start: 51, end: 71 },
    SOS: { start: 71, end: 91 },
    DIN: { start: 91, end: 111 },
    ING: { start: 111, end: 131 },
    MAT: { start: 131, end: 151 },
    FEN: { start: 151, end: 171 },
  },
};

const templates: ParserTemplate[] = [
  { id: 'v_opt129', name: 'Optik 129 TYT', parser_definition: JSON.stringify(parser129) },
  { id: 'v_opt7108', name: 'Optik 7108 LGS', parser_definition: JSON.stringify(parser7108) },
];

function fixedLine(length: number, placements: Array<[number, string]>): string {
  const chars = Array.from({ length }, () => ' ');
  for (const [start, value] of placements) {
    Array.from(value).forEach((char, offset) => {
      if (start + offset < chars.length) chars[start + offset] = char;
    });
  }
  return chars.join('');
}

function sequence(length: number, alphabet = 'ABCDE'): string {
  return Array.from({ length }, (_, index) => alphabet[index % alphabet.length]).join('');
}

describe('Sekonic real FMT-derived DAT mappings', () => {
  it('auto-detects and parses Optik 7108 LGS at 171 characters', () => {
    const tur = `A ${sequence(18, 'ABCD')}`;
    const row = fixedLine(171, [
      [0, '7108'],
      [10, '01234'],
      [15, 'ÇAĞLA ŞEN'],
      [35, '8A'],
      [50, 'B'],
      [51, tur],
      [71, sequence(20, 'ABCD')],
      [91, sequence(20, 'ABCD')],
      [111, sequence(20, 'ABCD')],
      [131, sequence(20, 'ABCD')],
      [151, sequence(20, 'ABCD')],
    ]);

    const parsed = parseUploadedText(row, 'sekonic-7108.dat', templates);
    expect(parsed.templateId).toBe('v_opt7108');
    expect(parsed.records).toHaveLength(1);
    const record = parsed.records[0];
    expect(record.student_number).toBe('01234');
    expect(record.name).toBe('ÇAĞLA ŞEN');
    expect(record.grade_level).toBe(8);
    expect(record.section).toBe('A');
    expect(record.booklet).toBe('B');
    expect(record.answers_by_subject.TUR).toHaveLength(20);
    expect(record.answers_by_subject.TUR[1]).toBe('_');
    expect(record.answers_by_subject.FEN).toHaveLength(20);
  });

  it('auto-detects and parses Optik 129 TYT at 222 characters', () => {
    const sos = sequence(46);
    const mat = `${sequence(10)} ${sequence(29)}`;
    const row = fixedLine(222, [
      [0, '129'],
      [11, '54321'],
      [16, 'ÖZGÜR IŞIK'],
      [48, '10B'],
      [55, 'A'],
      [56, sequence(40)],
      [96, sos],
      [142, mat],
      [182, sequence(40)],
    ]);

    const parsed = parseUploadedText(row, 'sekonic-129.dat', templates);
    expect(parsed.templateId).toBe('v_opt129');
    expect(parsed.records).toHaveLength(1);
    const record = parsed.records[0];
    expect(record.student_number).toBe('54321');
    expect(record.name).toBe('ÖZGÜR IŞIK');
    expect(record.grade_level).toBe(10);
    expect(record.section).toBe('B');
    expect(record.booklet).toBe('A');
    expect(record.answers_by_subject.TUR).toHaveLength(40);
    expect(record.answers_by_subject.SOS).toHaveLength(46);
    expect(record.answers_by_subject.MAT).toHaveLength(40);
    expect(record.answers_by_subject.MAT[10]).toBe('_');
    expect(record.answers_by_subject.FEN).toHaveLength(40);
  });

  it('decodes legacy Windows-1254 Turkish text without replacement characters', () => {
    const bytes = new Uint8Array([0xc7, 0x41, 0xd0, 0x4c, 0x41, 0x20, 0xde, 0x45, 0x4e]); // ÇAĞLA ŞEN
    const decoded = decodeUploadedText(bytes);
    expect(decoded.encoding).toBe('windows-1254');
    expect(decoded.text).toBe('ÇAĞLA ŞEN');
    expect(decoded.text).not.toContain('\uFFFD');
  });
});
