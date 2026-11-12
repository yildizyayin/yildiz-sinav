import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import app from '../worker/preview-policy-production-entry';
import { createSession } from '../worker/lib/auth';
import { acceptGemini, findOutcomeVideo, matchChapter, parseChapters, runOutcomeVideoQueue, SEARCH_CAP, stems, timeToSeconds } from '../worker/lib/outcome-videos';

/**
 * Kazanım videosu (owner, 12 Nov 2026): system video → the school's link → an automatic YouTube segment, shown without
 * approval but only as the real part of the outcome; removed by a teacher or by three students. Synthetic data only;
 * YouTube and Gemini are stubbed.
 */
afterEach(() => vi.unstubAllGlobals());

async function as(t: any, userId: string, path: string, method = 'GET', body?: any) {
  const cookie = (await createSession(t.env, userId, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookie, Origin: 'https://app.anunex.com', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }), t.env, { waitUntil() {}, passThroughOnException() {} });
  const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
  return { response: res, data, text };
}

const DESC = `Bu videoda:\n00:00 Giriş\n02:10 Üslü ifadelerde çarpma\n05:40 Üslü ifadelerde bölme\n09:00 Soru çözümü`;
function stubProviders(opts: { description?: string; gemini?: any; title?: string; duration?: string } = {}) {
  const calls: { url: string; body?: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (u: any, init?: any) => {
    const url = String(u); calls.push({ url, body: init?.body });
    if (url.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(opts.gemini) }] } }] }), { headers: { 'content-type': 'application/json' } });
    const body = url.includes('/search') ? { items: [{ id: { videoId: 'AAAAAAAAAAA' } }, { id: { videoId: 'BBBBBBBBBBB' } }] }
      : { items: ['AAAAAAAAAAA', 'BBBBBBBBBBB'].map((id) => ({ id, snippet: { title: opts.title ?? 'Üslü ifadeler konu anlatımı', description: id === 'AAAAAAAAAAA' ? (opts.description ?? DESC) : '', channelTitle: 'Kanal', liveBroadcastContent: 'none' }, contentDetails: { duration: opts.duration ?? 'PT12M' }, statistics: { viewCount: '5000' }, status: { privacyStatus: 'public', embeddable: true, uploadStatus: 'processed' } })) };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }));
  return calls;
}

async function base() {
  const t = await evaluatedExam('direct', { outcomes: true });
  const o = t.db.prepare(`SELECT id FROM outcomes WHERE code='M.8.1.1'`).get() as any;
  t.db.prepare(`UPDATE outcomes SET title='Üslü ifadelerle çarpma işlemi yapar',topic='Üslü İfadeler' WHERE id=?`).run(o.id);
  return { t, o };
}

