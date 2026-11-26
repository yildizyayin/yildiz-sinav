import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { mediaKey } from '../worker/lib/content-package';
import app from '../worker/preview-policy-production-entry';
import { createSession } from '../worker/lib/auth';
import { verifyQuestionMediaIntegrity } from '../worker/lib/question-media-integrity';

/** İçerik Paketi: Super Admin only; media hashed and sealed on upload; questions REVIEW + AI_GENERATED; a re-run adds nothing; a missing outcome holds its questions. Synthetic data only. */
const bytes = (s: string) => new TextEncoder().encode(s);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const IMG = bytes('jpeg-bytes'), VID = bytes('mp4-bytes-1'), VID2 = bytes('mp4-bytes-2'), TOPIC = bytes('topic-mp4');
const m = (b: Uint8Array) => ({ sha256: sha(b), bytes: b.length });
const q = (n: number, o: Record<string, unknown> = {}) => ({ id: `FB511-0${n}`, outcome: 'FB.5.1.1', stem: `Güneş ile ilgili ${n}. soru hangisidir?`, options: { A: 'bir', B: 'iki', C: 'üç', D: 'dört' }, answer: 'B', solution: 'Çünkü iki.', hint: 'İpucu', difficulty: 2, video: m(n === 1 ? VID : VID2), image: n === 1 ? { ...m(IMG), alt: 'Güneş şeması' } : null, ...o });
const body = (questions: any[], extra: any = {}) => ({ package: 'fen-5', gradeLevel: 5, sourceLabel: 'ANUNEX · 5. Sınıf Fen', copyrightStatus: 'OWNED', outcome: { code: 'FB.5.1.1', topic: { ...m(TOPIC), seconds: 197 } }, questions, ...extra });

