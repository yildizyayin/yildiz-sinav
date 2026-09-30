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
    CREATE TABLE exam_delivery_profiles(exam_id TEXT,result_freeze_status TEXT,published_at TEXT,result_publish_at TEXT);`);
  for (const [id,status,date] of [['due','PUBLISHED','2026-09-30T17:00:00Z'],['future','PUBLISHED','2026-09-30T19:00:00Z'],['draft','FROZEN',null]]) {
    db.prepare('INSERT INTO exams VALUES(?,?,?,?)').run(id,id,'2026-09-30','LGS');
    db.prepare('INSERT INTO exam_participants VALUES(?,?,?,?)').run(id,id,'student','A');
    db.prepare('INSERT INTO exam_results VALUES(?,1,0,0,1,NULL,100,1,?)').run(id,'2026-09-30');
    db.prepare('INSERT INTO exam_delivery_profiles VALUES(?,?,?,?)').run(id,status,'2026-09-30',date);
  }
  const env = { DB: { prepare: (sql: string) => ({ bind: (...args: any[]) => ({
    first: async () => sql.includes('FROM student_entities') ? { id: 'student', status: 'ACTIVE', institution_id: 'school' } : sql.includes('parent_student_links') ? { id: 'link' } : null,
    all: async () => ({ results: sql.includes('JOIN exam_results er') ? db.prepare(sql.replaceAll('CURRENT_TIMESTAMP', "'2026-09-30 18:00:00'")).all(...args) : [] }),
  }) }) } } as any;
  return { db, request: () => app.fetch(new Request('https://app.anunex.com/api/reporting/students/student/combined'), env) };
}
describe('student report publication gate', () => {
  for (const role of ['STUDENT','PARENT','INSTITUTION_MANAGER']) it(`filters publication correctly for ${role}`, async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'user', role, student_id: 'student', institution_id: 'school' } as any);
    const f = fixture();
    try { const response = await f.request(); expect(response.status).toBe(200); const payload = await response.json() as any;
      expect(payload.availableExams.map((e: any) => e.exam_id).sort()).toEqual(role==='INSTITUTION_MANAGER'?['draft','due','future']:['due']);
    } finally { f.db.close(); }
  });
});
