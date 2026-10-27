import type { AuthUser, Env } from '../types';
import { all, audit, one } from './db';

/**
 * S036 Veri Merkezi and Belge Merkezi (owner decisions 27 Oct):
 * - every upload: the original TXT/DAT (kept one academic year), the data as read (row by row), the results;
 * - documents of the exams the school took: answer key, outcome list, booklet (only what the publisher made visible
 *   to schools; Super Admin-only files never leave), and the optic's form/FMT.
 * Every download is written to the audit log. Scope: Super Admin all, a school its own, a dealer its region.
 */
export const academicYearEnd = (academicYear: unknown, now = new Date()) => {
  const m = String(academicYear || '').match(/^(\d{4})\s*[-–]\s*(\d{4})$/);
  const endYear = m ? Number(m[2]) : (now.getUTCMonth() >= 8 ? now.getUTCFullYear() + 1 : now.getUTCFullYear());
  return `${endYear}-08-31T23:59:59Z`;
};
const safeName = (s: string) => String(s || 'yukleme.txt').normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'yukleme.txt';
async function sha256(bytes: ArrayBuffer) { const d = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

/** Keeps the uploaded file as it was. A storage failure never blocks the evaluation; it is logged. */
export async function storeOriginalUpload(env: Env, args: { batchId: string; institutionId: string; academicYear: string; file: File }) {
  try {
    if (!env.FILES) return;
    const bytes = await args.file.arrayBuffer();
    const key = `scan-uploads/${args.academicYear || 'yil'}/${args.institutionId}/${args.batchId}/${safeName(args.file.name)}`;
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: args.file.type || 'text/plain', cacheControl: 'private, no-store' } });
    await env.DB.prepare(`INSERT OR REPLACE INTO scan_batch_files(batch_id,object_key,file_name,content_type,size_bytes,sha256,retain_until) VALUES(?,?,?,?,?,?,?)`)
      .bind(args.batchId, key, args.file.name || 'yukleme.txt', args.file.type || 'text/plain', bytes.byteLength, await sha256(bytes), academicYearEnd(args.academicYear)).run();
  } catch (error) { console.error('Original upload could not be kept', error); }
}

/** Deletes originals whose academic year is over (R2 object first, then the row). */
export async function purgeExpiredOriginals(env: Env, limit = 200) {
  const rows = await all<{ batch_id: string; object_key: string }>(env.DB.prepare(`SELECT batch_id,object_key FROM scan_batch_files WHERE retain_until<? ORDER BY retain_until LIMIT ?`).bind(new Date().toISOString(), limit));
  for (const r of rows) { try { await env.FILES.delete(r.object_key); await env.DB.prepare('DELETE FROM scan_batch_files WHERE batch_id=?').bind(r.batch_id).run(); } catch (error) { console.error('Original purge failed', r.batch_id, error); } }
  return rows.length;
}

export type Scope = { sql: string; args: unknown[] };

/** Uploads in scope with what can be downloaded for each. */
export async function listDataBatches(env: Env, scope: Scope, filters: { examId?: string; year?: string; q?: string }) {
  const where: string[] = [], args: unknown[] = [];
  if (filters.examId) { where.push('b.exam_id=?'); args.push(filters.examId); }
  if (filters.year) { where.push('e.academic_year=?'); args.push(filters.year); }
  if (filters.q) { where.push('(upper(i.name) LIKE ? OR upper(e.title) LIKE ?)'); const q = `%${filters.q.toLocaleUpperCase('tr-TR')}%`; args.push(q, q); }
  const rows = await all<any>(env.DB.prepare(`SELECT b.id,b.status,b.source_type,b.created_at,b.exam_id,b.institution_id,e.title,e.academic_year,e.exam_type,COALESCE(NULLIF(e.publisher_name,''),'') publisher_name,
      i.name institution_name,COALESCE(i.meb_code,i.code) institution_code,i.city,i.district,
      (SELECT count(*) FROM scan_records r WHERE r.batch_id=b.id) total,
      (SELECT count(*) FROM scan_records r WHERE r.batch_id=b.id AND r.resolution_status='CANCELLED') set_aside,
      f.file_name original_name,f.size_bytes original_size,f.retain_until
    FROM scan_batches b JOIN exams e ON e.id=b.exam_id JOIN institutions i ON i.id=b.institution_id LEFT JOIN scan_batch_files f ON f.batch_id=b.id
    WHERE 1=1${scope.sql.replace(/ep\.institution_id/g, 'b.institution_id')}${where.length ? ' AND ' + where.join(' AND ') : ''}
    ORDER BY b.created_at DESC,b.rowid DESC LIMIT 300`).bind(...scope.args, ...args));
  return rows.map((r) => ({ ...r, has_original: !!r.original_name }));
}

