import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { schoolAdvice, studentAdvice } from '../src/components/reports/nibiru';
import { buildBundle, componentFor, familyOf, weightedEstimate, type RawBundle } from '../worker/lib/report-bundle';

/** S034: the report family's data layer on synthetic rows (no real students). */
const W = {
  TYT: { TYT_TUR: 33, TYT_SOS: 17, TYT_MAT: 33, TYT_FEN: 17 },
  SAY: { TYT_TUR: 13, TYT_SOS: 7, TYT_MAT: 13, TYT_FEN: 7, AYT_MAT: 30, AYT_FIZ: 10, AYT_KIM: 10, AYT_BIY: 10 },
  EA: { TYT_TUR: 13, TYT_SOS: 7, TYT_MAT: 13, TYT_FEN: 7, AYT_MAT: 30, AYT_TDE: 18, AYT_TAR1: 7, AYT_COG1: 5 },
  SOZ: { TYT_TUR: 13, TYT_SOS: 7, TYT_MAT: 13, TYT_FEN: 7, AYT_TDE: 18, AYT_TAR1: 7, AYT_COG1: 5, AYT_TAR2: 8, AYT_COG2: 8, AYT_FEL: 9, AYT_DIN: 5 },
};

function aytRaw(mode: 'COMBINED' | 'AYT_ONLY', pair = true): RawBundle {
  // AYT with a composite test "Edebiyat-Sosyal-1" split by the key's DERS column, plus Matematik.
  const questions = [
    ...['Edebiyat', 'Edebiyat', 'Tarih-1', 'Coğrafya-1'].map((sec, i) => ({ id: `q${i + 1}`, subjectId: 'es1', no: i + 1, status: 'ACTIVE', section: sec, topic: `Konu ${sec}` })),
    ...[1, 2, 3, 4].map((n) => ({ id: `m${n}`, subjectId: 'mat', no: n, status: 'ACTIVE', section: null, topic: 'Fonksiyonlar' })),
  ];
  const keys = questions.map((q) => ({ questionId: q.id, booklet: 'A', answer: 'A', printed: q.no }));
  const people = [
    { id: 'p1', inst: 'i1', iname: 'Okul Bir', city: 'İstanbul', district: 'Pendik', name: 'AYŞE KAYA', no: '7', cls: '12-A', booklet: 'A', d: 7, y: 1, b: 0, n: 6.75, score: null },
    { id: 'p2', inst: 'i1', iname: 'Okul Bir', city: 'İstanbul', district: 'Pendik', name: 'CAN DEMİR', no: '8', cls: '12-B', booklet: 'A', d: 3, y: 2, b: 3, n: 2.5, score: null },
    { id: 'p3', inst: 'i2', iname: 'Okul İki', city: 'İstanbul', district: 'Pendik', name: 'EDA SU', no: '1', cls: '12-A', booklet: 'A', d: 5, y: 0, b: 3, n: 5, score: null },
  ];
  const answers: RawBundle['answers'] = [];
  const correct: Record<string, string[]> = { p1: ['q1', 'q2', 'q3', 'm1', 'm2', 'm3', 'm4'], p2: ['q1', 'm1', 'm2'], p3: ['q1', 'q2', 'q3', 'q4', 'm1'] };
  const wrong: Record<string, string[]> = { p1: ['q4'], p2: ['q2', 'm3'], p3: [] };
  for (const p of people) for (const q of questions) answers.push({ p: p.id, q: q.id, answer: correct[p.id].includes(q.id) ? 'A' : wrong[p.id].includes(q.id) ? 'C' : null, status: correct[p.id].includes(q.id) ? 'CORRECT' : wrong[p.id].includes(q.id) ? 'WRONG' : 'BLANK' });
  const sectionRows: RawBundle['sectionRows'] = [];
  for (const p of people) for (const sec of ['Edebiyat', 'Tarih-1', 'Coğrafya-1']) { const qs = questions.filter((q) => q.section === sec).map((q) => q.id); sectionRows.push({ p: p.id, k: `es1|${sec}`, d: qs.filter((q) => correct[p.id].includes(q)).length, y: qs.filter((q) => wrong[p.id].includes(q)).length }); }
  const subjectRows = people.flatMap((p) => [
    { p: p.id, s: 'es1', d: ['q1', 'q2', 'q3', 'q4'].filter((q) => correct[p.id].includes(q)).length, y: ['q1', 'q2', 'q3', 'q4'].filter((q) => wrong[p.id].includes(q)).length, b: 0, n: 0 },
    { p: p.id, s: 'mat', d: ['m1', 'm2', 'm3', 'm4'].filter((q) => correct[p.id].includes(q)).length, y: ['m1', 'm2', 'm3', 'm4'].filter((q) => wrong[p.id].includes(q)).length, b: 0, n: 0 },
  ]).map((r) => ({ ...r, n: r.d - r.y / 4 }));
  const items: RawBundle['items'] = [];
  for (const a of answers) { const p = people.find((x) => x.id === a.p)!; for (const inst of [null, p.inst]) { const ex = items.find((i) => i.inst === inst && (inst === null || i.cls === p.cls) && i.q === a.q && i.answer === a.answer && i.status === a.status); if (ex) ex.c++; else items.push({ inst, cls: inst ? p.cls : null, q: a.q, answer: a.answer, status: a.status, c: 1 }); } }
  return {
    exam: { id: 'ayt', title: 'AYT Deneme', academic_year: '2026-2027', exam_type: 'AYT', grade_level: 12 },
    subjects: [{ id: 'es1', name: 'Edebiyat-Sosyal-1', code: 'ES1', questionCount: 4, wrongDivisor: 4 }, { id: 'mat', name: 'Matematik', code: 'AYT_MAT', questionCount: 4, wrongDivisor: 4 }],
    questions, keys, participants: people, subjectRows, sectionRows, selected: ['i1'], answers, items, weights: W, aytMode: mode,
    pair: pair ? { exam: { id: 'tyt', title: 'TYT Deneme' }, participants: [{ inst: 'i1', name: 'Ayşe Kaya', no: '7', comps: { TYT_TUR: { net: 30, q: 40 }, TYT_SOS: { net: 10, q: 20 }, TYT_MAT: { net: 20, q: 40 }, TYT_FEN: { net: 10, q: 20 } } }] } : null,
    provisional: true,
  };
}

