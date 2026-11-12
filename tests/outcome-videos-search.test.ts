import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { cleanTitle, findOutcomeVideo, runOutcomeVideoQueue, searchQueries } from '../worker/lib/outcome-videos';

/** Kazanım videosu tuning (12 Nov 2026): clean MEB wording, a broader second search, useful miss notes, priority order. */
afterEach(() => vi.unstubAllGlobals());

describe('outcome video search', () => {
  it('drops the unit heading, honorifics and the -ebilme ending, and has a broader second query', () => {
    expect(cleanTitle('Allah’ın (cc) birliğini ve yüceliğini kavrayabilme')).toBe('Allah ın birliğini ve yüceliğini');
    const q = searchQueries({ grade_level: 4, subject_name: 'Din Kültürü', topic: '2. Ünite: Allah Sevgisi', title: 'Dua etme ihtiyacı hakkında düşünebilme' });
    expect(q).toEqual(['4. sınıf Din Kültürü Dua etme ihtiyacı hakkında konu anlatımı', '4. sınıf Din Kültürü Allah Sevgisi']);
  });

  it('tries the broader query when the first finds nothing and notes why a search missed', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    const o = t.db.prepare(`SELECT id FROM outcomes WHERE code='M.8.1.1'`).get() as any;
    Object.assign(t.env, { YOUTUBE_API_KEY: 'synthetic' });
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: any) => {
      const url = String(u); urls.push(url);
      if (url.includes('/search')) return new Response(JSON.stringify({ items: urls.filter((x) => x.includes('/search')).length === 1 ? [] : [{ id: { videoId: 'AAAAAAAAAAA' } }] }));
      return new Response(JSON.stringify({ items: [{ id: 'AAAAAAAAAAA', snippet: { title: 'x', description: '', liveBroadcastContent: 'none' }, contentDetails: { duration: 'PT20S' }, statistics: {}, status: { privacyStatus: 'public', embeddable: true, uploadStatus: 'processed' } }] }));
    }));
    const r = await findOutcomeVideo(t.env, o.id);
    expect(urls.filter((x) => x.includes('/search'))).toHaveLength(2);
    expect(r).toMatchObject({ status: 'NOT_FOUND', reason: 'NO_SAFE_CANDIDATE' });
    expect(r.detail).toContain('1 sonuç, 1 güvenli, 0 uygun süreli');
  });

  it('searches outcomes that have questions before the others', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    Object.assign(t.env, { YOUTUBE_API_KEY: 'synthetic' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }))));
    await runOutcomeVideoQueue(t.env);
    const first = t.db.prepare(`SELECT q.outcome_id,q.last_reason FROM outcome_video_queue q`).get() as any;
    expect(t.db.prepare(`SELECT count(*) n FROM question_outcomes WHERE outcome_id=?`).get(first.outcome_id)).not.toEqual({ n: 0 });
    expect(first.last_reason).toMatch(/^NO_CANDIDATE · "/);
  });
});
