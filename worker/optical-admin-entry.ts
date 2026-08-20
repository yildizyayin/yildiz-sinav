import examApp from './exam-admin-entry';
import type { AuthUser, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, badRequest, forbidden, json, notFound, one, uuid } from './lib/db';
import { parseWithTemplate } from './lib/parse';
import {
  definitionReadiness,
  parseDefinition,
  validateCameraGeometry,
  validateFiducials,
  validateParserDefinition,
  validatePrintFields,
  type DefinitionSection,
} from './lib/optical-definition';

function safeFileName(value: string): string {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 120) || 'file';
}

function error(status: number, code: string, message: string, details?: unknown): Response {
  return json({ ok: false, error: { code, message, details } }, status);
}

async function requireSuperAdmin(env: Env, request: Request): Promise<AuthUser | Response> {
  const user = await getAuthUser(env, request);
  if (!user) return error(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.role !== 'SUPER_ADMIN') return forbidden('Optik şablon tanımlarını yalnız Super Admin yönetebilir.');
  return user;
}

async function getVersion(env: Env, versionId: string): Promise<any | null> {
  return one<any>(env.DB.prepare(`
    SELECT v.*,t.name template_name,t.vendor,t.status template_status,t.active template_active,
           coalesce(dv.parser_test_passed,0) parser_test_passed,
           coalesce(dv.parser_test_record_count,0) parser_test_record_count,
           dv.parser_tested_at,dv.last_error
    FROM optical_template_versions v
    JOIN optical_templates t ON t.id=v.template_id
    LEFT JOIN optical_definition_validations dv ON dv.optical_template_version_id=v.id
    WHERE v.id=?
  `).bind(versionId));
}

function readinessFor(row: any) {
  return definitionReadiness({
    parser: row.parser_definition,
    camera: row.camera_geometry,
    print: row.print_fields,
    fiducials: row.fiducials,
    pageWidthMm: Number(row.page_width_mm),
    pageHeightMm: Number(row.page_height_mm),
    parserTestPassed: Boolean(row.parser_test_passed),
  });
}

async function listDefinitions(env: Env): Promise<Response> {
  const rows = await all<any>(env.DB.prepare(`
    SELECT t.id,t.name,t.vendor,t.status,t.active,t.created_at,
      (SELECT count(*) FROM optical_template_versions v WHERE v.template_id=t.id) version_count,
      (SELECT v.id FROM optical_template_versions v WHERE v.template_id=t.id AND v.active=1 ORDER BY v.created_at DESC LIMIT 1) active_version_id,
      (SELECT v.version FROM optical_template_versions v WHERE v.template_id=t.id AND v.active=1 ORDER BY v.created_at DESC LIMIT 1) active_version
    FROM optical_templates t
    ORDER BY t.active DESC,t.name
  `));
  return json({ ok: true, templates: rows });
}

