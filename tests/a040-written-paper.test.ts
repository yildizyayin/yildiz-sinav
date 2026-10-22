import { describe, expect, it } from 'vitest';
import { writtenItem, writtenSetup } from './helpers/written-item';
import { zumreRule } from '../worker/lib/written-papers';

/**
 * A040: written exam paper. The distribution follows the school's chosen scenario of a verified table, the
 * applicable school-committee rule is enforced, and a paper with its answer key is produced only when final.
 * Real schema, production entry chain, synthetic data.
 */
const SRC = 'https://www.meb.gov.tr/ortak-yazili-dagilim/haber/00000/tr';
const table = (over: any = {}) => ({ academicYear: '2026-2027', term: 1, examNo: 1, gradeLevel: 8, subjectId: 'sub_tur', authority: 'ODSGM', sourceTitle: 'Ortak yazılı konu-soru dağılım tabloları', sourceUrl: SRC, sourceAcademicYear: '2026-2027', ...over });
const crit = (total: number) => [{ criterion: 'Süreç adımlarını doğru uygulama', points: total - Math.floor(total / 2), levels: [{ points: 0, descriptor: 'Yok' }, { points: total - Math.floor(total / 2), descriptor: 'Tam' }] }, { criterion: 'Sonucu doğru ifade etme', points: Math.floor(total / 2) }];
const zumre = (row: string, total: number, stem = 'Okulumuz zümresinin hazırladığı soru: okuduğun metnin konusunu ve ana fikrini yazınız.') => ({ scenarioRowId: row, source: 'ZUMRE', stemText: stem, modelAnswer: 'Konu ve ana fikir doğru ifade edilir.', rubric: { totalPoints: total, criteria: crit(total), alternatives: [] } });

async function tableWithChoice(t: any, body: any) {
  const c = await t.as('admin', '/api/written-scenarios', 'POST', body);
  expect(c.response.status, c.text).toBe(201);
  expect((await t.as('admin', `/api/written-scenarios/${c.data.id}/verify`, 'POST', {})).response.status).toBe(200);
  const detail = await t.as('mgr', `/api/written-scenarios/${c.data.id}`);
  return { tableId: c.data.id, scenario: detail.data.table.scenarios[0], choose: () => t.as('mgr', `/api/written-scenarios/${c.data.id}/choice`, 'POST', { scenarioId: detail.data.table.scenarios[0].id }) };
}

