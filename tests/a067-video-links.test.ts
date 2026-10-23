import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** A067: learners open only person-approved, published, working videos; automatic candidates wait for review; unpublished results stay closed. Synthetic data only. */
afterEach(() => vi.unstubAllGlobals());

describe('A067 video links', () => {
  it('serves only approved, published and unbroken videos, never an unreviewed YouTube candidate, and only after results are published', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    const q = t.db.prepare(`SELECT sa.exam_question_id q FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id WHERE ep.student_id='s1' AND ep.exam_id=? LIMIT 1`).get(t.examId) as any;
    const support = () => t.request(`/api/student-standard/question-support?examQuestionId=${q.q}`, 'GET', undefined, 'stuuser');
    expect((await support()).response.status).toBe(404); // results not published: nothing about the question or the answer
    expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
    expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);

    // an automatic YouTube candidate is found but not shown
    const yt = (u: string) => u.includes('/search') ? { items: [{ id: { videoId: 'AAAAAAAAAAA' } }, { id: { videoId: 'BBBBBBBBBBB' } }] } : { items: ['AAAAAAAAAAA', 'BBBBBBBBBBB'].map((id) => ({ id, snippet: { title: 'Metnin ana fikri konu anlatımı türkçe', channelTitle: 'x', liveBroadcastContent: 'none' }, contentDetails: { duration: 'PT1M30S' }, statistics: { viewCount: '1000' }, status: { privacyStatus: 'public', embeddable: true, uploadStatus: 'processed' } })) };
    vi.stubGlobal('fetch', vi.fn(async (u: any) => new Response(JSON.stringify(yt(String(u))), { headers: { 'content-type': 'application/json' } })));
    Object.assign(t.env, { YOUTUBE_API_KEY: 'synthetic' });
    const auto = await support();
    expect(auto.response.status, auto.text).toBe(200);
    expect(auto.data.options.topicVideo).toBeNull();
    expect(auto.data.microLearning.awaitingReview).toBe(true);
    expect(auto.text).not.toContain('youtube.com/watch');

    const add = (id: string, extra: string) => t.db.exec(`INSERT INTO video_links(id,exam_id,exam_question_id,link_type,provider,url,title,approved,status,publish_at,link_status) VALUES('${id}','${t.examId}','${q.q}','SOLUTION','EXTERNAL','https://video.example/${id}','${id}',${extra})`);
    add('draft', `0,'DRAFT',NULL,'UNKNOWN'`);
    add('future', `1,'SCHEDULED','2999-01-01T00:00:00Z','UNKNOWN'`);
    add('broken', `1,'PUBLISHED',NULL,'BROKEN'`);
    add('unapproved', `0,'PUBLISHED',NULL,'OK'`);
    add('later', `1,'PUBLISHED','2999-01-01T00:00:00Z','OK'`);
    expect((await support()).data.options.solutionVideo).toBeNull();
    add('good', `1,'PUBLISHED',NULL,'OK'`);
    expect((await support()).data.options.solutionVideo.url).toBe('https://video.example/good');
    for (const path of [`/api/student-standard/exam-review?examId=${t.examId}`, `/api/my-wrong-answers?examId=${t.examId}`]) {
      const r = await t.request(path, 'GET', undefined, 'stuuser');
      expect(r.response.status, path).toBe(200);
      expect(r.text).not.toMatch(/video\.example\/(draft|future|broken|unapproved|later)/);
    }
    const rv = await t.request(`/api/student-standard/exam-review?examId=${t.examId}`, 'GET', undefined, 'stuuser');
    expect(rv.text).toContain('video.example/good');
  });
});
