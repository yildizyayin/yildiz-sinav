import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import app from '../worker/preview-policy-production-entry';
import { createSession } from '../worker/lib/auth';

/** Öğrenme Evreni PR-2 (owner, 11 Nov 2026): approved content for every kind, played end to end; content approval rules. Synthetic data only. */
async function asUser(t: any, userId: string, path: string, method = 'GET', body?: any) {
  const cookie = (await createSession(t.env, userId, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookie, Origin: 'https://app.anunex.com', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }), t.env, { waitUntil() {}, passThroughOnException() {} });
  return { response: res, data: await res.json().catch(() => null) as any };
}
const CONTENT: Record<string, { public: any; answer: any; right: any }> = {
  PAIRS: { public: { prompt: 'Eşleştir', left: [{ id: 'a', text: '2³' }, { id: 'b', text: '3²' }], right: [{ id: '1', text: '8' }, { id: '2', text: '9' }] }, answer: { pairs: [['a', '1'], ['b', '2']] }, right: { pairs: [['a', '1'], ['b', '2']] } },
  SEQUENCE: { public: { prompt: 'Sırala', items: [{ id: 'x', text: 'Tabanı yaz' }, { id: 'y', text: 'Üssü yaz' }, { id: 'z', text: 'Çarp' }] }, answer: { order: ['x', 'y', 'z'] }, right: { order: ['x', 'y', 'z'] } },
  CLOZE: { public: { text: '2³ = [b1] ve 3² = [b2]', blanks: [{ id: 'b1' }, { id: 'b2' }] }, answer: { blanks: { b1: { numeric: { value: 8 } }, b2: { accept: ['dokuz'], numeric: { value: 9 } } } }, right: { blanks: { b1: '8', b2: 'Dokuz' } } },
  HOTSPOT: { public: { prompt: 'Üssü göster', image: { url: 'https://example.invalid/us.png', width: 400, height: 300, alt: '2 üzeri 3 yazısı' } }, answer: { target: ['exp'], regions: [{ id: 'exp', x: 0.6, y: 0.1, w: 0.2, h: 0.3 }, { id: 'base', x: 0.2, y: 0.4, w: 0.3, h: 0.4 }] }, right: { x: 0.7, y: 0.2 } },
  AUDIO_QUESTION: { public: { transcript: 'İki üzeri üç kaçtır?', question: 'Duyduğun işlemin sonucu?', options: ['6', '8', '9'] }, answer: { correct: 'B' }, right: { answer: 'B' } },
  STEPS: { public: { problem: '2³ · 2² = ?', steps: [{ id: 's1', prompt: '2³ kaçtır?' }, { id: 's2', prompt: '2² kaçtır?' }, { id: 's3', prompt: 'Sonuç?' }] }, answer: { steps: { s1: { numeric: { value: 8 } }, s2: { numeric: { value: 4 } }, s3: { numeric: { value: 32 } } } }, right: { steps: { s1: '8', s2: '4', s3: '2⁵' } } },
};

it('plays all ten game kinds on approved content, graded on the server', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LEARNING_UNIVERSE'`);
    const o = t.db.prepare(`SELECT o.id,o.subject_id,cv.academic_year y FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.code='M.8.1.1'`).get() as any;
    t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,?,'OUTCOME',?,8,'M.8.1.1','Sentetik')`).run(`ln_${o.id}`, o.y, o.subject_id);
    const q = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status) VALUES(?,'PLATFORM',?,8,?,'MULTIPLE_CHOICE',?,'["-32","32","-16","16"]','A',4,'OWNED','APPROVED')`);
    for (let i = 1; i <= 20; i++) { q.run(`eq${i}`, o.y, o.subject_id, `Sentetik soru ${i}`); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run(`eq${i}`, `ln_${o.id}`); }
    const add = t.db.prepare(`INSERT INTO lu_game_contents(id,content_kind,outcome_id,academic_year,grade_level,subject_id,public_json,answer_json,copyright_status,review_status) VALUES(?,?,?,?,8,?,?,?,'OWNED','APPROVED')`);
    for (const [kind, c] of Object.entries(CONTENT)) for (let n = 1; n <= 8; n++) add.run(`gc_${kind}_${n}`, kind, o.id, o.y, o.subject_id, JSON.stringify(c.public), JSON.stringify(c.answer));
    const rightFor = (it: any) => it.kind === 'QUESTION' ? { answer: 'A' } : CONTENT[it.kind].right;
    const kinds: Record<string, string[]> = {};
    for (const code of ['LU_CHOICE', 'LU_MATCH', 'LU_ORDER', 'LU_FILL', 'LU_MEMORY', 'LU_VISUAL', 'LU_LISTEN', 'LU_MATH_STEPS', 'LU_TIMED', 'LU_FINAL']) {
      const s = await t.request('/api/student-standard/universe/sessions', 'POST', { templateCode: code, outcomeId: o.id }, 'stuuser');
      expect(s.response.status, `${code}: ${s.text}`).toBe(201);
      kinds[code] = [...new Set<string>(s.data.items.map((x: any) => x.kind))];
      const done = await t.request(`/api/student-standard/universe/sessions/${s.data.session.id}/submit`, 'POST', { answers: s.data.items.map((it: any) => ({ seq: it.seq, response: rightFor(it) })) }, 'stuuser');
      expect(done.data.session.correct, code).toBe(s.data.items.length);
      if (code === 'LU_MEMORY') expect(s.data.items[0].content.mode).toBe('MEMORY');
      if (code === 'LU_TIMED') expect(s.data.session).toMatchObject({ timed: true, secondsPerItem: 45 });
    }
    expect(kinds).toMatchObject({ LU_CHOICE: ['QUESTION'], LU_MATCH: ['PAIRS'], LU_ORDER: ['SEQUENCE'], LU_FILL: ['CLOZE'], LU_MEMORY: ['PAIRS'], LU_VISUAL: ['HOTSPOT'], LU_LISTEN: ['AUDIO_QUESTION'], LU_MATH_STEPS: ['STEPS'], LU_TIMED: ['QUESTION'] });
    expect(kinds.LU_FINAL.length).toBeGreaterThanOrEqual(2);
    // the timer can be switched off when starting
    const untimed = await t.request('/api/student-standard/universe/sessions', 'POST', { templateCode: 'LU_TIMED', outcomeId: o.id, timed: false, mode: 'REVIEW' }, 'stuuser');
    expect(untimed.data.session).toMatchObject({ timed: false, secondsPerItem: null });
  } finally { t.db.close(); }
}, 120000);

