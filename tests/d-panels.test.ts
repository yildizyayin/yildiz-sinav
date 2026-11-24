import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluatedExam } from './helpers/exam-flow';
import { properName } from '../src/lib/personName';
import app from '../worker/preview-policy-production-entry';
import { createSession } from '../worker/lib/auth';

/** D panels (owner, 11 Nov 2026): Canlı Ders off the staff/parent menus, Evren summaries, themes and sounds for parents. Synthetic data only. */
async function asUser(t: any, userId: string, path: string) {
  const cookie = (await createSession(t.env, userId, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { headers: { Cookie: cookie, Origin: 'https://app.anunex.com' } }), t.env, { waitUntil() {}, passThroughOnException() {} });
  return { response: res, data: await res.json().catch(() => null) as any };
}
async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LEARNING_UNIVERSE'`);
  const o = t.db.prepare(`SELECT o.id,o.subject_id,cv.academic_year y FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.code='M.8.1.1'`).get() as any;
  t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,?,'OUTCOME',?,8,'M.8.1.1','Sentetik')`).run(`ln_${o.id}`, o.y, o.subject_id);
  const q = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status) VALUES(?,'PLATFORM',?,8,?,'MULTIPLE_CHOICE',?,'["-32","32","-16","16"]','A',4,'OWNED','APPROVED')`);
  for (let i = 1; i <= 6; i++) { q.run(`lq${i}`, o.y, o.subject_id, `Sentetik soru ${i}`); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run(`lq${i}`, `ln_${o.id}`); }
  const c = t.db.prepare(`INSERT INTO lu_game_contents(id,content_kind,outcome_id,academic_year,grade_level,subject_id,public_json,answer_json,copyright_status,review_status) VALUES(?,?,?,?,8,?,?,?,?,?)`);
  const pairs = JSON.stringify({ left: [{ id: 'a', text: '2³' }, { id: 'b', text: '3²' }], right: [{ id: '1', text: '8' }, { id: '2', text: '9' }] });
  c.run('gc_pairs1', 'PAIRS', o.id, o.y, o.subject_id, pairs, JSON.stringify({ pairs: [['a', '1'], ['b', '2']] }), 'OWNED', 'APPROVED');
  c.run('gc_pairs_draft', 'PAIRS', o.id, o.y, o.subject_id, pairs, JSON.stringify({ pairs: [['a', '1'], ['b', '2']] }), 'OWNED', 'DRAFT');
  c.run('gc_pairs_rights', 'PAIRS', o.id, o.y, o.subject_id, pairs, JSON.stringify({ pairs: [['a', '1'], ['b', '2']] }), 'RESTRICTED', 'APPROVED');
  c.run('gc_seq1', 'SEQUENCE', o.id, o.y, o.subject_id, JSON.stringify({ items: [{ id: 'x', text: 'Üssü yaz' }, { id: 'y', text: 'Çarp' }, { id: 'z', text: 'Sonucu yaz' }] }), JSON.stringify({ order: ['x', 'y', 'z'] }), 'OWNED', 'APPROVED');
  c.run('gc_cloze1', 'CLOZE', o.id, o.y, o.subject_id, JSON.stringify({ text: '2³ = [b1]', blanks: [{ id: 'b1' }] }), JSON.stringify({ blanks: { b1: { numeric: { value: 8 } } } }), 'OWNED', 'APPROVED');
  return { t, o };
}

it('names stored in plain capitals read as written; Turkish capitals keep Turkish casing', () => {
  expect(properName('ALI')).toBe('Ali');
  expect(properName('ALİ')).toBe('Ali');
  expect(properName('IŞIK')).toBe('Işık');
  expect(properName('İPEK')).toBe('İpek');
  expect(properName('elif')).toBe('Elif');
  expect(properName('')).toBe('');
});

it('Canlı Ders is gone from the manager, teacher, guidance and parent menus; Super Admin keeps it', () => {
  const lay = readFileSync('src/components/Layout.tsx', 'utf8');
  const block = (role: string, from = 0) => { const i = lay.indexOf(`\n  ${role}: [`, from); return lay.slice(i, lay.indexOf('\n  ],', i)); };
  for (const role of ['INSTITUTION_MANAGER', 'TEACHER', 'GUIDANCE_TEACHER', 'PARENT']) {
    let at = 0;
    for (let k = 0; k < 2; k++) { const i = lay.indexOf(`\n  ${role}: [`, at); if (i < 0) break; expect(block(role, at), role).not.toContain("'/live-lessons'"); at = i + 1; }
  }
  expect(block('SUPER_ADMIN')).toContain("'/live-lessons'");
  expect(readFileSync('src/pages/InstitutionPanelV2.tsx', 'utf8')).toContain("ACTIVE:'Hazır'");
});

it('parents choose among the approved themes; the manager sees the institution Evren week', async () => {
  const { t, o } = await setup();
  try {
    const keys = async (who: string) => ((await t.request('/api/panel-experience', 'GET', undefined, who)).data.allowedThemes || []).map((x: any) => x.theme_key).sort();
    expect(await keys('parent')).toEqual(['ANUNEX_COSMIC', 'ANUNEX_FOCUS', 'ANUNEX_NEON', 'ANUNEX_STANDARD']);
    expect(await keys('teacher')).toEqual(['ANUNEX_STANDARD']);

    t.db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','Sentetik Müdür','x','x',1,'school')`);
    const s = await t.request('/api/student-standard/universe/sessions', 'POST', { templateCode: 'LU_MATCH', outcomeId: o.id }, 'stuuser');
    await t.request(`/api/student-standard/universe/sessions/${s.data.session.id}/submit`, 'POST', { answers: s.data.items.map((it: any) => ({ seq: it.seq, response: { pairs: [] } })) }, 'stuuser');
    const u = await asUser(t, 'mgr', '/api/reporting/universe/institution-usage');
    expect(u.response.status).toBe(200);
    expect(u.data).toMatchObject({ enabled: true, days: 7, plays: 1, students: 1, nibiruExams: 0, tasks: { active: 0 }, contentWaiting: 0 });
    expect(JSON.stringify(u.data)).not.toMatch(/s1|ALI|YILMAZ/i);
    expect((await t.request('/api/reporting/universe/institution-usage', 'GET', undefined, 'teacher')).response.status).toBe(403);
    t.db.exec(`UPDATE platform_features SET enabled_default=0 WHERE feature_key='LEARNING_UNIVERSE'`);
    expect((await asUser(t, 'mgr', '/api/reporting/universe/institution-usage')).data).toEqual({ ok: true, enabled: false });
  } finally { t.db.close(); }
}, 90000);
