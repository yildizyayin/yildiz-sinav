import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** A062: mini games — the student plays and earns activity; a client score or claimed outcome never becomes academic evidence. Synthetic data only. */
describe('A062 mini game learning record', () => {
  it('records only the student own play, ignores a claimed outcome and keeps game scores out of accuracy', async () => {
    const t = await evaluatedExam('direct');
    t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='GAMES';
      INSERT INTO educational_game_catalog(id,game_code,title,min_grade,max_grade,subject_code,game_type) VALUES('g8','TEST8','Sentetik oyun',8,8,'TR','QUIZ');`);
    const play = (as: string, body: any) => t.request('/api/platform/games?studentId=s1', 'POST', { gameCode: 'TEST8', durationSeconds: 40, ...body }, as);
    // a claimed outcome that exists and fits the grade would have made the frozen context "valid"
    const r = await play('stuuser', { score: 450, nodeId: 'ln_o_tur1', payload: { correct: 5, total: 5 } });
    expect(r.response.status, r.text).toBe(200);
    expect(r.data.score).toBe(100);
    const ev = t.db.prepare(`SELECT node_id,outcome_id,context_valid,score FROM frozen_game_session_evidence WHERE session_id=?`).get(r.data.id) as any;
    expect(ev).toMatchObject({ node_id: null, outcome_id: null, context_valid: 0, score: 100 });
    for (const who of ['parent', 'teacher', 'admin']) expect((await play(who, { score: 100 })).response.status, who).toBe(403);
    expect((t.db.prepare(`SELECT count(*) c FROM game_sessions WHERE student_id='s1'`).get() as any).c).toBe(1);
    const big = await play('stuuser', { score: 10, payload: { junk: 'x'.repeat(5000) } });
    expect(big.response.status).toBe(200);
    expect(t.db.prepare('SELECT payload_json p FROM game_sessions WHERE id=?').get(big.data.id)).toMatchObject({ p: '{}' });
    const { combineExpandedFrozenReports } = await import('../worker/lib/expanded-frozen-report');
    const merged = combineExpandedFrozenReports([], { groups: [{ subjectId: 'sub_tur', sessionCount: 2, averageScore: 55 }] });
    expect(merged.groups).toEqual([]); // game activity never becomes correct/wrong evidence
  });
});
