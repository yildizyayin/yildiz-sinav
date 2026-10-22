import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

/**
 * A033: the exam document archive. Answer key, exam PDF, videos and other files open on the right exam,
 * for the right people only. Real schema, production entry chain, in-memory file store.
 */
function memoryBucket() {
  const files = new Map<string, { bytes: Uint8Array; type?: string }>();
  return {
    files,
    async put(key: string, body: ReadableStream | ArrayBuffer | string, opts?: any) { const bytes = new Uint8Array(await new Response(body as any).arrayBuffer()); files.set(key, { bytes, type: opts?.httpMetadata?.contentType }); return {}; },
    async get(key: string) { const f = files.get(key); return f ? { body: new Blob([f.bytes]).stream(), writeHttpMetadata(h: Headers) { if (f.type) h.set('Content-Type', f.type); } } : null; },
    async delete(key: string) { files.delete(key); },
  };
}
async function setup() {
  const t = await evaluatedExam('direct');
  (t.env as any).FILES = memoryBucket();
  t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('other','Other School','OTHER','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','M','u','u',1,'school'),('othermgr','INSTITUTION_MANAGER','O','u','u',1,'other');`);
  const extra: Record<string, string> = {};
  for (const id of ['mgr', 'othermgr']) extra[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const upload = async (as: string, kind: string, name: string, type: string, text: string) => {
    const form = new FormData(); form.set('documentKind', kind); form.set('file', new File([text], name, { type }));
    return as === 'mgr' || as === 'othermgr'
      ? (async () => { const app = (await import('../worker/preview-policy-production-entry')).default as any; const res = await app.fetch(new Request(`https://app.anunex.com/api/exam-content/${t.examId}/assets`, { method: 'POST', headers: { Cookie: extra[as], Origin: 'https://app.anunex.com' }, body: form }), t.env, { waitUntil() {} }); return { response: res, data: await res.json() as any, text: '' }; })()
      : t.request(`/api/exam-content/${t.examId}/assets`, 'POST', form, as);
  };
  const asExtra = async (as: string, path: string) => { const app = (await import('../worker/preview-policy-production-entry')).default as any; const res = await app.fetch(new Request(`https://app.anunex.com${path}`, { headers: { Cookie: extra[as] } }), t.env, { waitUntil() {} }); return { status: res.status, text: await res.text() }; };
  return { ...t, upload, asExtra };
}