async function createTemplate(request: Request, env: Env, actor: AuthUser): Promise<Response> {
  const body = await request.json<{ name?: string; vendor?: string; version?: string; pageWidthMm?: number; pageHeightMm?: number }>();
  const name = body.name?.trim() || '';
  const vendor = body.vendor?.trim() || null;
  const version = body.version?.trim() || 'v1';
  const pageWidthMm = Number(body.pageWidthMm ?? 210);
  const pageHeightMm = Number(body.pageHeightMm ?? 297);
  if (!name) return badRequest('Optik adı gereklidir.');
  if (!Number.isFinite(pageWidthMm) || pageWidthMm <= 0 || !Number.isFinite(pageHeightMm) || pageHeightMm <= 0) return badRequest('Sayfa ölçüleri geçersiz.');
  const duplicate = await one(env.DB.prepare('SELECT id FROM optical_templates WHERE lower(name)=lower(?) AND coalesce(lower(vendor),\'\')=coalesce(lower(?),\'\')').bind(name, vendor));
  if (duplicate) return error(409, 'TEMPLATE_EXISTS', 'Aynı ad ve üreticiyle optik şablon zaten bulunuyor.');
  const templateId = uuid('opt');
  const versionId = uuid('optv');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO optical_templates (id,name,vendor,status,active) VALUES (?,?,?,'NEEDS_DEFINITION',1)`).bind(templateId, name, vendor),
    env.DB.prepare(`INSERT INTO optical_template_versions (id,template_id,version,page_width_mm,page_height_mm,active) VALUES (?,?,?,?,?,0)`).bind(versionId, templateId, version, pageWidthMm, pageHeightMm),
    env.DB.prepare(`INSERT INTO optical_definition_validations (optical_template_version_id) VALUES (?)`).bind(versionId),
  ]);
  await audit(env.DB, actor.id, null, 'OPTICAL_TEMPLATE_CREATED', 'optical_template', templateId, { name, vendor, version, pageWidthMm, pageHeightMm });
  return json({ ok: true, templateId, versionId }, 201);
}

async function getTemplateDetail(env: Env, templateId: string): Promise<Response> {
  const template = await one<any>(env.DB.prepare('SELECT * FROM optical_templates WHERE id=?').bind(templateId));
  if (!template) return notFound('Optik şablon bulunamadı.');
  const versions = await all<any>(env.DB.prepare(`
    SELECT v.id,v.version,v.page_width_mm,v.page_height_mm,v.active,v.created_at,
      v.parser_definition IS NOT NULL has_parser,v.camera_geometry IS NOT NULL has_camera,v.print_fields IS NOT NULL has_print,v.fiducials IS NOT NULL has_fiducials,
      coalesce(d.parser_test_passed,0) parser_test_passed,d.parser_test_record_count,d.parser_tested_at
    FROM optical_template_versions v
    LEFT JOIN optical_definition_validations d ON d.optical_template_version_id=v.id
    WHERE v.template_id=? ORDER BY v.active DESC,v.created_at DESC
  `).bind(templateId));
  return json({ ok: true, template, versions });
}

async function createVersion(request: Request, env: Env, actor: AuthUser, templateId: string): Promise<Response> {
  const template = await one<any>(env.DB.prepare('SELECT * FROM optical_templates WHERE id=?').bind(templateId));
  if (!template) return notFound('Optik şablon bulunamadı.');
  const body = await request.json<{ version?: string; pageWidthMm?: number; pageHeightMm?: number; cloneFromVersionId?: string }>();
  const version = body.version?.trim() || '';
  if (!version) return badRequest('Sürüm adı gereklidir.');
  const duplicate = await one(env.DB.prepare('SELECT id FROM optical_template_versions WHERE template_id=? AND version=?').bind(templateId, version));
  if (duplicate) return error(409, 'VERSION_EXISTS', 'Bu sürüm adı zaten kullanılıyor.');
  let source: any = null;
  if (body.cloneFromVersionId) {
    source = await one<any>(env.DB.prepare('SELECT * FROM optical_template_versions WHERE id=? AND template_id=?').bind(body.cloneFromVersionId, templateId));
    if (!source) return badRequest('Kopyalanacak sürüm bulunamadı.');
  }
  const pageWidthMm = Number(body.pageWidthMm ?? source?.page_width_mm ?? 210);
  const pageHeightMm = Number(body.pageHeightMm ?? source?.page_height_mm ?? 297);
  if (!Number.isFinite(pageWidthMm) || pageWidthMm <= 0 || !Number.isFinite(pageHeightMm) || pageHeightMm <= 0) return badRequest('Sayfa ölçüleri geçersiz.');
  const versionId = uuid('optv');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO optical_template_versions (id,template_id,version,page_width_mm,page_height_mm,parser_definition,camera_geometry,print_fields,fiducials,active)
      VALUES (?,?,?,?,?,?,?,?,?,0)`).bind(versionId, templateId, version, pageWidthMm, pageHeightMm, source?.parser_definition ?? null, source?.camera_geometry ?? null, source?.print_fields ?? null, source?.fiducials ?? null),
    env.DB.prepare(`INSERT INTO optical_definition_validations (optical_template_version_id,parser_test_passed,parser_test_record_count,last_error)
      VALUES (?,?,?,?)`).bind(versionId, 0, 0, source ? 'Kopyalanan parser yeni sürümde yeniden test edilmelidir.' : null),
  ]);
  await audit(env.DB, actor.id, null, 'OPTICAL_VERSION_CREATED', 'optical_template_version', versionId, { templateId, version, cloneFromVersionId: body.cloneFromVersionId || null });
  return json({ ok: true, versionId }, 201);
}

