/**
 * A037: common written exam distribution tables (ortak yazılı konu–soru dağılım tabloları).
 * Super Admin enters ÖDSGM and provincial tables and verifies them against a same-year MEB source; a school
 * enters its own committee table and chooses the scenario its committee uses.
 */
import type { AuthUser, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, json, one, uuid } from './lib/db';
import { normalizeTable, verificationBlockers, type TableInput } from './lib/written-scenarios';

const STAFF = ['SUPER_ADMIN', 'INSTITUTION_MANAGER', 'TEACHER', 'GUIDANCE_TEACHER'];
const fail = (status: number, code: string, message: string, details?: unknown) => json({ ok: false, error: { code, message, ...(details ? { details } : {}) } }, status);

async function institutionCity(env: Env, user: AuthUser): Promise<string | null> {
  if (!user.institution_id) return null;
  return (await one<{ city: string | null }>(env.DB.prepare('SELECT city FROM institutions WHERE id=?').bind(user.institution_id)))?.city ?? null;
}

/** Visibility: Super Admin all; staff the verified national tables, their province's verified tables, their own committee tables. */
async function visibleWhere(env: Env, user: AuthUser): Promise<{ sql: string; params: unknown[] }> {
  if (user.role === 'SUPER_ADMIN') return { sql: '1=1', params: [] };
  const city = await institutionCity(env, user);
  return {
    sql: `((t.status='VERIFIED' AND t.authority='ODSGM') OR (t.status='VERIFIED' AND t.authority='IL_ZUMRE' AND lower(t.province)=lower(?)) OR (t.authority='OKUL_ZUMRE' AND t.institution_id=? AND t.status<>'ARCHIVED'))`,
    params: [city || '', user.institution_id || ''],
  };
}

async function loadTable(env: Env, id: string) {
  const table = await one<any>(env.DB.prepare('SELECT t.*,s.name subject_name,s.code subject_code FROM written_exam_tables t JOIN subjects s ON s.id=t.subject_id WHERE t.id=?').bind(id));
  if (!table) return null;
  const scenarios = await all<any>(env.DB.prepare('SELECT id,label,sort_order FROM written_exam_scenarios WHERE table_id=? ORDER BY sort_order').bind(id));
  const rows = await all<any>(env.DB.prepare(`SELECT r.* FROM written_exam_scenario_rows r JOIN written_exam_scenarios s ON s.id=r.scenario_id WHERE s.table_id=? ORDER BY r.sort_order`).bind(id));
  return { ...table, scenarios: scenarios.map((s) => { const own = rows.filter((r) => r.scenario_id === s.id); return { ...s, total: own.reduce((t, r) => t + Number(r.question_count), 0), rows: own }; }) };
}

async function canSee(env: Env, user: AuthUser, id: string): Promise<boolean> {
  const w = await visibleWhere(env, user);
  return !!(await one(env.DB.prepare(`SELECT 1 FROM written_exam_tables t WHERE t.id=? AND ${w.sql}`).bind(id, ...w.params)));
}

const canEdit = (user: AuthUser, t: any) => user.role === 'SUPER_ADMIN' || (user.role === 'INSTITUTION_MANAGER' && t.authority === 'OKUL_ZUMRE' && t.institution_id === user.institution_id);

/** Outcome codes of the table that the verified curriculum of that year, grade and subject knows. */
async function resolveOutcomes(env: Env, t: TableInput): Promise<{ map: Map<string, string>; unknown: string[] }> {
  const codes = [...new Set(t.scenarios.flatMap((s) => s.rows.map((r) => r.outcomeCode).filter(Boolean) as string[]))];
  if (!codes.length) return { map: new Map(), unknown: [] };
  const found = await all<{ id: string; code: string }>(env.DB.prepare(`SELECT o.id,o.code FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
    WHERE cv.verified=1 AND cv.academic_year=? AND coalesce(o.grade_level,cv.grade_level)=? AND o.subject_id=? AND o.active=1 AND o.code IN (${codes.map(() => '?').join(',')})`).bind(t.academicYear, t.gradeLevel, t.subjectId, ...codes));
  const map = new Map(found.map((o) => [o.code, o.id]));
  return { map, unknown: codes.filter((c) => !map.has(c)) };
}

