import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { rowsFromJson, toImportRows } from '../src/lib/questionImportRows';

/** A082: bulk import — Super Admin only, every row on a verified 2027–2028 outcome of its grade, REVIEW only, no copies. Synthetic data only. */
const row = (o: Record<string, unknown> = {}) => ({ sourceLabel: 'Claude', gradeLevel: 8, outcomeCode: 'T.8.2.1', stem: 'Aşağıdaki cümlelerin hangisinde ana fikir vardır?', optionA: 'bir', optionB: 'iki', optionC: 'üç', optionD: 'dört', correctAnswer: 'B', copyrightStatus: 'OWNED', ...o });

async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,verified,program_code,authority) VALUES('cv27','2027-2028',8,'MAARIF-2027',1,'SCHOOL','MEB'),('cv27u','2027-2028',7,'MAARIF-2027-taslak',0,'SCHOOL','MEB'),('cv27g7','2027-2028',7,'MAARIF-2027',1,'SCHOOL','MEB');
    INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,topic,title,official,active) VALUES
      ('o27a','cv27','sub_tur',8,'T.8.2.1','Okuma','Ana fikri belirler.',1,1),
      ('o27b','cv27','sub_tur',8,'T.8.2.2','Okuma','Yardımcı fikirleri belirler.',1,1),
      ('o27u','cv27u','sub_tur',7,'T.7.9.9','Okuma','Taslak kazanım.',1,1),
      ('o27g7','cv27g7','sub_tur',7,'T.7.2.1','Okuma','Yedinci sınıf kazanımı.',1,1),
      ('o27off','cv27','sub_tur',8,'T.8.2.8','Okuma','Kaldırılmış kazanım.',1,0),
      ('o27un','cv27','sub_tur',8,'T.8.2.7','Okuma','Resmî olmayan kazanım.',0,1);`);
  return t;
}

describe('A082 bulk question import', () => {
  it('maps Turkish and English headers and reads JSON without guessing', () => {
    expect(toImportRows([{ 'Kaynak': 'Yayınevi', 'Sınıf': '8', 'Kazanım kodu': 'T.8.2.1', 'Soru': 'Kök', A: 'x', B: 'y', C: 'z', D: 'w', 'Doğru cevap': 'a', 'Telif': 'licensed', 'Bilinmeyen': 'yok' }]))
      .toEqual([{ sourceLabel: 'Yayınevi', gradeLevel: '8', outcomeCode: 'T.8.2.1', stem: 'Kök', optionA: 'x', optionB: 'y', optionC: 'z', optionD: 'w', correctAnswer: 'a', copyrightStatus: 'licensed' }]);
    expect(rowsFromJson(JSON.stringify({ rows: [{ source: 'Öğretmen', grade: 8 }] }))).toEqual([{ sourceLabel: 'Öğretmen', gradeLevel: 8 }]);
    expect(() => rowsFromJson('{"x":1}')).toThrow();
  });

  it('previews row by row and rejects missing source, rights, unknown, unverified, old-year and wrong-grade outcomes', async () => {
    const t = await setup();
    const rows = [
      row(),
      row({ sourceLabel: '' }),
      row({ copyrightStatus: '' }),
      row({ outcomeCode: 'T.8.9.9' }),
      row({ outcomeCode: 'T.7.2.1' }),
      row({ outcomeCode: 'T.7.9.9', gradeLevel: 7 }),
      row({ outcomeCode: 'T.8.1.1' }), // exists only in 2026-2027
      row({ correctAnswer: 'E' }),
      row(), // the same question again in the file
      row({ outcomeCode: 'T.8.2.8', stem: 'Kaldırılmış kazanım için ayrı soru kökü?' }),
      row({ outcomeCode: 'T.8.2.7', stem: 'Resmî olmayan kazanım için ayrı soru kökü?' }),
    ];
    for (const who of ['teacher', 'stuuser']) expect((await t.request('/api/admin/question-import/preview', 'POST', { rows }, who)).response.status).toBe(403);
    const before = (t.db.prepare('SELECT count(*) n FROM question_bank').get() as any).n;
    const r = await t.request('/api/admin/question-import/preview', 'POST', { rows });
    expect(r.response.status, r.text).toBe(200);
    expect(r.data.rows.map((x: any) => x.status)).toEqual(['READY', 'INVALID', 'INVALID', 'INVALID', 'INVALID', 'INVALID', 'INVALID', 'INVALID', 'INVALID', 'INVALID', 'INVALID']);
    const err = (i: number) => r.data.rows[i].errors.join(' ');
    expect(err(1)).toContain('Kaynak');
    expect(err(2)).toContain('Telif');
    expect(err(3)).toContain('yok');
    expect(err(4)).toContain('7. sınıf kazanımı');
    expect(err(5)).toContain('yok');
    expect(err(6)).toContain('yok');
    expect(err(7)).toContain('Doğru cevap');
    expect(err(8)).toContain('1. satır');
    expect(r.data.summary).toMatchObject({ total: 11, ready: 1, invalid: 10 });
    expect((t.db.prepare('SELECT count(*) n FROM question_bank').get() as any).n).toBe(before);
  });

  it('adds valid rows only to the REVIEW queue on the outcome, and a re-upload adds nothing', async () => {
    const t = await setup();
    const rows = [row(), row({ stem: 'Metindeki yardımcı fikir hangisidir?', outcomeCode: 'T.8.2.2', optionE: 'beş', correctAnswer: 'E', copyrightStatus: 'LICENSED', solution: 'Çözüm.' }), row({ sourceLabel: '' })];
    expect((await t.request('/api/admin/question-import/commit', 'POST', { rows })).response.status).toBe(400);
    const c = await t.request('/api/admin/question-import/commit', 'POST', { rows, confirm: true, fileName: 'sentetik.xlsx' });
    expect(c.response.status, c.text).toBe(200);
    expect(c.data.summary).toMatchObject({ added: 2, invalid: 1 });
    const added = t.db.prepare(`SELECT q.review_status,q.origin_kind,q.owner_type,q.academic_year,q.grade_level,q.subject_id,q.source_label,q.copyright_status,q.option_count,q.correct_answer,l.node_id FROM question_bank q JOIN question_learning_links l ON l.question_id=q.id WHERE q.origin_kind='IMPORT' ORDER BY l.node_id`).all() as any[];
    expect(added).toEqual([
      { review_status: 'REVIEW', origin_kind: 'IMPORT', owner_type: 'PLATFORM', academic_year: '2027-2028', grade_level: 8, subject_id: 'sub_tur', source_label: 'Claude', copyright_status: 'OWNED', option_count: 4, correct_answer: 'B', node_id: 'ln_o27a' },
      { review_status: 'REVIEW', origin_kind: 'IMPORT', owner_type: 'PLATFORM', academic_year: '2027-2028', grade_level: 8, subject_id: 'sub_tur', source_label: 'Claude', copyright_status: 'LICENSED', option_count: 5, correct_answer: 'E', node_id: 'ln_o27b' },
    ]);
    const listed = await t.request('/api/platform/questions?reviewStatus=REVIEW');
    expect(listed.data.questions.filter((q: any) => q.origin_kind === 'IMPORT')).toHaveLength(2);
    const again = await t.request('/api/admin/question-import/commit', 'POST', { rows, confirm: true });
    expect(again.data.summary).toMatchObject({ added: 0, duplicates: 2 });
    expect((t.db.prepare(`SELECT count(*) n FROM question_bank WHERE origin_kind='IMPORT'`).get() as any).n).toBe(2);
    expect((t.db.prepare(`SELECT count(*) n FROM audit_logs WHERE action='QUESTION_IMPORT_COMMITTED'`).get() as any).n).toBe(2);
  });

  it('never stores the same question twice when another upload writes it between preview and save', async () => {
    const t = await setup();
    const batch = t.env.DB.batch; let raced = false;
    // simulate a second upload of the same file committing first, after this request already checked for copies
    t.env.DB.batch = async (st: any[]) => {
      if (!raced) { raced = true; t.db.exec(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status,origin_kind)
        VALUES('first','PLATFORM','2027-2028',8,'sub_tur','MULTIPLE_CHOICE','Aşağıdaki cümlelerin hangisinde ana fikir vardır?','[{"label":"A","text":"bir"},{"label":"B","text":"iki"},{"label":"C","text":"üç"},{"label":"D","text":"dört"}]','B',4,'OWNED','REVIEW','IMPORT')`); }
      return batch(st);
    };
    const r = await t.request('/api/admin/question-import/commit', 'POST', { rows: [row()], confirm: true });
    expect(r.data.summary).toMatchObject({ added: 0, skippedAsCopy: 1 });
    expect((t.db.prepare(`SELECT count(*) n FROM question_bank WHERE origin_kind='IMPORT'`).get() as any).n).toBe(1);
    expect((t.db.prepare(`SELECT count(*) n FROM question_learning_links WHERE question_id<>'first' AND question_id NOT IN (SELECT id FROM question_bank)`).get() as any).n).toBe(0);
  });

  it('warns about a near-identical stem on the same outcome but still lets the reviewer decide', async () => {
    const t = await setup();
    t.db.exec(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status) VALUES('old','PLATFORM','2027-2028',8,'sub_tur','MULTIPLE_CHOICE','Aşağıdaki cümlelerin hangisinde ana fikir verilmiştir?','["k","l","m","n"]','A',4,'OWNED','APPROVED');
      INSERT INTO question_learning_links(question_id,node_id) VALUES('old','ln_o27a');`);
    const r = await t.request('/api/admin/question-import/preview', 'POST', { rows: [row(), row({ stem: 'Tamamen başka bir konu hakkında yazılmış ayrı bir soru kökü burada.' })] });
    expect(r.data.rows[0]).toMatchObject({ status: 'READY' });
    expect(r.data.rows[0].warnings.join(' ')).toContain('old');
    expect(r.data.rows[1].warnings).toEqual([]);
  });

  it('leaves the decision to the normal review gate: an imported question can be approved there', async () => {
    const t = await setup();
    const c = await t.request('/api/admin/question-import/commit', 'POST', { confirm: true, rows: [row({ solution: 'B şıkkı ana fikri verir çünkü metnin tamamını kapsar.' })] });
    const id = c.data.added[0].id;
    const listed = (await t.request(`/api/platform/questions?questionId=${id}`)).data.questions[0];
    const rev = (t.db.prepare('SELECT review_revision r FROM question_bank WHERE id=?').get(id) as any).r;
    const r = await t.request(`/api/question-bank-standard/${id}/review`, 'PATCH', { status: 'APPROVED', expectedRevision: rev, expectedContext: listed.reviewContext,
      qualityReview: { outcomeAlignment: 'Soru ana fikir kazanımını doğrudan ölçüyor.', languageAndDistractors: 'Dil sınıf düzeyine uygun; çeldiriciler makul.', duplicateDisposition: 'NO_REPETITION_FOUND', duplicateRationale: 'Havuzda benzer soru bulunmadı, kontrol edildi.' },
      checks: { answerAndSolution: true, curriculum: true, ageAppropriate: true, originalityAndRights: true } });
    expect(r.response.status, r.text).toBe(200);
    expect((t.db.prepare('SELECT review_status s,reviewed_by b FROM question_bank WHERE id=?').get(id) as any)).toEqual({ s: 'APPROVED', b: 'admin' });
  });
});
