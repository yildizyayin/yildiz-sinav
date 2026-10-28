import { describe, expect, it, vi } from 'vitest';
import chunkedApp from '../worker/chunked-evaluation-entry';
vi.mock('../worker/lib/auth', async (original) => ({ ...await original<any>(), getAuthUser: vi.fn(async () => user) }));
import { evaluateBatch } from '../worker/index';
vi.mock('../worker/lib/assessment-ledger', () => ({ recordExamAssessments: vi.fn(async () => 0), recordExamEvidenceAudit: vi.fn(async () => {}) }));
const user = { id: 'manager', role: 'INSTITUTION_MANAGER', institution_id: 'school' } as any;
function fixture(incomplete = false, optional = false, optionalKeyCount = 5, freezeStatus = 'OPEN', busy=false, networkPublished=false, batchStatus='READY') {
  let locked=false, progressed=false;
  const writes: { sql: string; args: any[] }[] = [];
  const keys = [
    { question_id: 'q1', subject_id: 'math', question_no: 1, printed_question_no: 2, booklet_code: 'B', correct_answer: 'A', question_status: 'EXCLUDED' },
    { question_id: 'q2', subject_id: 'math', question_no: 2, printed_question_no: 1, booklet_code: 'B', correct_answer: 'B', accepted_answers: '["B","C"]' },
    { question_id: 'q3', subject_id: 'math', question_no: 3, printed_question_no: 3, booklet_code: 'B', correct_answer: 'A' },
  ];
  const scanRow = { id: 'scan', row_no: 1, matched_student_id: 'student', match_status: 'ACTIVE_MATCH', resolution_status: 'RESOLVED', canonical_json: JSON.stringify({ name: 'Ada Test', booklet: 'B', answers_by_subject: { MAT: 'C_D' }, confidence: 1 }) };
  const optionalKeys = Array.from({ length: optionalKeyCount }, (_, i) => ({ id: `opt${i}`, subject_id: 'fel', question_no: i + 1, booklet_code: 'B', correct_answer: 'A' }));
  const env = { DB: { batch: async (statements: any[]) => { const results=[];for (const statement of statements) results.push(await statement.run());return results; }, prepare: (sql: string) => ({ bind: (...args: any[]) => ({
    first: async () => sql.includes('FROM scan_batches') ? { id: 'batch', exam_id: 'exam', institution_id: 'school', season_id: 'season', status: batchStatus }
      : sql.includes('SELECT id FROM exam_administrations') ? (networkPublished ? {id:'publication'} : null)
      : sql.includes('SELECT result_freeze_status') ? { result_freeze_status: freezeStatus }
      : sql.includes('count(*)') && sql.includes('scan_evaluation_progress') ? { c: progressed ? 1 : 0 }
      : sql.includes('count(*)') && sql.includes("resolution_status!='CANCELLED'") && !sql.includes('match_status IN') ? { c: 1 }
      : sql.includes('count(*)') ? { c: 0 }
      : sql.includes('FROM exams e LEFT JOIN scoring_rule_versions') ? { id: 'exam', status: 'ACTIVE', owner_type: 'INSTITUTION', institution_id: 'school', scoring_version_id: 'score', verified: 1 } : null,
    all: async () => ({ results: sql.includes('FROM exam_optional_answer_keys') ? (optional ? optionalKeys : [])
      : sql.includes('SELECT ep.id participant_id') ? [{ participant_id: 'participant', booklet_code: 'B', canonical_json: JSON.stringify({ booklet: 'B', answers_by_subject: { TYT_FEL: 'AB___' } }) }]
      : sql.includes('FROM exam_subjects') ? [{ subject_id: 'math', code: 'MAT', question_count: 3, wrong_divisor: 4 }]
      : sql.includes('FROM exam_booklets') ? [{ code: 'B' }]
      : /FROM exam_questions q\s+JOIN subjects/.test(sql) ? (incomplete ? keys.slice(0, 2) : keys)
      : sql.includes('LEFT JOIN scan_evaluation_progress') ? (progressed ? [] : [scanRow])
      : sql.includes('SELECT id,row_no,matched_student_id') ? [scanRow]
      : sql.includes('SELECT * FROM scan_records') ? [scanRow] : [] }),
    run: async () => { if(sql.includes('exam_operation_write_guards'))return {meta:{changes:1}};if(sql.includes('INSERT INTO exam_operation_locks')){if(busy)return {meta:{changes:0}};locked=true;return {meta:{changes:1}}}if(sql.includes('DELETE FROM exam_operation_locks')){locked=false;return {meta:{changes:1}}}if(sql.includes('tyt_optional_philosophy')&&!locked)throw new Error('OPTIONAL_OUTSIDE_LOCK');if(sql.includes('INTO scan_evaluation_progress'))progressed=true;writes.push({ sql, args }); return { success: true }; },
  }) }) } } as any;
  return { env, writes, isLocked:()=>locked, evaluate: () => evaluateBatch(env, user, 'batch') };
}
describe('Result Network evaluation native semantics', () => {
  it('rejects a held exam lock in both evaluation paths before writes',async()=>{
    for(const mode of ['direct','chunked']){const f=fixture(false,false,5,'OPEN',true);const response=mode==='direct'?await f.evaluate():await chunkedApp.fetch(new Request('https://test/api/scan-batches/batch/evaluate',{method:'POST'}),f.env);expect(response.status).toBe(409);expect(f.writes).toEqual([])}
  });
  it.each(['FROZEN', 'PUBLISHED'])('blocks %s results in both evaluation paths before writes', async (status) => {
    for (const mode of ['direct', 'chunked']) {
      const f = fixture(false, false, 5, status);
      const response = mode === 'direct' ? await f.evaluate() : await chunkedApp.fetch(new Request('https://test/api/scan-batches/batch/evaluate', { method: 'POST' }), f.env);
      expect(response.status).toBe(400);
      expect((await response.json() as any).error.code).toBe('RESULTS_FROZEN');
      expect(f.writes).toEqual([]);
    }
  });
  it('uses printed order, accepted answers and exclusion when writing results', async () => {
    const f = fixture(); expect((await f.evaluate()).status).toBe(200);
    // S035: rows travel as one JSON array per statement
    const rows = (table: string) => f.writes.filter(w => w.sql.includes(`INSERT INTO ${table}`)).flatMap(w => JSON.parse(w.args[0]));
    expect(rows('student_answers').map((r: any[]) => [r[2], r[3], r[4]])).toEqual([['q2', 'C', 'CORRECT'], ['q1', null, 'INVALID'], ['q3', 'D', 'WRONG']]);
    expect(rows('subject_results')[0].slice(3)).toEqual([1, 1, 0, 0.75, 37.5]);
  });
  it('persists optional philosophy separately without changing scored results', async () => {
    const f = fixture(false, true); expect((await f.evaluate()).status).toBe(200);
    const optional = f.writes.find(w => w.sql.includes('INSERT INTO tyt_optional_philosophy_results'))!;
    expect(optional.args.slice(5)).toEqual([1, 1, 3, 0, 5, 20]);expect(f.isLocked()).toBe(false);
    expect(f.writes.filter(w => w.sql.includes('INSERT INTO tyt_optional_philosophy_answers'))).toHaveLength(5);
    const main = JSON.parse(f.writes.find(w => w.sql.includes('INSERT INTO exam_results'))!.args[0])[0];
    expect(main.slice(3, 7)).toEqual([1, 1, 0, 0.75]);
  });
  it('reports optional evidence failure without clearing prior evidence or committing the batch', async () => {
    const f = fixture(false, true, 4); const response = await f.evaluate();
    expect(response.status).toBe(500);
    expect((await response.json() as any).error.code).toBe('TYT_OPTIONAL_EVIDENCE_FAILED');
    expect(f.writes.filter(w => w.sql.includes('tyt_optional_philosophy'))).toEqual([]);
    // S035: the batch may be marked committed before the optional evidence runs; on failure it is put back to READY
    expect(f.writes.filter(w => /UPDATE scan_batches SET status=/.test(w.sql)).pop()?.sql).toContain("status='READY'");
  });
  // D-S037 (owner, 28 Oct): a published Result Network exam keeps taking new uploads (live ranks); an upload already in it is not re-evaluated.
  it('blocks re-evaluating an upload of a published Result Network exam even with an open platform profile',async()=>{const f=fixture(false,false,5,'OPEN',false,true,'COMMITTED');const r=await f.evaluate();expect(r.status).toBe(400);expect((await r.json() as any).error.code).toBe('RESULTS_FROZEN');expect(f.writes).toEqual([]);});
  it('lets a new upload of a published Result Network exam be evaluated',async()=>{const f=fixture(false,false,5,'OPEN',false,true);const r=await f.evaluate();expect((await r.clone().json() as any).error?.code).not.toBe('RESULTS_FROZEN');});
  it('rejects an incomplete answer key before any write', async () => {
    const f = fixture(true); const response = await f.evaluate(); expect(response.status).toBe(400);
    expect((await response.json() as any).error.code).toBe('ANSWER_KEY_INCOMPLETE'); expect(f.writes).toEqual([]);
  });
});
