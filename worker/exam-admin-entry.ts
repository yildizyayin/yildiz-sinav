import accessApp from './access-entry';
import type { AuthUser, Env, Role } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, badRequest, forbidden, json, notFound, one, uuid } from './lib/db';

export type ExamOwnerType = 'CENTRAL' | 'INSTITUTION';

export function canManageExamDefinitions(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'INSTITUTION_MANAGER';
}

export function ownerTypeAllowed(role: Role, ownerType: ExamOwnerType): boolean {
  if (role === 'SUPER_ADMIN') return ownerType === 'CENTRAL' || ownerType === 'INSTITUTION';
  return role === 'INSTITUTION_MANAGER' && ownerType === 'INSTITUTION';
}

export function normalizeBookletCodes(values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const code = String(value ?? '').trim().toUpperCase();
    if (!code || !/^[A-Z0-9]{1,4}$/.test(code)) continue;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

export function answerStringValid(value: string, questionCount: number, optionCount: 4 | 5 = 5): boolean {
  const pattern = optionCount === 4 ? /^[A-D]+$/ : /^[A-E]+$/;
  return value.length === questionCount && pattern.test(value);
}

function err(status: number, code: string, message: string, details?: unknown): Response {
  return Response.json({ ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } }, { status });
}

const CONTENT_ROLES: Role[] = ['SUPER_ADMIN', 'INSTITUTION_MANAGER', 'TEACHER', 'GUIDANCE_TEACHER', 'STUDENT', 'PARENT'];

function safeAssetName(value: string): string {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 120) || 'dosya';
}

function validHttpUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname.length > 2; } catch { return false; }
}

