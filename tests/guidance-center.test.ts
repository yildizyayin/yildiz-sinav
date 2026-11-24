import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { isUrgentMessage, istanbulDate } from '../worker/lib/guidance-center';

/** Rehberlik merkezi R1 (owner, 11–12 Nov 2026): day, file, meetings, early warning and "Rehber öğretmenime yaz". Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8-A'),('c8b','school','season',8,'B','8-B');
    UPDATE student_enrollments SET class_id='c8a' WHERE id='enr1';
    INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s2','AYSE','KAYA','AYSE KAYA','ACTIVE');
    INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES('enr2','s2','school','season','c8b','102',8,'B','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('gt','GUIDANCE_TEACHER','Rehber A','unused','unused',1,'school'),('gtb','GUIDANCE_TEACHER','Rehber B','unused','unused',1,'school'),('mgr','INSTITUTION_MANAGER','Müdür','unused','unused',1,'school');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id,student_id) VALUES('stu2','STUDENT','Ayşe','unused','unused',1,'school','s2');
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,assignment_type,active) VALUES('g1','gt','school','season','c8a','GUIDANCE',1),('g2','gtb','school','season','c8b','GUIDANCE',1),('t1','teacher','school','season','c8a','SUBJECT',1);`);
  const cookies: Record<string, string> = {};
  for (const id of ['gt', 'gtb', 'mgr', 'stu2']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const app = (await import('../worker/preview-policy-production-entry')).default as any;
  const as = async (who: string, path: string, method = 'GET', body?: any) => {
    if (!cookies[who]) return t.request(path, method, body, who);
    const res = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who], Origin: 'https://app.anunex.com', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {}, passThroughOnException() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { response: res, data, text };
  };
  return { ...t, as };
}
const today = istanbulDate();

describe('guidance center R1', () => {
  it('turns guidance tests and RBA on by default', async () => {
    const t = await setup();
    const rows = t.db.prepare(`SELECT feature_key,enabled_default FROM platform_features WHERE feature_key IN ('GUIDANCE_TESTS','RBA') ORDER BY feature_key`).all();
    expect(rows).toEqual([{ feature_key: 'GUIDANCE_TESTS', enabled_default: 1 }, { feature_key: 'RBA', enabled_default: 1 }]);
  });

  it('opens the centre only to guidance teachers, each for their own students', async () => {
    const t = await setup();
    for (const who of ['teacher', 'stuuser', 'parent', 'mgr', 'admin']) expect((await t.as(who, '/api/guidance-center/today')).response.status, who).toBe(403);
    const a = await t.as('gt', '/api/guidance-center/students');
    expect(a.response.status, a.text).toBe(200);
    expect(a.data.students.map((s: any) => s.id)).toEqual(['s1']);
    expect((await t.as('gt', '/api/guidance-center/students/s1')).response.status).toBe(200);
    expect((await t.as('gt', '/api/guidance-center/students/s2')).response.status).toBe(403);
    expect((await t.as('gtb', '/api/guidance-center/students/s1')).response.status).toBe(403);
    expect(t.db.prepare(`SELECT count(*) n FROM audit_logs WHERE action='GUIDANCE_FILE_READ' AND actor_user_id='gt'`).get()).toEqual({ n: 1 });
  });

  it('plans, completes and lists meetings, and never for someone else’s student', async () => {
    const t = await setup();
    const at = `${today}T10:30`;
    expect((await t.as('gt', '/api/guidance-center/meetings', 'POST', { kind: 'INDIVIDUAL', area: 'ACADEMIC', topic: 'STUDY', scheduledAt: at, studentIds: ['s2'] })).response.status).toBe(403);
    expect((await t.as('gt', '/api/guidance-center/meetings', 'POST', { kind: 'GROUP', area: 'ACADEMIC', topic: 'STUDY', scheduledAt: at, studentIds: ['s1'] })).response.status).toBe(400);
    expect((await t.as('gt', '/api/guidance-center/meetings', 'POST', { kind: 'INDIVIDUAL', area: 'ACADEMIC', topic: 'NOPE', scheduledAt: at, studentIds: ['s1'] })).response.status).toBe(400);
    const made = await t.as('gt', '/api/guidance-center/meetings', 'POST', { kind: 'INDIVIDUAL', area: 'SOCIAL_EMOTIONAL', topic: 'PEER_BULLYING', scheduledAt: at, studentIds: ['s1'] });
    expect(made.response.status, made.text).toBe(201);
    const day = await t.as('gt', '/api/guidance-center/today');
    expect(day.data.meetings).toHaveLength(1); expect(day.data.meetings[0].students).toHaveLength(1);
    expect((await t.as('gt', `/api/guidance-center/meetings/${made.data.id}`, 'PATCH', { status: 'DONE' })).response.status).toBe(400); // a summary is required
    expect((await t.as('gt', `/api/guidance-center/meetings/${made.data.id}`, 'PATCH', { status: 'DONE', summary: 'Konuştuk.', followUpDate: today })).response.status).toBe(200);
    expect((await t.as('gtb', `/api/guidance-center/meetings/${made.data.id}`, 'PATCH', { status: 'CANCELLED' })).response.status).toBe(404);
    const file = await t.as('gt', '/api/guidance-center/students/s1');
    expect(file.data.meetings[0]).toMatchObject({ status: 'DONE', summary: 'Konuştuk.', topic: 'PEER_BULLYING' });
    expect((await t.as('gt', '/api/guidance-center/today')).data.followUps).toHaveLength(1);
  });

  it('lets a student write, by name or without one; the right guidance teacher reads it', async () => {
    const t = await setup();
    const named = await t.as('stuuser', '/api/guidance-center/messages', 'POST', { category: 'STUDY', body: 'Matematikte zorlanıyorum, görüşebilir miyiz?' });
    expect(named.response.status, named.text).toBe(201); expect(named.data.urgent).toBe(false); expect(named.data.emergency).toBeNull();
    const anon = await t.as('stuuser', '/api/guidance-center/messages', 'POST', { category: 'PEER_BULLYING', body: 'Teneffüste bir arkadaşımıza sürekli lakap takılıyor.', anonymous: true });
    expect(anon.data.urgent).toBe(true);
    expect(anon.data.emergency.lines.map((l: any) => l.number)).toEqual(['112', '147']);
    const stored = t.db.prepare(`SELECT student_id,sender_user_id,class_id,anonymous FROM guidance_messages WHERE id=?`).get(anon.data.id);
    expect(stored).toEqual({ student_id: null, sender_user_id: null, class_id: 'c8a', anonymous: 1 });
    expect(() => t.db.exec(`UPDATE guidance_messages SET student_id='s1' WHERE id='${anon.data.id}'`)).toThrow(/ANONYMOUS_MESSAGE/);
    // the guidance teacher of 8-A sees both, the anonymous one without a name; 8-B's does not
    const box = await t.as('gt', '/api/guidance-center/messages');
    expect(box.data.messages.map((m: any) => m.id).sort()).toEqual([named.data.id, anon.data.id].sort());
    const a = box.data.messages.find((m: any) => m.id === anon.data.id);
    expect(a.student).toBeNull(); expect(a.sender).toBeNull(); expect(box.data.messages[0].id).toBe(anon.data.id); // urgent first
    expect((await t.as('gtb', '/api/guidance-center/messages')).data.messages).toEqual([]);
    expect(t.db.prepare(`SELECT count(*) n FROM notifications WHERE recipient_user_id='gt' AND type='GUIDANCE_MESSAGE'`).get()).toEqual({ n: 2 });
    expect(t.db.prepare(`SELECT count(*) n FROM notifications WHERE recipient_user_id='gtb'`).get()).toEqual({ n: 0 });
    expect(JSON.stringify(t.db.prepare(`SELECT title,body FROM notifications`).all())).not.toContain('lakap');
    // the sender sees their own named message, never the anonymous one
    expect((await t.as('stuuser', '/api/guidance-center/messages/mine')).data.messages.map((m: any) => m.id)).toEqual([named.data.id]);
    // a meeting can start from a named message, not from an anonymous one
    expect((await t.as('gt', '/api/guidance-center/meetings', 'POST', { kind: 'INDIVIDUAL', area: 'SOCIAL_EMOTIONAL', topic: 'PEER_BULLYING', scheduledAt: `${today}T11:00`, studentIds: ['s1'], sourceMessageId: anon.data.id })).response.status).toBe(400);
    expect((await t.as('gt', '/api/guidance-center/meetings', 'POST', { kind: 'INDIVIDUAL', area: 'ACADEMIC', topic: 'STUDY', scheduledAt: `${today}T11:00`, studentIds: ['s1'], sourceMessageId: named.data.id })).response.status).toBe(201);
    expect(t.db.prepare(`SELECT status FROM guidance_messages WHERE id=?`).get(named.data.id)).toEqual({ status: 'SEEN' });
    expect((await t.as('gt', `/api/guidance-center/messages/${anon.data.id}`, 'PATCH', { status: 'CLOSED' })).response.status).toBe(200);
    expect((await t.as('gtb', `/api/guidance-center/messages/${named.data.id}`, 'PATCH', { status: 'CLOSED' })).response.status).toBe(404);
  });

  it('lets parents write only about their own child and teachers only about their own classes', async () => {
    const t = await setup();
    expect((await t.as('parent', '/api/guidance-center/messages', 'POST', { category: 'FAMILY', body: 'Görüşmek istiyoruz.', studentId: 's2' })).response.status).toBe(403);
    expect((await t.as('parent', '/api/guidance-center/messages', 'POST', { category: 'FAMILY', body: 'Görüşmek istiyoruz.', studentId: 's1' })).response.status).toBe(201);
    expect((await t.as('teacher', '/api/guidance-center/messages', 'POST', { category: 'WORRY', body: 'Derste çok dalgın.', studentId: 's2' })).response.status).toBe(403);
    expect((await t.as('teacher', '/api/guidance-center/messages', 'POST', { category: 'WORRY', body: 'Derste çok dalgın.', studentId: 's1' })).response.status).toBe(201);
    expect((await t.as('parent', '/api/guidance-center/messages/mine')).data.students.map((s: any) => s.id)).toEqual(['s1']);
    expect((await t.as('mgr', '/api/guidance-center/messages', 'POST', { category: 'OTHER', body: 'x y z' })).response.status).toBe(403);
    // a flood is slowed down
    for (let i = 0; i < 4; i++) await t.as('parent', '/api/guidance-center/messages', 'POST', { category: 'OTHER', body: `Mesaj ${i}`, studentId: 's1' });
    expect((await t.as('parent', '/api/guidance-center/messages', 'POST', { category: 'OTHER', body: 'Bir tane daha', studentId: 's1' })).response.status).toBe(429);
  });

  it('marks crisis words as urgent wherever they appear', () => {
    expect(isUrgentMessage('TALK', 'Bazen YAŞAMAK İSTEMİYORUM diye düşünüyorum')).toBe(true);
    expect(isUrgentMessage('STUDY', 'Matematik çalışmak istemiyorum')).toBe(false);
    expect(isUrgentMessage('PEER_BULLYING', 'x')).toBe(true);
  });

  it('shows early-warning signals with their reasons and lets the counsellor watch or set them aside', async () => {
    const t = await setup();
    t.db.exec(`INSERT INTO attendance_sessions(id,institution_id,class_id,attendance_date,created_by) VALUES('as1','school','c8a','${today}','teacher'),('as2','school','c8a',date('${today}','-1 day'),'teacher'),('as3','school','c8a',date('${today}','-2 day'),'teacher');
      INSERT INTO attendance_records(session_id,student_id,attendance_status,recorded_by) VALUES('as1','s1','ABSENT','teacher'),('as2','s1','ABSENT','teacher'),('as3','s1','ABSENT','teacher');`);
    const w = await t.as('gt', '/api/guidance-center/warnings');
    expect(w.data.warnings).toEqual([expect.objectContaining({ studentId: 's1', key: 'ATTENDANCE', reason: 'Son 30 günde 3 gün devamsız.' })]);
    expect((await t.as('gtb', '/api/guidance-center/warnings/s1/ATTENDANCE', 'POST', { action: 'DISMISS' })).response.status).toBe(403);
    expect((await t.as('gt', '/api/guidance-center/warnings/s1/ATTENDANCE', 'POST', { action: 'WATCH' })).response.status).toBe(200);
    expect((await t.as('gt', '/api/guidance-center/warnings')).data.warnings[0].watched).toBe(true);
    expect((await t.as('gt', '/api/guidance-center/warnings/s1/ATTENDANCE', 'POST', { action: 'DISMISS' })).response.status).toBe(200);
    expect((await t.as('gt', '/api/guidance-center/warnings')).data.warnings).toEqual([]);
    expect((await t.as('gt', '/api/guidance-center/students')).data.students[0].warnings).toEqual([]);
  });
});