describe('outcome video matching', () => {
  it('reads chapters, matches the outcome and accepts only a sane Gemini answer', () => {
    const ch = parseChapters(DESC, 720);
    expect(ch.map((c) => [c.start, c.end])).toEqual([[0, 130], [130, 340], [340, 540], [540, 720]]);
    expect(matchChapter(ch, stems('Üslü ifadeler çarpma işlemi'))).toMatchObject({ start: 130, end: 340 });
    expect(matchChapter(ch, stems('Kesirlerle toplama'))).toBeNull();
    expect(timeToSeconds('1:02:03')).toBe(3723); expect(timeToSeconds('abc')).toBeNull();
    expect(acceptGemini({ covers: true, suitable: true, confidence: 0.8, start: '02:00', end: '06:00' }, 720)).toEqual({ start: 120, end: 360, confidence: 0.8 });
    expect(acceptGemini({ covers: true, suitable: false, confidence: 0.9, start: '02:00', end: '06:00' }, 720)).toBeNull();
    expect(acceptGemini({ covers: true, suitable: true, confidence: 0.4, start: '02:00', end: '06:00' }, 720)).toBeNull();
    expect(acceptGemini({ covers: true, suitable: true, confidence: 0.9, start: '02:00', end: '02:10' }, 720)).toBeNull();
    expect(acceptGemini({ covers: true, suitable: true, confidence: 0.9, start: '02:00', end: '30:00' }, 720)).toBeNull();
  });

  it('without Gemini uses the video’s own chapter; with Gemini uses its segment and sends only the link and the outcome', async () => {
    const { t, o } = await base();
    Object.assign(t.env, { YOUTUBE_API_KEY: 'synthetic' });
    stubProviders();
    expect(await findOutcomeVideo(t.env, o.id)).toMatchObject({ status: 'FOUND', reason: 'CHAPTER' });
    expect(t.db.prepare(`SELECT youtube_video_id,start_seconds,end_seconds,method FROM outcome_auto_videos WHERE outcome_id=?`).get(o.id)).toEqual({ youtube_video_id: 'AAAAAAAAAAA', start_seconds: 130, end_seconds: 340, method: 'CHAPTER' });

    t.db.exec(`DELETE FROM outcome_auto_videos`);
    Object.assign(t.env, { GEMINI_API_KEY: 'synthetic' });
    const calls = stubProviders({ gemini: { covers: true, suitable: true, confidence: 0.9, start: '2:15', end: '5:30' } });
    expect(await findOutcomeVideo(t.env, o.id)).toMatchObject({ status: 'FOUND', reason: 'GEMINI' });
    expect(t.db.prepare(`SELECT start_seconds,end_seconds,method FROM outcome_auto_videos WHERE outcome_id=?`).get(o.id)).toEqual({ start_seconds: 135, end_seconds: 330, method: 'GEMINI' });
    const g = calls.find((c) => c.url.includes('generativelanguage'))!;
    expect(g.body).toContain('https://www.youtube.com/watch?v=AAAAAAAAAAA');
    expect(g.body).toContain('Üslü ifadelerle çarpma işlemi yapar');
    expect(g.body).not.toMatch(/ALI|s1|stuuser|school/);
    expect(calls.find((c) => c.url.includes('/search'))!.url).toContain('safeSearch=strict');
  });

  it('shows nothing when no real segment is found, never a whole unrelated video, and respects the daily quota', async () => {
    const { t, o } = await base();
    Object.assign(t.env, { YOUTUBE_API_KEY: 'synthetic', GEMINI_API_KEY: 'synthetic' });
    stubProviders({ description: '', title: 'Matematik genel tekrar', gemini: { covers: false, suitable: true, confidence: 0.9, start: '0:00', end: '5:00' } });
    expect(await findOutcomeVideo(t.env, o.id)).toMatchObject({ status: 'NOT_FOUND', reason: 'NO_SEGMENT' });
    expect(t.db.prepare(`SELECT count(*) n FROM outcome_auto_videos`).get()).toEqual({ n: 0 });
    t.db.prepare(`INSERT INTO outcome_video_usage(day,searches) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET searches=excluded.searches`).run(new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10), SEARCH_CAP);
    t.db.prepare(`INSERT INTO outcome_video_queue(outcome_id,priority) VALUES(?,10)`).run(o.id);
    const calls = stubProviders();
    expect(await runOutcomeVideoQueue(t.env)).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe('outcome video for learners and teachers', () => {
  it('serves the school’s link first, then the automatic segment, and lets a teacher replace it', async () => {
    const { t, o } = await base();
    expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
    expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
    const q = t.db.prepare(`SELECT sa.exam_question_id q FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id JOIN question_outcomes qo ON qo.exam_question_id=sa.exam_question_id WHERE ep.student_id='s1' AND qo.outcome_id=? LIMIT 1`).get(o.id) as any;
    const support = () => t.request(`/api/student-standard/question-support?examQuestionId=${q.q}`, 'GET', undefined, 'stuuser');

    t.db.prepare(`INSERT INTO outcome_auto_videos(id,outcome_id,youtube_video_id,title,duration_seconds,start_seconds,end_seconds,method) VALUES('oav1',?,'AAAAAAAAAAA','Üslü ifadeler',720,130,340,'CHAPTER')`).run(o.id);
    let r = await support();
    expect(r.response.status, r.text).toBe(200);
    expect(r.data.options.topicVideo).toMatchObject({ source: 'AUTO_SEGMENT', url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA&t=130s', start: 130, end: 340 });

    const add = await as(t, 'teacher', '/api/outcome-videos/teacher', 'POST', { outcomeId: o.id, url: 'https://youtu.be/CCCCCCCCCCC', title: 'Okulumuzun videosu', start: '1:00', end: '4:00' });
    expect(add.response.status, add.text).toBe(201);
    r = await support();
    expect(r.data.options.topicVideo).toMatchObject({ source: 'TEACHER', url: 'https://youtu.be/CCCCCCCCCCC', start: 60, end: 240 });

    const list = await as(t, 'teacher', `/api/outcome-videos?q=M.8.1.1`);
    expect(list.response.status, list.text).toBe(200);
    expect(list.data.outcomes[0]).toMatchObject({ teacher: { title: 'Okulumuzun videosu' }, auto: { id: 'oav1', method: 'CHAPTER' } });
    expect((await as(t, 'teacher', '/api/outcome-videos/auto/oav1/remove', 'POST', {})).response.status).toBe(200);
    expect(t.db.prepare(`SELECT status FROM outcome_auto_videos WHERE id='oav1'`).get()).toEqual({ status: 'REMOVED' });
    expect(t.db.prepare(`SELECT count(*) n FROM outcome_video_blocks WHERE outcome_id=? AND youtube_video_id='AAAAAAAAAAA'`).get(o.id)).toEqual({ n: 1 });
    expect(t.db.prepare(`SELECT status,priority FROM outcome_video_queue WHERE outcome_id=?`).get(o.id)).toEqual({ status: 'WAITING', priority: 20 });
    // the removed video is never chosen again for the outcome
    Object.assign(t.env, { YOUTUBE_API_KEY: 'synthetic' });
    stubProviders({ description: DESC });
    await findOutcomeVideo(t.env, o.id);
    expect(t.db.prepare(`SELECT youtube_video_id FROM outcome_auto_videos WHERE status='ACTIVE'`).all()).not.toContainEqual({ youtube_video_id: 'AAAAAAAAAAA' });
    expect((await as(t, 'stuuser', '/api/outcome-videos')).response.status).toBe(403);
  });

  it('removes an automatic video after three different students say it is off topic', async () => {
    const { t, o } = await base();
    t.db.prepare(`INSERT INTO outcome_auto_videos(id,outcome_id,youtube_video_id,title,duration_seconds,start_seconds,end_seconds,method) VALUES('oav2',?,'AAAAAAAAAAA','x',720,0,300,'GEMINI')`).run(o.id);
    t.db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('st2','STUDENT','Öğrenci 2','x','x',1,'school'),('st3','STUDENT','Öğrenci 3','x','x',1,'school')`);
    expect((await as(t, 'teacher', '/api/outcome-videos/auto/oav2/report', 'POST', {})).response.status).toBe(403);
    expect((await as(t, 'stuuser', '/api/outcome-videos/auto/oav2/report', 'POST', {})).data.removed).toBe(false);
    expect((await as(t, 'stuuser', '/api/outcome-videos/auto/oav2/report', 'POST', {})).data.removed).toBe(false); // the same student counts once
    expect((await as(t, 'st2', '/api/outcome-videos/auto/oav2/report', 'POST', {})).data.removed).toBe(false);
    expect((await as(t, 'st3', '/api/outcome-videos/auto/oav2/report', 'POST', {})).data.removed).toBe(true);
    expect(t.db.prepare(`SELECT status,removed_reason FROM outcome_auto_videos WHERE id='oav2'`).get()).toEqual({ status: 'REMOVED', removed_reason: 'STUDENT_REPORTS' });
  });
  it('puts the automatic segment into the Nibiru outcome loop, and swaps it out when it is removed before watching', async () => {
    const { t, o } = await base();
    expect((await t.request(`${t.base}/release`, 'POST', {})).response.status).toBe(200);
    const blank = t.db.prepare(`SELECT sa.exam_question_id id FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id JOIN question_outcomes qo ON qo.exam_question_id=sa.exam_question_id WHERE ep.student_id='s1' AND sa.status IN ('BLANK','WRONG') AND qo.outcome_id=? LIMIT 1`).get(o.id) as any;
    t.db.prepare(`INSERT INTO outcome_auto_videos(id,outcome_id,youtube_video_id,title,duration_seconds,start_seconds,end_seconds,method) VALUES('oav3',?,'AAAAAAAAAAA','Üslü ifadeler',720,130,340,'GEMINI')`).run(o.id);
    const started = await t.request('/api/nibiru/coach/loops', 'POST', { examQuestionId: blank.id }, 'stuuser');
    expect(started.response.status, started.text).toBe(201);
    expect(started.data).toMatchObject({ step: 'VIDEO', video: { source: 'AUTO', start: 130, end: 340, autoId: 'oav3', provider: 'YOUTUBE' }, videoMissing: false });
    expect((await as(t, 'teacher', '/api/outcome-videos/auto/oav3/remove', 'POST', {})).response.status).toBe(200);
    const after = await t.request(`/api/nibiru/coach/loops/${started.data.loop.id}`, 'GET', undefined, 'stuuser');
    expect(after.data).toMatchObject({ step: 'MINI_TEST', video: null, videoMissing: true });
  });
});
