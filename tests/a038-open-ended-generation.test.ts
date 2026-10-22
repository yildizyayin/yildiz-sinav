import { describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { openEndedDraftIssues, looksMultipleChoice } from '../worker/lib/open-ended-generation';

/**
 * A038: open-ended / short-answer production for written exams. A package (question, model answer, analytic
 * rubric) is produced, independently checked by a different model and saved only for human review; it never
 * enters multiple-choice automatic grading. Real schema, production entry chain, synthetic data, mocked models.
 */
const GEN = '@cf/zai-org/glm-4.7-flash', VER = '@cf/nvidia/nemotron-3-120b-a12b';
const item = (stemText = 'Bir metnin ana fikrini bulmak için hangi adımları izlersin? Açıklayınız.', over: any = {}) => ({
  stemText, modelAnswer: 'Metni dikkatle okurum, her paragrafın konusunu belirlerim ve yazarın vermek istediği temel mesajı tek cümleyle ifade ederim.',
  rubric: [{ criterion: 'Metni okuma ve paragraf konularını belirleme', descriptor: 'Adımları sıralar', points: 4 }, { criterion: 'Ana fikri tek cümleyle doğru ifade etme', points: 6 }],
  difficultyLevel: 3, ...over,
});
const gen = (questions: any[]) => ({ response: JSON.stringify({ questions }) });
const ok = (n: number) => ({ response: JSON.stringify({ reviews: Array.from({ length: n }, (_, index) => ({ index, valid: true, issues: [] })) }) });

async function setup(models: Record<string, (input: any) => any> = {}) {
  const t = await evaluatedExam('direct');
  const run = vi.fn(async (model: string, input: any) => { const f = models[model]; if (!f) throw new Error('no model ' + model); return f(input); });
  Object.assign(t.env, { QUESTION_GENERATION_ENABLED: 'true', QUESTION_GENERATION_VERIFICATION_ENABLED: 'true', AI: { run } });
  const create = (body: any = {}) => t.request('/api/open-ended-jobs', 'POST', { academicYear: '2026-2027', gradeLevel: 8, subjectId: 'sub_tur', outcomeCode: 'T.8.1.1', format: 'OPEN_ENDED', questionCount: 1, maxPoints: 10, ...body });
  const runJob = (id: string) => t.request(`/api/open-ended-jobs/${id}/run`, 'POST', {});
  const count = (sql: string) => (t.db.prepare(sql).get() as any).c;
  const nothingSaved = () => { expect(count(`SELECT count(*) c FROM question_bank WHERE question_type='OPEN_ENDED'`)).toBe(0); expect(count('SELECT count(*) c FROM question_rubric_items')).toBe(0); expect(count('SELECT count(*) c FROM open_ended_generation_items')).toBe(0); };
  return { ...t, run, create, runJob, count, nothingSaved };
}

describe('A038: open-ended question production', () => {
  it('a draft must be a written package: no options, no letter answer, rubric sums to the points', () => {
    expect(openEndedDraftIssues(item(), 'OPEN_ENDED', 10)).toEqual([]);
    expect(openEndedDraftIssues(item(), 'OPEN_ENDED', 12)).toEqual(['RUBRIC_TOTAL']);
    expect(openEndedDraftIssues(item('Hangisi doğrudur?\nA) bir\nB) iki\nC) üç'), 'OPEN_ENDED', 10)).toContain('MULTIPLE_CHOICE_SHAPE');
    expect(looksMultipleChoice('Aşağıdakileri açıklayınız: a) neden b) sonuç')).toBe(false);
    expect(openEndedDraftIssues(item(undefined, { modelAnswer: 'B' }), 'OPEN_ENDED', 10)).toContain('ANSWER_IS_A_LETTER');
    expect(openEndedDraftIssues(item(undefined, { modelAnswer: 'x'.repeat(301) }), 'SHORT_ANSWER', 10)).toContain('MODEL_ANSWER');
    expect(openEndedDraftIssues(item(undefined, { rubric: Array.from({ length: 4 }, (_, i) => ({ criterion: `Ölçüt numarası ${i}`, points: i === 0 ? 7 : 1 })) }), 'SHORT_ANSWER', 10)).toContain('RUBRIC_SIZE');
    expect(openEndedDraftIssues(item(undefined, { rubric: [{ criterion: 'Aynı ölçüt metni', points: 5 }, { criterion: 'aynı ölçüt metni', points: 5 }] }), 'OPEN_ENDED', 10)).toContain('RUBRIC_DUPLICATE');
    expect(openEndedDraftIssues(item(undefined, { options: [] }), 'OPEN_ENDED', 10)).toEqual(['FIELDS']);
    expect(openEndedDraftIssues(item(undefined, { rubric: [{ criterion: 'Kesirli puanlı ölçüt', points: 10.5 }] }), 'OPEN_ENDED', 10.5)).toContain('RUBRIC_ITEM');
  });

  it('produces, checks independently and saves only for human review; approval needs the rubric; never reaches MC grading', async () => {
    const t = await setup({ [GEN]: () => gen([item(), item('Okuduğun bir hikâyede olay örgüsünü oluşturan bölümleri açıklayınız.')]), [VER]: () => ok(2) });
    try {
      const c = await t.create({ questionCount: 2 });
      expect(c.response.status, c.text).toBe(201);
      const r = await t.runJob(c.data.job.id);
      expect(r.response.status, r.text).toBe(200);
      expect(r.data.job).toMatchObject({ status: 'REVIEW_READY', generatedCount: 2, generatorModel: GEN, verifierModel: VER });
      // the generator and a different checker were both called, in that order
      expect(t.run.mock.calls.map((x) => x[0])).toEqual([GEN, VER]);
      const qs = t.db.prepare(`SELECT * FROM question_bank WHERE question_type='OPEN_ENDED' ORDER BY stem_text`).all() as any[];
      expect(qs).toHaveLength(2);
      for (const q of qs) {
        expect(q).toMatchObject({ options_json: null, correct_answer: null, written_format: 'OPEN_ENDED', review_status: 'REVIEW', copyright_status: 'RESTRICTED', origin_kind: 'AI_GENERATED', owner_type: 'PLATFORM', academic_year: '2026-2027', grade_level: 8, subject_id: 'sub_tur' });
        expect(t.db.prepare('SELECT sum(points) s FROM question_rubric_items WHERE question_id=?').get(q.id)).toEqual({ s: 10 });
        expect(t.db.prepare('SELECT node_id FROM question_learning_links WHERE question_id=?').all(q.id)).toEqual([{ node_id: 'ln_o_tur1' }]);
      }
      expect(t.count(`SELECT count(*) c FROM audit_logs WHERE action='OPEN_ENDED_REVIEW_READY'`)).toBe(1);
      // running again reuses the result; no new model call
      expect((await t.runJob(c.data.job.id)).data.reused).toBe(true);
      expect(t.run).toHaveBeenCalledTimes(2);

      // human review: rights, then approval with the rubric check
      const q = qs[0];
      const listed = (await t.request(`/api/platform/questions?questionId=${q.id}`)).data.questions[0];
      expect(listed.rubric.map((x: any) => x.points)).toEqual([4, 6]);
      expect((await t.request(`/api/question-bank-standard/${q.id}`, 'PATCH', { copyrightStatus: 'OWNED', expectedRevision: q.review_revision })).response.status).toBe(200);
      const rev = (t.db.prepare('SELECT review_revision r FROM question_bank WHERE id=?').get(q.id) as any).r;
      const quality = { outcomeAlignment: 'Soru ana fikir kazanımını doğrudan ölçüyor.', languageAndDistractors: 'Dil sınıf düzeyine uygun; seçenek yok, rubrik açık.', duplicateDisposition: 'NO_REPETITION_FOUND', duplicateRationale: 'Havuzda benzer açık uçlu soru bulunmadı.' };
      const base = { status: 'APPROVED', expectedRevision: rev, qualityReview: quality, expectedContext: listed.reviewContext, checks: { answerAndSolution: true, curriculum: true, ageAppropriate: true, originalityAndRights: true } };
      const noRubric = await t.request(`/api/question-bank-standard/${q.id}/review`, 'PATCH', base);
      expect(noRubric.data.error.code, noRubric.text).toBe('HUMAN_REVIEW_REQUIRED');
      const approved = await t.request(`/api/question-bank-standard/${q.id}/review`, 'PATCH', { ...base, checks: { ...base.checks, rubric: true } });
      expect(approved.response.status, approved.text).toBe(200);
      expect(JSON.parse((t.db.prepare('SELECT review_checks_json j FROM question_bank WHERE id=?').get(q.id) as any).j)).toMatchObject({ rubric: true });

      // an approved written item never enters multiple-choice selections or grading
      const mcOnly = `COALESCE(q.question_type,'MULTIPLE_CHOICE')='MULTIPLE_CHOICE'`;
      const { selectionSteps } = await import('../worker/lib/studio-selection');
      expect(selectionSteps({ institutionId: 'school' } as any)[0].clause).toContain(mcOnly);
      for (const file of ['../worker/student-books-entry.ts', '../worker/lib/platform-advanced.ts']) {
        const { readFileSync } = await import('node:fs');
        const src = readFileSync(new URL(file, import.meta.url), 'utf8');
        for (const m of src.matchAll(/FROM question_bank q[^`]*review_status='APPROVED'[^`]*/g)) expect(m[0], file).toContain(mcOnly);
      }
      // control: an approved multiple-choice item of the same grade and subject is served
      t.env.SESSION_SECRET = 'synthetic-practice-secret';
      t.db.exec(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status) VALUES('mc_control','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Kontrol sorusu',json('[{"label":"A","text":"bir"},{"label":"B","text":"iki"},{"label":"C","text":"üç"},{"label":"D","text":"dört"}]'),'B',4,'OWNED','APPROVED')`);
      const practice = await t.request('/api/platform/student-practice?gradeLevel=8', 'GET', undefined, 'stuuser');
      expect(practice.response.status, practice.text).toBe(200);
      expect(practice.data.questions.map((x: any) => x.id)).toEqual(['mc_control']);
      const attempt = await t.request('/api/platform/student-practice/attempts', 'POST', { questionId: q.id, answer: 'A' }, 'stuuser');
      expect(attempt.response.status, attempt.text).toBe(404);
    } finally { t.db.close(); }
  }, 90000);

  it('nothing is saved when the independent check rejects, is unavailable, or the output is not a written package', async () => {
    const reject = await setup({ [GEN]: () => gen([item()]), [VER]: () => ({ response: JSON.stringify({ reviews: [{ index: 0, valid: false, issues: ['Model cevap eksik: ana fikir cümlesi yok.'] }] }) }) });
    try {
      const c = await reject.create();
      const r = await reject.runJob(c.data.job.id);
      expect(r.data.error.code).toBe('OPEN_ENDED_QUALITY_REJECTED');
      reject.nothingSaved();
      const audit = JSON.parse((reject.db.prepare(`SELECT details_json d FROM audit_logs WHERE action='OPEN_ENDED_GENERATION_BLOCKED'`).get() as any).d);
      expect(audit.reviews[0].issues[0]).toContain('ana fikir');
      expect(reject.db.prepare('SELECT status,error_code,attempt_count FROM open_ended_generation_jobs').get()).toEqual({ status: 'FAILED', error_code: 'OPEN_ENDED_QUALITY_REJECTED', attempt_count: 1 });
    } finally { reject.db.close(); }

    const down = await setup({ [GEN]: () => gen([item()]), [VER]: () => { throw new Error('down'); } });
    try {
      const r = await down.runJob((await down.create()).data.job.id);
      expect(r.data.error.code).toBe('OPEN_ENDED_VERIFICATION_UNAVAILABLE');
      down.nothingSaved();
    } finally { down.db.close(); }

    for (const bad of [item('Hangisi doğrudur?\nA) bir\nB) iki\nC) üç'), item(undefined, { rubric: [{ criterion: 'Tek ölçüt yeterli değil', points: 7 }] }), { ...item(), options: [{ label: 'A', text: 'x' }], correctAnswer: 'A' }]) {
      const t = await setup({ [GEN]: () => gen([bad]), [VER]: () => ok(1) });
      try {
        const r = await t.runJob((await t.create()).data.job.id);
        expect(r.data.error.code).toBe('OPEN_ENDED_OUTPUT_INVALID');
        // an invalid package never reaches the checker
        expect(t.run.mock.calls.map((x) => x[0])).toEqual([GEN]);
        t.nothingSaved();
      } finally { t.db.close(); }
    }
  }, 90000);

  it('a job cancelled while the checker runs saves nothing; three attempts at most', async () => {
    let cancel: () => void = () => {};
    const t = await setup({ [GEN]: () => gen([item()]), [VER]: () => { cancel(); return ok(1); } });
    try {
      const id = (await t.create()).data.job.id;
      cancel = () => t.db.prepare(`UPDATE open_ended_generation_jobs SET status='CANCELLED',lease_token=NULL,lease_until=NULL WHERE id=?`).run(id);
      expect((await t.runJob(id)).data.error.code).toBe('OPEN_ENDED_CANCELLED');
      t.nothingSaved();

      const id2 = (await t.create()).data.job.id;
      cancel = () => {};
      t.db.prepare(`UPDATE open_ended_generation_jobs SET status='FAILED',attempt_count=3 WHERE id=?`).run(id2);
      expect((await t.runJob(id2)).data.error.code).toBe('OPEN_ENDED_RETRY_EXHAUSTED');
    } finally { t.db.close(); }
  }, 60000);

  it('gates: Super Admin only; switched off means no model call; the checker must be a different model; only verified curriculum', async () => {
    const t = await setup({ [GEN]: () => gen([item()]), [VER]: () => ok(1) });
    try {
      for (const who of ['teacher', 'stuuser', 'parent']) expect((await t.request('/api/open-ended-jobs', 'POST', {}, who)).response.status, who).toBe(403);
      // 2027-2028 has no verified programme here: nothing can be requested
      expect((await t.create({ academicYear: '2027-2028' })).data.error.message).toContain('doğrulanmış programında bulunamadı');
      t.db.exec(`INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,verified,program_code,authority) VALUES('cv8u','2027-2028',8,'TASLAK',0,'SCHOOL','MEB');
        INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,topic,title,official,active) VALUES('o_u','cv8u','sub_tur',8,'T.8.1.1','Okuma','Taslak',0,1);`);
      expect((await t.create({ academicYear: '2027-2028' })).response.status).toBe(400);

      const id = (await t.create()).data.job.id;
      t.env.QUESTION_GENERATION_VERIFICATION_ENABLED = 'false';
      expect((await t.runJob(id)).data.error.code).toBe('OPEN_ENDED_DISABLED');
      t.env.QUESTION_GENERATION_VERIFICATION_ENABLED = 'true';
      t.env.QUESTION_GENERATION_VERIFIER_MODEL = GEN;
      expect((await t.runJob(id)).data.error.code).toBe('OPEN_ENDED_VERIFICATION_UNAVAILABLE');
      expect(t.run).not.toHaveBeenCalled();
      t.nothingSaved();
      // the job is untouched and can still run once the checker is a different model
      delete t.env.QUESTION_GENERATION_VERIFIER_MODEL;
      expect((await t.runJob(id)).data.job.status).toBe('REVIEW_READY');

      // a written table of another grade cannot be linked
      t.db.exec(`INSERT INTO written_exam_tables(id,academic_year,term,exam_no,grade_level,subject_id,authority,source_title,status,created_by) VALUES('wt7','2026-2027',1,1,7,'sub_tur','ODSGM','Kaynak','VERIFIED','admin');`);
      expect((await t.create({ writtenTableId: 'wt7' })).data.error.message).toContain('farklı');
    } finally { t.db.close(); }
  }, 60000);
});