/** The data exactly as the optic was read: one row per sheet, tests as answer strings. */
export async function readData(env: Env, batchId: string) {
  const rows = await all<any>(env.DB.prepare(`SELECT row_no,canonical_json,match_status,resolution_status,issues_json FROM scan_records WHERE batch_id=? ORDER BY row_no`).bind(batchId));
  const codes = new Set<string>();
  const parsed = rows.map((r) => { let c: any = {}; try { c = JSON.parse(r.canonical_json || '{}'); } catch { /* */ } for (const k of Object.keys(c.answers_by_subject || {})) codes.add(k); let issues: string[] = []; try { issues = JSON.parse(r.issues_json || '[]'); } catch { /* */ } return { r, c, issues }; });
  const subjects = [...codes];
  const headers = ['Satır', 'Öğrenci no', 'Ad soyad', 'Sınıf/şube', 'Kitapçık', ...subjects, 'Durum', 'Not'];
  const data = parsed.map(({ r, c, issues }) => [r.row_no, c.student_number || '', c.name || '', c.class_name || [c.grade_level, c.section].filter(Boolean).join('') || '', c.booklet || '',
    ...subjects.map((k) => String(c.answers_by_subject?.[k] ?? '')), r.resolution_status === 'CANCELLED' ? 'Değerlendirme dışı' : 'Değerlendirmede', issues.join(' · ')]);
  return { headers, rows: data };
}

export async function originalObject(env: Env, batchId: string) {
  const f = await one<any>(env.DB.prepare('SELECT object_key,file_name,content_type FROM scan_batch_files WHERE batch_id=?').bind(batchId));
  if (!f) return null;
  const object = await env.FILES.get(f.object_key);
  return object ? { object, fileName: f.file_name, contentType: f.content_type || 'text/plain' } : null;
}

export async function logDownload(env: Env, user: AuthUser, institutionId: string | null, kind: string, entity: string, entityId: string, details: Record<string, unknown> = {}) {
  await audit(env.DB, user.id, institutionId, 'RESULT_DATA_DOWNLOADED', entity, entityId, { kind, ...details });
}

const DOC_LABEL: Record<string, string> = { PLAIN_ANSWER_KEY_PDF: 'Cevap anahtarı', QUALIFIED_ANSWER_KEY: 'Kazanım listesi (kazanımlı cevap anahtarı)', SOURCE_ANSWER_KEY: 'Cevap anahtarı (kaynak dosya)', EXAM_PDF: 'Sınav kitapçığı', OTHER: 'Diğer belge' };
/**
 * Documents of the exams that have results in scope. Only files the Super Admin made visible to schools
 * (INSTITUTION_TEACHER, STUDENT or PUBLIC); SUPER_ADMIN files (e.g. a booklet without publisher permission) stay hidden.
 * Optic forms and FMT files of the optics these uploads were read with.
 */
