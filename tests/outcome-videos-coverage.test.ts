import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import app from '../worker/preview-policy-production-entry';
import { createSession } from '../worker/lib/auth';

/** Kazanım videosu kapsamı (12 Nov 2026): per grade and subject, how many outcomes have a video of each kind. */
describe('outcome video coverage', () => {
  it('counts system, school and automatic videos per grade and subject for staff only', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    const o = t.db.prepare(`SELECT id,grade_level FROM outcomes WHERE code='M.8.1.1'`).get() as any;
    t.db.prepare(`INSERT INTO outcome_auto_videos(id,outcome_id,youtube_video_id,title,duration_seconds,start_seconds,end_seconds,method) VALUES('oc1',?,'AAAAAAAAAAA','x',600,10,200,'GEMINI')`).run(o.id);
    const call = async (who: string) => {
      const cookie = (await createSession(t.env, who, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
      return (app as any).fetch(new Request('https://app.anunex.com/api/outcome-videos/coverage', { headers: { Cookie: cookie, Origin: 'https://app.anunex.com' } }), t.env, { waitUntil() {}, passThroughOnException() {} });
    };
    const res = await call('teacher');
    expect(res.status).toBe(200);
    const rows = (await res.json() as any).rows;
    const row = rows.find((r: any) => r.grade === o.grade_level && r.auto === 1);
    expect(row).toBeTruthy();
    expect(row.total).toBeGreaterThanOrEqual(1);
    expect((await call('stuuser')).status).toBe(403);
  });
});