async function contentUser(env: Env, request: Request): Promise<AuthUser | Response> {
  const user = await getAuthUser(env, request);
  if (!user) return err(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (!CONTENT_ROLES.includes(user.role)) return forbidden();
  return user;
}

async function contentExam(env: Env, user: AuthUser, examId: string): Promise<any | null> {
  const exam = await one<any>(env.DB.prepare('SELECT * FROM exams WHERE id=?').bind(examId));
  if (!exam) return null;
  if (user.role === 'SUPER_ADMIN') return exam;
  if (user.role === 'STUDENT') {
    return user.student_id && await one(env.DB.prepare('SELECT 1 FROM exam_participants WHERE exam_id=? AND student_id=?').bind(examId, user.student_id)) ? exam : null;
  }
  if (user.role === 'PARENT') {
    return await one(env.DB.prepare(`SELECT 1 FROM exam_participants ep JOIN parent_student_links p ON p.student_id=ep.student_id AND p.parent_user_id=? AND p.active=1 WHERE ep.exam_id=? LIMIT 1`).bind(user.id, examId)) ? exam : null;
  }
  if (!user.institution_id) return null;
  return exam.owner_type === 'CENTRAL'
    ? await one(env.DB.prepare('SELECT 1 FROM exam_institutions WHERE exam_id=? AND institution_id=? AND enabled=1').bind(examId, user.institution_id)) ? exam : null
    : exam.institution_id === user.institution_id ? exam : null;
}

function pdfAscii(value: unknown): string {
  return String(value ?? '').replace(/İ|ı/g, 'i').replace(/Ğ|ğ/g, 'g').replace(/Ş|ş/g, 's').replace(/Ü|ü/g, 'u').replace(/Ö|ö/g, 'o').replace(/Ç|ç/g, 'c').replace(/[^ -~]/g, '?');
}
function pdfEscape(value: unknown): string { return pdfAscii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function pdfLine(commands: string[], x: number, y: number, value: unknown, size = 10, color = '0.05 0.14 0.35') { commands.push(`${color} rg BT /F1 ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`); }
function makeAnswerKeyPdf(title: string, publisher: string, booklet: string, rows: any[], logoFileName?: string | null): ArrayBuffer {
  const enc = new TextEncoder(); const commands: string[] = [];
  commands.push('0.96 0.98 1 rg 0 0 595 842 re f', '0.10 0.35 0.85 rg 0 790 595 52 re f');
  pdfLine(commands, 34, 812, 'ANUNEX', 22, '1 1 1'); pdfLine(commands, 34, 798, 'SINAV SONUCLARI VE KAZANIM ARSIVI', 7, '0.82 0.90 1');
  pdfLine(commands, 390, 814, publisher || 'Yayinevi', 10, '1 1 1'); pdfLine(commands, 390, 800, title, 8, '0.82 0.90 1');
  pdfLine(commands, 34, 766, 'Cevap Anahtari', 17); pdfLine(commands, 34, 748, `${title} · Kitapcik ${booklet}`, 9, '0.25 0.32 0.45');
  if (logoFileName) pdfLine(commands, 34, 732, `Yayinevi logosu arsivlendi: ${logoFileName}`, 7, '0.32 0.40 0.55');
  let y = 704; let lastSubject = '';
  for (const row of rows) {
    if (y < 80) break;
    if (row.subject_name !== lastSubject) { commands.push('0.86 0.92 1 rg 32 ' + (y - 7) + ' 531 24 re f'); pdfLine(commands, 42, y, row.subject_name, 10); y -= 30; lastSubject = row.subject_name; }
    pdfLine(commands, 46, y, `${row.question_no}.`, 8); pdfLine(commands, 80, y, row.correct_answer || '—', 10, '0.10 0.35 0.85'); pdfLine(commands, 122, y, row.status === 'CANCELLED' ? 'Iptal' : row.status === 'EXCLUDED' ? 'Degerlendirme disi' : 'Aktif', 7, '0.28 0.36 0.50');
    pdfLine(commands, 250, y, row.outcome_text || 'Kazanimsiz', 7, '0.28 0.36 0.50'); y -= 20;
  }
  pdfLine(commands, 34, 45, 'Bu belge ANUNEX merkezi sinav kaydindan uretilmistir.', 7, '0.35 0.43 0.55');
  const objects: string[] = []; const add = (s: string) => { objects.push(s); return objects.length; }; const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const content = commands.join('\n'); const stream = add(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`); const page = add(`<< /Type /Page /Parent 4 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`); const pages = add(`<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`); const catalog = add(`<< /Type /Catalog /Pages ${pages} 0 R >>`);
  let out = '%PDF-1.4\n%\xFF\xFF\xFF\xFF\n'; const offsets = [0]; for (let i = 0; i < objects.length; i++) { offsets.push(enc.encode(out).length); out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; } const xref = enc.encode(out).length; out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`; for (let i = 1; i <= objects.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`; out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`; return enc.encode(out).buffer;
}

async function contentList(env: Env, user: AuthUser, examId: string): Promise<Response> {
  const exam = await contentExam(env, user, examId); if (!exam) return notFound('Bu sınav içeriğine erişilemiyor.');
  const [assets, videos] = await Promise.all([
    all<any>(env.DB.prepare(`SELECT id,asset_type,booklet_code,file_name,mime_type,byte_size,version,status,visibility,metadata_json,created_at FROM exam_document_assets WHERE exam_id=? AND status='READY' AND (visibility IN ('PUBLIC','STUDENT','INSTITUTION_TEACHER') OR ?='SUPER_ADMIN') ORDER BY created_at DESC`).bind(examId, user.role)),
    all<any>(env.DB.prepare(`SELECT id,exam_question_id,outcome_id,link_type,provider,url,title,description,status,publish_at,published_at,visibility,link_status,last_checked_at FROM video_links WHERE exam_id=? AND ((status='PUBLISHED' AND (publish_at IS NULL OR publish_at<=CURRENT_TIMESTAMP) AND visibility IN ('PUBLIC','STUDENT_TEACHER')) OR ? IN ('SUPER_ADMIN','INSTITUTION_MANAGER')) ORDER BY coalesce(published_at,publish_at,updated_at) DESC`).bind(examId, user.role)),
  ]);
  return json({ ok: true, exam: { id: exam.id, title: exam.title, publisherName: exam.publisher_name }, assets, videos });
}

async function uploadContentAsset(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
  if (!['SUPER_ADMIN', 'INSTITUTION_MANAGER'].includes(user.role)) return forbidden();
  const exam = await contentExam(env, user, examId); if (!exam) return notFound('Sınav tanımı bulunamadı.');
  if (exam.owner_type === 'CENTRAL' && user.role !== 'SUPER_ADMIN') return forbidden('Merkezi sınav arşivini yalnız Super Admin yönetebilir.');
  const form = await request.formData(); const file = form.get('file'); if (!(file instanceof File)) return badRequest('Bir dosya seçilmelidir.');
  const rawType = String(form.get('assetType') || '').toUpperCase(); const allowed = ['QUALIFIED_ANSWER_KEY', 'SOURCE_ANSWER_KEY', 'EXAM_PDF', 'PUBLISHER_LOGO', 'OTHER']; if (!allowed.includes(rawType)) return badRequest('Geçersiz arşiv belge türü.');
  const max = rawType === 'PUBLISHER_LOGO' ? 5 * 1024 * 1024 : 30 * 1024 * 1024; if (file.size > max) return badRequest('Dosya boyutu sınırı aşıyor.');
  const mime = file.type || 'application/octet-stream';
  if (rawType === 'PUBLISHER_LOGO' && !mime.startsWith('image/')) return badRequest('Yayınevi logosu PNG, JPG, SVG veya WEBP olmalıdır.');
  if (rawType !== 'PUBLISHER_LOGO' && rawType !== 'OTHER' && !(['application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(mime) || /\.(pdf|csv|xlsx)$/i.test(file.name))) return badRequest('Bu arşiv türü için PDF, CSV veya XLSX dosyası yükleyin.');
  const current = await one<{ version: number }>(env.DB.prepare('SELECT max(version) version FROM exam_document_assets WHERE exam_id=? AND asset_type=?').bind(examId, rawType)); const version = Number(current?.version || 0) + 1;
  const key = `exams/${exam.academic_year}/${examId}/archive/${rawType.toLowerCase()}/v${version}-${Date.now()}-${safeAssetName(file.name)}`;
  await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: mime, cacheControl: 'private, no-store' } });
  const id = uuid('eda'); await env.DB.prepare(`INSERT INTO exam_document_assets(id,exam_id,asset_type,r2_key,file_name,mime_type,byte_size,version,visibility,metadata_json,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id, examId, rawType, key, file.name, mime, file.size, version, rawType === 'PUBLISHER_LOGO' ? 'INSTITUTION_TEACHER' : 'INSTITUTION_TEACHER', JSON.stringify({ source: 'SUPER_ADMIN_ARCHIVE_UPLOAD' }), user.id).run();
  await audit(env.DB, user.id, exam.institution_id, 'EXAM_ARCHIVE_ASSET_UPLOADED', 'exam', examId, { assetType: rawType, version, fileName: file.name, byteSize: file.size });
  return json({ ok: true, id, version, assetType: rawType }, 201);
}

async function generatePlainAnswerKey(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
  if (!['SUPER_ADMIN', 'INSTITUTION_MANAGER'].includes(user.role)) return forbidden();
  const exam = await contentExam(env, user, examId); if (!exam) return notFound('Sınav tanımı bulunamadı.');
  if (exam.owner_type === 'CENTRAL' && user.role !== 'SUPER_ADMIN') return forbidden('Merkezi sınav PDF arşivini yalnız Super Admin yönetebilir.');
  const booklet = (new URL(request.url).searchParams.get('booklet') || 'A').trim().toUpperCase();
  const rows = await all<any>(env.DB.prepare(`SELECT s.name subject_name,q.question_no,ak.correct_answer,ak.question_status status,GROUP_CONCAT(DISTINCT o.code || ' · ' || o.title) outcome_text FROM exam_questions q JOIN subjects s ON s.id=q.subject_id LEFT JOIN answer_keys ak ON ak.exam_question_id=q.id AND ak.booklet_code=? LEFT JOIN question_outcomes qo ON qo.exam_question_id=q.id LEFT JOIN outcomes o ON o.id=qo.outcome_id WHERE q.exam_id=? GROUP BY q.id ORDER BY q.global_no`).bind(booklet, examId));
  if (!rows.length) return badRequest('Önce sınavın cevap anahtarını kaydedin.');
  const logo = await one<{ file_name: string }>(env.DB.prepare(`SELECT file_name FROM exam_document_assets WHERE exam_id=? AND asset_type='PUBLISHER_LOGO' AND status='READY' ORDER BY version DESC LIMIT 1`).bind(examId));
  const bytes = makeAnswerKeyPdf(exam.title, exam.publisher_name || '', booklet, rows, logo?.file_name); const versionRow = await one<{ version: number }>(env.DB.prepare(`SELECT max(version) version FROM exam_document_assets WHERE exam_id=? AND asset_type='PLAIN_ANSWER_KEY_PDF' AND booklet_code=?`).bind(examId, booklet)); const version = Number(versionRow?.version || 0) + 1;
  const fileName = `${safeAssetName(exam.title)}-${booklet}-cevap-anahtari.pdf`; const key = `exams/${exam.academic_year}/${examId}/archive/plain-answer-key/v${version}-${booklet}.pdf`; await env.FILES.put(key, bytes, { httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' } });
  const id = uuid('eda'); await env.DB.prepare(`INSERT INTO exam_document_assets(id,exam_id,asset_type,booklet_code,r2_key,file_name,mime_type,byte_size,version,visibility,metadata_json,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, examId, 'PLAIN_ANSWER_KEY_PDF', booklet, key, fileName, 'application/pdf', bytes.byteLength, version, 'STUDENT', JSON.stringify({ generatedFrom: 'ANSWER_KEYS', publisherLogoFile: logo?.file_name || null }), user.id).run();
  await audit(env.DB, user.id, exam.institution_id, 'EXAM_PLAIN_ANSWER_KEY_GENERATED', 'exam', examId, { booklet, version, byteSize: bytes.byteLength });
  return new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName}"`, 'Cache-Control': 'private, no-store', 'X-Anunex-Archive-Asset-Id': id } });
}

async function createExamVideo(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
  if (!['SUPER_ADMIN', 'INSTITUTION_MANAGER'].includes(user.role)) return forbidden(); const exam = await contentExam(env, user, examId); if (!exam) return notFound('Sınav tanımı bulunamadı.');
  if (exam.owner_type === 'CENTRAL' && user.role !== 'SUPER_ADMIN') return forbidden('Merkezi sınav videolarını yalnız Super Admin yönetebilir.');
  const body = await request.json<{ url?: string; title?: string; description?: string; linkType?: 'EXAM' | 'SOLUTION' | 'TOPIC'; examQuestionId?: string | null; outcomeId?: string | null; publishMode?: 'DRAFT' | 'NOW' | 'SCHEDULED'; publishAt?: string | null; visibility?: 'STUDENT_TEACHER' | 'PUBLIC' }>();
  const url = String(body.url || '').trim(); const title = String(body.title || '').trim(); if (!validHttpUrl(url) || !title) return badRequest('HTTPS video bağlantısı ve başlık zorunludur.');
  const linkType = body.linkType || 'EXAM'; if (linkType !== 'EXAM' && !body.examQuestionId && !body.outcomeId) return badRequest('Çözüm veya konu videosu soru ya da kazanıma bağlanmalıdır.');
  if (body.examQuestionId && !(await one(env.DB.prepare('SELECT 1 FROM exam_questions WHERE id=? AND exam_id=?').bind(body.examQuestionId, examId)))) return badRequest('Video sorusu bu sınava ait değil.');
  if (body.outcomeId && !(await one(env.DB.prepare('SELECT 1 FROM outcomes o JOIN question_outcomes qo ON qo.outcome_id=o.id JOIN exam_questions q ON q.id=qo.exam_question_id WHERE o.id=? AND q.exam_id=?').bind(body.outcomeId, examId)))) return badRequest('Video kazanımı bu sınava ait değil.');
  let status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' = 'DRAFT'; let publishAt: string | null = null; const mode = body.publishMode || 'DRAFT'; if (mode === 'NOW') status = 'PUBLISHED'; else if (mode === 'SCHEDULED') { const date = body.publishAt ? new Date(body.publishAt) : null; if (!date || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return badRequest('Planlı yayın tarihi gelecekte olmalıdır.'); status = 'SCHEDULED'; publishAt = date.toISOString(); }
  const id = uuid('vid'); await env.DB.prepare(`INSERT INTO video_links(id,exam_id,exam_question_id,outcome_id,link_type,provider,url,title,description,approved,status,publish_at,published_at,visibility,link_status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,'UNKNOWN',CURRENT_TIMESTAMP)`).bind(id, examId, body.examQuestionId || null, body.outcomeId || null, linkType, 'EXTERNAL', url, title, body.description?.trim() || null, status === 'PUBLISHED' ? 1 : 0, status, publishAt, status === 'PUBLISHED' ? new Date().toISOString() : null, body.visibility || 'STUDENT_TEACHER').run();
  await audit(env.DB, user.id, exam.institution_id, 'EXAM_VIDEO_CREATED', 'exam', examId, { videoId: id, linkType, status, publishAt }); return json({ ok: true, id, status }, 201);
}

async function updateExamVideo(request: Request, env: Env, user: AuthUser, examId: string, videoId: string): Promise<Response> {
  if (!['SUPER_ADMIN', 'INSTITUTION_MANAGER'].includes(user.role)) return forbidden(); const exam = await contentExam(env, user, examId); if (!exam) return notFound('Sınav tanımı bulunamadı.'); if (exam.owner_type === 'CENTRAL' && user.role !== 'SUPER_ADMIN') return forbidden('Merkezi sınav videolarını yalnız Super Admin yönetebilir.'); const body = await request.json<{ status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; publishAt?: string | null }>(); const next = body.status; if (!next || !['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(next)) return badRequest('Geçersiz video durumu.'); const row = await one<any>(env.DB.prepare('SELECT id FROM video_links WHERE id=? AND exam_id=?').bind(videoId, examId)); if (!row) return notFound('Video bulunamadı.'); const published = next === 'PUBLISHED' ? 1 : 0; await env.DB.prepare(`UPDATE video_links SET status=?,approved=?,publish_at=?,published_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND exam_id=?`).bind(next, published, next === 'PUBLISHED' ? null : body.publishAt || null, next === 'PUBLISHED' ? new Date().toISOString() : null, videoId, examId).run(); await audit(env.DB, user.id, exam.institution_id, 'EXAM_VIDEO_STATUS_CHANGED', 'video_link', videoId, { status: next }); return json({ ok: true, status: next });
}

async function checkExamVideo(env: Env, user: AuthUser, examId: string, videoId: string): Promise<Response> {
  if (!['SUPER_ADMIN', 'INSTITUTION_MANAGER'].includes(user.role)) return forbidden();
  const exam = await contentExam(env, user, examId); if (!exam) return notFound('Sınav tanımı bulunamadı.');
  const row = await one<any>(env.DB.prepare('SELECT id,url FROM video_links WHERE id=? AND exam_id=?').bind(videoId, examId)); if (!row) return notFound('Video bulunamadı.');
  let status: 'OK' | 'BROKEN' = 'BROKEN';
  try { const response = await fetch(row.url, { method: 'HEAD', redirect: 'manual' }); status = response.status >= 200 && response.status < 400 ? 'OK' : 'BROKEN'; } catch { status = 'BROKEN'; }
  await env.DB.prepare('UPDATE video_links SET link_status=?,last_checked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status, videoId).run();
  await audit(env.DB, user.id, exam.institution_id, 'EXAM_VIDEO_LINK_CHECKED', 'video_link', videoId, { linkStatus: status }); return json({ ok: true, linkStatus: status });
}

async function downloadExamAsset(request: Request, env: Env, user: AuthUser, examId: string, assetId: string): Promise<Response> {
  const exam = await contentExam(env, user, examId); if (!exam) return notFound('Bu sınav arşivine erişilemiyor.'); const visibility = user.role === 'SUPER_ADMIN' ? null : user.role === 'STUDENT' || user.role === 'PARENT' ? 'STUDENT' : 'INSTITUTION_TEACHER'; const asset = await one<any>(env.DB.prepare(`SELECT * FROM exam_document_assets WHERE id=? AND exam_id=? AND status=? AND (? IS NULL OR visibility IN (?, 'PUBLIC'))`).bind(assetId, examId, 'READY', visibility, visibility)); if (!asset) return notFound('Arşiv belgesi bulunamadı.'); const object = await env.FILES.get(asset.r2_key); if (!object) return notFound('Arşiv dosyası depolamada bulunamadı.'); await audit(env.DB, user.id, exam.institution_id, 'EXAM_ARCHIVE_ASSET_DOWNLOADED', 'exam_document_asset', assetId, { assetType: asset.asset_type }); const headers = new Headers({ 'Content-Type': asset.mime_type, 'Content-Disposition': `attachment; filename="${safeAssetName(asset.file_name)}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); object.writeHttpMetadata(headers); return new Response(object.body, { headers });
}

export async function publishScheduledExamVideos(env: Env): Promise<void> {
  try { await env.DB.prepare(`UPDATE video_links SET status='PUBLISHED',approved=1,published_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE status='SCHEDULED' AND publish_at IS NOT NULL AND publish_at<=CURRENT_TIMESTAMP`).run(); } catch (error) { console.error('Scheduled exam video promotion failed', error); }
}

async function actor(env: Env, request: Request): Promise<AuthUser | Response> {
  const user = await getAuthUser(env, request);
  if (!user) return err(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (!canManageExamDefinitions(user.role)) return err(403, 'FORBIDDEN', 'Sınav tanımı yönetme yetkiniz bulunmuyor.');
  return user;
}

function requestedInstitution(user: AuthUser, url: URL, bodyInstitutionId?: string | null): string | null {
  if (user.role === 'SUPER_ADMIN') return bodyInstitutionId || url.searchParams.get('institutionId');
  return user.institution_id || null;
}

async function institutionAllowed(env: Env, user: AuthUser, institutionId: string): Promise<boolean> {
  if (user.role !== 'SUPER_ADMIN') return user.institution_id === institutionId;
  return Boolean(await one(env.DB.prepare('SELECT id FROM institutions WHERE id=?').bind(institutionId)));
}

async function managedExam(env: Env, user: AuthUser, examId: string): Promise<any | null> {
  const exam = await one<any>(env.DB.prepare(`
    SELECT e.*,srv.verified scoring_verified,sr.name scoring_name,sr.authority scoring_authority
    FROM exams e
    LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id
    LEFT JOIN scoring_rules sr ON sr.id=srv.rule_id
    WHERE e.id=?
  `).bind(examId));
  if (!exam) return null;
  if (user.role === 'SUPER_ADMIN') return exam;
  if (exam.owner_type !== 'INSTITUTION' || exam.institution_id !== user.institution_id) return null;
  return exam;
}

async function options(env: Env, user: AuthUser, url: URL): Promise<Response> {
  const gradeLevelRaw = url.searchParams.get('gradeLevel');
  const subjectId = url.searchParams.get('subjectId');
  const gradeLevel = gradeLevelRaw ? Number(gradeLevelRaw) : null;
  const [subjects, scoringVersions, institutions] = await Promise.all([
    all<any>(env.DB.prepare(`SELECT id,code,name,category FROM subjects WHERE active=1 ORDER BY name`)),
    all<any>(env.DB.prepare(`
      SELECT srv.id,srv.academic_year,srv.version,srv.verified,srv.source_url,srv.config_json,sr.code rule_code,sr.name rule_name,sr.authority,sr.official
      FROM scoring_rule_versions srv JOIN scoring_rules sr ON sr.id=srv.rule_id
      ORDER BY srv.verified DESC,srv.academic_year DESC,sr.name,srv.version
    `)),
    user.role === 'SUPER_ADMIN'
      ? all<any>(env.DB.prepare(`SELECT id,name,code,city,district,status FROM institutions ORDER BY status,name`))
      : Promise.resolve([]),
  ]);
  const params: unknown[] = [];
  let where = 'o.active=1';
  if (gradeLevel && Number.isInteger(gradeLevel)) { where += ' AND (o.grade_level=? OR o.grade_level IS NULL)'; params.push(gradeLevel); }
  if (subjectId) { where += ' AND o.subject_id=?'; params.push(subjectId); }
  const outcomes = await all<any>(env.DB.prepare(`
    SELECT o.id,o.subject_id,o.grade_level,o.code,o.topic,o.subtopic,o.title,o.official,
           o.parent_outcome_id,o.node_type,o.unit,coalesce(cv.verified,0) verified,cv.authority,cv.program_code,
           s.name subject_name
    FROM outcomes o JOIN subjects s ON s.id=o.subject_id
    LEFT JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
    WHERE ${where}
    ORDER BY s.name,o.topic,o.title
    LIMIT 1000
  `).bind(...params));
  return Response.json({ ok: true, subjects, scoringVersions, institutions, outcomes });
}

async function listDefinitions(env: Env, user: AuthUser): Promise<Response> {
  const params: unknown[] = [];
  let where = '1=1';
  if (user.role === 'INSTITUTION_MANAGER') {
    where += ` AND e.owner_type='INSTITUTION' AND e.institution_id=?`;
    params.push(user.institution_id);
  }
  const exams = await all<any>(env.DB.prepare(`
    SELECT e.*,i.name institution_name,srv.verified scoring_verified,sr.name scoring_name,
      (SELECT count(*) FROM exam_subjects es WHERE es.exam_id=e.id) subject_count,
      (SELECT coalesce(sum(question_count),0) FROM exam_subjects es WHERE es.exam_id=e.id) question_count,
      (SELECT count(*) FROM exam_booklets eb WHERE eb.exam_id=e.id AND eb.active=1) booklet_count,
      (SELECT count(*) FROM answer_keys ak JOIN exam_questions q ON q.id=ak.exam_question_id WHERE q.exam_id=e.id) answer_count,
      (SELECT count(DISTINCT qo.exam_question_id) FROM question_outcomes qo JOIN exam_questions q ON q.id=qo.exam_question_id WHERE q.exam_id=e.id) outcome_mapped_count,
      (SELECT count(*) FROM exam_institutions ei WHERE ei.exam_id=e.id AND ei.enabled=1) institution_count,
      (SELECT count(*) FROM exam_participants ep WHERE ep.exam_id=e.id) participant_count
    FROM exams e
    LEFT JOIN institutions i ON i.id=e.institution_id
    LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id
    LEFT JOIN scoring_rules sr ON sr.id=srv.rule_id
    WHERE ${where}
    ORDER BY CASE e.status WHEN 'DRAFT' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END,coalesce(e.exam_date,'9999-12-31') DESC,e.title
  `).bind(...params));
  return Response.json({ ok: true, exams });
}

async function createDefinition(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const body = await request.json<{
    ownerType?: ExamOwnerType;
    institutionId?: string | null;
    academicYear?: string;
    title?: string;
    examType?: string;
    gradeLevel?: number | null;
    examDate?: string | null;
    scoringRuleVersionId?: string | null;
    publisherName?: string | null;
    sessionLabel?: string | null;
    description?: string | null;
    resultNetworkEnabled?: boolean;
    scoringOverride?: Record<string, unknown> | null;
    scoringSettings?: Record<string, unknown> | null;
    outcomeMode?: 'OPTIONAL' | 'OFFICIAL_REQUIRED';
  }>();
  const ownerType = body.ownerType || (user.role === 'SUPER_ADMIN' ? 'CENTRAL' : 'INSTITUTION');
  if (!ownerTypeAllowed(user.role, ownerType)) return err(403, 'OWNER_TYPE_FORBIDDEN', 'Bu sınav sahipliği türünü oluşturma yetkiniz bulunmuyor.');
  const title = body.title?.trim() || '';
  const academicYear = body.academicYear?.trim() || '';
  const examType = body.examType?.trim().toUpperCase() || '';
  if (!title || !/^20\d{2}-20\d{2}$/.test(academicYear) || !examType) return err(400, 'VALIDATION_ERROR', 'Sınav adı, eğitim yılı ve sınav türü gereklidir.');
  const publisherName = body.publisherName?.trim() || '';
  const sessionLabel = body.sessionLabel?.trim() || '';
  const description = body.description?.trim() || '';
  if (!publisherName || !sessionLabel || !description) return err(400, 'VALIDATION_ERROR', 'Yayınevi adı, oturum/bölüm ve açıklama/not gereklidir.');
  if (publisherName && publisherName.length > 160) return err(400, 'VALIDATION_ERROR', 'Yayınevi adı 160 karakteri geçemez.');
  if (sessionLabel && sessionLabel.length > 120) return err(400, 'VALIDATION_ERROR', 'Oturum / bölüm 120 karakteri geçemez.');
  if (description && description.length > 2000) return err(400, 'VALIDATION_ERROR', 'Açıklama 2000 karakteri geçemez.');
  const gradeLevel = body.gradeLevel == null ? null : Number(body.gradeLevel);
  if (gradeLevel != null && (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 12)) return err(400, 'INVALID_GRADE', 'Sınıf düzeyi 1-12 arasında olmalıdır.');

  let institutionId: string | null = null;
  if (ownerType === 'INSTITUTION') {
    institutionId = requestedInstitution(user, new URL(request.url), body.institutionId || null);
    if (!institutionId) return err(400, 'INSTITUTION_REQUIRED', 'Kurum sınavında kurum seçilmelidir.');
    if (!(await institutionAllowed(env, user, institutionId))) return err(403, 'FORBIDDEN', 'Bu kuruma erişim yetkiniz bulunmuyor.');
  }
  let scoring: any = null;
  if (body.scoringRuleVersionId) {
    scoring = await one<any>(env.DB.prepare('SELECT srv.id,sr.code rule_code FROM scoring_rule_versions srv JOIN scoring_rules sr ON sr.id=srv.rule_id WHERE srv.id=?').bind(body.scoringRuleVersionId));
    if (!scoring) return err(404, 'SCORING_NOT_FOUND', 'Puanlama kuralı bulunamadı.');
  }
  if (body.scoringOverride && scoring?.rule_code !== 'CUSTOM_EXAM') return err(400, 'SCORING_OVERRIDE_FORBIDDEN', 'Özel puanlama alanları yalnız Özel Deneme profilinde kullanılabilir.');
  const scoringOverride = body.scoringOverride ? JSON.stringify(body.scoringOverride) : null;
  if (scoringOverride && scoringOverride.length > 5000) return err(400, 'VALIDATION_ERROR', 'Özel puanlama tanımı çok uzun.');
  const scoringSettings = body.scoringSettings ? JSON.stringify(body.scoringSettings) : null;
  if (scoringSettings && scoringSettings.length > 5000) return err(400, 'VALIDATION_ERROR', 'Sonuç görünümü tanımı çok uzun.');
  const resultNetworkEnabled = user.role === 'SUPER_ADMIN' && body.resultNetworkEnabled === true ? 1 : 0;
  const outcomeMode = body.outcomeMode === 'OFFICIAL_REQUIRED' ? 'OFFICIAL_REQUIRED' : 'OPTIONAL';
  const id = uuid('exam');
  await env.DB.prepare(`
    INSERT INTO exams (id,owner_type,institution_id,academic_year,title,exam_type,grade_level,exam_date,status,scoring_rule_version_id,sponsor_mode,created_by,publisher_name,session_label,description,result_network_enabled,scoring_override_json,scoring_settings_json,outcome_mode)
    VALUES (?,?,?,?,?,?,?,?, 'DRAFT',?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, ownerType, institutionId, academicYear, title, examType, gradeLevel,
    body.examDate || null, body.scoringRuleVersionId || null,
    ownerType === 'CENTRAL' ? 'ADMIN_SPONSORED' : 'INSTITUTION', user.id,
    publisherName, sessionLabel, description, resultNetworkEnabled, scoringOverride, scoringSettings, outcomeMode,
  ).run();
  await audit(env.DB, user.id, institutionId, 'EXAM_DEFINITION_CREATED', 'exam', id, { ownerType, academicYear, title, examType, gradeLevel, resultNetworkEnabled });
  return Response.json({ ok: true, id }, { status: 201 });
}

async function readiness(env: Env, examId: string): Promise<any> {
  const row = await one<any>(env.DB.prepare(`
    SELECT
      (SELECT count(*) FROM exam_subjects WHERE exam_id=?) subject_count,
      (SELECT coalesce(sum(question_count),0) FROM exam_subjects WHERE exam_id=?) expected_questions,
      (SELECT count(*) FROM exam_questions WHERE exam_id=?) actual_questions,
      (SELECT count(*) FROM exam_booklets WHERE exam_id=? AND active=1) booklet_count,
      (SELECT count(*) FROM answer_keys ak JOIN exam_questions q ON q.id=ak.exam_question_id WHERE q.exam_id=?) actual_answers,
      (SELECT e.outcome_mode FROM exams e WHERE e.id=?) outcome_mode,
      (SELECT count(DISTINCT qo.exam_question_id) FROM question_outcomes qo JOIN exam_questions q ON q.id=qo.exam_question_id WHERE q.exam_id=?) outcome_mapped_questions,
      (SELECT coalesce(srv.verified,0) FROM exams e LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id WHERE e.id=?) scoring_verified
  `).bind(examId, examId, examId, examId, examId, examId, examId, examId));
  const expectedAnswers = Number(row?.expected_questions || 0) * Number(row?.booklet_count || 0);
  const readyToPublish = Number(row?.subject_count || 0) > 0
    && Number(row?.booklet_count || 0) > 0
    && Number(row?.actual_questions || 0) === Number(row?.expected_questions || 0)
    && Number(row?.actual_answers || 0) === expectedAnswers
    && Number(row?.scoring_verified || 0) === 1
    && (row?.outcome_mode !== 'OFFICIAL_REQUIRED' || Number(row?.outcome_mapped_questions || 0) >= Number(row?.expected_questions || 0));
  return { ...row, expected_answers: expectedAnswers, ready_to_publish: readyToPublish };
}

async function getDefinition(env: Env, user: AuthUser, examId: string): Promise<Response> {
  const exam = await managedExam(env, user, examId);
  if (!exam) return err(404, 'NOT_FOUND', 'Sınav tanımı bulunamadı.');
  const [subjects, booklets, institutions, keys, ready] = await Promise.all([
    all<any>(env.DB.prepare(`SELECT es.*,s.code,s.name,s.category FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=? ORDER BY es.sort_order,s.name`).bind(examId)),
    all<any>(env.DB.prepare(`SELECT id,code,active FROM exam_booklets WHERE exam_id=? ORDER BY code`).bind(examId)),
    all<any>(env.DB.prepare(`SELECT ei.institution_id,ei.enabled,i.name,i.code FROM exam_institutions ei JOIN institutions i ON i.id=ei.institution_id WHERE ei.exam_id=? ORDER BY i.name`).bind(examId)),
    all<any>(env.DB.prepare(`
      SELECT q.id question_id,q.subject_id,q.question_no,q.global_no,q.option_count question_option_count,q.question_status question_status,
             ak.booklet_code,ak.correct_answer,ak.option_count answer_option_count,ak.accepted_answers,ak.question_status answer_question_status,
             group_concat(DISTINCT qo.outcome_id) outcome_ids,group_concat(DISTINCT o.code) outcome_codes,group_concat(DISTINCT o.title) outcome_titles
      FROM exam_questions q
      LEFT JOIN answer_keys ak ON ak.exam_question_id=q.id
      LEFT JOIN question_outcomes qo ON qo.exam_question_id=q.id
      LEFT JOIN outcomes o ON o.id=qo.outcome_id
      WHERE q.exam_id=?
      GROUP BY q.id,ak.booklet_code
      ORDER BY q.global_no,ak.booklet_code
    `).bind(examId)),
    readiness(env, examId),
  ]);
  return Response.json({ ok: true, exam, subjects, booklets, institutions, answerKey: keys, readiness: ready });
}

async function updateGeneral(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
  const exam = await managedExam(env, user, examId);
  if (!exam) return err(404, 'NOT_FOUND', 'Sınav tanımı bulunamadı.');
  if (exam.status !== 'DRAFT') return err(409, 'EXAM_LOCKED', 'Aktif veya kapanmış sınavın temel tanımı değiştirilemez.');
  const body = await request.json<{ title?: string; examType?: string; gradeLevel?: number | null; examDate?: string | null; scoringRuleVersionId?: string | null; publisherName?: string | null; sessionLabel?: string | null; description?: string | null; resultNetworkEnabled?: boolean; scoringOverride?: Record<string, unknown> | null; scoringSettings?: Record<string, unknown> | null; outcomeMode?: 'OPTIONAL' | 'OFFICIAL_REQUIRED' }>();
  const title = body.title?.trim() || exam.title;
  const examType = body.examType?.trim().toUpperCase() || exam.exam_type;
  const gradeLevel = body.gradeLevel === undefined ? exam.grade_level : body.gradeLevel == null ? null : Number(body.gradeLevel);
  if (gradeLevel != null && (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 12)) return err(400, 'INVALID_GRADE', 'Sınıf düzeyi 1-12 arasında olmalıdır.');
  const publisherName = body.publisherName === undefined ? exam.publisher_name : body.publisherName?.trim() || null;
  const sessionLabel = body.sessionLabel === undefined ? exam.session_label : body.sessionLabel?.trim() || null;
  const description = body.description === undefined ? exam.description : body.description?.trim() || null;
  if (publisherName && publisherName.length > 160) return err(400, 'VALIDATION_ERROR', 'Yayınevi adı 160 karakteri geçemez.');
  if (sessionLabel && sessionLabel.length > 120) return err(400, 'VALIDATION_ERROR', 'Oturum / bölüm 120 karakteri geçemez.');
  if (description && description.length > 2000) return err(400, 'VALIDATION_ERROR', 'Açıklama 2000 karakteri geçemez.');
  const scoringRuleVersionId = body.scoringRuleVersionId === undefined ? exam.scoring_rule_version_id : body.scoringRuleVersionId || null;
  let scoringCode: string | null = null;
  if (scoringRuleVersionId) {
    const scoring = await one<any>(env.DB.prepare('SELECT srv.id,sr.code rule_code FROM scoring_rule_versions srv JOIN scoring_rules sr ON sr.id=srv.rule_id WHERE srv.id=?').bind(scoringRuleVersionId));
    if (!scoring) return err(404, 'SCORING_NOT_FOUND', 'Puanlama kuralı bulunamadı.');
    scoringCode = scoring.rule_code;
  }
  if (body.scoringOverride && scoringCode !== 'CUSTOM_EXAM') return err(400, 'SCORING_OVERRIDE_FORBIDDEN', 'Özel puanlama alanları yalnız Özel Deneme profilinde kullanılabilir.');
  const scoringOverride = body.scoringOverride === undefined ? exam.scoring_override_json : body.scoringOverride ? JSON.stringify(body.scoringOverride) : null;
  if (scoringOverride && scoringOverride.length > 5000) return err(400, 'VALIDATION_ERROR', 'Özel puanlama tanımı çok uzun.');
  const scoringSettings = body.scoringSettings === undefined ? exam.scoring_settings_json : body.scoringSettings ? JSON.stringify(body.scoringSettings) : null;
  if (scoringSettings && scoringSettings.length > 5000) return err(400, 'VALIDATION_ERROR', 'Sonuç görünümü tanımı çok uzun.');
  const resultNetworkEnabled = user.role === 'SUPER_ADMIN' && body.resultNetworkEnabled !== undefined
    ? (body.resultNetworkEnabled ? 1 : 0)
    : Number(exam.result_network_enabled || 0);
  const outcomeMode = body.outcomeMode === undefined ? (exam.outcome_mode || 'OPTIONAL') : body.outcomeMode === 'OFFICIAL_REQUIRED' ? 'OFFICIAL_REQUIRED' : 'OPTIONAL';
  await env.DB.prepare(`UPDATE exams SET title=?,exam_type=?,grade_level=?,exam_date=?,scoring_rule_version_id=?,publisher_name=?,session_label=?,description=?,result_network_enabled=?,scoring_override_json=?,scoring_settings_json=?,outcome_mode=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(title, examType, gradeLevel, body.examDate === undefined ? exam.exam_date : body.examDate || null,
      scoringRuleVersionId, publisherName, sessionLabel, description, resultNetworkEnabled, scoringOverride, scoringSettings, outcomeMode, examId).run();
  await audit(env.DB, user.id, exam.institution_id, 'EXAM_DEFINITION_UPDATED', 'exam', examId, { title, examType, gradeLevel });
  return Response.json({ ok: true });
}

async function replaceStructure(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
  const exam = await managedExam(env, user, examId);
  if (!exam) return err(404, 'NOT_FOUND', 'Sınav tanımı bulunamadı.');
  if (exam.status !== 'DRAFT') return err(409, 'EXAM_LOCKED', 'Sınav yapısı yalnız taslak durumunda değiştirilebilir.');
  const participant = await one<{ c: number }>(env.DB.prepare('SELECT count(*) c FROM exam_participants WHERE exam_id=?').bind(examId));
  if ((participant?.c || 0) > 0) return err(409, 'EXAM_HAS_RESULTS', 'Katılımcısı bulunan sınavın soru yapısı değiştirilemez.');
  const body = await request.json<{ booklets?: unknown[]; subjects?: Array<{ subjectId?: string; questionCount?: number; questionStart?: number; questionEnd?: number; optionCount?: 4 | 5; questionStatus?: 'ACTIVE' | 'CANCELLED' | 'EXCLUDED'; wrongDivisor?: number; sortOrder?: number }> }>();
  const booklets = normalizeBookletCodes(body.booklets || []);
  if (!booklets.length || booklets.length > 8) return err(400, 'INVALID_BOOKLETS', 'En az 1, en fazla 8 geçerli kitapçık tanımlayın.');
  const subjects = (body.subjects || []).map((s, index) => ({
    subjectId: String(s.subjectId || ''), questionCount: Number(s.questionCount),
    questionStart: Number(s.questionStart ?? 1), questionEnd: Number(s.questionEnd ?? (Number(s.questionStart ?? 1) + Number(s.questionCount) - 1)),
    optionCount: Number(s.optionCount ?? 5) as 4 | 5, questionStatus: s.questionStatus || 'ACTIVE' as const,
    wrongDivisor: Number(s.wrongDivisor ?? 4), sortOrder: Number(s.sortOrder ?? index + 1),
  })).filter((s) => s.subjectId);
  if (!subjects.length) return err(400, 'SUBJECT_REQUIRED', 'En az bir ders tanımlayın.');
  if (new Set(subjects.map((s) => s.subjectId)).size !== subjects.length) return err(400, 'DUPLICATE_SUBJECT', 'Aynı ders birden fazla kez eklenemez.');
  for (const s of subjects) {
    if (!Number.isInteger(s.questionCount) || s.questionCount < 1 || s.questionCount > 200) return err(400, 'INVALID_QUESTION_COUNT', 'Ders soru sayısı 1-200 arasında olmalıdır.');
    if (!Number.isInteger(s.questionStart) || !Number.isInteger(s.questionEnd) || s.questionStart < 1 || s.questionEnd < s.questionStart || s.questionEnd - s.questionStart + 1 !== s.questionCount) return err(400, 'INVALID_QUESTION_RANGE', 'Soru başlangıç/bitiş aralığı soru sayısıyla uyuşmalıdır.');
    if (s.questionEnd > 1000) return err(400, 'INVALID_QUESTION_RANGE', 'Soru numarası 1000 değerini geçemez.');
    if (s.optionCount !== 4 && s.optionCount !== 5) return err(400, 'INVALID_OPTION_COUNT', 'Şık sayısı 4 veya 5 olmalıdır.');
    if (!['ACTIVE', 'CANCELLED', 'EXCLUDED'].includes(s.questionStatus)) return err(400, 'INVALID_QUESTION_STATUS', 'Geçersiz soru durumu.');
    if (!Number.isFinite(s.wrongDivisor) || s.wrongDivisor <= 0 || s.wrongDivisor > 20) return err(400, 'INVALID_WRONG_DIVISOR', 'Yanlış götürme böleni geçersiz.');
    const subject = await one(env.DB.prepare('SELECT id FROM subjects WHERE id=? AND active=1').bind(s.subjectId));
    if (!subject) return err(404, 'SUBJECT_NOT_FOUND', 'Seçilen derslerden biri bulunamadı.');
  }

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`DELETE FROM question_outcomes WHERE exam_question_id IN (SELECT id FROM exam_questions WHERE exam_id=?)`).bind(examId),
    env.DB.prepare(`DELETE FROM answer_keys WHERE exam_question_id IN (SELECT id FROM exam_questions WHERE exam_id=?)`).bind(examId),
    env.DB.prepare('DELETE FROM exam_questions WHERE exam_id=?').bind(examId),
    env.DB.prepare('DELETE FROM exam_subjects WHERE exam_id=?').bind(examId),
    env.DB.prepare('DELETE FROM exam_booklets WHERE exam_id=?').bind(examId),
  ];
  let globalNo = 1;
  for (const [index, s] of subjects.entries()) {
    statements.push(env.DB.prepare(`INSERT INTO exam_subjects (id,exam_id,subject_id,question_count,sort_order,wrong_divisor,question_start,question_end,option_count) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(uuid('es'), examId, s.subjectId, s.questionCount, s.sortOrder || index + 1, s.wrongDivisor, s.questionStart, s.questionEnd, s.optionCount));
    for (let q = s.questionStart; q <= s.questionEnd; q++) {
      statements.push(env.DB.prepare(`INSERT INTO exam_questions (id,exam_id,subject_id,question_no,global_no,option_count,question_status) VALUES(?,?,?,?,?,?,?)`)
        .bind(uuid('q'), examId, s.subjectId, q, globalNo++, s.optionCount, s.questionStatus));
    }
  }
  for (const code of booklets) statements.push(env.DB.prepare(`INSERT INTO exam_booklets (id,exam_id,code,active) VALUES(?,?,?,1)`).bind(uuid('book'), examId, code));
  await env.DB.batch(statements);
  await audit(env.DB, user.id, exam.institution_id, 'EXAM_STRUCTURE_REPLACED', 'exam', examId, { booklets, subjects });
  return Response.json({ ok: true, questionCount: globalNo - 1, booklets });
}

async function replaceAnswerKey(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
  const exam = await managedExam(env, user, examId);
  if (!exam) return err(404, 'NOT_FOUND', 'Sınav tanımı bulunamadı.');
  if (exam.status !== 'DRAFT') return err(409, 'EXAM_LOCKED', 'Cevap anahtarı yalnız taslak sınavda değiştirilebilir.');
  const body = await request.json<{
    entries?: Array<{ subjectId?: string; bookletCode?: string; answers?: string; optionCount?: 4 | 5; acceptedAnswers?: Array<string | string[]>; questionStatuses?: Array<'ACTIVE' | 'CANCELLED' | 'EXCLUDED'> }>;
    outcomeMappings?: Array<{ subjectId?: string; questionNo?: number; outcomeId?: string }>;
    outcomeMode?: 'OPTIONAL' | 'OFFICIAL_REQUIRED';
  }>();
  const subjects = await all<any>(env.DB.prepare(`SELECT subject_id,question_count,question_start,question_end,option_count FROM exam_subjects WHERE exam_id=? ORDER BY sort_order`).bind(examId));
  const booklets = await all<{ code: string }>(env.DB.prepare(`SELECT code FROM exam_booklets WHERE exam_id=? AND active=1 ORDER BY code`).bind(examId));
  if (!subjects.length || !booklets.length) return err(409, 'STRUCTURE_REQUIRED', 'Önce ders ve kitapçık yapısını kaydedin.');
  const entryMap = new Map<string, { answers: string; optionCount: 4 | 5; acceptedAnswers?: Array<string | string[]>; questionStatuses?: Array<'ACTIVE' | 'CANCELLED' | 'EXCLUDED'> }>();
  for (const entry of body.entries || []) {
    const subjectId = String(entry.subjectId || '');
    const bookletCode = String(entry.bookletCode || '').trim().toUpperCase();
    const answers = String(entry.answers || '').replace(/\s+/g, '').toUpperCase();
    const optionCount = entry.optionCount === 4 ? 4 : 5;
    entryMap.set(`${subjectId}::${bookletCode}`, { answers, optionCount, acceptedAnswers: entry.acceptedAnswers, questionStatuses: entry.questionStatuses });
  }
  for (const subject of subjects) {
    for (const booklet of booklets) {
      const entry = entryMap.get(`${subject.subject_id}::${booklet.code}`);
      const answers = entry?.answers || '';
      const optionCount = (entry?.optionCount || Number(subject.option_count) || 5) as 4 | 5;
      if (optionCount !== Number(subject.option_count || optionCount)) return err(400, 'OPTION_COUNT_MISMATCH', `${subject.subject_id} / ${booklet.code} şık sayısı sınav yapısıyla uyuşmuyor.`);
      if (!answerStringValid(answers, Number(subject.question_count), optionCount)) {
        return err(400, 'ANSWER_KEY_INCOMPLETE', `${subject.subject_id} / ${booklet.code} cevap anahtarı ${subject.question_count} karakter olmalıdır.`);
      }
      if (entry?.questionStatuses && entry.questionStatuses.length !== Number(subject.question_count)) return err(400, 'QUESTION_STATUS_INCOMPLETE', `${subject.subject_id} soru durumları soru sayısıyla uyuşmuyor.`);
      if (entry?.acceptedAnswers && entry.acceptedAnswers.length !== Number(subject.question_count)) return err(400, 'ACCEPTED_ANSWERS_INCOMPLETE', `${subject.subject_id} kabul edilen cevaplar soru sayısıyla uyuşmuyor.`);
    }
  }

  const questions = await all<any>(env.DB.prepare(`SELECT id,subject_id,question_no,option_count FROM exam_questions WHERE exam_id=? ORDER BY global_no`).bind(examId));
  const questionMap = new Map(questions.map((q) => [`${q.subject_id}::${q.question_no}`, q]));
  const outcomeMode = body.outcomeMode === 'OFFICIAL_REQUIRED' || exam.outcome_mode === 'OFFICIAL_REQUIRED' ? 'OFFICIAL_REQUIRED' : 'OPTIONAL';
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`DELETE FROM answer_keys WHERE exam_question_id IN (SELECT id FROM exam_questions WHERE exam_id=?)`).bind(examId),
    env.DB.prepare(`DELETE FROM question_outcomes WHERE exam_question_id IN (SELECT id FROM exam_questions WHERE exam_id=?)`).bind(examId),
  ];
  for (const subject of subjects) {
    for (const booklet of booklets) {
      const entry = entryMap.get(`${subject.subject_id}::${booklet.code}`)!;
      for (let offset = 0; offset < Number(subject.question_count); offset++) {
        const n = Number(subject.question_start || 1) + offset;
        const question = questionMap.get(`${subject.subject_id}::${n}`);
        if (!question) return err(500, 'QUESTION_STRUCTURE_ERROR', 'Soru yapısı cevap anahtarıyla uyuşmuyor.');
        const primary = entry.answers[offset];
        const acceptedRaw = entry.acceptedAnswers?.[offset];
        const accepted = Array.isArray(acceptedRaw) ? acceptedRaw : typeof acceptedRaw === 'string' ? acceptedRaw.split(/[|/,]/) : [primary];
        const allowed = entry.optionCount === 4 ? /^[A-D]$/ : /^[A-E]$/;
        const normalizedAccepted = [...new Set(accepted.map((x) => String(x).trim().toUpperCase()).filter(Boolean))];
        if (!normalizedAccepted.length || normalizedAccepted.some((x) => !allowed.test(x))) return err(400, 'INVALID_ACCEPTED_ANSWER', `${subject.subject_id} / ${n} kabul edilen cevapları geçersiz.`);
        const status = entry.questionStatuses?.[offset] || 'ACTIVE';
        statements.push(env.DB.prepare(`UPDATE exam_questions SET option_count=?,question_status=? WHERE id=?`).bind(entry.optionCount, status, question.id));
        statements.push(env.DB.prepare(`INSERT INTO answer_keys (id,exam_question_id,booklet_code,correct_answer,option_count,accepted_answers,question_status) VALUES(?,?,?,?,?,?,?)`)
          .bind(uuid('ak'), question.id, booklet.code, primary, entry.optionCount, JSON.stringify(normalizedAccepted), status));
      }
    }
  }

  const seenMappings = new Set<string>();
  for (const mapping of body.outcomeMappings || []) {
    const subjectId = String(mapping.subjectId || '');
    const questionNo = Number(mapping.questionNo);
    const outcomeId = String(mapping.outcomeId || '');
    if (!subjectId || !Number.isInteger(questionNo) || !outcomeId) continue;
    const question = questionMap.get(`${subjectId}::${questionNo}`);
    if (!question) return err(400, 'QUESTION_NOT_FOUND', 'Kazanım eşleştirmesinde geçersiz soru bulundu.');
    const outcome = await one<any>(env.DB.prepare(`SELECT o.id,o.subject_id,o.official,coalesce(cv.verified,0) verified
      FROM outcomes o LEFT JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
      WHERE o.id=? AND o.active=1`).bind(outcomeId));
    if (!outcome || outcome.subject_id !== subjectId) return err(400, 'OUTCOME_SUBJECT_MISMATCH', 'Kazanım ilgili dersle eşleşmiyor.');
    if (outcomeMode === 'OFFICIAL_REQUIRED' && (Number(outcome.official) !== 1 || Number(outcome.verified) !== 1)) return err(400, 'OUTCOME_NOT_VERIFIED', 'Kazanımlı resmî sınavlarda yalnız doğrulanmış MEB/ÖSYM katalog kayıtları kullanılabilir.');
    const key = `${question.id}::${outcomeId}`;
    if (seenMappings.has(key)) continue;
    seenMappings.add(key);
    statements.push(env.DB.prepare(`INSERT INTO question_outcomes (exam_question_id,outcome_id) VALUES(?,?)`).bind(question.id, outcomeId));
  }
  if (outcomeMode !== exam.outcome_mode) statements.push(env.DB.prepare('UPDATE exams SET outcome_mode=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(outcomeMode, examId));
  await env.DB.batch(statements);
  await audit(env.DB, user.id, exam.institution_id, 'EXAM_ANSWER_KEY_REPLACED', 'exam', examId, { entryCount: entryMap.size, outcomeMappingCount: seenMappings.size });
  return Response.json({ ok: true, answerCount: subjects.reduce((sum, s) => sum + Number(s.question_count), 0) * booklets.length, outcomeMappingCount: seenMappings.size });
}

async function replaceInstitutions(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
  const exam = await managedExam(env, user, examId);
  if (!exam) return err(404, 'NOT_FOUND', 'Sınav tanımı bulunamadı.');
  if (user.role !== 'SUPER_ADMIN' || exam.owner_type !== 'CENTRAL') return err(403, 'FORBIDDEN', 'Kurum dağıtımı yalnız merkezi sınavlarda Super Admin tarafından yönetilir.');
  const body = await request.json<{ institutionIds?: string[] }>();
  const ids = [...new Set((body.institutionIds || []).map((x) => String(x).trim()).filter(Boolean))];
  for (const id of ids) {
    if (!(await one(env.DB.prepare('SELECT id FROM institutions WHERE id=?').bind(id)))) return err(404, 'INSTITUTION_NOT_FOUND', 'Seçilen kurumlardan biri bulunamadı.');
  }
  const statements: D1PreparedStatement[] = [env.DB.prepare('DELETE FROM exam_institutions WHERE exam_id=?').bind(examId)];
  for (const institutionId of ids) statements.push(env.DB.prepare(`INSERT INTO exam_institutions (id,exam_id,institution_id,enabled) VALUES(?,?,?,1)`).bind(uuid('ei'), examId, institutionId));
  await env.DB.batch(statements);
  await audit(env.DB, user.id, null, 'EXAM_INSTITUTIONS_REPLACED', 'exam', examId, { institutionIds: ids });
  return Response.json({ ok: true, institutionCount: ids.length });
}

async function setStatus(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
  const exam = await managedExam(env, user, examId);
  if (!exam) return err(404, 'NOT_FOUND', 'Sınav tanımı bulunamadı.');
  const body = await request.json<{ status?: 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED' }>();
  const next = body.status;
  if (!next || !['DRAFT','ACTIVE','CLOSED','ARCHIVED'].includes(next)) return err(400, 'INVALID_STATUS', 'Geçersiz sınav durumu.');
  const allowed: Record<string, string[]> = { DRAFT: ['ACTIVE','ARCHIVED'], ACTIVE: ['CLOSED','ARCHIVED'], CLOSED: ['ARCHIVED'], ARCHIVED: [] };
  if (!allowed[exam.status]?.includes(next)) return err(409, 'INVALID_STATUS_TRANSITION', `${exam.status} durumundan ${next} durumuna geçilemez.`);
  if (next === 'ACTIVE') {
    const ready = await readiness(env, examId);
    if (!ready.ready_to_publish) return err(409, 'EXAM_NOT_READY', 'Sınav yayınlanmaya hazır değil. Ders, kitapçık, tam cevap anahtarı ve doğrulanmış puanlama kuralını kontrol edin.', ready);
    if (exam.owner_type === 'CENTRAL') {
      const assigned = await one<{ c: number }>(env.DB.prepare('SELECT count(*) c FROM exam_institutions WHERE exam_id=? AND enabled=1').bind(examId));
      if (!assigned?.c) return err(409, 'INSTITUTION_ASSIGNMENT_REQUIRED', 'Merkezi sınavı yayınlamadan önce en az bir kurum seçin.');
    }
  }
  await env.DB.prepare('UPDATE exams SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(next, examId).run();
  if (next === 'ACTIVE') {
    if (Number(exam.result_network_enabled || 0) === 1) {
      await env.DB.prepare(`
        INSERT INTO exam_channel_publications (id,exam_id,channel,status,published_by,published_at)
        VALUES(?,?, 'RESULT_NETWORK','ACTIVE',?,CURRENT_TIMESTAMP)
        ON CONFLICT(exam_id,channel) DO UPDATE SET status='ACTIVE',published_by=excluded.published_by,published_at=excluded.published_at
      `).bind(uuid('pub'), examId, user.id).run();
    } else {
      await env.DB.prepare(`UPDATE exam_channel_publications SET status='ARCHIVED' WHERE exam_id=? AND channel='RESULT_NETWORK'`).bind(examId).run();
    }
  }
  if (next === 'ARCHIVED') {
    await env.DB.prepare(`UPDATE exam_channel_publications SET status='ARCHIVED' WHERE exam_id=? AND channel='RESULT_NETWORK'`).bind(examId).run();
  }
  await audit(env.DB, user.id, exam.institution_id, `EXAM_STATUS_${next}`, 'exam', examId, { previous: exam.status, next });
  return Response.json({ ok: true, status: next });
}

async function filterCatalogByInstitution(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/exams') return null;
  const user = await getAuthUser(env, request);
  if (!user) return null;
  const institutionId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('institutionId') : user.institution_id;
  if (!institutionId) return null;
  const response = await accessApp.fetch(request, env);
  if (!response.ok) return response;
  const payload = await response.json<any>();
  const visible = await all<{ id: string }>(env.DB.prepare(`
    SELECT e.id FROM exams e
    WHERE e.status IN ('ACTIVE','CLOSED')
      AND (e.institution_id=? OR EXISTS(SELECT 1 FROM exam_institutions ei WHERE ei.exam_id=e.id AND ei.institution_id=? AND ei.enabled=1))
  `).bind(institutionId, institutionId));
  const allowed = new Set(visible.map((x) => x.id));
  return Response.json({ ...payload, exams: (payload.exams || []).filter((e: any) => allowed.has(e.id)) }, { status: response.status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const filteredCatalog = await filterCatalogByInstitution(request, env);
    if (filteredCatalog) return filteredCatalog;

    const url = new URL(request.url);
    const plainPdfMatch = url.pathname.match(/^\/api\/exam-content\/([^/]+)\/plain-answer-key\.pdf$/);
    if (plainPdfMatch) {
      const auth = await contentUser(env, request);
      if (auth instanceof Response) return auth;
      return request.method === 'POST' ? generatePlainAnswerKey(request, env, auth, plainPdfMatch[1]) : err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    }
    const videoCheckMatch = url.pathname.match(/^\/api\/exam-content\/([^/]+)\/videos\/([^/]+)\/check$/);
    if (videoCheckMatch) {
      const auth = await contentUser(env, request);
      if (auth instanceof Response) return auth;
      return request.method === 'POST' ? checkExamVideo(env, auth, videoCheckMatch[1], videoCheckMatch[2]) : err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    }
    const contentMatch = url.pathname.match(/^\/api\/exam-content\/([^/]+)(?:\/assets\/([^/]+))?(?:\/videos(?:\/([^/]+))?)?$/);
    if (contentMatch) {
      const auth = await contentUser(env, request);
      if (auth instanceof Response) return auth;
      const examId = contentMatch[1];
      if (contentMatch[2] && request.method === 'GET') return downloadExamAsset(request, env, auth, examId, contentMatch[2]);
      if (contentMatch[3]) {
        if (request.method === 'PATCH') return updateExamVideo(request, env, auth, examId, contentMatch[3]);
        if (request.method === 'POST' && url.pathname.endsWith('/check')) return checkExamVideo(env, auth, examId, contentMatch[3]);
        return err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
      }
      if (url.pathname.endsWith('/videos') && request.method === 'POST') return createExamVideo(request, env, auth, examId);
      if (url.pathname.endsWith('/plain-answer-key.pdf') && request.method === 'POST') return generatePlainAnswerKey(request, env, auth, examId);
      return request.method === 'GET' ? contentList(env, auth, examId) : err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    }
    const uploadMatch = url.pathname.match(/^\/api\/exam-content\/([^/]+)\/assets$/);
    if (uploadMatch) {
      const auth = await contentUser(env, request);
      if (auth instanceof Response) return auth;
      return request.method === 'POST' ? uploadContentAsset(request, env, auth, uploadMatch[1]) : err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    }
    if (!url.pathname.startsWith('/api/exam-definitions')) return accessApp.fetch(request, env);
    const auth = await actor(env, request);
    if (auth instanceof Response) return auth;

    if (url.pathname === '/api/exam-definitions/options' && request.method === 'GET') return options(env, auth, url);
    if (url.pathname === '/api/exam-definitions') {
      if (request.method === 'GET') return listDefinitions(env, auth);
      if (request.method === 'POST') return createDefinition(request, env, auth);
      return err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    }

    const detail = url.pathname.match(/^\/api\/exam-definitions\/([^/]+)$/);
    if (detail) {
      if (request.method === 'GET') return getDefinition(env, auth, detail[1]);
      if (request.method === 'PATCH') return updateGeneral(request, env, auth, detail[1]);
      return err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    }
    const structure = url.pathname.match(/^\/api\/exam-definitions\/([^/]+)\/structure$/);
    if (structure) return request.method === 'PUT' ? replaceStructure(request, env, auth, structure[1]) : err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    const answerKey = url.pathname.match(/^\/api\/exam-definitions\/([^/]+)\/answer-key$/);
    if (answerKey) return request.method === 'PUT' ? replaceAnswerKey(request, env, auth, answerKey[1]) : err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    const institutions = url.pathname.match(/^\/api\/exam-definitions\/([^/]+)\/institutions$/);
    if (institutions) return request.method === 'PUT' ? replaceInstitutions(request, env, auth, institutions[1]) : err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    const status = url.pathname.match(/^\/api\/exam-definitions\/([^/]+)\/status$/);
    if (status) return request.method === 'PATCH' ? setStatus(request, env, auth, status[1]) : err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');

    return err(404, 'NOT_FOUND', 'Sınav tanımı API yolu bulunamadı.');
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    await publishScheduledExamVideos(env);
    if ('scheduled' in accessApp && typeof accessApp.scheduled === 'function') return accessApp.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env>;