function contentStatements(env: Env, tableId: string, t: TableInput, outcomeIds: Map<string, string>): D1PreparedStatement[] {
  const st: D1PreparedStatement[] = [env.DB.prepare('DELETE FROM written_exam_scenarios WHERE table_id=?').bind(tableId)];
  t.scenarios.forEach((s, i) => {
    const sid = uuid('wes');
    st.push(env.DB.prepare('INSERT INTO written_exam_scenarios(id,table_id,label,sort_order) VALUES(?,?,?,?)').bind(sid, tableId, s.label, i + 1));
    s.rows.forEach((r, k) => st.push(env.DB.prepare('INSERT INTO written_exam_scenario_rows(id,scenario_id,sort_order,unit,topic,outcome_code,outcome_id,question_count) VALUES(?,?,?,?,?,?,?,?)')
      .bind(uuid('wer'), sid, k + 1, r.unit || null, r.topic || null, r.outcomeCode || null, (r.outcomeCode && outcomeIds.get(r.outcomeCode)) || null, r.questionCount)));
  });
  return st;
}

async function list(env: Env, user: AuthUser, url: URL) {
  const w = await visibleWhere(env, user);
  const where = [w.sql]; const params = [...w.params];
  for (const [key, col] of [['academicYear', 't.academic_year'], ['subjectId', 't.subject_id']] as const) { const v = url.searchParams.get(key); if (v) { where.push(`${col}=?`); params.push(v); } }
  for (const [key, col] of [['gradeLevel', 't.grade_level'], ['term', 't.term']] as const) { const v = url.searchParams.get(key); if (v) { where.push(`${col}=?`); params.push(Number(v)); } }
  where.push(url.searchParams.get('archived') === '1' ? `t.status='ARCHIVED'` : `t.status<>'ARCHIVED'`);
  const rows = await all<any>(env.DB.prepare(`SELECT t.id,t.academic_year,t.term,t.exam_no,t.grade_level,t.subject_id,s.name subject_name,t.authority,t.province,t.institution_id,t.source_title,t.source_url,t.source_academic_year,t.status,t.verified_at,
      (SELECT count(*) FROM written_exam_scenarios x WHERE x.table_id=t.id) scenario_count,
      (SELECT c.scenario_id FROM written_exam_scenario_choices c WHERE c.table_id=t.id AND c.institution_id=?) chosen_scenario_id
    FROM written_exam_tables t JOIN subjects s ON s.id=t.subject_id WHERE ${where.join(' AND ')} ORDER BY t.academic_year DESC,t.grade_level,s.name,t.term,t.exam_no LIMIT 500`).bind(user.institution_id || '', ...params));
  return json({ ok: true, tables: rows });
}

async function create(request: Request, env: Env, user: AuthUser) {
  if (!['SUPER_ADMIN', 'INSTITUTION_MANAGER'].includes(user.role)) return fail(403, 'FORBIDDEN', 'Dağılım tablosu girme yetkiniz yok.');
  const body = await request.json().catch(() => null) as any;
  if (user.role === 'INSTITUTION_MANAGER') { body.authority = 'OKUL_ZUMRE'; body.institutionId = user.institution_id; }
  const n = normalizeTable(body); if (!n.value) return fail(400, 'VALIDATION_ERROR', n.errors[0], n.errors);
  const t = n.value;
  if (!(await one(env.DB.prepare('SELECT 1 FROM subjects WHERE id=?').bind(t.subjectId)))) return fail(400, 'VALIDATION_ERROR', 'Ders bulunamadı.');
  if (t.institutionId && !(await one(env.DB.prepare('SELECT 1 FROM institutions WHERE id=?').bind(t.institutionId)))) return fail(400, 'VALIDATION_ERROR', 'Okul bulunamadı.');
  const { map, unknown } = await resolveOutcomes(env, t);
  const id = uuid('wet');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO written_exam_tables(id,academic_year,term,exam_no,grade_level,subject_id,authority,province,institution_id,source_title,source_url,source_academic_year,source_published_at,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, t.academicYear, t.term, t.examNo, t.gradeLevel, t.subjectId, t.authority, t.province, t.institutionId, t.sourceTitle, t.sourceUrl, t.sourceAcademicYear, t.sourcePublishedAt, t.authority === 'OKUL_ZUMRE' ? 'ZUMRE' : 'DRAFT', user.id),
    ...contentStatements(env, id, t, map),
  ]);
  await audit(env.DB, user.id, t.institutionId || user.institution_id || null, 'WRITTEN_TABLE_CREATED', 'written_exam_table', id, { authority: t.authority, academicYear: t.academicYear, gradeLevel: t.gradeLevel, subjectId: t.subjectId, scenarios: t.scenarios.length, unknownOutcomeCodes: unknown });
  return json({ ok: true, id, unknownOutcomeCodes: unknown, blockers: verificationBlockers(t, unknown) }, 201);
}

