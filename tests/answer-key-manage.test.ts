import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { parseAnswerKeyWorkbookRows, buildAnswerKeyTemplateRows } from '../src/lib/guidedDefinitions';

/**
 * Owner (5 Nov, Fenomen 8): a key or its outcomes loaded wrong can be cleared and loaded again from the file; the
 * file's Durum (İPTAL), Kabul Edilen Cevaplar (A/B/C/D) and Şık Sayısı columns are read, and an unreadable answer is
 * named. Synthetic data only.
 */
const SUBJECTS = [{ id: 'sub_tur', code: 'TUR', name: 'Türkçe' }, { id: 'sub_mat', code: 'MAT', name: 'Matematik' }];
const sheet = (rows: Array<[number, string, number, number, string, string, string, number, string]>, option = 4) => {
  const head = Array(34).fill('');
  const out: unknown[][] = [['ANUNEX · SINAV YÜKLEME ŞABLONU'], ['SINAV ADI', '', '', '', '', 'Sentetik'], ['Seçenek sayısı', '', '', '', '', option], ['CEVAP ANAHTARI']];
  const h = [...head]; h[0] = 'Test No'; h[2] = 'Açıklama / Test Adı'; h[4] = 'A Soru No'; h[5] = 'B Soru No'; h[8] = 'Doğru Cevap'; h[10] = 'Yayınevi Kazanımı'; h[28] = 'Durum'; h[30] = 'Şık Sayısı'; h[32] = 'Kabul Edilen Cevaplar';
  out.push(h);
  for (const [t, name, a, b, ans, outcome, status, opt, acc] of rows) { const r = [...head]; r[0] = t; r[2] = name; r[4] = a; r[5] = b; r[8] = ans; r[10] = outcome; r[28] = status; r[30] = opt; r[32] = acc; out.push(r); }
  return out;
};
describe('answer key file columns', () => {
  it('reads İPTAL, accepted answers and names an unreadable answer', () => {
    const r = parseAnswerKeyWorkbookRows(sheet([
      [1, 'Türkçe', 1, 2, 'A', 'Sentetik kazanım 1', 'ACTIVE', 4, ''],
      [1, 'Türkçe', 2, 1, 'F', 'Sentetik kazanım 2', 'ACTIVE', 4, 'A/B/C/D'],
      [1, 'Türkçe', 3, 4, '', '', 'İPTAL', 4, ''],
      [1, 'Türkçe', 4, 3, 'F', '', 'ACTIVE', 4, ''],
    ]) as any, SUBJECTS);
    const a = r.entries.find((e) => e.subjectId === 'sub_tur' && e.bookletCode === 'A')!;
    expect(a.answers).toBe('AAA');
    expect(a.acceptedAnswers).toEqual([['A'], ['A', 'B', 'C', 'D'], ['A']]);
    expect(a.questionStatuses).toEqual(['ACTIVE', 'ACTIVE', 'CANCELLED']);
    expect(a.optionCount).toBe(4);
    expect(r.unknownLines).toHaveLength(1);
    expect(r.warnings?.join(' ')).toMatch(/Türkçe 4\. soru okunamadı: cevap "F"/);
  });
  it('the downloadable template carries the Kabul Edilen Cevaplar column', () => {
    const t = buildAnswerKeyTemplateRows({ title: 'Sentetik', gradeLevel: 8, examType: 'LGS', publisherName: 'Sentetik', sessionLabel: 'Tek', booklets: ['A'], sections: [{ subjectCode: 'TUR', label: 'Türkçe', questionStart: 1, questionEnd: 2, questionCount: 2, optionCount: 4 }], subjectName: (_c: string, l?: string) => l || '' } as any);
    expect(t.rows[t.answerHeaderRow]).toContain('Kabul Edilen Cevaplar');
  });
});

