import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { evaluatedExam } from './helpers/exam-flow';

/** video.anunex.com: a QR on the student sheet opens the solution video without an account — only for approved questions with an approved video. Synthetic data only. */
const VIDEO = new Uint8Array(1000).map((_, i) => i % 251);
async function world() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES('STUDIO','Studio','STANDARD',1);
    UPDATE platform_features SET enabled_default=1 WHERE feature_key='STUDIO';
    INSERT INTO question_bank(id,grade_level,subject_id,stem_text,options_json,correct_answer,review_status) VALUES('qa',8,'sub_tur','Bir?','["a","b","c","d"]','C','APPROVED'),('qb',8,'sub_tur','İki?','["a","b","c","d"]','A','REVIEW'),('qc',8,'sub_tur','Üç?','["a","b","c","d"]','D','APPROVED');
    INSERT INTO content_package_items(external_id,package,question_id,outcome_id,video_code) VALUES('x1','FEN5','qa','o_tur1','K7M2QPA'),('x2','FEN5','qb','o_tur1','R4XN8TB');
    INSERT INTO question_assets(id,question_id,asset_type,r2_key,approved) VALUES('va','qa','SOLUTION_VIDEO','video/qa.mp4',1),('vb','qb','SOLUTION_VIDEO','video/qb.mp4',1);
    INSERT INTO studio_documents(id,institution_id,created_by,document_type,title,grade_level,subject_id,status,config_json) VALUES('d1','school','teacher','WORKSHEET','Kuvvet testi',8,'sub_tur','READY','{}');
    INSERT INTO studio_document_items(document_id,question_id,booklet_code,sort_order) VALUES('d1','qa','A',1),('d1','qb','A',2),('d1','qc','A',3),('d1','qc','B',1),('d1','qb','B',2),('d1','qa','B',3);`);
  Object.assign(t.env, { FILES: {
    head: async (k: string) => (k.startsWith('video/') ? { size: VIDEO.length, httpMetadata: { contentType: 'video/mp4' } } : null),
    get: async (k: string, o?: any) => { if (!k.startsWith('video/')) return null; const s = o?.range?.offset ?? 0, l = o?.range?.length ?? VIDEO.length; const b = VIDEO.slice(s, s + l); return { body: b, arrayBuffer: async () => b.buffer } as any; },
  } });
  return t;
}

describe('video.anunex.com', () => {
  it('plays an approved question’s video without an account, with byte ranges', async () => {
    const t = await world();
    const info = await t.request('/api/public/video/k7m2qpa', 'GET', undefined, 'nobody');
    expect(info.response.status, info.text).toBe(200);
    expect(info.data.video).toMatchObject({ code: 'K7M2QPA', outcome: { code: 'T.8.1.1' } });
    expect(JSON.stringify(info.data)).not.toMatch(/"C"|correct/);                      // never the answer key
    const app = (await import('../worker/preview-policy-production-entry')).default as any;
    const res = await app.fetch(new Request('https://app.anunex.com/api/public/video/K7M2QPA/solution', { headers: { Range: 'bytes=100-199' } }), t.env, { waitUntil() {}, passThroughOnException() {} });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe(`bytes 100-199/${VIDEO.length}`);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('keeps unapproved and unknown codes closed', async () => {
    const t = await world();
    expect((await t.request('/api/public/video/R4XN8TB', 'GET', undefined, 'nobody')).data.error.code).toBe('VIDEO_NOT_PUBLIC');
    expect((await t.request('/api/public/video/R4XN8TB/solution', 'GET', undefined, 'nobody')).response.status).toBe(404);
    expect((await t.request('/api/public/video/NOPE999', 'GET', undefined, 'nobody')).response.status).toBe(404);
    expect((await t.request('/api/public/video/..%2Fx', 'GET', undefined, 'nobody')).data.error.code).toBe('VIDEO_NOT_FOUND');
    t.db.exec(`UPDATE question_assets SET approved=0 WHERE id='va'`);
    expect((await t.request('/api/public/video/K7M2QPA', 'GET', undefined, 'nobody')).data.error.code).toBe('VIDEO_NOT_PUBLIC');
  });

  it('prints the student sheet with a QR only where the video is public, per booklet, for the test’s owner', async () => {
    const t = await world();
    expect((await t.request('/api/teacher-tests/d1/solution-sheet', 'GET', undefined, 'stuuser')).response.status).toBe(403);
    const app = (await import('../worker/preview-policy-production-entry')).default as any;
    const get = async (q: string) => { const cookie = (await import('../worker/lib/auth')).createSession; const c = (await cookie(t.env, 'teacher', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
      return app.fetch(new Request(`https://app.anunex.com/api/teacher-tests/d1/solution-sheet${q}`, { headers: { Cookie: c } }), t.env, { waitUntil() {}, passThroughOnException() {} }) as Promise<Response>; };
    const a = await get('');
    expect(a.status).toBe(200);
    expect(a.headers.get('Content-Type')).toBe('application/pdf');
    expect(a.headers.get('X-Anunex-Videos')).toBe('1');                                  // qa only: qb waits for approval, qc has no video
    const pdf = await PDFDocument.load(await a.arrayBuffer());
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toContain('çözüm videoları');
    expect((await get('?booklet=B')).status).toBe(200);
    expect((await get('?booklet=C')).status).toBe(400);
  });
});