async function versionDetail(env: Env, versionId: string): Promise<Response> {
  const row = await getVersion(env, versionId);
  if (!row) return notFound('Optik sürümü bulunamadı.');
  const assets = await all<any>(env.DB.prepare(`SELECT id,asset_type,file_name,content_type,created_at FROM optical_template_assets WHERE optical_template_version_id=? ORDER BY created_at DESC`).bind(versionId));
  return json({ ok: true, version: row, readiness: readinessFor(row), assets });
}

function sectionValidator(section: DefinitionSection, value: unknown, row: any) {
  if (section === 'parser') return validateParserDefinition(value);
  if (section === 'camera') return validateCameraGeometry(value, Number(row.page_width_mm), Number(row.page_height_mm));
  if (section === 'print') return validatePrintFields(value, Number(row.page_width_mm), Number(row.page_height_mm));
  return validateFiducials(value, Number(row.page_width_mm), Number(row.page_height_mm));
}

async function updateSection(request: Request, env: Env, actor: AuthUser, versionId: string, section: DefinitionSection): Promise<Response> {
  const row = await getVersion(env, versionId);
  if (!row) return notFound('Optik sürümü bulunamadı.');
  if (row.active) return badRequest('Yayındaki optik sürümü doğrudan değiştirilemez. Yeni sürüm oluşturun.', 'PUBLISHED_VERSION_LOCKED');
  const body = await request.json<{ definition?: unknown }>();
  const parsed = parseDefinition(body.definition);
  if (!parsed.value) return badRequest('Tanım doğrulanamadı.', 'INVALID_DEFINITION', parsed.errors);
  const validation = sectionValidator(section, parsed.value, row);
  if (!validation.valid) return badRequest('Tanım doğrulanamadı.', 'INVALID_DEFINITION', validation.errors);
  const column = section === 'parser' ? 'parser_definition' : section === 'camera' ? 'camera_geometry' : section === 'print' ? 'print_fields' : 'fiducials';
  await env.DB.prepare(`UPDATE optical_template_versions SET ${column}=? WHERE id=?`).bind(JSON.stringify(parsed.value), versionId).run();
  if (section === 'parser') {
    await env.DB.prepare(`INSERT INTO optical_definition_validations (optical_template_version_id,parser_test_passed,parser_test_record_count,parser_tested_at,last_error,updated_at)
      VALUES (?,0,0,NULL,'Parser değişti; örnek dosya yeniden test edilmelidir.',CURRENT_TIMESTAMP)
      ON CONFLICT(optical_template_version_id) DO UPDATE SET parser_test_passed=0,parser_test_record_count=0,parser_tested_at=NULL,last_error=excluded.last_error,updated_at=CURRENT_TIMESTAMP`).bind(versionId).run();
  }
  await audit(env.DB, actor.id, null, 'OPTICAL_DEFINITION_UPDATED', 'optical_template_version', versionId, { section });
  const fresh = await getVersion(env, versionId);
  return json({ ok: true, validation, readiness: readinessFor(fresh) });
}