describe('A040: written exam paper', () => {
  it('the committee rule is applied only where it is confirmed', () => {
    const r = (authority: string, year: string, grade: number, code: string) => zumreRule({ authority, academic_year: year, grade_level: grade }, code);
    expect(r('ODSGM', '2026-2027', 7, 'TUR')).toBe('REQUIRED_2');
    expect(r('ODSGM', '2026-2027', 10, 'FIZ')).toBe('REQUIRED_2');
    expect(r('ODSGM', '2026-2027', 8, 'TUR')).toBe('NOT_APPLICABLE');
    expect(r('ODSGM', '2026-2027', 12, 'MAT')).toBe('NOT_APPLICABLE');
    expect(r('ODSGM', '2026-2027', 7, 'BEDEN')).toBe('NOT_APPLICABLE');
    expect(r('IL_ZUMRE', '2026-2027', 7, 'TUR')).toBe('NOT_APPLICABLE');
    expect(r('ODSGM', '2027-2028', 7, 'TUR')).toBe('UNVERIFIED');
  });

  it('builds the paper from the chosen scenario with approved rubrics, totals 100, pins rubrics and locks on finalisation', async () => {
    const t = await writtenSetup([writtenItem(), writtenItem('Bir şiirde duygu ile düşünce arasındaki ilişkiyi örnekle açıklayınız.'), writtenItem('Okuduğun bir metindeki yardımcı fikirleri yazınız ve ana fikirle ilişkisini gösteriniz.')]);
    try {
      // the first item measures another outcome of the same grade and subject
      t.db.exec(`INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,topic,title,official,active) VALUES('o_tur2','cv8','sub_tur',8,'T.8.2.1','Yazma','Paragraf yazar.',1,1)`);
      t.db.prepare(`UPDATE question_learning_links SET node_id='ln_o_tur2' WHERE question_id=?`).run(t.questionIds[0]);
      for (const q of t.questionIds) await t.approve(q);
      const tb = await tableWithChoice(t, table({ scenarios: [{ label: '1. Senaryo', rows: [{ unit: 'Okuma', topic: 'Ana fikir', outcomeCode: 'T.8.1.1', questionCount: 2 }, { unit: 'Okuma', topic: 'Metin yorumu', questionCount: 1 }] }] }));
      const create = () => t.as('teacher', '/api/written-papers', 'POST', { tableId: tb.tableId, title: '8-A Türkçe 1. yazılı', classLabel: '8-A', examDate: '2026-11-05' });
      expect((await create()).data.error.code).toBe('SCENARIO_NOT_CHOSEN');
      expect((await tb.choose()).response.status).toBe(200);
      const c = await create();
      expect(c.response.status, c.text).toBe(201);
      expect(c.data.zumreRule).toBe('NOT_APPLICABLE');
      const id = c.data.id;
      // other school, other subject and learners cannot reach it
      for (const who of ['tch_other', 'tch_mat']) expect((await t.as(who, `/api/written-papers/${id}`)).response.status, who).toBe(404);
      for (const who of ['stuuser', 'parent']) expect((await t.as(who, `/api/written-papers/${id}`)).response.status, who).toBe(403);

      // without approved rubrics nothing can be placed
      const empty = await t.as('teacher', `/api/written-papers/${id}/autofill`, 'POST', {});
      expect(empty.data).toMatchObject({ added: 0 });
      expect((await t.as('teacher', `/api/written-papers/${id}`)).data.blockers.join(' | ')).toContain('Toplam puan 0');
      expect((await t.as('teacher', `/api/written-papers/${id}/items`, 'PUT', { items: [{ scenarioRowId: tb.scenario.rows[0].id, questionId: t.questionIds[1] }] })).data.error.message).toContain('onaylı rubriği yok');

      // the teacher sets the points through school rubric versions (40 + 30 + 30) and approves them
      for (const [q, total] of [[t.questionIds[0], 40], [t.questionIds[1], 30], [t.questionIds[2], 30]] as const) {
        expect((await t.as('teacher', `/api/question-rubrics/${q}/versions`, 'POST', { totalPoints: total, criteria: crit(total), alternatives: [] })).response.status).toBe(201);
        expect((await t.as('teacher', `/api/question-rubrics/${q}/versions/2/approve`, 'POST', { confirm: true })).response.status).toBe(200);
      }
      expect((await t.as('teacher', `/api/written-papers/${id}/autofill`, 'POST', {})).data).toMatchObject({ added: 3, missing: [] });
      const ready = await t.as('teacher', `/api/written-papers/${id}`);
      expect(ready.data.total).toBe(100);
      expect(ready.data.blockers).toEqual([]);
      // the outcome row only took items of that outcome; each row has exactly its count
      expect(ready.data.rows.map((r: any) => ready.data.items.filter((i: any) => i.scenario_row_id === r.id).length)).toEqual([2, 1]);
      // the T.8.1.1 row holds only T.8.1.1 items; the item of the other outcome went to the open row
      expect(ready.data.items.filter((i: any) => i.scenario_row_id === ready.data.rows[0].id).map((i: any) => i.question_id).sort()).toEqual([t.questionIds[1], t.questionIds[2]].sort());
      expect((await t.as('teacher', `/api/written-papers/${id}/items`, 'PUT', { items: [{ scenarioRowId: ready.data.rows[0].id, questionId: t.questionIds[0] }] })).data.error.code).toBe('QUESTION_NOT_ELIGIBLE');
      await t.as('teacher', `/api/written-papers/${id}/items`, 'PUT', { items: ready.data.items.map((i: any) => ({ scenarioRowId: i.scenario_row_id, questionId: i.question_id })) });

      // not printable before it is final
      expect((await t.as('teacher', `/api/written-papers/${id}/paper`)).data.error.code).toBe('PAPER_NOT_FINAL');
      expect((await t.as('teacher', `/api/written-papers/${id}/finalize`, 'POST', {})).data.error.code).toBe('CONFIRMATION_REQUIRED');
      const fin = await t.as('teacher', `/api/written-papers/${id}/finalize`, 'POST', { confirm: true });
      expect(fin.response.status, fin.text).toBe(200);
      const pinned = t.db.prepare(`SELECT i.points,r.version,r.institution_id FROM written_paper_items i JOIN question_rubrics r ON r.id=i.rubric_id WHERE i.paper_id=? ORDER BY i.sort_order`).all(id);
      expect(pinned.map((r: any) => [r.version, r.institution_id])).toEqual([[2, 'school'], [2, 'school'], [2, 'school']]);
      expect(pinned.reduce((s: number, r: any) => s + r.points, 0)).toBe(100);

      // locked: API and database; a later rubric version does not change the paper's key
      expect((await t.as('teacher', `/api/written-papers/${id}/items`, 'PUT', { items: [] })).data.error.code).toBe('PAPER_LOCKED');
      expect(() => t.db.prepare(`DELETE FROM written_paper_items WHERE paper_id=?`).run(id)).toThrow(/PAPER_LOCKED/);
      expect(() => t.db.prepare(`UPDATE written_papers SET status='DRAFT' WHERE id=?`).run(id)).toThrow(/PAPER_LOCKED/);
      const q0 = t.questionIds[0];
      expect((await t.as('teacher', `/api/question-rubrics/${q0}/versions`, 'POST', { totalPoints: 20, criteria: crit(20), alternatives: [] })).response.status).toBe(201);
      expect((await t.as('teacher', `/api/question-rubrics/${q0}/versions/3/approve`, 'POST', { confirm: true })).response.status).toBe(200);

      const paper = await t.as('teacher', `/api/written-papers/${id}/paper`);
      expect(paper.response.headers.get('Content-Type')).toContain('text/html');
      expect(paper.text).toContain('8-A Türkçe 1. yazılı');
      expect(paper.text).toContain('40 puan');
      expect(paper.text).not.toContain('Model cevap');
      expect(paper.text).not.toContain('Metni dikkatle okurum');
      const key = await t.as('mgr', `/api/written-papers/${id}/key`);
      expect(key.text).toContain('Model cevap');
      expect(key.text).toContain('Metni dikkatle okurum');
      expect(key.text).toContain('Rubrik v2');
      expect(key.text).not.toContain('Rubrik v3');
      expect(t.db.prepare(`SELECT action FROM audit_logs WHERE entity_type='written_paper' ORDER BY rowid`).all().map((r: any) => r.action)).toEqual(['WRITTEN_PAPER_CREATED', 'WRITTEN_PAPER_AUTOFILLED', 'WRITTEN_PAPER_AUTOFILLED', 'WRITTEN_PAPER_ITEMS_SET', 'WRITTEN_PAPER_FINALIZED', 'WRITTEN_PAPER_OPENED', 'WRITTEN_KEY_OPENED']);
    } finally { t.db.close(); }
  }, 120000);

  it('where the rule is confirmed the school committee writes exactly two questions; elsewhere it is a warning only; totals must reach 100', async () => {
    const t = await writtenSetup();
    try {
      const g7 = await tableWithChoice(t, table({ gradeLevel: 7, scenarios: [{ label: 'A', rows: [{ unit: 'Okuma', topic: 'Metin', questionCount: 3 }] }] }));
      await g7.choose();
      const id = (await t.as('mgr', '/api/written-papers', 'POST', { tableId: g7.tableId, title: '7. sınıf Türkçe' })).data.id;
      const row = g7.scenario.rows[0].id;
      // three committee questions: the rule asks for exactly two
      expect((await t.as('mgr', `/api/written-papers/${id}/items`, 'PUT', { items: [zumre(row, 34), zumre(row, 33, 'İkinci zümre sorusu: metindeki olay sırasını yazınız.'), zumre(row, 33, 'Üçüncü zümre sorusu: metnin başlığını gerekçesiyle öneriniz.')] })).response.status).toBe(200);
      let d = await t.as('mgr', `/api/written-papers/${id}`);
      expect(d.data.paper.zumre_rule).toBe('REQUIRED_2');
      expect(d.data.blockers.join()).toContain('tam 2 soru');
      expect((await t.as('mgr', `/api/written-papers/${id}/finalize`, 'POST', { confirm: true })).data.error.code).toBe('PAPER_INCOMPLETE');
      // a committee question that is multiple choice in disguise or has a broken rubric is refused
      expect((await t.as('mgr', `/api/written-papers/${id}/items`, 'PUT', { items: [zumre(row, 50, 'Hangisi doğru?\nA) bir\nB) iki')] })).data.error.message).toContain('çoktan seçmeli');
      expect((await t.as('mgr', `/api/written-papers/${id}/items`, 'PUT', { items: [{ ...zumre(row, 50), rubric: { totalPoints: 50, criteria: crit(40), alternatives: [] } }] })).data.error.message).toContain('toplam');

      // the database refuses a final paper that does not add up, whatever the API did
      expect(() => t.db.prepare(`UPDATE written_papers SET total_points=100,status='FINAL',finalized_at=CURRENT_TIMESTAMP WHERE id=?`).run(id)).toThrow(/PAPER_INCOMPLETE/);

      // 2027-2028 (a hypothetical verified table): the rule is not imposed, only flagged
      const next = await tableWithChoice(t, table({ academicYear: '2027-2028', sourceAcademicYear: '2027-2028', gradeLevel: 7, scenarios: [{ label: 'A', rows: [{ topic: 'Metin', questionCount: 1 }] }] }));
      await next.choose();
      const id2 = (await t.as('mgr', '/api/written-papers', 'POST', { tableId: next.tableId, title: 'Gelecek yıl' })).data.id;
      await t.as('mgr', `/api/written-papers/${id2}/items`, 'PUT', { items: [zumre(next.scenario.rows[0].id, 100)] });
      d = await t.as('mgr', `/api/written-papers/${id2}`);
      expect(d.data.paper.zumre_rule).toBe('UNVERIFIED');
      expect(d.data.warnings.join()).toContain('yeniden doğrulanmadı');
      expect(d.data.blockers).toEqual([]);
      expect((await t.as('mgr', `/api/written-papers/${id2}/finalize`, 'POST', { confirm: true })).response.status).toBe(200);

      // if the school changes its scenario choice, an unfinished paper must be rebuilt
      const sc2 = await t.as('admin', '/api/written-scenarios', 'POST', table({ gradeLevel: 7, scenarios: [{ label: 'A', rows: [{ topic: 'x', questionCount: 2 }] }, { label: 'B', rows: [{ topic: 'y', questionCount: 2 }] }] }));
      await t.as('admin', `/api/written-scenarios/${sc2.data.id}/verify`, 'POST', {});
      const det = await t.as('mgr', `/api/written-scenarios/${sc2.data.id}`);
      await t.as('mgr', `/api/written-scenarios/${sc2.data.id}/choice`, 'POST', { scenarioId: det.data.table.scenarios[0].id });
      const id3 = (await t.as('mgr', '/api/written-papers', 'POST', { tableId: sc2.data.id, title: 'Değişen senaryo' })).data.id;
      await t.as('mgr', `/api/written-papers/${id3}/items`, 'PUT', { items: [zumre(det.data.table.scenarios[0].rows[0].id, 50), zumre(det.data.table.scenarios[0].rows[0].id, 50, 'İkinci soru: metnin türünü gerekçesiyle yazınız.')] });
      expect((await t.as('mgr', `/api/written-papers/${id3}`)).data.blockers).toEqual([]);
      await t.as('mgr', `/api/written-scenarios/${sc2.data.id}/choice`, 'POST', { scenarioId: det.data.table.scenarios[1].id });
      expect((await t.as('mgr', `/api/written-papers/${id3}`)).data.blockers.join()).toContain('senaryo değişti');
    } finally { t.db.close(); }
  }, 120000);
});
