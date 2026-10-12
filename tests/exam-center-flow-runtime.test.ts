import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import definitions from '../worker/exam-admin-entry';
import examApi from '../worker/index';
import chunkedApi from '../worker/chunked-evaluation-entry';
import { createSession } from '../worker/lib/auth';
import { normalizeName } from '../worker/lib/db';

async function fixture(mode: 'direct' | 'chunked') {
  const db = new DatabaseSync(':memory:');
  const directory = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(directory).filter(file => file.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, directory), 'utf8'));
  function prepare(sql: string, args: any[] = []): any {
    return {
      bind: (...values: any[]) => prepare(sql, values),
      first: async (column?: string) => {const row = db.prepare(sql).get(...args) as any; return column ? row?.[column] : row;},
      all: async () => ({results: db.prepare(sql).all(...args)}),
      run: async () => ({results: [], meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
    };
  }
  const env = {ENVIRONMENT: 'test', DB: {prepare, batch: async (statements: any[]) => {
    db.exec('BEGIN');
    try {const result = []; for (const statement of statements) result.push(await statement.run()); db.exec('COMMIT'); return result;}
    catch (error) {db.exec('ROLLBACK'); throw error;}
  }}} as any;
  db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('school','Synthetic School','SYNTHETIC','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active) VALUES('admin','SUPER_ADMIN','Synthetic Admin','unused','unused',1);
    INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season','school','2026-2027','ACTIVE');`);
  for (let n = 1; n <= 7; n++) {
    db.prepare('INSERT INTO student_entities(id,first_name,last_name,normalized_name,status,tckn) VALUES(?,?,?,?,?,?)').run(`s${n}`, `Student${n}`, 'Test', normalizeName(`Student${n} Test`), 'ACTIVE', n === 1 ? '10000000001' : null);
    db.prepare('INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,grade_level,section,status) VALUES(?,?,?,?,?,?,?,?)').run(`enr${n}`, `s${n}`, 'school', 'season', String(100 + n), 8, 'A', 'ACTIVE');
  }
  const session = await createSession(env, 'admin', new Request('https://demo.anunex.com'), false);
  const cookie = session.headers.get('Set-Cookie')!.split(';')[0];
  async function request(path: string, method = 'GET', body?: any) {
    const form = body instanceof FormData;
    const req = new Request(`https://demo.anunex.com${path}`, {method, headers: {Cookie: cookie, ...(form || body === undefined ? {} : {'Content-Type': 'application/json'})}, ...(body === undefined ? {} : {body: form ? body : JSON.stringify(body)})});
    const response = await (path.startsWith('/api/exam-definitions') ? definitions : mode === 'chunked' && path.endsWith('/evaluate') ? chunkedApi : examApi).fetch(req, env);
    const data = await response.json() as any;
    return {response, data};
  }
  return {db, request};
}

describe('authenticated exam center HTTP flow on the complete migration schema', () => {
  for (const mode of ['direct','chunked'] as const) for (const extension of ['txt', 'dat']) it(`${mode}: creates, activates, uploads ${extension.toUpperCase()}, resolves identity/booklet and persists results`, async () => {
    const f = await fixture(mode);
    try {
      const created = await f.request('/api/exam-definitions', 'POST', {ownerType: 'CENTRAL', academicYear: '2026-2027', title: `Synthetic ${extension} acceptance`, examType: 'CUSTOM', gradeLevel: 8, publisherName: 'Synthetic Publisher', sessionLabel: 'Acceptance', description: 'Synthetic test only', scoringRuleVersionId: 'srv_anunex_standard_2627'});
      expect(created.response.status, JSON.stringify(created.data)).toBe(201);
      const examId = created.data.id;
      const base = `/api/exam-definitions/${examId}`;
      expect((f.db.prepare('SELECT status FROM exams WHERE id=?').get(examId) as any).status).toBe('DRAFT');
      const structure = await f.request(`${base}/structure`, 'PUT', {booklets: ['A','B'], subjects: [{subjectId: 'sub_tyt_mat', questionCount: 4, optionCount: 4, wrongDivisor: 4}]});
      expect(structure.response.status, JSON.stringify(structure.data)).toBe(200);
      const answers = await f.request(`${base}/answer-key`, 'PUT', {entries: [{subjectId: 'sub_tyt_mat', bookletCode: 'A', answers: 'ABCA', optionCount: 4}, {subjectId: 'sub_tyt_mat', bookletCode: 'B', answers: 'BACB', optionCount: 4}]});
      expect(answers.response.status, JSON.stringify(answers.data)).toBe(200);
      const blocked = await f.request(`${base}/status`, 'PATCH', {status: 'ACTIVE'});
      expect(blocked.response.status).toBe(409);
      expect(blocked.data.error.code).toBe('INSTITUTION_ASSIGNMENT_REQUIRED');
      expect((await f.request(`${base}/institutions`, 'PUT', {institutionIds: ['school']})).response.status).toBe(200);
      expect((await f.request(base)).data.readiness.ready_to_publish).toBe(true);
      expect((await f.request(`${base}/status`, 'PATCH', {status: 'ACTIVE'})).response.status).toBe(200);
      const text = 'tckn,student_number,name,class,booklet,answers_TYT_MAT\n10000000001,999,Student1 Test,8/A,A,ABCA\n,102,Student2 Test,8/A,A,ABDA\n,,Student3 Test,8/A,A,ABCA\n,999,Unknown Participant,8/A,,ABC_\n,105,Student5 Test,8/A,A,ABCA\n,106,Student6 Test,8/A,A,ABCA\n,107,Student7 Test,8/A,A,ABCA';
      const form = new FormData(); form.set('institutionId', 'school'); form.set('file', new File([text], `synthetic.${extension}`, {type: 'text/plain'}));
      const uploaded = await f.request(`/api/exams/${examId}/preview-file`, 'POST', form);
      expect(uploaded.response.status, JSON.stringify(uploaded.data)).toBe(200);
      expect(uploaded.data).toMatchObject({total: 7, status: 'NEEDS_REVIEW'});
      const batchId = uploaded.data.batchId;
      const batchPath = `/api/scan-batches/${batchId}`;
      const preview = (await f.request(batchPath)).data;
      expect(preview.records.slice(0,4).map((row: any) => row.matched_student_id)).toEqual(['s1','s2','s3',null]);
      expect(preview.records.every((row: any) => !('tckn' in row.canonical))).toBe(true);
      const unknown = preview.records[3];
      expect(unknown.bookletOptions).toEqual(expect.arrayContaining([expect.objectContaining({code:'A', available:true, correct:3, blank:1, net:3}), expect.objectContaining({code:'B', available:true, correct:1, wrong:2, net:0.5})]));
      expect((await f.request(`${batchPath}/evaluate`, 'POST')).data.error.code).toBe('BATCH_NEEDS_REVIEW');
      expect((await f.request(`${batchPath}/records/${preview.records[2].id}/resolve`, 'POST', {action:'MATCH', studentId:'s3'})).response.status).toBe(200);
      expect((await f.request(`${batchPath}/records/${unknown.id}/resolve`, 'POST', {action:'MATCH', studentId:'s4'})).response.status).toBe(200);
      expect((await f.request(batchPath)).data.counts.pending).toBe(1);
      expect((await f.request(`${batchPath}/records/${unknown.id}/resolve`, 'POST', {action:'BOOKLET', bookletCode:'A'})).response.status).toBe(200);
      expect((await f.request(`${batchPath}/records/${preview.records[6].id}/resolve`, 'POST', {action:'CANCEL'})).response.status).toBe(200);
      expect((await f.request(batchPath)).data.batch.status).toBe('READY');
      let evaluated = await f.request(`${batchPath}/evaluate`, 'POST');
      if (mode === 'chunked') {expect(evaluated.data).toMatchObject({done:false,processed:5,total:6});evaluated = await f.request(`${batchPath}/evaluate`, 'POST');expect(evaluated.data.done).toBe(true);}
      expect(evaluated.response.status, JSON.stringify(evaluated.data)).toBe(200);
      expect(evaluated.data.processed).toBe(6);
      const persisted = f.db.prepare('SELECT ep.student_id,er.correct_count,er.wrong_count,er.blank_count,er.net FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id=? ORDER BY ep.student_id').all(examId);
      expect(persisted).toEqual([
        {student_id:'s1',correct_count:4,wrong_count:0,blank_count:0,net:4},
        {student_id:'s2',correct_count:3,wrong_count:1,blank_count:0,net:2.75},
        {student_id:'s3',correct_count:4,wrong_count:0,blank_count:0,net:4},
        {student_id:'s4',correct_count:3,wrong_count:0,blank_count:1,net:3},
        {student_id:'s5',correct_count:4,wrong_count:0,blank_count:0,net:4},
        {student_id:'s6',correct_count:4,wrong_count:0,blank_count:0,net:4},
      ]);
      expect((f.db.prepare('SELECT count(*) c FROM student_answers').get() as any).c).toBe(24);
      expect((f.db.prepare('SELECT count(*) c FROM assessment_runs WHERE exam_id=?').get(examId) as any).c).toBe(6);
      expect((f.db.prepare('SELECT count(*) c FROM assessment_responses WHERE exam_question_id IS NOT NULL AND question_id IS NULL').get() as any).c).toBe(24);
      expect((await f.request(batchPath)).data.batch.status).toBe('COMMITTED');
      expect((await f.request(`${batchPath}/records/${unknown.id}/resolve`, 'POST', {action:'BOOKLET',bookletCode:'B'})).response.status).toBe(400);
      expect((await f.request(`${base}/answer-key`, 'PUT', {entries:[]})).response.status).toBe(409);
    } finally {f.db.close();}
  }, 15000);
});
