import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {OUTCOME_PICK_SQL} from '../worker/lib/question-autonomous-queue';

/**
 * 2026-10-21: production D1 hit the free-tier daily read limit. Every 15-minute tick the
 * scheduler's outcome pick scanned whole tables once per outcome. This test builds the real
 * schema from every migration and checks the queries the tick runs never full-scan the large
 * tables (jobs, links, questions).
 */
function schema(){const db=new DatabaseSync(':memory:');for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(`migrations/${f}`,'utf8'));return db;}

const BIG=/\bSCAN (j|l|q|question_generation_jobs|question_learning_links|question_bank)\b/;

it('the scheduler\'s outcome pick reads through indexes only (no full scan of jobs, links or questions)',()=>{
 const db=schema();try{
  const plan=(db.prepare('EXPLAIN QUERY PLAN '+OUTCOME_PICK_SQL).all('2027-2028') as any[]).map(r=>r.detail).join(' | ');
  expect(plan).not.toMatch(BIG);
  expect(plan).toContain('question_generation_jobs_outcome_status');
 }finally{db.close();}
});

it('the generator\'s sibling-question lookups use the link index',()=>{
 const db=schema();try{
  const plan=(db.prepare(`EXPLAIN QUERY PLAN SELECT q.id FROM question_bank q JOIN question_learning_links l ON l.question_id=q.id WHERE l.node_id=? AND q.academic_year=? AND q.grade_level=? AND q.subject_id=? AND q.owner_type='PLATFORM' AND q.origin_kind='AI_GENERATED'`).all(null,null,null,null) as any[]).map(r=>r.detail).join(' | ');
  expect(plan).not.toMatch(BIG);
 }finally{db.close();}
});
