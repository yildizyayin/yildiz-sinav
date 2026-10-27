import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { expect } from 'vitest';
import app from '../../worker/preview-policy-production-entry';
import chunkedApi from '../../worker/chunked-evaluation-entry';
import { createSession } from '../../worker/lib/auth';
import { normalizeName } from '../../worker/lib/db';

/**
 * A029/A030: an exam evaluated end to end on the real migration schema, served by the production
 * entry chain. Synthetic data only: one registered student (with student and parent accounts) and a guest.
 */
export const TITLE = 'GIZLI DENEME 7731';
export const KEY = { TUR: 'ABCD', MAT: 'DCBA' };
export const SHEETS = [
  { no: '101', name: 'ALI YILMAZ', TUR: 'ABCC', MAT: 'DC__' },
  { no: '555', name: 'MISAFIR OGRENCI', TUR: 'AB__', MAT: 'DCBA' },
];

// Workers edge cache is not in node: an empty cache keeps every read going to the database.
(globalThis as any).caches ??= { default: { match: async () => undefined, put: async () => undefined, delete: async () => false }, open: async () => ({ match: async () => undefined, put: async () => undefined, delete: async () => false }) };

export async function evaluatedExam(mode: 'direct' | 'chunked' = 'direct', opts: { outcomes?: boolean; sheets?: Array<{ no: string; name: string; TUR: string; MAT: string }> } = {}) {
  const sheets = opts.sheets || SHEETS;
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../../migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'));
  const make = (sql: string, args: any[] = []): any => ({
    __sql: sql,
    bind: (...v: any[]) => make(sql, v),
    first: async (c?: string) => { const r = db.prepare(sql).get(...args) as any; return c ? r?.[c] : r; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    raw: async () => db.prepare(sql).all(...args).map((r: any) => Object.values(r)),
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  const env = { ENVIRONMENT: 'test', DB: {
    prepare: (sql: string) => make(sql),
    batch: async (st: any[]) => { db.exec('BEGIN'); try { const r = []; for (const s of st) r.push(/^\s*(WITH[\s\S]*?\)\s*)?SELECT/i.test(String(s.__sql)) ? { results: (await s.all()).results, meta: {} } : await s.run()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    exec: async (sql: string) => { db.exec(sql); return { count: 1 }; },
  } } as any;
  db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('school','Synthetic School','SYNTHETIC','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active) VALUES('admin','SUPER_ADMIN','Synthetic Admin','unused','unused',1);
    INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season','school','2026-2027','ACTIVE');
    INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,verified,program_code,authority) VALUES('cv8','2026-2027',8,'MAARIF-2026',1,'SCHOOL','MEB');
    INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,topic,title,official,active) VALUES
      ('o_tur1','cv8','sub_tur',8,'T.8.1.1','Okuma','Metnin ana fikrini belirler.',1,1),
      ('o_mat1','cv8','sub_mat',8,'M.8.1.1','Üslü ifadeler','Üslü ifadelerle işlem yapar.',1,1);`);
  db.prepare('INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES(?,?,?,?,?)').run('s1', 'ALI', 'YILMAZ', normalizeName('ALI YILMAZ'), 'ACTIVE');
  db.prepare('INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,grade_level,section,status) VALUES(?,?,?,?,?,?,?,?)').run('enr1', 's1', 'school', 'season', '101', 8, 'A', 'ACTIVE');
  db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id,student_id) VALUES('stuuser','STUDENT','Ali','unused','unused',1,'school','s1');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('parent','PARENT','Veli','unused','unused',1,'school'),('teacher','TEACHER','Synthetic Teacher','unused','unused',1,'school');
    INSERT INTO parent_student_links(id,parent_user_id,student_id,active) VALUES('psl1','parent','s1',1);`);
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'stuuser', 'parent', 'teacher']) cookies[id] = (await createSession(env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
  const request = async (path: string, method = 'GET', body?: any, as = 'admin') => {
    const form = body instanceof FormData;
    const req = new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[as], Origin: 'https://app.anunex.com', ...(form || body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }) });
    const res = mode === 'chunked' && path.endsWith('/evaluate') ? await chunkedApi.fetch(req, env) : await (app as any).fetch(req, env, ctx);
    const text = await res.text();
    let data: any = null; try { data = JSON.parse(text); } catch { data = text; }
    return { response: res, data, text };
  };
  const created = await request('/api/exam-definitions', 'POST', { ownerType: 'CENTRAL', academicYear: '2026-2027', title: TITLE, examType: 'LGS', gradeLevel: 8, publisherName: 'Sentetik', sessionLabel: 'Tek', scoringRuleVersionId: 'srv_meb_lgs_2627', outcomeMode: 'OPTIONAL' });
  expect(created.response.status, created.text).toBe(201);
  const examId = created.data.id as string, base = `/api/exam-definitions/${examId}`;
  expect((await request(`${base}/structure`, 'PUT', { booklets: ['A'], subjects: [
    { subjectId: 'sub_tur', questionCount: 4, questionStart: 1, questionEnd: 4, optionCount: 4, wrongDivisor: 3, sortOrder: 1 },
    { subjectId: 'sub_mat', questionCount: 4, questionStart: 5, questionEnd: 8, optionCount: 4, wrongDivisor: 3, sortOrder: 2 }] })).response.status).toBe(200);
  const outcomeRefs = (code: string) => Array.from({ length: 4 }, () => ({ code }));
  const key = await request(`${base}/answer-key`, 'PUT', { entries: [
    { subjectId: 'sub_tur', bookletCode: 'A', answers: KEY.TUR, optionCount: 4, ...(opts.outcomes ? { outcomeRefs: outcomeRefs('T.8.1.1') } : {}) },
    { subjectId: 'sub_mat', bookletCode: 'A', answers: KEY.MAT, optionCount: 4, ...(opts.outcomes ? { outcomeRefs: outcomeRefs('M.8.1.1') } : {}) }] });
  expect(key.response.status, key.text).toBe(200);
  expect((await request(`${base}/institutions`, 'PUT', { institutionIds: ['school'] })).response.status).toBe(200);
  expect((await request(`${base}/status`, 'PATCH', { status: 'ACTIVE' })).response.status).toBe(200);
  // Built-in Sekonic 7108 lines (171 chars): no 10–15, name 15–35, class 35–37, booklet 50, TUR 51–71 … MAT 131–151.
  const line = (s: typeof SHEETS[number]) => '7108'.padEnd(10) + s.no.padStart(5) + s.name.padEnd(20) + '8A' + ' '.repeat(13) + 'A' + s.TUR.replace(/_/g, ' ').padEnd(20) + ' '.repeat(60) + s.MAT.replace(/_/g, ' ').padEnd(20) + ' '.repeat(20);
  const txt = sheets.map(line).join('\r\n');
  const form = new FormData(); form.set('institutionId', 'school'); form.set('templateVersionId', 'optik-7108-sekonic-v1'); form.set('file', new File([txt], 'deneme.txt', { type: 'text/plain' }));
  const up = await request(`/api/exams/${examId}/preview-file`, 'POST', form);
  expect(up.response.status, up.text).toBe(200);
  const batchPath = `/api/scan-batches/${up.data.batchId}`;
  for (const r of (await request(batchPath)).data.records) if (r.match_status === 'NEW_GUEST') expect((await request(`${batchPath}/records/${r.id}/resolve`, 'POST', { action: 'GUEST' })).response.status).toBe(200);
  let ev = await request(`${batchPath}/evaluate`, 'POST');
  while (mode === 'chunked' && ev.data?.done === false) ev = await request(`${batchPath}/evaluate`, 'POST');
  expect(ev.response.status, ev.text).toBe(200);
  return { db, env, request, examId, base };
}
