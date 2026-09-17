import { describe, expect, it } from 'vitest';
import { analyzeFixedWidthSample, EXAM_CHOICES, EXAM_TEMPLATES, matchOfficialOutcome, parseAnswerKeyText } from '../src/lib/guidedDefinitions';

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

  it('maps tabular CSV rows with outcomes metadata', () => {
    const result = parseAnswerKeyText('Ders,Soru,Kitapçık,Doğru Cevap,Şık Sayısı,Kabul Edilen Cevaplar,Durum,Kazanım Kodu,Kazanım Açıklaması,Konu,Alt Konu\nMAT,1,A,A,4,A|B,ACTIVE,MAT.7.1.1,Tam sayılarla işlem yapar.,Sayılar,Tam sayılar\nMAT,2,A,C,4,C,CANCELLED,MAT.7.1.2,İşlem sonucunu bulur.,Sayılar,Tam sayılar', subjects);
    expect(result.entries[0]).toMatchObject({ subjectId: 'sub_mat', bookletCode: 'A', answers: 'AC', optionCount: 4 });
    expect(result.entries[0].acceptedAnswers).toEqual([['A', 'B'], ['C']]);
    expect(result.entries[0].questionStatuses).toEqual(['ACTIVE', 'CANCELLED']);
    expect(result.entries[0].outcomeRefs?.[0]).toMatchObject({ code: 'MAT.7.1.1', title: 'Tam sayılarla işlem yapar.', topic: 'Sayılar', subtopic: 'Tam sayılar' });
  });

  it('imports qualified wide tables with A/B/C/D booklet question maps and pre-header metadata', () => {
    const result = parseAnswerKeyText([
      'ÇAP,,ÇAP TYT 0 Deneme',
      '7661,,12.Sınıf',
      'Kitapçık,Test,Ders,A Soru,B Soru,C Soru,D Soru,Cevap,Kazanım Kodu,Kazanım-1,Kazanım-2',
      'A,TYT Türkçe,Türkçe,1,4,2,3,D,TUR.1,Sözcükte anlam,Söz varlığı',
      'A,TYT Türkçe,Türkçe,2,1,3,4,B,TUR.2,Cümlede anlam,',
    ].join('\n'), [
      { id: 'sub_tur', code: 'TUR', name: 'Türkçe' },
    ]);
    expect(result.detectedFormat).toBe('WIDE_BOOKLET_TABLE');
    expect(result.detectedBooklets).toEqual(['A', 'B', 'C', 'D']);
    expect(result.metadata).toMatchObject({ publisherName: 'ÇAP', gradeLevel: 12, externalExamCode: '7661' });
    expect(result.entries).toHaveLength(4);
    expect(result.entries.find((entry) => entry.bookletCode === 'B')).toMatchObject({
      answers: 'DB',
      bookletQuestionNumbers: [4, 1],
    });
    const dOutcomes = result.entries.find((entry) => entry.bookletCode === 'D')?.outcomeRefsByQuestion?.[0] || [];
    expect(dOutcomes).toHaveLength(2);
    expect(dOutcomes[0]).toMatchObject({ code: 'TUR.1', title: 'Sözcükte anlam' });
    expect(dOutcomes.slice(1)).toEqual([{ title: 'Söz varlığı' }]);
  });

  it('uses the test name when a qualified workbook lists TYT subtests in the course column', () => {
    const result = parseAnswerKeyText([
      'ÇAP,,ÇAP TYT 0 Deneme',
      'Kitapçık,Test,Ders,A Soru,B Soru,Cevap,Kazanım Kodu,Kazanım-1',
      'A,TYT Sosyal,Tarih-1,1,4,A,SOS.1,Tarih bilgisi',
      'A,TYT Fen,Fizik,1,2,C,FEN.1,Fizik bilgisi',
    ].join('\n'), [
      { id: 'sub_tyt_sos', code: 'TYT_SOS', name: 'TYT Sosyal Bilimler' },
      { id: 'sub_tyt_fen', code: 'TYT_FEN', name: 'TYT Fen Bilimleri' },
    ]);
    expect(result.unknownLines).toHaveLength(0);
    expect(result.questionCounts).toEqual({ sub_tyt_sos: 1, sub_tyt_fen: 1 });
  });
});