export async function listDocuments(env: Env, scope: Scope, isSuperAdmin: boolean) {
  const exams = await all<any>(env.DB.prepare(`SELECT DISTINCT e.id,e.title,e.academic_year,e.exam_type,COALESCE(NULLIF(e.publisher_name,''),'') publisher_name FROM scan_batches b JOIN exams e ON e.id=b.exam_id JOIN institutions i ON i.id=b.institution_id
    WHERE b.status='COMMITTED'${scope.sql.replace(/ep\.institution_id/g, 'b.institution_id')} ORDER BY e.academic_year DESC,e.title LIMIT 200`).bind(...scope.args));
  if (!exams.length) return [];
  const ids = JSON.stringify(exams.map((e) => e.id));
  const docs = await all<any>(env.DB.prepare(`SELECT id,exam_id,asset_type,booklet_code,file_name,mime_type,byte_size,version FROM exam_document_assets WHERE exam_id IN (SELECT value FROM json_each(?)) AND status='READY' AND asset_type<>'PUBLISHER_LOGO'
    AND (? OR visibility IN ('INSTITUTION_TEACHER','STUDENT','PUBLIC')) ORDER BY exam_id,asset_type,booklet_code,version DESC`).bind(ids, isSuperAdmin ? 1 : 0));
  const optics = await all<any>(env.DB.prepare(`SELECT DISTINCT b.exam_id,a.id,a.asset_type,a.file_name,t.name optic_name FROM scan_batches b JOIN institutions i ON i.id=b.institution_id
    JOIN optical_template_assets a ON a.optical_template_version_id=b.optical_template_version_id JOIN optical_template_versions v ON v.id=a.optical_template_version_id JOIN optical_templates t ON t.id=v.template_id
    WHERE b.status='COMMITTED' AND a.asset_type IN ('BLANK_FORM','FMT_SAMPLE')${scope.sql.replace(/ep\.institution_id/g, 'b.institution_id')}`).bind(...scope.args));
  return exams.map((e) => ({ ...e,
    documents: [
      ...docs.filter((d) => d.exam_id === e.id).map((d) => ({ id: d.id, kind: 'EXAM', type: d.asset_type, label: `${DOC_LABEL[d.asset_type] || d.asset_type}${d.booklet_code ? ` · ${d.booklet_code} kitapçığı` : ''}`, fileName: d.file_name, size: d.byte_size })),
      ...optics.filter((o) => o.exam_id === e.id).map((o) => ({ id: o.id, kind: 'OPTIC', type: o.asset_type, label: `${o.asset_type === 'FMT_SAMPLE' ? 'FMT dosyası' : 'Optik form'} · ${o.optic_name}`, fileName: o.file_name, size: null })),
    ] }));
}

/** One document, checked again against the scope (exam with results in scope; visibility for schools). */
export async function documentObject(env: Env, scope: Scope, isSuperAdmin: boolean, kind: string, id: string) {
  if (kind === 'OPTIC') {
    const a = await one<any>(env.DB.prepare(`SELECT a.object_key,a.file_name,a.content_type FROM optical_template_assets a WHERE a.id=? AND a.asset_type IN ('BLANK_FORM','FMT_SAMPLE') AND EXISTS(
      SELECT 1 FROM scan_batches b JOIN institutions i ON i.id=b.institution_id WHERE b.optical_template_version_id=a.optical_template_version_id AND b.status='COMMITTED'${scope.sql.replace(/ep\.institution_id/g, 'b.institution_id')})`).bind(id, ...scope.args));
    if (!a) return null; const object = await env.FILES.get(a.object_key); return object ? { object, fileName: a.file_name, contentType: a.content_type || 'application/octet-stream', examId: null } : null;
  }
  const d = await one<any>(env.DB.prepare(`SELECT d.r2_key,d.file_name,d.mime_type,d.exam_id FROM exam_document_assets d WHERE d.id=? AND d.status='READY' AND d.asset_type<>'PUBLISHER_LOGO' AND (? OR d.visibility IN ('INSTITUTION_TEACHER','STUDENT','PUBLIC'))
    AND EXISTS(SELECT 1 FROM scan_batches b JOIN institutions i ON i.id=b.institution_id WHERE b.exam_id=d.exam_id AND b.status='COMMITTED'${scope.sql.replace(/ep\.institution_id/g, 'b.institution_id')})`).bind(id, isSuperAdmin ? 1 : 0, ...scope.args));
  if (!d) return null; const object = await env.FILES.get(d.r2_key); return object ? { object, fileName: d.file_name, contentType: d.mime_type || 'application/octet-stream', examId: d.exam_id } : null;
}

export function fileResponse(object: R2ObjectBody, fileName: string, contentType: string) {
  return new Response(object.body, { headers: { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