describe('S034 report bundle', () => {
  it('maps tests and sub-tests to ÖSYM components', () => {
    expect(familyOf('AYT', 12, [])).toBe('AYT');
    expect(familyOf('LGS', 8, [])).toBe('LGS');
    expect(componentFor('AYT', 'Tarih-1')).toBe('AYT_TAR1');
    expect(componentFor('AYT', 'Tarih-2')).toBe('AYT_TAR2');
    expect(componentFor('AYT', 'Coğrafya-1')).toBe('AYT_COG1');
    expect(componentFor('AYT', 'Edebiyat')).toBe('AYT_TDE');
    expect(componentFor('AYT', 'Geometri')).toBe('AYT_MAT');
    expect(componentFor('TYT', 'TUR')).toBe('TYT_TUR');
    expect(componentFor('TYT', 'TYT Sosyal Bilimler')).toBe('TYT_SOS');
    expect(weightedEstimate(W.TYT, { TYT_TUR: { net: 40, q: 40 }, TYT_SOS: { net: 20, q: 20 }, TYT_MAT: { net: 40, q: 40 }, TYT_FEN: { net: 20, q: 20 } })).toBe(500);
  });

  it('builds sub-test columns and combined SAY/SÖZ/EA with the student TYT, else the school TYT average', () => {
    const b = buildBundle(aytRaw('COMBINED'));
    expect(b.family).toBe('AYT');
    expect(b.columns.map((c) => c.name)).toEqual(['Edebiyat', 'Tarih-1', 'Coğrafya-1', 'Matematik']);
    expect(b.columns.map((c) => c.component)).toEqual(['AYT_TDE', 'AYT_TAR1', 'AYT_COG1', 'AYT_MAT']);
    // only EA has every weighted test (AYT Matematik, Edebiyat, Tarih-1, Coğrafya-1) in this exam
    expect(b.scoreTypes.map((t) => t.key)).toEqual(['EA']);
    const [ayse, can] = b.institutions[0].students;
    expect(ayse.name).toBe('AYŞE KAYA');
    expect(ayse.tytSource).toBe('STUDENT');
    expect(can.tytSource).toBe('SCHOOL'); // CAN has no TYT: the school's TYT average is used and said so
    expect(ayse.scores.EA).toBeGreaterThan(can.scores.EA!);
    expect(ayse.cols['es1|Edebiyat']).toEqual({ d: 2, y: 0, b: 0, n: 2 });
    expect(ayse.cols['es1|Coğrafya-1']).toEqual({ d: 0, y: 1, b: 0, n: -0.25 });
    expect(ayse.ranks.EA).toMatchObject({ school: 1, class: 1 });
    // the other school's student had no TYT anywhere: no score, not a zero
    expect(b.institutions[0].students.length).toBe(2);
  });

  it('gives field nets without a score in "Yalnız AYT" mode', () => {
    const b = buildBundle(aytRaw('AYT_ONLY'));
    expect(b.scoreTypes.map((t) => [t.key, t.isScore])).toEqual([['SAY', false], ['SOZ', false], ['EA', false]]);
    const ayse = b.institutions[0].students[0];
    expect(ayse.scores.SAY).toBe(4); // Matematik 4 net
    expect(ayse.scores.EA).toBe(ayse.scores.SAY! + 2 + 1 - 0.25);
  });

  it('computes school and şube standings, topics and items', () => {
    const b = buildBundle(aytRaw('AYT_ONLY'));
    const i1 = b.institutions[0];
    expect(i1.classes.map((c) => c.name)).toEqual(['12-A', '12-B']);
    expect(i1.counts.general).toMatchObject({ students: 3, schools: 2, classes: 3 });
    expect(i1.rank.district[1]).toBe(2);
    const q4 = i1.items.find((x) => x.id === 'q4')!;
    expect(q4).toMatchObject({ key: 'A', school: { n: 2, p: 0 }, general: { n: 3, p: 33 }, topWrong: { answer: 'C', share: 50 } });
    expect(i1.topics.find((t) => t.topic === 'Fonksiyonlar')).toMatchObject({ s: 4, d: 3, p: 75 });
    expect(b.districtSchools[0].schools.map((s) => s.name)).toEqual(['Okul Bir']);
  });

  it('writes Nibiru notes only from this exam\'s verified comparisons', () => {
    const b = buildBundle(aytRaw('COMBINED'));
    const i1 = b.institutions[0];
    const can = i1.students.find((s: any) => s.name === 'CAN DEMİR');
    const notes = studentAdvice(b, i1, can);
    expect(notes.some((n) => n.includes('okulunun TYT ortalamasıyla'))).toBe(true);
    expect(notes.some((n) => n.startsWith('Okul ortalamasının altında'))).toBe(true);
    expect(schoolAdvice(b, i1).some((n) => n.startsWith('Şubeler arası fark'))).toBe(true);
  });

  it('prints with its own A4 pages and is not restyled by the app print rules', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css).toContain('#print-root table:not(.rx-t):not(.rx-ans)');
    expect(readFileSync('src/components/reports/ReportFamily.tsx', 'utf8')).toContain('@page rxport{size:A4 portrait;margin:0}');
  });
});