it('checks and approves content: institution content by its manager, platform content by the Super Admin, never with unclear rights', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    const o = t.db.prepare(`SELECT id FROM outcomes WHERE code='M.8.1.1'`).get() as any;
    t.db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','Müdür','x','x',1,'school')`);
    const pairs = { contentKind: 'PAIRS', outcomeId: o.id, public: CONTENT.PAIRS.public, answer: CONTENT.PAIRS.answer };
    expect((await t.request('/api/reporting/universe/contents', 'POST', { ...pairs, answer: { pairs: [['a', '9']] } }, 'teacher')).data.error.code).toBe('INVALID_CONTENT');
    expect((await t.request('/api/reporting/universe/contents', 'POST', pairs, 'stuuser')).response.status).toBe(403);
    const unclear = await t.request('/api/reporting/universe/contents', 'POST', pairs, 'teacher');
    expect(unclear.response.status, unclear.text).toBe(201);
    expect(t.db.prepare('SELECT owner_type,owner_id,review_status,copyright_status FROM lu_game_contents WHERE id=?').get(unclear.data.id)).toMatchObject({ owner_type: 'INSTITUTION', owner_id: 'school', review_status: 'REVIEW', copyright_status: 'UNKNOWN' });
    expect((await t.request(`/api/reporting/universe/contents/${unclear.data.id}/review`, 'POST', { decision: 'APPROVED' }, 'teacher')).response.status).toBe(403);
    expect((await asUser(t, 'mgr', `/api/reporting/universe/contents/${unclear.data.id}/review`, 'POST', { decision: 'APPROVED' })).data.error.code).toBe('RIGHTS_REQUIRED');
    const owned = await t.request('/api/reporting/universe/contents', 'POST', { ...pairs, copyrightStatus: 'OWNED' }, 'teacher');
    expect((await asUser(t, 'mgr', `/api/reporting/universe/contents/${owned.data.id}/review`, 'POST', { decision: 'APPROVED' })).data.status).toBe('APPROVED');
    const platform = await t.request('/api/reporting/universe/contents', 'POST', { ...pairs, copyrightStatus: 'OWNED' }, 'admin');
    expect(t.db.prepare('SELECT owner_type FROM lu_game_contents WHERE id=?').get(platform.data.id)).toMatchObject({ owner_type: 'PLATFORM' });
    expect((await asUser(t, 'mgr', `/api/reporting/universe/contents/${platform.data.id}/review`, 'POST', { decision: 'APPROVED' })).response.status).toBe(403);
    expect((await t.request(`/api/reporting/universe/contents/${platform.data.id}/review`, 'POST', { decision: 'APPROVED' }, 'admin')).data.status).toBe('APPROVED');
    t.db.exec(`UPDATE curriculum_versions SET verified=0 WHERE id=(SELECT curriculum_version_id FROM outcomes WHERE code='T.8.1.1')`);
    const tur = t.db.prepare(`SELECT id FROM outcomes WHERE code='T.8.1.1'`).get() as any;
    expect((await t.request('/api/reporting/universe/contents', 'POST', { ...pairs, outcomeId: tur.id }, 'teacher')).data.error.code).toBe('OUTCOME_NOT_VERIFIED');
    const listed = (await t.request(`/api/reporting/universe/contents?outcomeId=${o.id}`, 'GET', undefined, 'teacher')).data.contents.map((c: any) => c.id).sort();
    expect(listed).toEqual([owned.data.id, platform.data.id, unclear.data.id].sort());
  } finally { t.db.close(); }
}, 90000);
