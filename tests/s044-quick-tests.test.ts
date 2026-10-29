import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

process.env.TZ = 'UTC';

/** S044 Hızlı Test: crop → answer → print / timed online exam with a code. Synthetic people, images and answers only. */
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

async function world() {
  const t = await evaluatedExam('direct');
  const store = new Map<string, Uint8Array>();
  Object.assign(t.env, { FILES: {
    put: async (k: string, v: Uint8Array) => { store.set(k, v); },
    get: async (k: string) => store.has(k) ? { body: store.get(k), arrayBuffer: async () => store.get(k)!.buffer } : null,
    delete: async (k: string) => { store.delete(k); },
  } });
  t.db.exec(`INSERT INTO institution_feature_overrides(institution_id,feature_key,enabled) VALUES('school','STUDIO',1);
    INSERT INTO institutions(id,name,code,status) VALUES('other','Başka Okul','OTHER','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('teacher2','TEACHER','Başka Öğretmen','u','u',1,'other'),('mgr','INSTITUTION_MANAGER','Müdür','u','u',1,'school');
    INSERT INTO institution_feature_overrides(institution_id,feature_key,enabled) VALUES('other','STUDIO',1);`);
  const app = (await import('../worker/preview-policy-production-entry')).default as any;
  const cookies: Record<string, string> = {};
  const call = async (who: string | null, path: string, method = 'GET', body?: any) => {
    if (who && !cookies[who]) cookies[who] = (await createSession(t.env, who, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const form = body instanceof FormData;
    const r = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { ...(who ? { Cookie: cookies[who] } : {}), Origin: 'https://app.anunex.com', ...(body && !form ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: form ? body : JSON.stringify(body) } : {}) }), t.env, { waitUntil() {}, passThroughOnException() {} });
    const ct = r.headers.get('Content-Type') || '';
    if (ct.includes('pdf') || ct.startsWith('image/')) return { status: r.status, data: null, ct, bytes: new Uint8Array(await r.arrayBuffer()) };
    const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { status: r.status, data, text, ct };
  };
  const addImage = (who: string, id: string, answer = '') => { const f = new FormData(); f.set('image', new File([PNG], 'q.png', { type: 'image/png' })); f.set('width', '600'); f.set('height', '300'); if (answer) f.set('correctAnswer', answer); return call(who, `/api/quick-tests/${id}/questions`, 'POST', f); };
  return { t, call, addImage, store };
}