async function replace(request: Request, env: Env, user: AuthUser, id: string) {
  const current = await one<any>(env.DB.prepare('SELECT * FROM written_exam_tables WHERE id=?').bind(id));
  if (!current || !(await canSee(env, user, id))) return fail(404, 'NOT_FOUND', 'Tablo bulunamadı.');
  if (!canEdit(user, current)) return fail(403, 'FORBIDDEN', 'Bu tabloyu değiştirme yetkiniz yok.');
  if (['VERIFIED', 'ARCHIVED'].includes(current.status)) return fail(409, 'TABLE_LOCKED', 'Doğrulanmış veya arşivlenmiş tablo değiştirilemez. Yeni tablo girin, eskisini arşivleyin.');
  const body = await request.json().catch(() => null) as any;
  Object.assign(body || {}, { authority: current.authority, province: body?.province ?? current.province, institutionId: current.institution_id });
  const n = normalizeTable(body); if (!n.value) return fail(400, 'VALIDATION_ERROR', n.errors[0], n.errors);
  const t = n.value; const { map, unknown } = await resolveOutcomes(env, t);
  await env.DB.batch([
    env.DB.prepare(`UPDATE written_exam_tables SET academic_year=?,term=?,exam_no=?,grade_level=?,subject_id=?,province=?,source_title=?,source_url=?,source_academic_year=?,source_published_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(t.academicYear, t.term, t.examNo, t.gradeLevel, t.subjectId, t.province, t.sourceTitle, t.sourceUrl, t.sourceAcademicYear, t.sourcePublishedAt, id),
    env.DB.prepare('DELETE FROM written_exam_scenario_choices WHERE table_id=?').bind(id),
    ...contentStatements(env, id, t, map),
  ]);
  await audit(env.DB, user.id, current.institution_id || user.institution_id || null, 'WRITTEN_TABLE_UPDATED', 'written_exam_table', id, { scenarios: t.scenarios.length, unknownOutcomeCodes: unknown });
  return json({ ok: true, id, unknownOutcomeCodes: unknown, blockers: verificationBlockers(t, unknown) });
}

async function verify(env: Env, user: AuthUser, id: string) {
  if (user.role !== 'SUPER_ADMIN') return fail(403, 'FORBIDDEN', 'Resmî doğrulamayı yalnız Süper Admin yapar.');
  const table = await loadTable(env, id); if (!table) return fail(404, 'NOT_FOUND', 'Tablo bulunamadı.');
  if (table.status !== 'DRAFT') return fail(409, 'TABLE_NOT_DRAFT', 'Yalnız taslak tablo doğrulanır.');
  const input = { authority: table.authority, academicYear: table.academic_year, gradeLevel: table.grade_level, subjectId: table.subject_id, sourceUrl: table.source_url, sourceAcademicYear: table.source_academic_year, scenarios: table.scenarios.map((s: any) => ({ label: s.label, rows: s.rows.map((r: any) => ({ outcomeCode: r.outcome_code || undefined, questionCount: r.question_count })) })) } as TableInput;
  const { unknown } = await resolveOutcomes(env, input);
  const blockers = verificationBlockers(input, unknown);
  if (blockers.length) return fail(409, 'VERIFICATION_BLOCKED', blockers[0], blockers);
  await env.DB.prepare(`UPDATE written_exam_tables SET status='VERIFIED',verified_by=?,verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='DRAFT'`).bind(user.id, id).run();
  await audit(env.DB, user.id, null, 'WRITTEN_TABLE_VERIFIED', 'written_exam_table', id, { authority: table.authority, academicYear: table.academic_year, source: table.source_url });
  return json({ ok: true, id, status: 'VERIFIED' });
}

async function archive(env: Env, user: AuthUser, id: string) {
  const current = await one<any>(env.DB.prepare('SELECT * FROM written_exam_tables WHERE id=?').bind(id));
  if (!current || !(await canSee(env, user, id))) return fail(404, 'NOT_FOUND', 'Tablo bulunamadı.');
  if (!canEdit(user, current)) return fail(403, 'FORBIDDEN', 'Bu tabloyu arşivleme yetkiniz yok.');
  await env.DB.prepare(`UPDATE written_exam_tables SET status='ARCHIVED',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
  await audit(env.DB, user.id, current.institution_id || null, 'WRITTEN_TABLE_ARCHIVED', 'written_exam_table', id, { previous: current.status });
  return json({ ok: true, id, status: 'ARCHIVED' });
}

async function choose(request: Request, env: Env, user: AuthUser, id: string) {
  if (user.role !== 'INSTITUTION_MANAGER' || !user.institution_id) return fail(403, 'FORBIDDEN', 'Senaryoyu okul yöneticisi (zümre kararıyla) seçer.');
  if (!(await canSee(env, user, id))) return fail(404, 'NOT_FOUND', 'Tablo bulunamadı.');
  const table = await one<any>(env.DB.prepare('SELECT status FROM written_exam_tables WHERE id=?').bind(id));
  if (!['VERIFIED', 'ZUMRE'].includes(table?.status)) return fail(409, 'TABLE_NOT_USABLE', 'Yalnız doğrulanmış tablo ya da okul zümresi tablosu seçilebilir.');
  const body = await request.json().catch(() => ({})) as any;
  const scenario = await one<any>(env.DB.prepare('SELECT id,label FROM written_exam_scenarios WHERE id=? AND table_id=?').bind(String(body?.scenarioId || ''), id));
  if (!scenario) return fail(400, 'VALIDATION_ERROR', 'Senaryo bu tabloda yok.');
  await env.DB.prepare(`INSERT INTO written_exam_scenario_choices(institution_id,table_id,scenario_id,chosen_by) VALUES(?,?,?,?) ON CONFLICT(institution_id,table_id) DO UPDATE SET scenario_id=excluded.scenario_id,chosen_by=excluded.chosen_by,chosen_at=CURRENT_TIMESTAMP`).bind(user.institution_id, id, scenario.id, user.id).run();
  await audit(env.DB, user.id, user.institution_id, 'WRITTEN_SCENARIO_CHOSEN', 'written_exam_table', id, { scenarioId: scenario.id, label: scenario.label, note: String(body?.note || '').slice(0, 300) || null });
  return json({ ok: true, id, scenarioId: scenario.id });
}

export async function handleWrittenScenarios(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/written-scenarios')) return null;
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (!STAFF.includes(user.role) || user.must_change_password) return fail(403, 'FORBIDDEN', 'Bu bölüme erişiminiz yok.');
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  if (url.pathname === '/api/written-scenarios') return request.method === 'GET' ? list(env, user, url) : request.method === 'POST' ? create(request, env, user) : fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  if (url.pathname === '/api/written-scenarios/subjects' && request.method === 'GET') return json({ ok: true, subjects: await all(env.DB.prepare('SELECT id,code,name FROM subjects WHERE active=1 ORDER BY name')) });
  const m = url.pathname.match(/^\/api\/written-scenarios\/([^/]+)(?:\/(verify|archive|choice))?$/);
  if (!m) return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
  const [, id, action] = m;
  if (!action) {
    if (request.method === 'GET') {
      if (!(await canSee(env, user, id))) return fail(404, 'NOT_FOUND', 'Tablo bulunamadı.');
      const table = await loadTable(env, id);
      const choice = user.institution_id ? await one<any>(env.DB.prepare('SELECT scenario_id,chosen_at FROM written_exam_scenario_choices WHERE institution_id=? AND table_id=?').bind(user.institution_id, id)) : null;
      const blockers = user.role === 'SUPER_ADMIN' && table!.status === 'DRAFT'
        ? verificationBlockers({ authority: table!.authority, academicYear: table!.academic_year, sourceUrl: table!.source_url, sourceAcademicYear: table!.source_academic_year }, [...new Set(table!.scenarios.flatMap((s: any) => s.rows.filter((r: any) => r.outcome_code && !r.outcome_id).map((r: any) => r.outcome_code)))] as string[])
        : [];
      return json({ ok: true, table, choice, blockers });
    }
    if (request.method === 'PUT') return replace(request, env, user, id);
    return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  }
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  if (action === 'verify') return verify(env, user, id);
  if (action === 'archive') return archive(env, user, id);
  return choose(request, env, user, id);
}