describe('clearing and uploading a key again', () => {
  it('clears outcomes or the whole draft key, refuses clearing an active key, and replaces the source on upload', async () => {
    const t = await evaluatedExam('direct');
    try {
      const created = await t.request('/api/exam-definitions', 'POST', { ownerType: 'CENTRAL', academicYear: '2026-2027', title: 'Sentetik Anahtar', examType: 'LGS', gradeLevel: 8, publisherName: 'Sentetik', sessionLabel: 'Tek', scoringRuleVersionId: 'srv_meb_lgs_2627', outcomeMode: 'OPTIONAL' });
      expect(created.response.status, created.text).toBe(201);
      const id = created.data.id, base = `/api/exam-definitions/${id}`;
      expect((await t.request(`${base}/structure`, 'PUT', { booklets: ['A'], subjects: [{ subjectId: 'sub_tur', questionCount: 2, questionStart: 1, questionEnd: 2, optionCount: 4, wrongDivisor: 3, sortOrder: 1 }] })).response.status).toBe(200);
      const put = (answers: string, label: string, extra: any = {}) => t.request(`${base}/answer-key`, 'PUT', { entries: [{ subjectId: 'sub_tur', bookletCode: 'A', answers, optionCount: 4, outcomeRefs: [{ publisherTitle: `${label} 1` }, { publisherTitle: `${label} 2` }] }], ...extra });
      const pub = () => (t.db.prepare(`SELECT group_concat(json_extract(l.label_path_json,'$.publisherTitle'),'|') v FROM question_publisher_outcomes q JOIN publisher_outcome_labels l ON l.id=q.publisher_outcome_id JOIN exam_questions eq ON eq.id=q.exam_question_id WHERE eq.exam_id=?`).get(id) as any)?.v || '';
      const keys = () => Number((t.db.prepare('SELECT count(*) n FROM answer_keys ak JOIN exam_questions q ON q.id=ak.exam_question_id WHERE q.exam_id=?').get(id) as any).n);
      const first = await put('AB', 'Eski');
      expect(first.response.status, first.text).toBe(200);
      expect(pub()).toMatch(/Eski/);
      // a plain save keeps the imported labels; an upload from a file replaces them
      expect((await put('AB', 'Yeni', { replaceSource: true })).response.status).toBe(200);
      expect(pub()).toMatch(/Yeni/); expect(pub()).not.toMatch(/Eski/);

      const bad = await t.request(`${base}/answer-key`, 'DELETE', { scope: 'X' });
      expect(bad.data.error.code).toBe('INVALID_SCOPE');
      const outcomes = await t.request(`${base}/answer-key`, 'DELETE', { scope: 'OUTCOMES' });
      expect(outcomes.response.status, outcomes.text).toBe(200);
      expect(pub()).toBe(''); expect(keys()).toBe(2);
      // a complete key makes the draft active by itself; an active exam's key is not left empty, it is uploaded again
      expect((t.db.prepare('SELECT status s FROM exams WHERE id=?').get(id) as any).s).toBe('ACTIVE');
      expect((await t.request(`${base}/answer-key`, 'DELETE', { scope: 'ALL' })).data.error.code).toBe('EXAM_NOT_DRAFT');
      t.db.prepare(`UPDATE exams SET status='DRAFT' WHERE id=?`).run(id);
      const all = await t.request(`${base}/answer-key`, 'DELETE', { scope: 'ALL' });
      expect(all.response.status, all.text).toBe(200);
      expect(all.data.deleted.answers).toBe(2); expect(keys()).toBe(0);
      expect((t.db.prepare(`SELECT count(*) n FROM audit_logs WHERE entity_id=? AND action IN ('EXAM_OUTCOMES_CLEARED','EXAM_ANSWER_KEY_DELETED')`).get(id) as any).n).toBe(2);
      expect((await put('AB', 'Yeni', { replaceSource: true })).response.status).toBe(200);
      expect(keys()).toBe(2);
    } finally { t.db.close(); }
  }, 60000);
});
