import { describe, expect, it, vi } from 'vitest';
import chunkedApp from '../worker/chunked-evaluation-entry';
vi.mock('../worker/lib/auth', async (original) => ({ ...await original<any>(), getAuthUser: vi.fn(async () => user) }));
import { evaluateBatch } from '../worker/index';
vi.mock('../worker/lib/assessment-ledger', () => ({ recordExamAssessments: vi.fn(async () => 0), recordExamEvidenceAudit: vi.fn(async () => {}) }));
const user = { id: 'manager', role: 'INSTITUTION_MANAGER', institution_id: 'school' } as any;
function fixture(incomplete = false, optional = false, optionalKeyCount = 5, freezeStatus = 'OPEN', busy=false, networkPublished=false) {
  let locked=false;
  const writes: { sql: string; args: any[] }[] = [];
  const keys = [
    { question_id: 'q1', subject_id: 'math', question_no: 1, printed_question_no: 2, booklet_code: 'B', correct_answer: 'A', question_status: 'EXCLUDED' },
    { question_id: 'q2', subject_id: 'math', question_no: 2, printed_question_no: 1, booklet_code: 'B', correct_answer: 'B', accepted_answers: '["B","C"]' },
    { question_id: 'q3', subject_id: 'math', question_no: 3, printed_question_no: 3, booklet_code: 'B', correct_answer: 'A' },
  ];
  const optionalKeys = Array.from({ length: optionalKeyCount }, (_, i) => ({ id: `opt${i}`, subject_id: 'fel', question_no: i + 1, booklet_code: 'B', correct_answer: 'A' }));
  const env = { DB: { batch: async (statements: any[]) => { const results=[];for (const statement of statements) results.push(await statement.run());return results; }, prepare: (sql: string) => ({ bind: (...args: any[]) => ({
    first: async () => sql.includes('FROM scan_batches') ? { id: 'batch', exam_id: 'exam', institution_id: 'school', season_id: 'season', status: 'READY' }
      : sql.includes('SELECT id FROM exam_administrations') ? (networkPublished ? {id:'publication'} : null)
      : sql.includes('SELECT result_freeze_status') ? { result_freeze_status: freezeStatus }
      : sql.includes('count(*)') ? { c: 0 }
      : sql.includes('FROM exams e LEFT JOIN scoring_rule_versions') ? { id: 'exam', scoring_version_id: 'score', verified: 1 } : null,
    all: async () => ({ results: sql.includes('FROM exam_optional_answer_keys') ? (optional ? optionalKeys : [])
      : sql.includes('SELECT ep.id participant_id') ? [{ participant_id: 'participant', booklet_code: 'B', canonical_json: JSON.stringify({ booklet: 'B', answers_by_subject: { TYT_FEL: 'AB___' } }) }]
      : sql.includes('FROM exam_subjects') ? [{ subject_id: 'math', code: 'MAT', question_count: 3, wrong_divisor: 4 }]
      : sql.includes('FROM exam_booklets') ? [{ code: 'B' }]
      : sql.includes('FROM exam_questions q JOIN subjects') ? (incomplete ? keys.slice(0, 2) : keys)
      : sql.includes('SELECT * FROM scan_records') ? [{ id: 'scan', row_no: 1, matched_student_id: 'student', match_status: 'ACTIVE_MATCH', canonical_json: JSON.stringify({ name: 'Ada Test', booklet: 'B', answers_by_subject: { MAT: 'C_D' }, confidence: 1 }) }] : [] }),
    run: async () => { if(sql.includes('exam_operation_write_guards'))return {meta:{changes:1}};if(sql.includes('INSERT INTO exam_operation_locks')){if(busy)return {meta:{changes:0}};locked=true;return {meta:{changes:1}}}if(sql.includes('DELETE FROM exam_operation_locks')){locked=false;return {meta:{changes:1}}}if(sql.includes('tyt_optional_philosophy')&&!locked)throw new Error('OPTIONAL_OUTSIDE_LOCK');writes.push({ sql, args }); return { success: true }; },
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
    const answers = f.writes.filter(w => w.sql.includes('INSERT INTO student_answers'));
    expect(answers.map(w => [w.args[2], w.args[3], w.args[4]])).toEqual([['q2', 'C', 'CORRECT'], ['q1', null, 'INVALID'], ['q3', 'D', 'WRONG']]);
    const result = f.writes.find(w => w.sql.includes('INSERT INTO subject_results'))!;
    expect(result.args.slice(3)).toEqual([1, 1, 0, 0.75, 37.5]);
  });
  it('persists optional philosophy separately without changing scored results', async () => {
    const f = fixture(false, true); expect((await f.evaluate()).status).toBe(200);
    const optional = f.writes.find(w => w.sql.includes('INSERT INTO tyt_optional_philosophy_results'))!;
    expect(optional.args.slice(5)).toEqual([1, 1, 3, 0, 5, 20]);expect(f.isLocked()).toBe(false);
    expect(f.writes.filter(w => w.sql.includes('INSERT INTO tyt_optional_philosophy_answers'))).toHaveLength(5);
    const main = f.writes.find(w => w.sql.includes('INSERT INTO exam_results'))!;
    expect(main.args.slice(3, 7)).toEqual([1, 1, 0, 0.75]);
  });
  it('reports optional evidence failure without clearing prior evidence or committing the batch', async () => {
    const f = fixture(false, true, 4); const response = await f.evaluate();
    expect(response.status).toBe(500);
    expect((await response.json() as any).error.code).toBe('TYT_OPTIONAL_EVIDENCE_FAILED');
    expect(f.writes.filter(w => w.sql.includes('tyt_optional_philosophy'))).toEqual([]);
    expect(f.writes.some(w => w.sql.includes("status='COMMITTED'"))).toBe(false);
  });
  it('blocks evaluating a frozen Result Network publication even with an open platform profile',async()=>{const f=fixture(false,false,5,'OPEN',false,true);expect((await f.evaluate()).status).toBe(400);expect(f.writes).toEqual([]);});
  it('rejects an incomplete answer key before any write', async () => {
    const f = fixture(true); const response = await f.evaluate(); expect(response.status).toBe(400);
    expect((await response.json() as any).error.code).toBe('ANSWER_KEY_INCOMPLETE'); expect(f.writes).toEqual([]);
  });
});
