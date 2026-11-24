import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { nibiruAfterWrite } from '../worker/lib/nibiru-companion';

// 24 Nov 2026 (owner: "görüşme planladım, bildirim gelmedi" — the showcase has no cron): a change that can create a
// first message runs the pass right away; reads and unrelated changes do not, and bursts are throttled.
it('writes the meeting message right after the meeting is planned, without the cron', async () => {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('gt','GUIDANCE_TEACHER','Rehber','x','x',1,'school');
    INSERT INTO guidance_meetings(id,institution_id,counselor_id,kind,area,topic,scheduled_at) VALUES('gm1','school','gt','INDIVIDUAL','ACADEMIC','STUDY',datetime('now','+3 days'));
    INSERT INTO guidance_meeting_students(meeting_id,student_id) VALUES('gm1','s1');`);
  const jobs: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => { jobs.push(p); } };
  const req = (path: string, method = 'POST') => new Request(`https://tanitim.anunex.com${path}`, { method });
  nibiruAfterWrite(req('/api/guidance-center/meetings', 'GET'), t.env, ctx, new Response('{}'));
  nibiruAfterWrite(req('/api/exams'), t.env, ctx, new Response('{}'));
  nibiruAfterWrite(req('/api/guidance-center/meetings'), t.env, ctx, new Response('{}', { status: 400 }));
  expect(jobs).toHaveLength(0);
  nibiruAfterWrite(req('/api/guidance-center/meetings'), t.env, ctx, new Response('{}'));
  nibiruAfterWrite(req('/api/guidance-center/meetings'), t.env, ctx, new Response('{}'));
  expect(jobs).toHaveLength(1);
  await Promise.all(jobs);
  const texts = (t.db.prepare(`SELECT user_id,text FROM nibiru_messages ORDER BY rowid`).all() as any[]);
  expect(texts.filter((m) => m.user_id === 'parent').map((m) => m.text).join()).toMatch(/görüşme planladı/);
});