async function testParser(request: Request, env: Env, actor: AuthUser, versionId: string): Promise<Response> {
  const row = await getVersion(env, versionId);
  if (!row) return notFound('Optik sürümü bulunamadı.');
  if (!row.parser_definition) return badRequest('Önce parser tanımı kaydedilmelidir.', 'PARSER_REQUIRED');
  const body = await request.json<{ sampleText?: string; fileName?: string }>();
  const sampleText = body.sampleText || '';
  const fileName = body.fileName?.trim() || 'sample.txt';
  if (!sampleText.trim()) return badRequest('Test için örnek TXT/DAT içeriği gereklidir.');
  if (sampleText.length > 2_000_000) return badRequest('Örnek dosya 2 MB sınırını aşıyor.');
  const result = parseWithTemplate(sampleText, fileName, { id: row.id, name: `${row.template_name} ${row.version}`, parser_definition: row.parser_definition });
  const passed = result.records.length > 0 && !result.ambiguous && result.confidence >= 0.8 && result.records.every((r) => Boolean(r.name) && Object.keys(r.answers_by_subject || {}).length > 0);
  const lastError = passed ? null : (result.issues.join(' · ') || 'Örnek kayıtlar canonical cevaba dönüştürülemedi.');
  await env.DB.prepare(`INSERT INTO optical_definition_validations (optical_template_version_id,parser_test_passed,parser_test_record_count,parser_tested_at,last_error,updated_at)
    VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(optical_template_version_id) DO UPDATE SET parser_test_passed=excluded.parser_test_passed,parser_test_record_count=excluded.parser_test_record_count,parser_tested_at=excluded.parser_tested_at,last_error=excluded.last_error,updated_at=CURRENT_TIMESTAMP`)
    .bind(versionId, passed ? 1 : 0, result.records.length, new Date().toISOString(), lastError).run();
  await audit(env.DB, actor.id, null, passed ? 'OPTICAL_PARSER_TEST_PASSED' : 'OPTICAL_PARSER_TEST_FAILED', 'optical_template_version', versionId, { fileName, recordCount: result.records.length, confidence: result.confidence, issues: result.issues });
  const fresh = await getVersion(env, versionId);
  return json({ ok: true, passed, confidence: result.confidence, recordCount: result.records.length, issues: result.issues, sample: result.records.slice(0, 5), readiness: readinessFor(fresh) });
}

async function uploadAsset(request: Request, env: Env, actor: AuthUser, versionId: string): Promise<Response> {
  const row = await getVersion(env, versionId);
  if (!row) return notFound('Optik sürümü bulunamadı.');
  const form = await request.formData();
  const file = form.get('file');
  const assetType = String(form.get('assetType') || '');
  if (!(file instanceof File)) return badRequest('Dosya seçilmelidir.');
  if (!['BLANK_FORM','FMT_SAMPLE','PRINT_BASE'].includes(assetType)) return badRequest('Geçersiz optik dosya türü.');
  if (file.size > 20 * 1024 * 1024) return badRequest('Dosya 20 MB sınırını aşıyor.');
  const key = `optical-definitions/${row.template_id}/${versionId}/${assetType}/${Date.now()}-${safeFileName(file.name)}`;
  await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  const id = uuid('opta');
  await env.DB.prepare(`INSERT INTO optical_template_assets (id,optical_template_version_id,asset_type,object_key,file_name,content_type,uploaded_by) VALUES (?,?,?,?,?,?,?)`)
    .bind(id, versionId, assetType, key, file.name, file.type || null, actor.id).run();
  await audit(env.DB, actor.id, null, 'OPTICAL_ASSET_UPLOADED', 'optical_template_version', versionId, { assetType, fileName: file.name, objectKey: key });
  return json({ ok: true, id, assetType, fileName: file.name }, 201);
}

async function publishVersion(env: Env, actor: AuthUser, versionId: string): Promise<Response> {
  const row = await getVersion(env, versionId);
  if (!row) return notFound('Optik sürümü bulunamadı.');
  const readiness = readinessFor(row);
  if (!readiness.ready) return badRequest('Optik sürümü yayına hazır değil.', 'OPTICAL_DEFINITION_INCOMPLETE', readiness.errors);
  await env.DB.batch([
    env.DB.prepare('UPDATE optical_template_versions SET active=0 WHERE template_id=?').bind(row.template_id),
    env.DB.prepare('UPDATE optical_template_versions SET active=1 WHERE id=?').bind(versionId),
    env.DB.prepare(`UPDATE optical_templates SET status='READY',active=1 WHERE id=?`).bind(row.template_id),
  ]);
  await audit(env.DB, actor.id, null, 'OPTICAL_VERSION_PUBLISHED', 'optical_template_version', versionId, { templateId: row.template_id, version: row.version });
  return json({ ok: true, status: 'READY', versionId, templateId: row.template_id });
}