describe('A033: exam document archive', () => {
  it('opens the archive (it failed for everyone: missing column, broken insert, EXAM videos refused) and keeps each file on its own exam and audience', async () => {
    const t = await setup();
    try {
      const key = await t.upload('admin', 'ANSWER_KEY_PDF', 'cevap-anahtari.pdf', 'application/pdf', '%PDF-anahtar');
      expect(key.response.status, JSON.stringify(key.data)).toBe(201);
      const pdf = await t.upload('admin', 'EXAM_PDF', 'kitapcik.pdf', 'application/pdf', '%PDF-kitapcik');
      expect(pdf.response.status).toBe(201);
      const video = await t.request(`/api/exam-content/${t.examId}/videos`, 'POST', { url: 'https://video.example/cozum', title: 'Genel çözüm', linkType: 'EXAM', publishMode: 'NOW', description: 'Tüm sorular' });
      expect(video.response.status, video.text).toBe(201);
      const draft = await t.request(`/api/exam-content/${t.examId}/videos`, 'POST', { url: 'https://video.example/taslak', title: 'Taslak video', linkType: 'EXAM', publishMode: 'DRAFT' });
      expect(draft.response.status).toBe(201);

      const list = await t.request(`/api/exam-content/${t.examId}`);
      expect(list.response.status, list.text).toBe(200);
      expect(list.data.assets.map((a: any) => a.asset_type).sort()).toEqual(['EXAM_PDF', 'SOURCE_ANSWER_KEY']);
      expect(list.data.videos.map((v: any) => v.title).sort()).toEqual(['Genel çözüm', 'Taslak video']);

      // the institution teacher sees the staff files and published videos, not drafts
      const teacher = await t.request(`/api/exam-content/${t.examId}`, 'GET', undefined, 'teacher');
      expect(teacher.response.status, teacher.text).toBe(200);
      expect(teacher.data.assets.map((a: any) => a.asset_type).sort()).toEqual(['EXAM_PDF', 'SOURCE_ANSWER_KEY']);
      expect(teacher.data.videos.map((v: any) => v.title)).toEqual(['Genel çözüm']);
      const dl = await t.request(`/api/exam-content/${t.examId}/assets/${key.data.id}`, 'GET', undefined, 'teacher');
      expect(dl.response.status).toBe(200);
      expect(dl.text).toBe('%PDF-anahtar');
      expect(dl.response.headers.get('Cache-Control')).toContain('no-store');

      // another institution, and an asset reached through another exam's address, are refused
      expect((await t.asExtra('othermgr', `/api/exam-content/${t.examId}`)).status).toBe(404);
      expect((await t.asExtra('othermgr', `/api/exam-content/${t.examId}/assets/${key.data.id}`)).status).toBe(404);
      const copy = await t.request(`/api/exam-definitions/${t.examId}/copy`, 'POST');
      expect((await t.request(`/api/exam-content/${copy.data.id}/assets/${key.data.id}`)).response.status).toBe(404);
      // a manager cannot change a central exam's archive
      expect((await t.upload('mgr', 'EXAM_PDF', 'x.pdf', 'application/pdf', '%PDF')).response.status).toBe(403);

      // students and parents: nothing before the results are published to them
      for (const as of ['stuuser', 'parent']) expect((await t.request(`/api/exam-content/${t.examId}`, 'GET', undefined, as)).response.status, as).toBe(404);
      expect((await t.request(`/api/exam-content/${t.examId}/assets/${pdf.data.id}`, 'GET', undefined, 'stuuser')).response.status).toBe(404);
      expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
      expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
      const student = await t.request(`/api/exam-content/${t.examId}`, 'GET', undefined, 'stuuser');
      expect(student.response.status, student.text).toBe(200);
      expect(student.data.assets.map((a: any) => a.asset_type)).toEqual(['EXAM_PDF']);
      expect(student.data.videos.map((v: any) => v.title)).toEqual(['Genel çözüm']);
      expect((await t.request(`/api/exam-content/${t.examId}/assets/${pdf.data.id}`, 'GET', undefined, 'stuuser')).text).toBe('%PDF-kitapcik');
      expect((await t.request(`/api/exam-content/${t.examId}/assets/${key.data.id}`, 'GET', undefined, 'stuuser')).response.status).toBe(404);
      expect((await t.request(`/api/exam-content/${t.examId}`, 'GET', undefined, 'parent')).data.assets.map((a: any) => a.asset_type)).toEqual(['EXAM_PDF']);

      // removed from the app: closed to the institution and its students; the Super Admin keeps access
      expect((await t.request(`/api/admin/exams/${t.examId}/trash`, 'POST', { scope: 'APP' })).response.status).toBe(200);
      for (const as of ['teacher', 'stuuser']) expect((await t.request(`/api/exam-content/${t.examId}`, 'GET', undefined, as)).response.status, as).toBe(404);
      expect((await t.request(`/api/exam-content/${t.examId}`)).response.status).toBe(200);
      const audit = t.db.prepare(`SELECT action FROM audit_logs WHERE action LIKE 'EXAM_ARCHIVE_ASSET_%' ORDER BY rowid`).all().map((r: any) => r.action);
      expect(audit).toContain('EXAM_ARCHIVE_ASSET_UPLOADED');
      expect(audit).toContain('EXAM_ARCHIVE_ASSET_DOWNLOADED');
    } finally { t.db.close(); }
  }, 60000);
});
