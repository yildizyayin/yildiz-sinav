import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { examReadiness } from '../worker/lib/exam-readiness';
import { setStatus } from '../worker/exam-admin-entry';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE exams(id TEXT PRIMARY KEY,owner_type TEXT,institution_id TEXT,status TEXT,outcome_mode TEXT,scoring_rule_version_id TEXT,result_network_enabled INTEGER,updated_at TEXT);
    CREATE TABLE exam_subjects(exam_id TEXT,question_count INTEGER);
    CREATE TABLE exam_questions(id TEXT PRIMARY KEY,exam_id TEXT,question_status TEXT);
    CREATE TABLE exam_booklets(exam_id TEXT,code TEXT,active INTEGER);
    CREATE TABLE answer_keys(exam_question_id TEXT,booklet_code TEXT);
    CREATE TABLE question_outcomes(exam_question_id TEXT);
    CREATE TABLE scoring_rule_versions(id TEXT,rule_id TEXT,verified INTEGER);
    CREATE TABLE scoring_rules(id TEXT,name TEXT,authority TEXT);
    CREATE TABLE exam_institutions(exam_id TEXT,institution_id TEXT,enabled INTEGER);
    CREATE TABLE exam_operation_locks(exam_id TEXT PRIMARY KEY,owner_token TEXT,operation TEXT);
    CREATE TABLE exam_channel_publications(id TEXT,exam_id TEXT,channel TEXT,status TEXT,published_by TEXT,published_at TEXT, UNIQUE(exam_id,channel));
    CREATE TABLE audit_logs(id TEXT,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);
    INSERT INTO exams VALUES('exam','CENTRAL',NULL,'DRAFT','OPTIONAL','verified',1,NULL);
    INSERT INTO exam_subjects VALUES('exam',2);
    INSERT INTO exam_questions VALUES('q1','exam','ACTIVE'),('q2','exam','ACTIVE');
    INSERT INTO exam_booklets VALUES('exam','A',1),('exam','B',1);
    INSERT INTO answer_keys VALUES('q1','A'),('q2','A'),('q1','B'),('q2','B');
    INSERT INTO scoring_rule_versions VALUES('verified','rule',1);
    INSERT INTO scoring_rules VALUES('rule','Test','CUSTOM');
  `);
  db.exec(readFileSync(new URL('../migrations/0059_exam_operation_write_guards.sql', import.meta.url), 'utf8'));
  db.exec(`ALTER TABLE exams ADD COLUMN publisher_name TEXT;ALTER TABLE exams ADD COLUMN exam_date TEXT;ALTER TABLE exams ADD COLUMN description TEXT;ALTER TABLE exams ADD COLUMN title TEXT;CREATE TABLE exam_revision_state(exam_id TEXT,revision INTEGER,app_trashed_at TEXT);INSERT INTO exam_revision_state VALUES('exam',1,NULL);CREATE TABLE channel_definition_publications(exam_id TEXT,channel TEXT,source_revision INTEGER,definition_json TEXT,published_by TEXT,status TEXT,published_at TEXT,UNIQUE(exam_id,channel));`);
  function prepare(sql: string, args: any[] = []): any {
    return {
      bind: (...values: any[]) => prepare(sql, values),
      first: async () => db.prepare(sql).get(...args),
      all: async () => ({results: db.prepare(sql).all(...args)}),
      run: async () => ({results: [], meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
    };
  }
  const env = {DB: {prepare, batch: async (statements: any[]) => {
    db.exec('BEGIN');
    try {const result = []; for (const statement of statements) result.push(await statement.run()); db.exec('COMMIT'); return result;}
    catch (error) {db.exec('ROLLBACK'); throw error;}
  }}} as any;
  const activate = (user = {id: 'admin', role: 'SUPER_ADMIN'} as any) => setStatus(new Request('https://demo.anunex.com/api/exam-definitions/exam/status', {method: 'PATCH', body: JSON.stringify({status: 'ACTIVE'})}), env, user, 'exam');
  return {db, env, activate};
}

describe('exam activation with actual relational evidence', () => {
  it('activates a central exam without an institution list (S027: open to every institution)', async () => {
    const f = fixture(); try {
      const ready = await examReadiness(f.env, 'exam');
      expect(ready.blockers).toEqual([]);
      expect(ready.ready_to_publish).toBe(true);
      expect((await f.activate()).status).toBe(200);
      expect((f.db.prepare('SELECT status FROM exams').get() as any).status).toBe('ACTIVE');
      expect((f.db.prepare('SELECT channel,status FROM exam_channel_publications').get() as any)).toMatchObject({channel:'LICENSED',status:'ACTIVE'});expect(f.db.prepare("SELECT * FROM exam_channel_publications WHERE channel='RESULT_NETWORK'").all()).toEqual([]);
      expect((f.db.prepare('SELECT action FROM audit_logs').get() as any).action).toBe('EXAM_STATUS_ACTIVE');
      expect(f.db.prepare('SELECT * FROM exam_operation_locks').all()).toEqual([]);
    } finally {f.db.close();}
  });
  it('rejects incomplete B answers even if stale inactive C answers previously made total count look complete', async () => {
    const f = fixture(); try {
      f.db.exec("INSERT INTO exam_institutions VALUES('exam','institution',1); DELETE FROM answer_keys WHERE exam_question_id='q2' AND booklet_code='B'; INSERT INTO exam_booklets VALUES('exam','C',0); INSERT INTO answer_keys VALUES('q2','C')");
      const ready = await examReadiness(f.env, 'exam');
      expect(ready.actual_answers).toBe(3);
      expect(ready.missing_answer_count).toBe(1);
      expect(ready.blockers.map((b: any) => b.code)).toEqual(['ANSWER_KEYS_INCOMPLETE']);
      expect((await f.activate()).status).toBe(409);
    } finally {f.db.close();}
  });
  it('keeps official outcome and scoring checks, allowing activation only after both are complete', async () => {
    const f = fixture(); try {
      f.db.exec("UPDATE exams SET owner_type='INSTITUTION',institution_id='institution',outcome_mode='OFFICIAL_REQUIRED'; UPDATE scoring_rule_versions SET verified=0; INSERT INTO question_outcomes VALUES('q1')");
      const ready = await examReadiness(f.env, 'exam');
      expect(ready.blockers.map((b: any) => b.code)).toEqual(['SCORING_VERIFICATION_REQUIRED','OUTCOMES_REQUIRED']);
      expect((await f.activate()).status).toBe(409);
      f.db.exec("UPDATE scoring_rule_versions SET verified=1; INSERT INTO question_outcomes VALUES('q2')");
      expect((await f.activate({id:'manager',role:'INSTITUTION_MANAGER',institution_id:'institution'})).status).toBe(200);
    } finally {f.db.close();}
  });
  it('does not expose or activate another institution exam', async () => {
    const f = fixture(); try {
      f.db.exec("UPDATE exams SET owner_type='INSTITUTION',institution_id='institution'");
      expect((await f.activate({id:'manager',role:'INSTITUTION_MANAGER',institution_id:'other'})).status).toBe(404);
      expect((f.db.prepare('SELECT status FROM exams').get() as any).status).toBe('DRAFT');
    } finally {f.db.close();}
  });
});