async function archiveTemplate(env: Env, actor: AuthUser, templateId: string): Promise<Response> {
  const template = await one<any>(env.DB.prepare('SELECT * FROM optical_templates WHERE id=?').bind(templateId));
  if (!template) return notFound('Optik şablon bulunamadı.');
  await env.DB.batch([
    env.DB.prepare(`UPDATE optical_templates SET status='ARCHIVED',active=0 WHERE id=?`).bind(templateId),
    env.DB.prepare('UPDATE optical_template_versions SET active=0 WHERE template_id=?').bind(templateId),
  ]);
  await audit(env.DB, actor.id, null, 'OPTICAL_TEMPLATE_ARCHIVED', 'optical_template', templateId, { name: template.name });
  return json({ ok: true, status: 'ARCHIVED' });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isOpticalAdmin = url.pathname.startsWith('/api/optical-definitions') || url.pathname.startsWith('/api/optical-definition-versions');
    if (!isOpticalAdmin) return examApp.fetch(request, env);
    try {
      const actor = await requireSuperAdmin(env, request);
      if (actor instanceof Response) return actor;

      if (url.pathname === '/api/optical-definitions') {
        if (request.method === 'GET') return listDefinitions(env);
        if (request.method === 'POST') return createTemplate(request, env, actor);
        return error(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
      }

      const templateArchive = url.pathname.match(/^\/api\/optical-definitions\/([^/]+)\/archive$/);
      if (templateArchive) return request.method === 'POST' ? archiveTemplate(env, actor, templateArchive[1]) : error(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');

      const templateVersions = url.pathname.match(/^\/api\/optical-definitions\/([^/]+)\/versions$/);
      if (templateVersions) return request.method === 'POST' ? createVersion(request, env, actor, templateVersions[1]) : error(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');

      const templateDetail = url.pathname.match(/^\/api\/optical-definitions\/([^/]+)$/);
      if (templateDetail) return request.method === 'GET' ? getTemplateDetail(env, templateDetail[1]) : error(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');

      const sectionMatch = url.pathname.match(/^\/api\/optical-definition-versions\/([^/]+)\/(parser|camera|print|fiducials)$/);
      if (sectionMatch) return request.method === 'PUT' ? updateSection(request, env, actor, sectionMatch[1], sectionMatch[2] as DefinitionSection) : error(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');

      const parserTestMatch = url.pathname.match(/^\/api\/optical-definition-versions\/([^/]+)\/test-parser$/);
      if (parserTestMatch) return request.method === 'POST' ? testParser(request, env, actor, parserTestMatch[1]) : error(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');

      const assetMatch = url.pathname.match(/^\/api\/optical-definition-versions\/([^/]+)\/assets$/);
      if (assetMatch) return request.method === 'POST' ? uploadAsset(request, env, actor, assetMatch[1]) : error(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');

      const publishMatch = url.pathname.match(/^\/api\/optical-definition-versions\/([^/]+)\/publish$/);
      if (publishMatch) return request.method === 'POST' ? publishVersion(env, actor, publishMatch[1]) : error(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');

      const versionMatch = url.pathname.match(/^\/api\/optical-definition-versions\/([^/]+)$/);
      if (versionMatch) return request.method === 'GET' ? versionDetail(env, versionMatch[1]) : error(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');

      return notFound('Optik yönetim API yolu bulunamadı.');
    } catch (e) {
      console.error('Optical admin error', e);
      return error(500, 'SERVER_ERROR', 'Optik şablon işlemi sırasında sunucu hatası oluştu.');
    }
  },
} satisfies ExportedHandler<Env>;