describe('professional exam model catalog', () => {
  it('covers grades 5 through 12 without the retired grade 4 shortcut', () => {
    const standardGrades = EXAM_CHOICES.filter((x) => x.examType === 'STANDARD').map((x) => x.gradeLevel);
    expect(standardGrades).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(EXAM_CHOICES.some((x) => x.gradeLevel === 4)).toBe(false);
  });

  it('offers middle-school and TYT–AYT composite models', () => {
    expect(EXAM_CHOICES.filter((x) => x.sessionMode === 'VERBAL_NUMERIC').map((x) => x.gradeLevel)).toEqual([8, 5, 6, 7, 8]);
    expect(EXAM_CHOICES.some((x) => x.examType === 'TYT_AYT' && x.sessionMode === 'TYT_AYT')).toBe(true);
  });

  it('keeps the agreed template question totals and scoring profiles', () => {
    const tyt = EXAM_TEMPLATES.find((x) => x.key === 'TYT');
    expect(tyt?.sections.reduce((n, x) => n + x.questionCount, 0)).toBe(120);
    expect(tyt?.optionalSections).toEqual([expect.objectContaining({ subjectCode: 'TYT_FEL', questionCount: 5, answerKeyOnly: true, optionalGroup: 'TYT_SOSYAL_SECME' })]);
    expect(tyt?.optionalSections?.reduce((n, x) => n + x.questionCount, 0)).toBe(5);
    expect(EXAM_TEMPLATES.find((x) => x.key === 'AYT')?.sections.reduce((n, x) => n + x.questionCount, 0)).toBe(160);
    expect(EXAM_TEMPLATES.find((x) => x.key === 'YDT')?.sections[0]).toMatchObject({ questionCount: 80, optionCount: 5, wrongDivisor: 4 });
    expect(EXAM_TEMPLATES.find((x) => x.key === 'LGS')?.sections.reduce((n, x) => n + x.questionCount, 0)).toBe(90);
    expect(EXAM_TEMPLATES.filter((x) => /^SCHOOL_[567]$/.test(x.key)).map((x) => x.gradeLevel)).toEqual([5, 6, 7]);
  });
});

describe('official outcome matching', () => {
  const catalog = [
    { id: 'out-1', subject_id: 'sub_mat', code: 'MAT.7.1.1', title: 'Tam sayılarla işlem yapar.', topic: 'Sayılar', official: 1, verified: 1 },
    { id: 'out-2', subject_id: 'sub_mat', code: 'MAT.7.1.2', title: 'İşlem sonucunu bulur.', topic: 'Sayılar', official: 1, verified: 0 },
  ];

  it('prefers an exact verified official code', () => {
    expect(matchOfficialOutcome({ code: 'mat.7.1.1' }, 'sub_mat', catalog)).toEqual({ outcomeId: 'out-1', reason: 'CODE' });
  });

  it('does not auto-match an unverified catalog', () => {
    expect(matchOfficialOutcome({ code: 'MAT.7.1.2' }, 'sub_mat', catalog)).toEqual({ reason: 'UNVERIFIED' });
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


describe('TYT optional answer-key envelope', () => {
  it('keeps 120 scored questions and five separate optional philosophy answers', () => {
    const tytSubjects = [
      { id: 'tyt_tur', code: 'TYT_TUR', name: 'Türkçe' },
      { id: 'tyt_fel', code: 'TYT_FEL', name: 'Felsefe (seçmeli)' },
    ];
    const result = parseAnswerKeyText('TYT_TUR: ' + 'A'.repeat(40) + '\nTYT_FEL: ABCDE', tytSubjects);
    expect(result.questionCounts.tyt_tur).toBe(40);
    expect(result.questionCounts.tyt_fel).toBe(5);
    const tyt = EXAM_TEMPLATES.find((x) => x.key === 'TYT');
    expect(tyt?.sections.reduce((n, x) => n + x.questionCount, 0)).toBe(120);
    expect(tyt?.optionalSections?.[0]).toMatchObject({ subjectCode: 'TYT_FEL', questionCount: 5, answerKeyOnly: true });
  });
});
