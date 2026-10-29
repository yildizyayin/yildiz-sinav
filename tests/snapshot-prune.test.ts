import { describe, expect, it } from 'vitest';
import { pruneOldSnapshotVersions } from '../worker/lib/snapshot-prune';
import { evaluatedExam } from './helpers/exam-flow';

describe('S041 old snapshot versions are pruned safely', () => {
  it('removes only old, unreferenced, non-current versions', async () => {
    const { db, env, examId } = await evaluatedExam();
    const p: any = db.prepare('SELECT id,institution_id FROM exam_participants WHERE exam_id=? LIMIT 1').get(examId);
    expect(p).toBeTruthy();
    const add = (id: string, v: number, age: string) => db.prepare(`INSERT INTO exam_result_snapshots(id,exam_id,participant_id,snapshot_version,institution_id,net,created_at) VALUES(?,?,?,?,?,1,datetime('now',?))`).run(id, examId, p.id, v, p.institution_id, age);
    add('old-a', 1, '-10 days'); add('old-pub', 2, '-10 days'); add('old-current', 3, '-10 days'); add('recent', 4, '-1 days'); add('newest', 5, '-10 days');
    db.prepare(`INSERT INTO exam_result_scope_ranks(id,exam_id,participant_id,snapshot_version,scope_type,scope_id,rank,participant_count) VALUES('rk1',?,?,1,'NATIONAL','TR',1,1)`).run(examId, p.id);
    db.prepare(`INSERT INTO exam_administrations(id,exam_id,academic_year,channel,status,published_snapshot_version) VALUES('adm-prune',?,'2026-2027','RESULT_NETWORK','PUBLISHED',2)`).run(examId);
    db.prepare(`INSERT OR REPLACE INTO exam_delivery_profiles(exam_id,scope,snapshot_version) VALUES(?,'INSTITUTION',3)`).run(examId);
    const n = await pruneOldSnapshotVersions(env, 50);
    const left = (id: string) => !!db.prepare('SELECT 1 FROM exam_result_snapshots WHERE id=?').get(id);
    expect(n).toBe(1);
    expect(left('old-a')).toBe(false);
    expect(db.prepare('SELECT count(*) c FROM exam_result_scope_ranks WHERE snapshot_version=1').get()).toEqual({ c: 0 });
    for (const id of ['old-pub', 'old-current', 'recent', 'newest']) expect(left(id)).toBe(true);
  });
});
