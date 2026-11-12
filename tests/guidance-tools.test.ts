import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { scoreGuidanceResponses } from '../worker/lib/guidance-assessments';
import { validateItems } from '../worker/lib/guidance-tools';

/** Rehberlik R3 (owner, 12 Nov 2026): item types, class use, class report, drafts with expert approval, anonymous surveys. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  const kids = Array.from({ length: 7 }, (_, i) => i);
  t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8-A');
    UPDATE student_enrollments SET class_id='c8a' WHERE student_id='s1';
    ${kids.map((i) => `INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('k${i}','ADA${i}','DENİZ','ADA${i} DENİZ','ACTIVE');
    INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES('ek${i}','k${i}','school','season','c8a','${300 + i}',8,'A','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id,student_id) VALUES('uk${i}','STUDENT','Ada ${i}','unused','unused',1,'school','k${i}');`).join('\n')}
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('gt','GUIDANCE_TEACHER','Rehber A','unused','unused',1,'school');
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,assignment_type,active) VALUES('g1','gt','school','season','c8a','GUIDANCE',1);`);
  const cookies: Record<string, string> = {};
  for (const id of ['gt', ...kids.map((i) => `uk${i}`)]) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const app = (await import('../worker/preview-policy-production-entry')).default as any;
  const as = async (who: string, path: string, method = 'GET', body?: any) => {
    if (!cookies[who]) return t.request(path, method, body, who);
    const res = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who], Origin: 'https://app.anunex.com', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {}, passThroughOnException() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { response: res, data, text };
  };
  return { ...t, as, kids };
}

describe('guidance tools R3', () => {
  it('scores the new item types and keeps the 1–5 scale as it was', () => {
    const r = scoreGuidanceResponses({ scale: { min: 1, max: 5 }, items: [
      { id: 'l', dimension: 'plan', text: 'x' }, { id: 'y', type: 'YESNO', dimension: 'plan', text: 'y', reverse: true },
      { id: 'ab', type: 'AB', text: 'z', a: { text: 'a', dimension: 'tech' }, b: { text: 'b', dimension: 'art' } },
      { id: 'c', type: 'CHOICE', dimension: 'time', text: 'c', options: [{ id: 'o1', text: '1', value: 100 }, { id: 'o2', text: '2', value: 0 }] },
      { id: 't', type: 'TEXT', text: 't', optional: true }, { id: 'p', type: 'PEER', text: 'p', max: 2 } ] } as any,
    { l: 5, y: true, ab: 'B', c: 'o2', p: ['k1'] });
    expect(r.dimensions).toEqual({ plan: 50, art: 100, tech: 0, time: 0 });
    expect(r.answered).toBe(5); expect(r.total).toBe(6);
    expect(() => scoreGuidanceResponses({ items: [{ id: 'p', type: 'PEER', text: 'p', max: 1 }] } as any, { p: ['a', 'b'] })).toThrow(/RESPONSE_INVALID/);
    expect(() => scoreGuidanceResponses({ items: [{ id: 'y', type: 'YESNO', text: 'y' }] } as any, {})).toThrow(/RESPONSE_REQUIRED/);
    expect(validateItems([{ id: 'a', text: 'Merhaba', type: 'NOPE' }])).toMatch(/türü/);
    expect(validateItems([{ id: 'a', text: 'Merhaba', type: 'PEER', max: 3 }], { survey: 'CLIMATE' })).toMatch(/yalnız 1–5/);
  });

  it('keeps every new ANUNEX tool in review until an expert approves it', async () => {
    const t = await setup();
    const cat = await t.as('gt', '/api/guidance-tools/catalog');
    expect(cat.response.status, cat.text).toBe(200);
    expect(cat.data.instruments.some((i: any) => i.code === 'RBA_EDU_V2_B')).toBe(false); // not active, not theirs
    expect((await t.as('gt', '/api/guidance-tools/assign', 'POST', { instrumentCode: 'SOSYOMETRI_V1', classId: 'c8a' })).response.status).toBe(404);
    const q = await t.as('admin', '/api/guidance-tools/review-queue');
    expect(q.data.instruments.map((i: any) => i.code)).toEqual(expect.arrayContaining(['RBA_EDU_V2_A', 'RBA_EDU_V2_B', 'RBA_EDU_V2_C', 'SOSYOMETRI_V1', 'SINAV_KAYGI_V1', 'EKRAN_KULLANIM_V1', 'ILGI_MESLEK_V1', 'PROBLEM_TARAMA_V1', 'OGRENCI_BILGI_V1', 'BASARISIZLIK_NEDEN_V1']));
    expect(JSON.stringify(q.data.instruments)).not.toMatch(/beyin/i);
    // RİBA has no items until they are loaded from the confirmed official source, so it cannot be approved yet
    const riba = q.data.templates.find((x: any) => x.code === 'RIBA');
    expect(riba.forms.forms.every((f: any) => f.items.length === 0)).toBe(true);
    expect((await t.as('admin', `/api/guidance-tools/review/templates/${riba.id}`, 'POST', { decision: 'APPROVE' })).data.error.code).toBe('FORMS_EMPTY');
    expect((await t.as('gt', '/api/guidance-tools/review-queue')).response.status).toBe(403);
  });

  it('opens an approved tool for a class, reports it and shows the sociogram only to the guidance teacher', async () => {
    const t = await setup();
    const soc = (await t.as('admin', '/api/guidance-tools/review-queue')).data.instruments.find((i: any) => i.code === 'SOSYOMETRI_V1');
    expect((await t.as('admin', `/api/guidance-tools/review/instruments/${soc.id}`, 'POST', { decision: 'APPROVE' })).response.status).toBe(200);
    const a = await t.as('gt', '/api/guidance-tools/assign', 'POST', { instrumentCode: 'SOSYOMETRI_V1', classId: 'c8a' });
    expect(a.data).toMatchObject({ opened: 8, reused: 0 });
    expect((await t.as('gt', '/api/guidance-tools/assign', 'POST', { instrumentCode: 'SOSYOMETRI_V1', classId: 'c8a' })).data).toMatchObject({ opened: 0, reused: 8 });
    // students answer: only classmates, never oneself
    for (const i of t.kids) {
      const mine = await t.as(`uk${i}`, '/api/nibiru/guidance/assessments/my');
      const s = mine.data.sessions.find((x: any) => x.code === 'SOSYOMETRI_V1');
      expect(mine.data.classmates.some((c: any) => c.id === `k${i}`)).toBe(false);
      if (i === 0) expect((await t.as('uk0', `/api/nibiru/guidance/assessments/${s.id}/submit`, 'POST', { responses: { s1: ['k0'], s2: ['k1'] } })).response.status).toBe(400);
      const pick = [`k${(i + 1) % 7}`];
      const r = await t.as(`uk${i}`, `/api/nibiru/guidance/assessments/${s.id}/submit`, 'POST', { responses: { s1: pick, s2: pick } });
      expect(r.response.status, r.text).toBe(200);
    }
    const rep = await t.as('gt', '/api/guidance-tools/report?instrumentCode=SOSYOMETRI_V1&classId=c8a');
    expect(rep.response.status, rep.text).toBe(200);
    expect(rep.data.sociogram.answered).toBe(7);
    expect(rep.data.sociogram.notChosen.map((x: any) => x.id)).toEqual(['s1']); // s1 did not answer and nobody chose them
    expect(rep.data.sociogram.note).toMatch(/sorunlu” değildir/);
    expect(t.db.prepare(`SELECT count(*) n FROM audit_logs WHERE action='GUIDANCE_SOCIOGRAM_READ'`).get()).toEqual({ n: 1 });
    expect((await t.as('teacher', '/api/guidance-tools/report?instrumentCode=SOSYOMETRI_V1&classId=c8a')).response.status).toBe(403);
  });

  it('lets a guidance teacher draft a tool that only the Super Admin can release, for their own school', async () => {
    const t = await setup();
    const bad = await t.as('gt', '/api/guidance-tools/drafts', 'POST', { title: 'X', description: 'Y', items: [{ id: 'a', text: 'Merhaba', type: 'AB' }] });
    expect(bad.response.status).toBe(400);
    const d = await t.as('gt', '/api/guidance-tools/drafts', 'POST', { title: 'Teneffüs gözlemi', description: 'Okulumuza özel kısa anket', items: [{ id: 'a', text: 'Teneffüsleri seviyorum.' }, { id: 'b', type: 'YESNO', text: 'Kantin kalabalık.' }] });
    expect(d.response.status, d.text).toBe(201);
    expect((await t.as('gt', '/api/guidance-tools/assign', 'POST', { instrumentCode: d.data.code, classId: 'c8a' })).response.status).toBe(404);
    expect((await t.as('gt', '/api/guidance-tools/catalog')).data.instruments.find((i: any) => i.code === d.data.code)).toMatchObject({ review_status: 'REVIEW', mine: true, active: 0 });
    expect((await t.as('admin', `/api/guidance-tools/review/instruments/${d.data.id}`, 'POST', { decision: 'APPROVE', note: 'Uygun' })).response.status).toBe(200);
    expect((await t.as('gt', '/api/guidance-tools/assign', 'POST', { instrumentCode: d.data.code, classId: 'c8a' })).data.opened).toBe(8);
    // another school does not see it
    t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('other','Other','OTHER','ACTIVE')`);
    const other = t.db.prepare(`SELECT count(*) n FROM guidance_assessment_instruments WHERE code=? AND (institution_id IS NULL OR institution_id='other')`).get(d.data.code);
    expect(other).toEqual({ n: 0 });
  });

  it('runs an anonymous survey: a sample answers, no answer carries a person, small groups stay hidden', async () => {
    const t = await setup();
    const q = (await t.as('admin', '/api/guidance-tools/review-queue')).data.templates;
    const climate = q.find((x: any) => x.code === 'OKUL_IKLIMI');
    expect((await t.as('admin', `/api/guidance-tools/review/templates/${climate.id}`, 'POST', { decision: 'APPROVE' })).response.status).toBe(200);
    const open = await t.as('gt', '/api/guidance-tools/surveys', 'POST', { templateCode: 'OKUL_IKLIMI', samplePct: 100 });
    expect(open.response.status, open.text).toBe(201); expect(open.data.invited).toBe(8);
    const answerAll = async (who: string) => {
      const mine = await t.as(who, '/api/guidance-tools/my-surveys');
      const s = mine.data.surveys[0];
      return t.as(who, `/api/guidance-tools/my-surveys/${s.inviteId}`, 'POST', { answers: Object.fromEntries(s.items.map((it: any) => [it.id, 4])) });
    };
    for (const i of [0, 1, 2, 3]) expect((await answerAll(`uk${i}`)).response.status).toBe(200);
    let res = await t.as('gt', `/api/guidance-tools/surveys/${open.data.id}`);
    expect(res.data.forms[0]).toMatchObject({ responded: 4, hidden: true, school: null }); // fewer than five
    expect((await answerAll('uk4')).response.status).toBe(200);
    expect((await t.as('uk4', '/api/guidance-tools/my-surveys')).data.surveys).toEqual([]);
    res = await t.as('gt', `/api/guidance-tools/surveys/${open.data.id}`);
    expect(res.data.forms[0].hidden).toBe(false);
    expect(res.data.forms[0].school.find((x: any) => x.id === 'c7')).toMatchObject({ average: 4, score: 25 }); // a reverse item: “bana lakap takıldı” agreed → low
    expect(res.data.forms[0].classes[0]).toMatchObject({ className: '8-A', n: 5 });
    const cols = (t.db.prepare(`PRAGMA table_info(guidance_survey_responses)`).all() as any[]).map((c) => c.name);
    expect(cols).not.toContain('user_id'); expect(cols).not.toContain('student_id');
    expect((await t.as('stuuser', '/api/guidance-tools/surveys')).response.status).toBe(403);
  });
});