describe('S044 Hızlı Test', () => {
  it('a teacher crops questions, marks answers, prints the test, key and optical form', async () => {
    const { call, addImage, store } = await world();
    expect((await call('teacher', '/api/quick-tests', 'POST', { title: 'Kesirler mini test' })).status).toBe(400);
    const made = await call('teacher', '/api/quick-tests', 'POST', { title: 'Kesirler mini test', gradeLevel: 6, subjectLabel: 'Matematik', optionCount: 4, rightsDeclared: true });
    expect(made.status, made.text).toBe(201);
    const id = made.data.id;
    const q1 = await addImage('teacher', id, 'B'); expect(q1.status, q1.text).toBe(201);
    const q2 = await addImage('teacher', id); expect(q2.data.question.correctAnswer).toBeNull();
    const q3 = await addImage('teacher', id, 'X');
    expect(store.size).toBe(3);
    expect((await call('teacher', `/api/quick-tests/${id}/pdf`)).status).toBe(409);
    expect((await call('teacher', `/api/quick-tests/${id}/questions/${q2.data.question.id}`, 'PATCH', { correctAnswer: 'E' })).status).toBe(400);
    expect((await call('teacher', `/api/quick-tests/${id}/questions/${q2.data.question.id}`, 'PATCH', { correctAnswer: 'D' })).status).toBe(200);
    expect((await call('teacher', `/api/quick-tests/${id}/order`, 'PUT', { ids: [q3.data.question.id, q1.data.question.id, q2.data.question.id] })).status).toBe(200);
    const detail = await call('teacher', `/api/quick-tests/${id}`);
    expect(detail.data.questions.map((q: any) => q.correctAnswer)).toEqual(['X', 'B', 'D']);
    const pdf = await call('teacher', `/api/quick-tests/${id}/pdf?columns=1`);
    expect(pdf.status).toBe(200); expect(pdf.ct).toContain('pdf'); expect(new TextDecoder().decode(pdf.bytes!.slice(0, 5))).toBe('%PDF-');
    expect((await call('teacher', `/api/quick-tests/${id}/answer-key`)).status).toBe(200);
    const tpl = await call('teacher', `/api/quick-tests/${id}/optical-template`);
    expect(tpl.data.template.optical.version).toBe('ANUNEX-OPTICAL-2');
    // a paper sheet read with the camera: printed order X,B,D → the cancelled first question does not count
    const paper = await call('teacher', `/api/quick-tests/${id}/paper`, 'POST', { name: 'Ece Kaya', number: '7', answers: 'ABA' });
    expect(paper.status, paper.text).toBe(201);
    expect(paper.data.result).toMatchObject({ correct: 1, wrong: 1, blank: 0 });
    // other people
    expect((await call('teacher2', `/api/quick-tests/${id}`)).status).toBe(404);
    expect((await call('mgr', `/api/quick-tests/${id}`)).status).toBe(200);
    expect((await call('stuuser', '/api/quick-tests')).status).toBe(403);
    expect((await call('teacher', '/api/quick-tests')).data.tests.map((x: any) => x.id)).toContain(id);
    expect((await call('teacher2', '/api/quick-tests')).data.tests.map((x: any) => x.id)).not.toContain(id);
  });

  it('runs a timed online exam: code, name and number, saves as it goes, resumes on the same device, scores on submit', async () => {
    const { t, call, addImage } = await world();
    const id = (await call('teacher', '/api/quick-tests', 'POST', { title: 'Online deneme', optionCount: 4, rightsDeclared: true })).data.id;
    const qa = await addImage('teacher', id, 'A'), qb = await addImage('teacher', id, 'C'), qc = await addImage('teacher', id, 'D');
    expect((await call('teacher', `/api/quick-tests/${id}/sessions`, 'POST', { durationMinutes: 0 })).status).toBe(400);
    const ses = await call('teacher', `/api/quick-tests/${id}/sessions`, 'POST', { durationMinutes: 20, shuffle: true, resultMode: 'AFTER_SUBMIT' });
    expect(ses.status, ses.text).toBe(201);
    const code = ses.data.session.code;
    expect((await call(null, '/api/public/quick-tests/ZZZZZZ')).status).toBe(404);
    const info = await call(null, `/api/public/quick-tests/${code.toLowerCase()}`);
    expect(info.data.exam).toMatchObject({ title: 'Online deneme', questionCount: 3, durationMinutes: 20, state: 'OPEN' });
    expect((await call(null, `/api/public/quick-tests/${code}/start`, 'POST', { name: 'Ali', number: '12' })).status).toBe(400);
    const start = await call(null, `/api/public/quick-tests/${code}/start`, 'POST', { name: 'Ali Veli', number: '12', className: '6A' });
    expect(start.status, start.text).toBe(201);
    expect(start.data.questions).toHaveLength(3);
    const { attemptId, token } = start.data;
    const img = await call(null, `/api/public/quick-tests/attempts/${attemptId}/image/${qa.data.question.id}?t=${token}`);
    expect(img.status).toBe(200); expect(img.ct).toBe('image/png');
    expect((await call(null, `/api/public/quick-tests/attempts/${attemptId}/image/${qa.data.question.id}?t=wrong`)).status).toBe(403);
    // another device with the same number cannot take over; the same device resumes
    expect((await call(null, `/api/public/quick-tests/${code}/start`, 'POST', { name: 'Ali Veli', number: '12' })).status).toBe(409);
    const answers = { [qa.data.question.id]: 'A', [qb.data.question.id]: 'B' };
    expect((await call(null, `/api/public/quick-tests/attempts/${attemptId}/answers?t=${token}`, 'PUT', { answers })).status).toBe(200);
    const resumed = await call(null, `/api/public/quick-tests/${code}/start`, 'POST', { name: 'Ali Veli', number: '12', resumeToken: token });
    expect(resumed.status).toBe(200); expect(resumed.data.answers).toEqual(answers);
    const sub = await call(null, `/api/public/quick-tests/attempts/${attemptId}/submit?t=${token}`, 'POST', { answers: { ...answers, [qc.data.question.id]: 'D' } });
    expect(sub.status, sub.text).toBe(200);
    expect(sub.data.result).toMatchObject({ correct: 2, wrong: 1, blank: 0, net: 2 });
    expect((await call(null, `/api/public/quick-tests/attempts/${attemptId}/submit?t=${token}`, 'POST', { answers: {} })).data.result.correct).toBe(2);
    // a second student starts, leaves; time runs out and the saved answers are handed in by themselves
    const s2 = await call(null, `/api/public/quick-tests/${code}/start`, 'POST', { name: 'Ayşe Demir', number: '13' });
    await call(null, `/api/public/quick-tests/attempts/${s2.data.attemptId}/answers?t=${s2.data.token}`, 'PUT', { answers: { [qa.data.question.id]: 'A' } });
    t.db.prepare(`UPDATE quick_test_attempts SET deadline_at=datetime('now','-1 minute') WHERE id=?`).run(s2.data.attemptId);
    expect((await call(null, `/api/public/quick-tests/attempts/${s2.data.attemptId}/answers?t=${s2.data.token}`, 'PUT', { answers: {} })).status).toBe(409);
    const res = await call('teacher', `/api/quick-tests/${id}/results`);
    expect(res.data.attempts).toHaveLength(2);
    expect(res.data.attempts.every((a: any) => !a.inProgress)).toBe(true);
    expect(res.data.attempts.find((a: any) => a.taker_number === '13')).toMatchObject({ correct_count: 1, blank_count: 2 });
    expect(res.data.stats[0]).toMatchObject({ no: 1, correct: 2, rate: 100 });
    // the teacher resets an attempt so the student can start again; closing the session ends it
    const a13 = res.data.attempts.find((a: any) => a.taker_number === '13').id;
    expect((await call('teacher', `/api/quick-tests/${id}/attempts/${a13}`, 'DELETE')).status).toBe(200);
    expect((await call('teacher', `/api/quick-tests/${id}/sessions/${ses.data.session.id}/close`, 'POST')).status).toBe(200);
    expect((await call(null, `/api/public/quick-tests/${code}`)).data.exam.state).toBe('CLOSED');
    expect((await call(null, `/api/public/quick-tests/${code}/start`, 'POST', { name: 'Ayşe Demir', number: '13' })).status).toBe(409);
  });

  it('is part of the Studio switch, and results can be hidden until the exam closes', async () => {
    const { t, call, addImage } = await world();
    const id = (await call('teacher', '/api/quick-tests', 'POST', { title: 'Gizli sonuç', rightsDeclared: true })).data.id;
    const q = await addImage('teacher', id, 'A');
    const ses = await call('teacher', `/api/quick-tests/${id}/sessions`, 'POST', { durationMinutes: 5, resultMode: 'AFTER_CLOSE' });
    const st = await call(null, `/api/public/quick-tests/${ses.data.session.code}/start`, 'POST', { name: 'Can Ak', number: '5' });
    const sub = await call(null, `/api/public/quick-tests/attempts/${st.data.attemptId}/submit?t=${st.data.token}`, 'POST', { answers: { [q.data.question.id]: 'A' } });
    expect(sub.data.result).toBeNull();
    await call('teacher', `/api/quick-tests/${id}/sessions/${ses.data.session.id}/close`, 'POST');
    expect((await call(null, `/api/public/quick-tests/attempts/${st.data.attemptId}/result?t=${st.data.token}`)).data.result).toMatchObject({ correct: 1 });
    t.db.exec(`UPDATE institution_feature_overrides SET enabled=0 WHERE institution_id='school' AND feature_key='STUDIO'`);
    const off = await call('teacher', '/api/quick-tests');
    expect(off.status).toBe(403); expect(off.data.error.code).toBe('FEATURE_DISABLED');
  });
});

describe('S044 paper layout', () => {
  it('prints wide crops in one column and narrow crops in two', async () => {
    const { autoColumns } = await import('../worker/lib/quick-test-pdf');
    expect(autoColumns([{ kind: 'IMAGE', image_width: 1200 }, { kind: 'IMAGE', image_width: 1100 }])).toBe(1);
    expect(autoColumns([{ kind: 'IMAGE', image_width: 480 }, { kind: 'IMAGE', image_width: 500 }])).toBe(2);
    expect(autoColumns([{ kind: 'BANK' }])).toBe(2);
  });
});
