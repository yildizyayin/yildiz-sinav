import { describe, expect, it } from 'vitest';
import { resolveScanRecord } from '../worker/index';

const user = { id: 'manager', role: 'INSTITUTION_MANAGER', institution_id: 'school' } as any;
function fixture({ status = 'NEW_GUEST', issues = ['Kitapçık: işaretlenmemiş; elle seçin.'], institution = 'school', complete = true, frozen=false } = {}) {
  const canonical = { name: 'Ada Test', answers_by_subject: { MAT: 'A' }, issues: [], row_no: 1 };
  const row: any = { match_status: status, match_confidence: 0, matched_student_id: null, resolution_status: 'PENDING', issues_json: JSON.stringify(issues), canonical_json: JSON.stringify(canonical) };
  const writes: any[] = [];
  const env = { DB: { batch:async(stmts:any[])=>{const result=[];for(const s of stmts)result.push(await s.run());return result;},prepare: (sql: string) => ({ bind: (...args: any[]) => ({
    first: async () => sql.includes('FROM scan_batches') ? { id: 'batch', institution_id: institution, season_id: 'season', exam_id: 'exam', status: 'NEEDS_REVIEW' }
      : sql.includes('SELECT result_freeze_status') ? {result_freeze_status:frozen?'PUBLISHED':'OPEN'}
      : sql.includes('FROM scan_records WHERE id') ? row
      : sql.includes('FROM student_entities') ? { id: 'student', status: 'ACTIVE' }
      : sql.includes('count(*)') ? { c: ['NEW_GUEST','AMBIGUOUS','INVALID'].includes(row.match_status) || row.issues_json !== '[]' ? 1 : 0 } : null,
    all: async () => ({ results: sql.includes('FROM exam_booklets') ? [{ code: 'A' }, { code: 'B' }]
      : sql.includes('FROM exam_subjects') ? [{ subject_id: 'math', code: 'MAT', question_count: 1, wrong_divisor: 4 }]
      : sql.includes('FROM exam_questions') && complete ? [{ subject_id: 'math', booklet_code: 'A', question_no: 1, correct_answer: 'A' }] : [] }),
    run: async () => { if(sql.includes('exam_operation_locks')||sql.includes('exam_operation_write_guards'))return {meta:{changes:1}};writes.push({ sql, args }); if (sql.includes('UPDATE scan_records SET matched_student_id')) Object.assign(row, { matched_student_id: args[0], match_status: args[1], match_confidence: args[2], resolution_status: args[3], issues_json: args[4], canonical_json: args[5] }); return { success: true }; },
  }) }) } } as any;
  const decide = (body: any) => resolveScanRecord(new Request('https://app.anunex.com/api/resolve', { method: 'POST', body: JSON.stringify(body) }), env, user, 'batch', 'record');
  return { decide, row, writes };
}
describe('scan identity and booklet decisions', () => {
  it('blocks source changes while the publication is frozen',async()=>{const f=fixture({frozen:true});expect((await f.decide({action:'BOOKLET',bookletCode:'A'})).status).toBe(400);expect(f.writes).toEqual([])});
  it('keeps booklet review pending after a manual student match', async () => {
    const f = fixture(); expect((await f.decide({ action: 'MATCH', studentId: 'student' })).status).toBe(200);
    expect(f.row.match_status).toBe('ACTIVE_MATCH'); expect(f.row.resolution_status).toBe('PENDING'); expect(JSON.parse(f.row.issues_json)).toHaveLength(1);
    expect(f.writes.find(w => w.sql.includes('UPDATE scan_batches'))?.args[0]).toBe('NEEDS_REVIEW');
  });
  it('requires identity resolution even after selecting a booklet', async () => {
    const f = fixture(); expect((await f.decide({ action: 'BOOKLET', bookletCode: 'A' })).status).toBe(200);
    expect(JSON.parse(f.row.canonical_json).booklet).toBe('A'); expect(f.row.resolution_status).toBe('PENDING');
  });
  it('becomes ready only after both decisions and records an audit', async () => {
    const f = fixture(); await f.decide({ action: 'MATCH', studentId: 'student' }); await f.decide({ action: 'BOOKLET', bookletCode: 'A' });
    expect(f.row.resolution_status).toBe('RESOLVED'); expect(f.row.issues_json).toBe('[]');
    expect(f.writes.filter(w => w.sql.includes('UPDATE scan_batches')).at(-1)?.args[0]).toBe('READY');
    expect(f.writes.filter(w => w.sql.includes('INSERT INTO audit_logs'))).toHaveLength(2);
  });
  it('rejects cross-institution access without writing', async () => {
    const f = fixture({ institution: 'other-school' }); expect((await f.decide({ action: 'BOOKLET', bookletCode: 'A' })).status).toBe(403); expect(f.writes).toEqual([]);
  });
  it('rejects invalid codes and incomplete answer keys without writing', async () => {
    const f = fixture({ complete: false }); expect((await f.decide({ action: 'BOOKLET', bookletCode: 'X' })).status).toBe(400); expect((await f.decide({ action: 'BOOKLET', bookletCode: 'A' })).status).toBe(400); expect(f.writes).toEqual([]);
  });
});
