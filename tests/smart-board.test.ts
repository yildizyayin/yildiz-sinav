import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import app from '../worker/preview-policy-production-entry';
import { createSession } from '../worker/lib/auth';
import { solutionSteps } from '../worker/lib/smart-board';

/** Akıllı tahta API: one lesson payload per test; images and videos stream from storage with byte ranges; only the test's owner (or manager) opens it; a topic video only once approved. Synthetic data only. */
const VIDEO = new TextEncoder().encode('0123456789abcdefghij');
async function setup() {
  const t = await evaluatedExam('direct');
  const store = new Map<string, Uint8Array>([['question-media/immutable/aa/vid', VIDEO], ['question-media/immutable/bb/img', new TextEncoder().encode('jpeg')], ['question-media/immutable/cc/topic', new TextEncoder().encode('topic-video')]]);
  t.env.FILES = {
    head: async (k: string) => (store.has(k) ? { size: store.get(k)!.length, httpMetadata: {} } : null),
    get: async (k: string, o?: any) => { const b = store.get(k); if (!b) return null; const part = o?.range ? b.slice(o.range.offset, o.range.offset + o.range.length) : b; return { body: part, size: b.length }; },
  };
  t.db.exec(`INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES('STUDIO','Studio','STANDARD',1);
    UPDATE platform_features SET enabled_default=1 WHERE feature_key='STUDIO';
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('teacher2','TEACHER','Öteki','unused','unused',1,'school');
    INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,verified,program_code,authority) VALUES('cv5','2027-2028',5,'M',1,'SCHOOL','MEB');
    INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,topic,title,official,active) VALUES('o521','cv5','sub_tur',5,'FB.5.2.1','Kuvvet','Kuvveti büyüklüğü ile tanımlayabilme',1,1);
    INSERT INTO question_bank(id,grade_level,subject_id,stem_text,options_json,correct_answer,solution_text,review_status) VALUES
      ('q1',5,'sub_tur','Kapıyı çeken kuvvet hangisidir?','[{"label":"A","text":"İtme"},{"label":"B","text":"Çekme"}]','B','Kol kendine doğru hareket eder. Bu bir çekme kuvvetidir.','APPROVED'),
      ('q2',5,'sub_tur','İkinci soru?','["bir","iki"]','A',NULL,'APPROVED');
    INSERT INTO question_learning_links(question_id,node_id) VALUES('q1','ln_o521');
    INSERT INTO question_assets(id,question_id,asset_type,r2_key,approved,placement,alt_text,mime_type) VALUES
      ('img1','q1','IMAGE','question-media/immutable/bb/img',1,'STEM','Kapı şeması','image/jpeg'),
      ('vid1','q1','SOLUTION_VIDEO','question-media/immutable/aa/vid',1,'SOLUTION','çözüm','video/mp4'),
      ('ext2','q2','SOLUTION_VIDEO',NULL,1,'SOLUTION',NULL,NULL);
    UPDATE question_assets SET external_url='https://example.test/v' WHERE id='ext2';
    INSERT INTO learning_videos(id,provider,url,title,approved,active,duration_seconds) VALUES('lv1','R2','r2:question-media/immutable/cc/topic','Konu',0,1,190);
    INSERT INTO content_package_topics(outcome_id,package,learning_video_id,r2_key,byte_sha256,byte_size,video_code) VALUES('o521','fb-5','lv1','question-media/immutable/cc/topic','x',11,'TOPIC01');
    INSERT INTO studio_documents(id,institution_id,created_by,document_type,title,grade_level,status,config_json) VALUES('doc1','school','teacher','WORKSHEET','Kuvvet testi',5,'READY','{}');
    INSERT INTO studio_document_items(document_id,question_id,booklet_code,sort_order) VALUES('doc1','q1','A',1),('doc1','q2','A',2),('doc1','q2','B',1),('doc1','q1','B',2);`);
  const cookie = async (id: string) => (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const raw = async (path: string, who = 'teacher', headers: Record<string, string> = {}) => (app as any).fetch(new Request(`https://app.anunex.com${path}`, { headers: { Cookie: await cookie(who), ...headers } }), t.env, { waitUntil() {}, passThroughOnException() {} }) as Promise<Response>;
  return { ...t, raw };
}

describe('akıllı tahta', () => {
  it('splits a written solution into steps the class reveals one by one', () => {
    expect(solutionSteps('Kol kendine doğru hareket eder. Bu bir çekme kuvvetidir.')).toEqual(['Kol kendine doğru hareket eder.', 'Bu bir çekme kuvvetidir.']);
    expect(solutionSteps('1. adım\n2. adım\n\n3. adım')).toEqual(['1. adım', '2. adım', '3. adım']);
    expect(solutionSteps(Array.from({ length: 12 }, (_, k) => `Adım ${k}.`).join(' '))).toHaveLength(6);
    expect(solutionSteps(null)).toEqual([]);
  });

  it('gives the owner the whole lesson in booklet A order, with media links and no unapproved topic video', async () => {
    const t = await setup();
    const r = await t.request('/api/board/doc1', 'GET', undefined, 'teacher');
    expect(r.response.status, r.text).toBe(200);
    expect(r.data.items.map((i: any) => i.id)).toEqual(['q1', 'q2']);
    const q1 = r.data.items[0];
    expect(q1).toMatchObject({ answer: 'B', outcome: { code: 'FB.5.2.1' }, steps: ['Kol kendine doğru hareket eder.', 'Bu bir çekme kuvvetidir.'],
      images: [{ id: 'img1', url: '/api/board/doc1/media/img1', alt: 'Kapı şeması' }], solutionVideo: { kind: 'FILE', url: '/api/board/doc1/media/vid1' }, topicVideo: null });
    expect(q1.options.map((o: any) => o.label + o.text)).toEqual(['Aİtme', 'BÇekme']);
    expect(r.data.items[1]).toMatchObject({ options: [{ label: 'A', text: 'bir' }, { label: 'B', text: 'iki' }], solutionVideo: { kind: 'LINK', url: 'https://example.test/v' }, steps: [] });
    t.db.exec(`UPDATE learning_videos SET approved=1 WHERE id='lv1'`);
    const again = await t.request('/api/board/doc1', 'GET', undefined, 'teacher');
    expect(again.data.items[0].topicVideo).toEqual({ url: '/api/board/doc1/topic/o521', seconds: 190 });
  });

  it('streams videos with byte ranges so they start at once and can be sought', async () => {
    const t = await setup();
    let res = await t.raw('/api/board/doc1/media/vid1');
    expect(res.status).toBe(200);
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect(await res.text()).toBe('0123456789abcdefghij');
    res = await t.raw('/api/board/doc1/media/vid1', 'teacher', { Range: 'bytes=5-9' });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 5-9/20');
    expect(await res.text()).toBe('56789');
    res = await t.raw('/api/board/doc1/media/vid1', 'teacher', { Range: 'bytes=15-' });
    expect(res.headers.get('Content-Range')).toBe('bytes 15-19/20');
    expect((await t.raw('/api/board/doc1/media/vid1', 'teacher', { Range: 'bytes=40-' })).status).toBe(416);
    expect((await t.raw('/api/board/doc1/topic/o521')).status).toBe(404);          // not approved yet
    t.db.exec(`UPDATE learning_videos SET approved=1 WHERE id='lv1'`);
    expect(await (await t.raw('/api/board/doc1/topic/o521')).text()).toBe('topic-video');
  });

  it('opens only for the test’s own teacher (or the manager), and only the test’s own media', async () => {
    const t = await setup();
    expect((await t.request('/api/board/doc1', 'GET', undefined, 'stuuser')).response.status).toBe(403);
    t.db.exec(`UPDATE studio_documents SET created_by='teacher2' WHERE id='doc1'`);          // another teacher's test
    expect((await t.request('/api/board/doc1', 'GET', undefined, 'teacher')).response.status).toBe(403);
    expect((await t.raw('/api/board/doc1/media/vid1')).status).toBe(403);
    expect((await t.request('/api/board/doc1', 'GET', undefined, 'admin')).response.status).toBe(200);
    t.db.exec(`UPDATE studio_documents SET created_by='teacher' WHERE id='doc1'`);
    t.db.exec(`INSERT INTO question_bank(id,grade_level,subject_id,stem_text,options_json,correct_answer,review_status) VALUES('q9',5,'sub_tur','Başka?','[]','A','APPROVED');
      INSERT INTO question_assets(id,question_id,asset_type,r2_key,approved,placement,mime_type) VALUES('vid9','q9','SOLUTION_VIDEO','question-media/immutable/aa/vid',1,'SOLUTION','video/mp4');`);
    expect((await t.raw('/api/board/doc1/media/vid9')).status).toBe(404);
    expect((await t.request('/api/board/nope', 'GET', undefined, 'teacher')).response.status).toBe(404);
  });
});
