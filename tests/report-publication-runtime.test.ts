import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import app from '../worker/reporting-entry';
import { getAuthUser } from '../worker/lib/auth';
vi.mock('../worker/lib/auth', () => ({ getAuthUser: vi.fn() }));
vi.mock('../worker/answer-correctness-entry', () => ({ default: { fetch: vi.fn() } }));
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE exams(id TEXT,title TEXT,exam_date TEXT,exam_type TEXT);
    CREATE TABLE exam_participants(id TEXT,exam_id TEXT,student_id TEXT,booklet_code TEXT);
    CREATE TABLE exam_results(participant_id TEXT,correct_count INTEGER,wrong_count INTEGER,blank_count INTEGER,net REAL,score REAL,success_percent REAL,institution_rank INTEGER,created_at TEXT);
    CREATE TABLE exam_delivery_profiles(exam_id TEXT,result_freeze_status TEXT,published_at TEXT,result_publish_at TEXT,snapshot_version INTEGER DEFAULT 1);
    CREATE TABLE exam_result_snapshots(exam_id TEXT,student_id TEXT,snapshot_version INTEGER,payload_json TEXT);`);
  for (const [id,status,date] of [['due','PUBLISHED','2026-09-30T17:00:00Z'],['future','PUBLISHED','2026-09-30T19:00:00Z'],['draft','FROZEN',null]]) {
    db.prepare('INSERT INTO exams VALUES(?,?,?,?)').run(id,id,'2026-09-30','LGS');
    db.prepare('INSERT INTO exam_participants VALUES(?,?,?,?)').run(id,id,'student','A');
    db.prepare('INSERT INTO exam_results VALUES(?,1,0,0,1,NULL,100,1,?)').run(id,'2026-09-30');
    db.prepare('INSERT INTO exam_delivery_profiles(exam_id,result_freeze_status,published_at,result_publish_at) VALUES(?,?,?,?)').run(id,status,'2026-09-30',date);
  }
  for (const id of ['due','future','draft']) db.prepare('INSERT INTO exam_result_snapshots VALUES(?,?,?,?)').run(id,'student',1,JSON.stringify({schemaVersion:1,exam:{exam_id:id,title:id,exam_date:'2026-09-30',net:1},subjects:[{subject_id:'math',subject_name:'Matematik',net:1}],outcomes:[{outcome_id:'o1',evidence_count:1,correct_count:1}]}));
  const env = { DB: { prepare: (sql: string) => ({ bind: (...args: any[]) => ({
    first: async () => sql.includes('FROM student_entities') ? { id: 'student', status: 'ACTIVE', institution_id: 'school' } : sql.includes('parent_student_links') ? { id: 'link' } : null,
    all: async () => ({ results: (sql.includes('JOIN exam_results er')||sql.includes('FROM exam_result_snapshots snap')) ? db.prepare(sql.replaceAll('CURRENT_TIMESTAMP', "'2026-09-30 18:00:00'")).all(...args) : [] }),
  }) }) } } as any;
  return { db, request: () => app.fetch(new Request('https://app.anunex.com/api/reporting/students/student/combined'), env) };
}
describe('student report publication gate', () => {
  it('keeps published totals, subject and outcome evidence fixed when live results change', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({id:'user',role:'STUDENT',student_id:'student'} as any);
    const f=fixture();try{
      f.db.exec('UPDATE exam_results SET net=99,correct_count=99');
      const data=await (await f.request()).json() as any;
      expect(data.exams[0].net).toBe(1);expect(data.subjectTrend[0].net).toBe(1);
      expect(data.outcomes[0].correct_count).toBe(1);expect(data.unavailableSnapshotExamIds).toEqual([]);
    }finally{f.db.close()}
  });
  it('reports missing legacy payload without falling back to live results', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({id:'user',role:'PARENT'} as any);
    const f=fixture();try{
      f.db.exec("UPDATE exam_result_snapshots SET payload_json=NULL WHERE exam_id='due'");
      const data=await (await f.request()).json() as any;
      expect(data.availableExams).toEqual([]);expect(data.unavailableSnapshotExamIds).toEqual(['due']);
    }finally{f.db.close()}
  });
  for (const role of ['STUDENT','PARENT','INSTITUTION_MANAGER']) it(`filters publication correctly for ${role}`, async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'user', role, student_id: 'student', institution_id: 'school' } as any);
    const f = fixture();
    try { const response = await f.request(); expect(response.status).toBe(200); const payload = await response.json() as any;
      expect(payload.availableExams.map((e: any) => e.exam_id).sort()).toEqual(role==='INSTITUTION_MANAGER'?['draft','due','future']:['due']);
    } finally { f.db.close(); }
  });
});
