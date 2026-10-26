import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import definitions from '../worker/exam-outcome-matching-entry';
import examApi from '../worker/index';
import chunkedApi from '../worker/chunked-evaluation-entry';
import reporting from '../worker/reporting-entry';
import { handlePlatformApi } from '../worker/lib/platform-expansion';
import { createSession } from '../worker/lib/auth';
import { normalizeName } from '../worker/lib/db';

/**
 * A029: an exam evaluated and published without outcomes gets its outcome links later. An authorised
 * re-analysis must make the outcomes appear in the past result (staff view, student app view) without
 * touching scores, ranks or the frozen snapshot, and must not reach the result network until it is
 * published there. Runs on the real migration schema. All names are synthetic.
 */
const KEY = { TUR: 'ABCD', MAT: 'DCBA' };
const SHEETS = [
  { no: '101', name: 'ALI YILMAZ', TUR: 'ABCC', MAT: 'DC__' },
  { no: '555', name: 'MISAFIR OGRENCI', TUR: 'AB__', MAT: 'DCBA' },
];

async function setup(mode: 'direct' | 'chunked') {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  const prepare = (sql: string, args: any[] = []): any => ({ bind: (...v: any[]) => prepare(sql, v), first: async (c?: string) => { const r = db.prepare(sql).get(...args) as any; return c ? r?.[c] : r; }, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => { const r = db.prepare(sql).run(...args); return { success: true, results: [], meta: { changes: Number(r.changes) } }; } });
  const env = { ENVIRONMENT: 'test', DB: { prepare, batch: async (st: any[]) => { db.exec('BEGIN'); try { const r = []; for (const s of st) { const sql = String((s as any).__sql || ''); r.push(/^\s*(WITH[\s\S]*?\)\s*)?SELECT/i.test(sql) ? { results: await s.all().then((x: any) => x.results), meta: {} } : await s.run()); } db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } } } as any;
  // batch() needs to know which statements are reads: remember the SQL on each prepared statement.
  env.DB.prepare = (sql: string, args: any[] = []): any => { const p = prepare(sql, args); return { ...p, __sql: sql, bind: (...v: any[]) => env.DB.prepare(sql, v) }; };
  db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('school','Synthetic School','SYNTHETIC','ACTIVE'),('other','Other School','OTHER','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active) VALUES('admin','SUPER_ADMIN','Synthetic Admin','unused','unused',1);
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('teacher','TEACHER','Synthetic Teacher','unused','unused',1,'school'),('othermgr','INSTITUTION_MANAGER','Other Manager','unused','unused',1,'other');
    INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season','school','2026-2027','ACTIVE');
    INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,verified,program_code,authority) VALUES('cv8','2026-2027',8,'MAARIF-2026',1,'SCHOOL','MEB'),('cv8old','2025-2026',8,'OLD',1,'SCHOOL','MEB');
    INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,topic,title,official,active) VALUES
      ('o_tur1','cv8','sub_tur',8,'T.8.1.1','Okuma','Metnin ana fikrini belirler.',1,1),
      ('o_mat1','cv8','sub_mat',8,'M.8.1.1','Üslü ifadeler','Üslü ifadelerle işlem yapar.',1,1),
      ('o_old','cv8old','sub_mat',8,'M.8.9.9','Eski','Eski programdan kazanım.',1,1);`);
  db.prepare('INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES(?,?,?,?,?)').run('s1', 'ALI', 'YILMAZ', normalizeName('ALI YILMAZ'), 'ACTIVE');
  db.prepare('INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,grade_level,section,status) VALUES(?,?,?,?,?,?,?,?)').run('enr1', 's1', 'school', 'season', '101', 8, 'A', 'ACTIVE');
  db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id,student_id) VALUES('stuuser','STUDENT','Ali','unused','unused',1,'school','s1');`);
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'teacher', 'othermgr', 'stuuser']) cookies[id] = (await createSession(env, id, new Request('https://demo.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const request = async (path: string, method = 'GET', body?: any, as = 'admin') => {
    const form = body instanceof FormData;
    const req = new Request(`https://demo.anunex.com${path}`, { method, headers: { Cookie: cookies[as], Origin: 'https://demo.anunex.com', ...(form || body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }) });
    const app = path.startsWith('/api/exam-definitions') ? definitions : path.startsWith('/api/reporting') ? reporting : mode === 'chunked' && path.endsWith('/evaluate') ? chunkedApi : examApi;
    const res = await app.fetch(req, env);
    return { response: res, data: await res.json() as any };
  };
  const created = await request('/api/exam-definitions', 'POST', { ownerType: 'CENTRAL', academicYear: '2026-2027', title: 'Deneme 1', examType: 'LGS', gradeLevel: 8, publisherName: 'Sentetik', sessionLabel: 'Tek', scoringRuleVersionId: 'srv_meb_lgs_2627', outcomeMode: 'OPTIONAL' });
  expect(created.response.status, JSON.stringify(created.data)).toBe(201);
  const examId = created.data.id as string, base = `/api/exam-definitions/${examId}`;
  expect((await request(`${base}/structure`, 'PUT', { booklets: ['A'], subjects: [
    { subjectId: 'sub_tur', questionCount: 4, questionStart: 1, questionEnd: 4, optionCount: 4, wrongDivisor: 3, sortOrder: 1 },
    { subjectId: 'sub_mat', questionCount: 4, questionStart: 5, questionEnd: 8, optionCount: 4, wrongDivisor: 3, sortOrder: 2 }] })).response.status).toBe(200);
  const key = await request(`${base}/answer-key`, 'PUT', { entries: [{ subjectId: 'sub_tur', bookletCode: 'A', answers: KEY.TUR, optionCount: 4 }, { subjectId: 'sub_mat', bookletCode: 'A', answers: KEY.MAT, optionCount: 4 }] });
  expect(key.response.status, JSON.stringify(key.data)).toBe(200);
  expect((await request(`${base}/institutions`, 'PUT', { institutionIds: ['school'] })).response.status).toBe(200);
  expect((await request(`${base}/status`, 'PATCH', { status: 'ACTIVE' })).response.status).toBe(200);
  const csv = ['student_number;name;class;booklet;answers_TUR;answers_MAT', ...SHEETS.map((s) => `${s.no};${s.name};8A;A;${s.TUR};${s.MAT}`)].join('\n');
  const form = new FormData(); form.set('institutionId', 'school'); form.set('file', new File([csv], 'deneme.csv', { type: 'text/csv' }));
  const up = await request(`/api/exams/${examId}/preview-file`, 'POST', form);
  expect(up.response.status, JSON.stringify(up.data)).toBe(200);
  const batchPath = `/api/scan-batches/${up.data.batchId}`;
  for (const r of (await request(batchPath)).data.records) if (r.match_status === 'NEW_GUEST') expect((await request(`${batchPath}/records/${r.id}/resolve`, 'POST', { action: 'GUEST' })).response.status).toBe(200);
  let ev = await request(`${batchPath}/evaluate`, 'POST');
  while (mode === 'chunked' && ev.data.done === false) ev = await request(`${batchPath}/evaluate`, 'POST');
  expect(ev.response.status, JSON.stringify(ev.data)).toBe(200);
  const platform = async (path: string) => { const res = (await handlePlatformApi(new Request(`https://demo.anunex.com${path}`, { method: 'POST' }), env, { id: 'admin', role: 'SUPER_ADMIN' } as any))!; return { response: res, data: await res.json() as any }; };
  return { db, env, request, platform, examId, base };
}

const scoresOf = (db: DatabaseSync, examId: string) => db.prepare(`SELECT ep.student_id s,ep.participant_status st,er.net,er.score,er.correct_count d FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id=? ORDER BY ep.name_snapshot`).all(examId);

describe('A029: outcomes linked after the results', () => {
  for (const mode of ['direct', 'chunked'] as const) it(`${mode}: re-analysis shows outcomes in the published past result, scores and the frozen snapshot stay as they were`, async () => {
    const t = await setup(mode);
    try {
      expect(t.db.prepare('SELECT count(*) c FROM outcome_results WHERE exam_id=?').get(t.examId)).toEqual({ c: 0 });
      const frozen = await t.platform(`/api/platform/exam-center/${t.examId}/freeze`);
      expect(frozen.response.status, JSON.stringify(frozen.data)).toBe(200);
      const pub = await t.platform(`/api/platform/exam-center/${t.examId}/publish`);
      expect(pub.response.status, JSON.stringify(pub.data)).toBe(200);
      const before = { scores: scoresOf(t.db, t.examId), snapshots: t.db.prepare('SELECT participant_id,score,net,institution_rank,payload_json FROM exam_result_snapshots WHERE exam_id=? ORDER BY participant_id').all(t.examId) };
      const studentBefore = await t.request('/api/reporting/students/s1/combined', 'GET', undefined, 'stuuser');
      expect(studentBefore.response.status, JSON.stringify(studentBefore.data)).toBe(200);
      expect(studentBefore.data.outcomes).toEqual([]);

      // Only the exam's manager may re-analyse; a teacher or another institution cannot.
      const mappings = await t.request(`${t.base}/outcome-mappings`);
      expect(mappings.response.status).toBe(200);
      expect(mappings.data.outcomes.map((o: any) => o.id).sort()).toEqual(['o_mat1', 'o_tur1']);
      expect(mappings.data).toMatchObject({ resultCount: 2, appPublished: true, networkPublished: true }); // S029: a central exam is listed in the result network on activation
      const q = mappings.data.questions as Array<{ id: string; subject_id: string; question_no: number }>;
      const body = { expectedRevision: mappings.data.revision, reason: 'Kazanım tablosu sonradan geldi.', mappings: q.map((x) => ({ questionId: x.id, outcomeIds: [x.subject_id === 'sub_tur' ? 'o_tur1' : 'o_mat1'] })) };
      expect((await t.request(`${t.base}/outcome-mappings`, 'PUT', body, 'teacher')).response.status).toBe(403);
      expect((await t.request(`${t.base}/outcome-mappings`, 'PUT', body, 'othermgr')).response.status).toBe(404);
      const wrongYear = await t.request(`${t.base}/outcome-mappings`, 'PUT', { ...body, mappings: [{ questionId: q.find((x) => x.subject_id === 'sub_mat')!.id, outcomeIds: ['o_old'] }] });
      expect(wrongYear.data.error.code).toBe('OUTCOME_SCOPE_MISMATCH');
      const saved = await t.request(`${t.base}/outcome-mappings`, 'PUT', body);
      expect(saved.response.status, JSON.stringify(saved.data)).toBe(200);
      expect(saved.data).toMatchObject({ ok: true, scoresChanged: false, participantCount: 2 });
      expect((await t.request(`${t.base}/outcome-mappings`, 'PUT', body)).data.error.code).toBe('OUTCOME_REVISION_CHANGED');

      // Scores, ranks and the frozen snapshot did not move.
      expect(scoresOf(t.db, t.examId)).toEqual(before.scores);
      expect(t.db.prepare('SELECT participant_id,score,net,institution_rank,payload_json FROM exam_result_snapshots WHERE exam_id=? ORDER BY participant_id').all(t.examId)).toEqual(before.snapshots);

      // Staff (live) view: every participant who took the exam, guest included, has outcome evidence.
      const evidence = t.db.prepare(`SELECT ep.name_snapshot n,o.code,r.evidence_count e,r.correct_count c FROM outcome_results r JOIN exam_participants ep ON ep.student_id=r.student_id AND ep.exam_id=r.exam_id JOIN outcomes o ON o.id=r.outcome_id WHERE r.exam_id=? ORDER BY n,o.code`).all(t.examId).map((r: any) => [r.n, r.code, r.e, r.c]);
      expect(evidence).toEqual([['ALI YILMAZ', 'M.8.1.1', 4, 2], ['ALI YILMAZ', 'T.8.1.1', 4, 3], ['MISAFIR OGRENCI', 'M.8.1.1', 4, 4], ['MISAFIR OGRENCI', 'T.8.1.1', 4, 2]]);

      // Student app view of the published past result now lists the outcomes.
      const studentAfter = await t.request('/api/reporting/students/s1/combined', 'GET', undefined, 'stuuser');
      expect(studentAfter.data.outcomes.map((o: any) => [o.code, o.evidence_count, o.correct_count]).sort()).toEqual([['M.8.1.1', 4, 2], ['T.8.1.1', 4, 3]]);
      expect(studentAfter.data.exams[0]).toMatchObject({ net: before.scores[0].net });

      // The result network keeps its version until it is published there.
      expect(t.db.prepare('SELECT revision,published_app_at IS NOT NULL app,published_result_at IS NOT NULL result FROM exam_outcome_analysis_revisions WHERE exam_id=? ORDER BY revision DESC LIMIT 1').get(t.examId)).toEqual({ revision: saved.data.revision, app: 1, result: 0 });
      const audit = t.db.prepare(`SELECT details_json FROM audit_logs WHERE action='EXAM_OUTCOMES_UPDATED' AND entity_id=?`).get(t.examId) as any;
      expect(JSON.parse(audit.details_json)).toMatchObject({ reason: 'Kazanım tablosu sonradan geldi.', questionCount: 8 });
    } finally { t.db.close(); }
  }, 30000);
});