async function setup() {
  const t = await evaluatedExam('direct');
  const store = new Map<string, { body: Uint8Array; meta: any }>();
  t.env.FILES = {
    head: async (k: string) => (store.has(k) ? { size: store.get(k)!.body.length, customMetadata: store.get(k)!.meta } : null),
    get: async (k: string) => (store.has(k) ? { size: store.get(k)!.body.length, arrayBuffer: async () => store.get(k)!.body.buffer } : null),
    put: async (k: string, b: ArrayBuffer, o: any) => { store.set(k, { body: new Uint8Array(b), meta: o?.customMetadata || {} }); },
  };
  t.db.exec(`INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,verified,program_code,authority) VALUES('cv5','2027-2028',5,'MAARIF-2027',1,'SCHOOL','MEB');
    INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,topic,title,official,active) VALUES('o511','cv5','sub_fen',5,'FB.5.1.1','Güneş','Güneş’in yapısı.',1,1);`);
  const cookie = (await createSession(t.env, 'admin', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const up = async (b: Uint8Array, type: string, hash = sha(b)) => {
    const res = await (app as any).fetch(new Request(`https://app.anunex.com/api/admin/content-package/media/${hash}`, { method: 'PUT', headers: { Cookie: cookie, Origin: 'https://app.anunex.com', 'Content-Type': type }, body: b }), t.env, { waitUntil() {}, passThroughOnException() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { data = text; }
    return { response: res, data, text };
  };
  return { ...t, store, up };
}

describe('content package import', () => {
  it('is for the Super Admin only', async () => {
    const t = await setup();
    for (const who of ['teacher', 'stuuser']) expect((await t.request('/api/admin/content-package/preview', 'POST', body([q(1)]), who)).response.status).toBe(403);
  });

  it('previews, takes only files whose hash matches, then imports REVIEW questions with sealed media and the topic video', async () => {
    const t = await setup();
    let r = await t.request('/api/admin/content-package/preview', 'POST', body([q(1), q(2), q(3, { answer: 'E' })]));
    expect(r.response.status, r.text).toBe(200);
    expect(r.data.summary).toMatchObject({ total: 3, needsMedia: 2, invalid: 1 });
    expect(r.data.topic.status).toBe('NEEDS_MEDIA');
    expect(r.data.need.map((n: any) => n.sha256).sort()).toEqual([sha(IMG), sha(VID), sha(VID2), sha(TOPIC)].sort());
    const up = t.up;
    expect((await up(VID, 'video/mp4', sha(VID2))).response.status).toBe(422);          // wrong bytes for this hash
    expect((await up(VID, 'text/plain')).response.status).toBe(415);
    for (const [b, type] of [[IMG, 'image/jpeg'], [VID, 'video/mp4'], [VID2, 'video/mp4'], [TOPIC, 'video/mp4']] as const) expect((await up(b, type)).data.stored).toBe(true);
    expect((await up(VID, 'video/mp4')).data.stored).toBe(false);                     // already there: nothing re-sent
    expect((await t.request('/api/admin/content-package/commit', 'POST', body([q(1), q(2)]))).response.status).toBe(400); // no confirm
    r = await t.request('/api/admin/content-package/commit', 'POST', { ...body([q(1), q(2), q(3, { answer: 'E' })]), confirm: true });
    expect(r.response.status, r.text).toBe(200);
    expect(r.data.created).toBe(2);
    expect(r.data.summary).toMatchObject({ exists: 2, invalid: 1 });
    expect(r.data.topic.status).toBe('EXISTS');
    const rows = t.db.prepare(`SELECT q.review_status,q.origin_kind,q.source_label,q.correct_answer,i.external_id,i.video_code,i.hint FROM content_package_items i JOIN question_bank q ON q.id=i.question_id ORDER BY i.external_id`).all() as any[];
    expect(rows.map((x) => [x.review_status, x.origin_kind, x.source_label, x.external_id])).toEqual([
      ['REVIEW', 'AI_GENERATED', 'ANUNEX · 5. Sınıf Fen · FB511-01', 'FB511-01'], ['REVIEW', 'AI_GENERATED', 'ANUNEX · 5. Sınıf Fen · FB511-02', 'FB511-02']]);
    expect(rows[0].video_code).toMatch(/^[A-Z2-9]{7}$/);
    expect(rows[0].video_code).not.toBe(rows[1].video_code);
    const qid = (t.db.prepare(`SELECT question_id FROM content_package_items WHERE external_id='FB511-01'`).get() as any).question_id;
    const assets = t.db.prepare(`SELECT asset_type,placement,r2_key,byte_sha256,sealed_at FROM question_assets WHERE question_id=? ORDER BY asset_type`).all(qid) as any[];
    expect(assets.map((a) => [a.asset_type, a.placement, a.r2_key])).toEqual([['IMAGE', 'STEM', mediaKey(sha(IMG))], ['SOLUTION_VIDEO', 'SOLUTION', mediaKey(sha(VID))]]);
    expect(await verifyQuestionMediaIntegrity(t.env, qid)).toEqual({ ok: true });        // the review gate accepts the sealed media
    expect(t.db.prepare(`SELECT count(*) n FROM question_learning_links WHERE question_id=? AND node_id='ln_o511'`).get(qid)).toMatchObject({ n: 1 });
    const topic = t.db.prepare(`SELECT t.video_code,v.provider,v.approved,v.duration_seconds FROM content_package_topics t JOIN learning_videos v ON v.id=t.learning_video_id`).get() as any;
    expect(topic).toMatchObject({ provider: 'R2', approved: 0, duration_seconds: 197 });
    // a second run adds nothing
    const before = (t.db.prepare('SELECT count(*) n FROM question_bank').get() as any).n;
    r = await t.request('/api/admin/content-package/commit', 'POST', { ...body([q(1), q(2)]), confirm: true });
    expect(r.data.created).toBe(0);
    expect((t.db.prepare('SELECT count(*) n FROM question_bank').get() as any).n).toBe(before);
    expect((t.db.prepare('SELECT count(*) n FROM content_package_topics').get() as any).n).toBe(1);
  });

  it('holds the questions of an outcome that is not in the verified program, and rejects a bad package header', async () => {
    const t = await setup();
    let r = await t.request('/api/admin/content-package/preview', 'POST', body([q(1, { outcome: 'FB.5.7.1' })], { outcome: { code: 'FB.5.7.1' } }));
    expect(r.data.outcomeError).toContain('FB.5.7.1');
    expect(r.data.summary).toMatchObject({ held: 1 });
    r = await t.request('/api/admin/content-package/commit', 'POST', { ...body([q(1)], { copyrightStatus: 'RESTRICTED' }), confirm: true });
    expect(r.response.status).toBe(400);
    expect(r.data.errors.join(' ')).toContain('Telif');
    expect((t.db.prepare('SELECT count(*) n FROM content_package_items').get() as any).n).toBe(0);
  });
});
