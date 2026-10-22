import { expect, vi } from 'vitest';
import { evaluatedExam } from './exam-flow';
import { createSession } from '../../worker/lib/auth';

/**
 * A038–A041: a written (open-ended) item produced through the real pipeline with mocked models, rights set
 * and approved by the Super Admin with the rubric check. Synthetic data; real schema; production entry chain.
 */
export const GEN = '@cf/zai-org/glm-4.7-flash', VER = '@cf/nvidia/nemotron-3-120b-a12b';
export const writtenItem = (stemText = 'Bir metnin ana fikrini bulmak için hangi adımları izlersin? Açıklayınız.') => ({
  stemText, modelAnswer: 'Metni dikkatle okurum, her paragrafın konusunu belirlerim ve yazarın vermek istediği temel mesajı tek cümleyle ifade ederim.',
  rubric: [{ criterion: 'Metni okuma ve paragraf konularını belirleme', descriptor: 'Adımları sıralar', points: 4 }, { criterion: 'Ana fikri tek cümleyle doğru ifade etme', points: 6 }],
  difficultyLevel: 3,
});

export async function writtenSetup(items = [writtenItem()]) {
  const t = await evaluatedExam('direct');
  const run = vi.fn(async (model: string) => model === GEN ? { response: JSON.stringify({ questions: items }) } : { response: JSON.stringify({ reviews: items.map((_, index) => ({ index, valid: true, issues: [] })) }) });
  Object.assign(t.env, { QUESTION_GENERATION_ENABLED: 'true', QUESTION_GENERATION_VERIFICATION_ENABLED: 'true', AI: { run } });
  const job = await t.request('/api/open-ended-jobs', 'POST', { academicYear: '2026-2027', gradeLevel: 8, subjectId: 'sub_tur', outcomeCode: 'T.8.1.1', format: 'OPEN_ENDED', questionCount: items.length, maxPoints: 10 });
  expect(job.response.status, job.text).toBe(201);
  const ran = await t.request(`/api/open-ended-jobs/${job.data.job.id}/run`, 'POST', {});
  expect(ran.response.status, ran.text).toBe(200);
  const questionIds: string[] = ran.data.questionIds;
  const approve = async (id: string) => {
    const q = t.db.prepare('SELECT review_revision FROM question_bank WHERE id=?').get(id) as any;
    expect((await t.request(`/api/question-bank-standard/${id}`, 'PATCH', { copyrightStatus: 'OWNED', expectedRevision: q.review_revision })).response.status).toBe(200);
    const listed = (await t.request(`/api/platform/questions?questionId=${id}`)).data.questions[0];
    const rev = (t.db.prepare('SELECT review_revision r FROM question_bank WHERE id=?').get(id) as any).r;
    const r = await t.request(`/api/question-bank-standard/${id}/review`, 'PATCH', { status: 'APPROVED', expectedRevision: rev, expectedContext: listed.reviewContext,
      qualityReview: { outcomeAlignment: 'Soru ana fikir kazanımını doğrudan ölçüyor.', languageAndDistractors: 'Dil sınıf düzeyine uygun; seçenek yok, rubrik açık.', duplicateDisposition: 'NO_REPETITION_FOUND', duplicateRationale: 'Havuzda benzer açık uçlu soru bulunmadı.' },
      checks: { answerAndSolution: true, curriculum: true, ageAppropriate: true, originalityAndRights: true, rubric: true } });
    expect(r.response.status, r.text).toBe(200);
  };
  // a Turkish teacher of the school, a teacher of another subject, and a Turkish teacher of another school
  t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('other','Other School','OTHER','ACTIVE');
    INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season2','other','2026-2027','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('tch_mat','TEACHER','Mat','unused','unused',1,'school'),('tch_other','TEACHER','Other','unused','unused',1,'other'),('mgr','INSTITUTION_MANAGER','Mgr','unused','unused',1,'school');
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,subject_id,assignment_type,active) VALUES('ta1','teacher','school','season','sub_tur','SUBJECT',1),('ta2','tch_mat','school','season','sub_mat','SUBJECT',1),('ta3','tch_other','other','season2','sub_tur','SUBJECT',1);`);
  const cookies: Record<string, string> = {};
  for (const id of ['tch_mat', 'tch_other', 'mgr']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const app = (await import('../../worker/preview-policy-production-entry')).default as any;
  const as = async (who: string, path: string, method = 'GET', body?: any) => {
    if (!cookies[who]) return t.request(path, method, body, who);
    const res = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who], Origin: 'https://app.anunex.com', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { response: res, data, text };
  };
  return { ...t, run, questionIds, approve, as };
}

/** A final written paper (A040) of the school: bank item 40 pts on T.8.1.1 (two 20-pt criteria, 0/10/20) and a committee item 60 pts (0/30/60) on an un-coded row. */
export async function finalWrittenPaper() {
  const t = await writtenSetup();
  const [qid] = t.questionIds; await t.approve(qid);
  expect((await t.as('teacher', `/api/question-rubrics/${qid}/versions`, 'POST', { totalPoints: 40, alternatives: [], criteria: [
    { criterion: 'Okuma adımlarını sıralama', points: 20, levels: [{ points: 0, descriptor: 'Yok' }, { points: 10, descriptor: 'Kısmen' }, { points: 20, descriptor: 'Tam' }] },
    { criterion: 'Ana fikri ifade etme', points: 20, levels: [{ points: 0, descriptor: 'Yok' }, { points: 10, descriptor: 'Kısmen' }, { points: 20, descriptor: 'Tam' }] }] })).response.status).toBe(201);
  expect((await t.as('teacher', `/api/question-rubrics/${qid}/versions/2/approve`, 'POST', { confirm: true })).response.status).toBe(200);
  const tb = await t.as('admin', '/api/written-scenarios', 'POST', { academicYear: '2026-2027', term: 1, examNo: 1, gradeLevel: 8, subjectId: 'sub_tur', authority: 'ODSGM', sourceTitle: 'Dağılım tablosu', sourceUrl: 'https://www.meb.gov.tr/ortak-yazili-dagilim/haber/00000/tr', sourceAcademicYear: '2026-2027',
    scenarios: [{ label: 'A', rows: [{ unit: 'Okuma', outcomeCode: 'T.8.1.1', questionCount: 1 }, { unit: 'Yazma', topic: 'Metin', questionCount: 1 }] }] });
  await t.as('admin', `/api/written-scenarios/${tb.data.id}/verify`, 'POST', {});
  const sc = (await t.as('mgr', `/api/written-scenarios/${tb.data.id}`)).data.table.scenarios[0];
  await t.as('mgr', `/api/written-scenarios/${tb.data.id}/choice`, 'POST', { scenarioId: sc.id });
  const id = (await t.as('teacher', '/api/written-papers', 'POST', { tableId: tb.data.id, title: '8-A Türkçe 1. yazılı' })).data.id;
  expect((await t.as('teacher', `/api/written-papers/${id}/items`, 'PUT', { items: [
    { scenarioRowId: sc.rows[0].id, questionId: qid },
    { scenarioRowId: sc.rows[1].id, source: 'ZUMRE', stemText: 'Zümre sorusu: okuduğunuz metnin konusunu ve ana fikrini yazınız.', modelAnswer: 'Konu ve ana fikir doğru yazılır.',
      rubric: { totalPoints: 60, alternatives: [], criteria: [{ criterion: 'Konu ve ana fikir', points: 60, levels: [{ points: 0, descriptor: 'Yok' }, { points: 30, descriptor: 'Kısmen' }, { points: 60, descriptor: 'Tam' }] }] } }] })).response.status).toBe(200);
  expect((await t.as('teacher', `/api/written-papers/${id}/finalize`, 'POST', { confirm: true })).response.status).toBe(200);
  const items = t.db.prepare('SELECT id,sort_order FROM written_paper_items WHERE paper_id=? ORDER BY sort_order').all(id) as any[];
  const score = (student: string, itemId: string, criterionPoints: number[], reason?: string) => t.as('teacher', `/api/written-papers/${id}/grading/${student}/items/${itemId}`, 'POST', { criterionPoints, reason });
  const finalize = (student: string, reason?: string) => t.as('teacher', `/api/written-papers/${id}/grading/${student}/finalize`, 'POST', { confirm: true, reason });
  return { ...t, id, items, score, finalize };
}
