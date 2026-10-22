/**
 * A039: analytic rubrics of written questions. A version stores criteria with partial-credit levels and
 * alternative correct solutions; its totals must add up. Grading may use a version only after a human
 * teacher approves it for their school (or the Super Admin platform-wide). Approved versions never change.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, one, uuid } from './db';

export type RubricLevel = { points: number; descriptor: string };
export type RubricCriterion = { criterion: string; descriptor?: string; points: number; levels: RubricLevel[] };
export type RubricInput = { totalPoints: number; criteria: RubricCriterion[]; alternatives: { answerText: string; note?: string }[]; changeNote?: string };

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : Number.NaN);

/** Validates a rubric version. `requiredTotal` optionally pins the total (points are otherwise set by the teacher). */
export function normalizeRubric(raw: any, requiredTotal?: number | null): { value?: RubricInput; errors: string[] } {
  const errors: string[] = [];
  const totalPoints = int(raw?.totalPoints);
  if (!(totalPoints >= 1 && totalPoints <= 100)) errors.push('Toplam puan 1–100 arasında tam sayı olmalıdır.');
  else if (requiredTotal && totalPoints !== requiredTotal) errors.push(`Bu sorunun puanı ${requiredTotal}; rubriğin toplamı da ${requiredTotal} olmalıdır.`);
  const list = Array.isArray(raw?.criteria) ? raw.criteria : [];
  if (!list.length || list.length > 10) errors.push('Rubrikte 1–10 ölçüt olmalıdır.');
  const seen = new Set<string>(); const criteria: RubricCriterion[] = [];
  list.slice(0, 10).forEach((c: any, i: number) => {
    const name = `${i + 1}. ölçüt`;
    const criterion = text(c?.criterion, 300); const points = int(c?.points);
    if (criterion.length < 3) errors.push(`${name}: ölçüt metni gereklidir.`);
    const key = criterion.toLocaleLowerCase('tr-TR'); if (criterion && seen.has(key)) errors.push(`${name}: aynı ölçüt iki kez yazılmış.`); seen.add(key);
    if (!(points >= 1 && points <= 100)) errors.push(`${name}: puan 1–100 arasında tam sayı olmalıdır.`);
    const rawLevels = Array.isArray(c?.levels) && c.levels.length ? c.levels : [{ points: 0, descriptor: 'Ölçüt karşılanmadı' }, { points, descriptor: 'Ölçüt tam karşılandı' }];
    const levels: RubricLevel[] = rawLevels.slice(0, 7).map((l: any) => ({ points: int(l?.points), descriptor: text(l?.descriptor, 300) }));
    if (rawLevels.length > 7) errors.push(`${name}: en çok 7 puan düzeyi olabilir.`);
    if (levels.some((l) => !(l.points >= 0) || l.points > points)) errors.push(`${name}: kısmi puanlar 0 ile ${points} arasında tam sayı olmalıdır.`);
    if (levels.some((l) => l.descriptor.length < 2)) errors.push(`${name}: her puan düzeyinin açıklaması olmalıdır.`);
    if (new Set(levels.map((l) => l.points)).size !== levels.length) errors.push(`${name}: aynı puan düzeyi iki kez yazılmış.`);
    if (!levels.some((l) => l.points === 0) || !levels.some((l) => l.points === points)) errors.push(`${name}: 0 puan ve tam puan (${points}) düzeyi bulunmalıdır.`);
    criteria.push({ criterion, ...(text(c?.descriptor, 600) ? { descriptor: text(c?.descriptor, 600) } : {}), points, levels: levels.sort((a, b) => a.points - b.points) });
  });
  const sum = criteria.reduce((t, c) => t + (Number.isInteger(c.points) ? c.points : 0), 0);
  if (criteria.length && totalPoints >= 1 && sum !== totalPoints) errors.push(`Ölçüt puanlarının toplamı ${sum}, toplam puan ${totalPoints}; ikisi eşit olmalıdır.`);
  const altList = Array.isArray(raw?.alternatives) ? raw.alternatives : [];
  if (altList.length > 10) errors.push('En çok 10 alternatif çözüm yazılabilir.');
  const alternatives = altList.slice(0, 10).map((a: any, i: number) => { const answerText = text(a?.answerText, 2000); if (answerText.length < 3) errors.push(`${i + 1}. alternatif çözüm boş.`); return { answerText, ...(text(a?.note, 300) ? { note: text(a?.note, 300) } : {}) }; });
  if (errors.length) return { errors };
  return { value: { totalPoints, criteria, alternatives, ...(text(raw?.changeNote, 300) ? { changeNote: text(raw?.changeNote, 300) } : {}) }, errors };
}

const fail = (status: number, code: string, message: string, details?: unknown) => json({ ok: false, error: { code, message, ...(details ? { details } : {}) } }, status);

async function teacherSubjects(env: Env, user: AuthUser): Promise<string[]> {
  if (user.role !== 'TEACHER' || !user.institution_id) return [];
  return (await all<{ subject_id: string }>(env.DB.prepare(`SELECT DISTINCT subject_id FROM teacher_assignments WHERE user_id=? AND institution_id=? AND active=1 AND assignment_type='SUBJECT' AND subject_id IS NOT NULL`).bind(user.id, user.institution_id))).map((r) => r.subject_id);
}
/** Written questions a user may work on: Super Admin all; a teacher approved items of their subjects, platform or own school. */
async function accessibleQuestion(env: Env, user: AuthUser, id: string) {
  const q = await one<any>(env.DB.prepare(`SELECT q.id,q.stem_text,q.solution_text,q.written_format,q.subject_id,q.grade_level,q.academic_year,q.review_status,q.owner_type,q.owner_id,s.name subject_name,
      (SELECT j.max_points FROM open_ended_generation_items i JOIN open_ended_generation_jobs j ON j.id=i.job_id WHERE i.question_id=q.id) max_points
    FROM question_bank q LEFT JOIN subjects s ON s.id=q.subject_id WHERE q.id=? AND q.question_type='OPEN_ENDED' AND q.review_status<>'ARCHIVED'`).bind(id));
  if (!q) return null;
  if (user.role === 'SUPER_ADMIN') return q;
  if (q.review_status !== 'APPROVED' || !(q.owner_type === 'PLATFORM' || (q.owner_type === 'INSTITUTION' && q.owner_id === user.institution_id))) return null;
  return (await teacherSubjects(env, user)).includes(q.subject_id) ? q : null;
}
/** Versions a user sees: platform versions and, for a teacher, their own school's versions. */
const versionScope = (user: AuthUser) => (user.role === 'SUPER_ADMIN' ? { sql: '1=1', params: [] as unknown[] } : { sql: '(r.institution_id IS NULL OR r.institution_id=?)', params: [user.institution_id] as unknown[] });

/** The version grading uses for a school: a school approval wins over a platform one; newest version first. */
export async function effectiveRubric(env: Env, questionId: string, institutionId: string | null) {
  return one<any>(env.DB.prepare(`SELECT r.*,a.institution_id approval_institution_id,a.approved_by,a.approver_role,a.approved_at FROM question_rubrics r JOIN question_rubric_approvals a ON a.rubric_id=r.id
    WHERE r.question_id=? AND r.status='APPROVED' AND (a.institution_id IS NULL OR a.institution_id=?) AND (r.institution_id IS NULL OR r.institution_id=?)
    ORDER BY (a.institution_id IS NOT NULL) DESC, r.version DESC LIMIT 1`).bind(questionId, institutionId || '', institutionId || ''));
}

async function loadVersions(env: Env, user: AuthUser, questionId: string) {
  const s = versionScope(user);
  const versions = await all<any>(env.DB.prepare(`SELECT r.* FROM question_rubrics r WHERE r.question_id=? AND ${s.sql} ORDER BY r.version DESC`).bind(questionId, ...s.params));
  if (!versions.length) return [];
  const ids = versions.map((v) => v.id); const marks = ids.map(() => '?').join(',');
  const criteria = await all<any>(env.DB.prepare(`SELECT * FROM question_rubric_criteria WHERE rubric_id IN (${marks}) ORDER BY sort_order`).bind(...ids));
  const levels = criteria.length ? await all<any>(env.DB.prepare(`SELECT * FROM question_rubric_levels WHERE criterion_id IN (${criteria.map(() => '?').join(',')}) ORDER BY points`).bind(...criteria.map((c) => c.id))) : [];
  const alternatives = await all<any>(env.DB.prepare(`SELECT * FROM question_rubric_alternatives WHERE rubric_id IN (${marks}) ORDER BY sort_order`).bind(...ids));
  const approvals = await all<any>(env.DB.prepare(`SELECT a.*,u.display_name approver_name FROM question_rubric_approvals a LEFT JOIN users u ON u.id=a.approved_by WHERE a.rubric_id IN (${marks}) ${user.role === 'SUPER_ADMIN' ? '' : 'AND (a.institution_id IS NULL OR a.institution_id=?)'} ORDER BY a.approved_at`).bind(...ids, ...(user.role === 'SUPER_ADMIN' ? [] : [user.institution_id])));
  return versions.map((v) => ({
    ...v,
    criteria: criteria.filter((c) => c.rubric_id === v.id).map((c) => ({ ...c, levels: levels.filter((l) => l.criterion_id === c.id) })),
    alternatives: alternatives.filter((a) => a.rubric_id === v.id),
    approvals: approvals.filter((a) => a.rubric_id === v.id),
  }));
}

function contentStatements(env: Env, rubricId: string, r: RubricInput): D1PreparedStatement[] {
  const st: D1PreparedStatement[] = [env.DB.prepare('DELETE FROM question_rubric_criteria WHERE rubric_id=?').bind(rubricId), env.DB.prepare('DELETE FROM question_rubric_alternatives WHERE rubric_id=?').bind(rubricId)];
  r.criteria.forEach((c, i) => {
    const cid = uuid('qrc');
    st.push(env.DB.prepare('INSERT INTO question_rubric_criteria(id,rubric_id,sort_order,criterion,descriptor,points) VALUES(?,?,?,?,?,?)').bind(cid, rubricId, i + 1, c.criterion, c.descriptor || null, c.points));
    c.levels.forEach((l) => st.push(env.DB.prepare('INSERT INTO question_rubric_levels(id,criterion_id,points,descriptor) VALUES(?,?,?,?)').bind(uuid('qrl'), cid, l.points, l.descriptor)));
  });
  r.alternatives.forEach((a, i) => st.push(env.DB.prepare('INSERT INTO question_rubric_alternatives(id,rubric_id,sort_order,answer_text,note) VALUES(?,?,?,?,?)').bind(uuid('qra'), rubricId, i + 1, a.answerText, a.note || null)));
  return st;
}

async function listQuestions(env: Env, user: AuthUser, url: URL) {
  const where = [`q.question_type='OPEN_ENDED'`, `q.review_status<>'ARCHIVED'`]; const params: unknown[] = [];
  if (user.role !== 'SUPER_ADMIN') {
    const subjects = await teacherSubjects(env, user);
    if (!subjects.length) return json({ ok: true, questions: [] });
    where.push(`q.review_status='APPROVED'`, `(q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?))`, `q.subject_id IN (${subjects.map(() => '?').join(',')})`);
    params.push(user.institution_id, ...subjects);
  }
  for (const [k, col] of [['gradeLevel', 'q.grade_level'], ['subjectId', 'q.subject_id'], ['academicYear', 'q.academic_year']] as const) { const v = url.searchParams.get(k); if (v) { where.push(`${col}=?`); params.push(k === 'gradeLevel' ? Number(v) : v); } }
  const s = versionScope(user);
  const rows = await all<any>(env.DB.prepare(`SELECT q.id,substr(q.stem_text,1,220) stem,q.written_format,q.grade_level,q.academic_year,q.review_status,s.name subject_name,
      (SELECT max(r.version) FROM question_rubrics r WHERE r.question_id=q.id AND ${s.sql}) latest_version,
      (SELECT count(*) FROM question_rubrics r WHERE r.question_id=q.id AND r.status='DRAFT' AND ${s.sql}) drafts
    FROM question_bank q LEFT JOIN subjects s ON s.id=q.subject_id WHERE ${where.join(' AND ')} ORDER BY q.academic_year DESC,q.grade_level,s.name,q.created_at DESC LIMIT 300`).bind(...s.params, ...s.params, ...params));
  const out = [];
  for (const r of rows) { const eff = await effectiveRubric(env, r.id, user.role === 'SUPER_ADMIN' ? null : user.institution_id); out.push({ ...r, effective_version: eff?.version ?? null }); }
  return json({ ok: true, questions: out });
}

async function createVersion(request: Request, env: Env, user: AuthUser, q: any) {
  const body = await request.json().catch(() => null);
  const n = normalizeRubric(body); if (!n.value) return fail(400, 'VALIDATION_ERROR', n.errors[0], n.errors);
  const institutionId = user.role === 'SUPER_ADMIN' ? null : user.institution_id;
  const draft = await one(env.DB.prepare(`SELECT version FROM question_rubrics WHERE question_id=? AND status='DRAFT' AND institution_id IS ?`).bind(q.id, institutionId));
  if (draft) return fail(409, 'RUBRIC_DRAFT_EXISTS', 'Bu soruda zaten bir taslak rubrik var; önce onu düzenleyin veya onaylayın.');
  const next = Number((await one<{ v: number }>(env.DB.prepare('SELECT coalesce(max(version),0)+1 v FROM question_rubrics WHERE question_id=?').bind(q.id)))?.v || 1);
  const id = uuid('qr');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO question_rubrics(id,question_id,institution_id,version,status,total_points,source,change_note,created_by) VALUES(?,?,?,?,'DRAFT',?,'TEACHER',?,?)`).bind(id, q.id, institutionId, next, n.value.totalPoints, n.value.changeNote || null, user.id),
    ...contentStatements(env, id, n.value),
  ]);
  await audit(env.DB, user.id, institutionId, 'RUBRIC_VERSION_CREATED', 'question_rubric', id, { questionId: q.id, version: next, totalPoints: n.value.totalPoints, criteria: n.value.criteria.length, alternatives: n.value.alternatives.length });
  return json({ ok: true, id, version: next }, 201);
}

async function findVersion(env: Env, user: AuthUser, questionId: string, version: number) {
  const s = versionScope(user);
  return one<any>(env.DB.prepare(`SELECT r.* FROM question_rubrics r WHERE r.question_id=? AND r.version=? AND ${s.sql}`).bind(questionId, version, ...s.params));
}
const canEditDraft = (user: AuthUser, r: any) => user.role === 'SUPER_ADMIN' || (r.institution_id && r.institution_id === user.institution_id);

async function updateVersion(request: Request, env: Env, user: AuthUser, q: any, version: number) {
  const r = await findVersion(env, user, q.id, version); if (!r) return fail(404, 'NOT_FOUND', 'Rubrik sürümü bulunamadı.');
  if (r.status !== 'DRAFT') return fail(409, 'RUBRIC_LOCKED', 'Onaylanmış rubrik değiştirilemez; düzeltme için yeni sürüm oluşturun.');
  if (!canEditDraft(user, r)) return fail(403, 'FORBIDDEN', 'Bu taslağı yalnız Süper Admin değiştirebilir; okulunuz için yeni sürüm oluşturun.');
  const body = await request.json().catch(() => null);
  const n = normalizeRubric(body); if (!n.value) return fail(400, 'VALIDATION_ERROR', n.errors[0], n.errors);
  await env.DB.batch([
    env.DB.prepare(`UPDATE question_rubrics SET total_points=?,change_note=? WHERE id=? AND status='DRAFT'`).bind(n.value.totalPoints, n.value.changeNote || r.change_note, r.id),
    ...contentStatements(env, r.id, n.value),
  ]);
  await audit(env.DB, user.id, r.institution_id || null, 'RUBRIC_VERSION_UPDATED', 'question_rubric', r.id, { questionId: q.id, version, totalPoints: n.value.totalPoints });
  return json({ ok: true, id: r.id, version });
}

async function approveVersion(request: Request, env: Env, user: AuthUser, q: any, version: number) {
  const r = await findVersion(env, user, q.id, version); if (!r) return fail(404, 'NOT_FOUND', 'Rubrik sürümü bulunamadı.');
  if (r.status === 'ARCHIVED') return fail(409, 'RUBRIC_ARCHIVED', 'Arşivlenmiş sürüm onaylanamaz.');
  // the approving scope: a teacher approves for their school; the Super Admin for the version's own scope
  const scope = user.role === 'SUPER_ADMIN' ? (r.institution_id || null) : user.institution_id;
  if (q.review_status !== 'APPROVED') return fail(409, 'QUESTION_NOT_APPROVED', 'Soru içerik ve telif onayından geçmeden rubriği onaylanamaz.');
  const body = await request.json().catch(() => ({})) as any;
  if (body?.confirm !== true) return fail(400, 'CONFIRMATION_REQUIRED', 'Ölçütleri, kısmi puanları, alternatif çözümleri ve toplamı kontrol ettiğinizi onaylayın.');
  // re-check the stored version itself, not the request
  const stored = (await loadVersions(env, user, q.id)).find((v) => v.id === r.id)!;
  const check = normalizeRubric({ totalPoints: stored.total_points, criteria: stored.criteria.map((c: any) => ({ criterion: c.criterion, descriptor: c.descriptor, points: c.points, levels: c.levels.map((l: any) => ({ points: l.points, descriptor: l.descriptor })) })), alternatives: stored.alternatives.map((a: any) => ({ answerText: a.answer_text, note: a.note })) });
  if (!check.value) return fail(409, 'RUBRIC_INCONSISTENT', check.errors[0], check.errors);
  if (await one(env.DB.prepare('SELECT 1 FROM question_rubric_approvals WHERE rubric_id=? AND institution_id IS ?').bind(r.id, scope))) return fail(409, 'ALREADY_APPROVED', 'Bu sürüm bu kapsam için zaten onaylı.');
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO question_rubric_approvals(id,rubric_id,institution_id,approved_by,approver_role,note) VALUES(?,?,?,?,?,?)`).bind(uuid('qrap'), r.id, scope, user.id, user.role, text(body?.note, 300) || null),
      env.DB.prepare(`UPDATE question_rubrics SET status='APPROVED' WHERE id=? AND status='DRAFT'`).bind(r.id),
    ]);
  } catch { return fail(409, 'RUBRIC_INCONSISTENT', 'Rubrik tutarsız; toplamlar veya puan düzeyleri eksik.'); }
  await audit(env.DB, user.id, scope, 'RUBRIC_VERSION_APPROVED', 'question_rubric', r.id, { questionId: q.id, version, scope: scope || 'PLATFORM', role: user.role });
  return json({ ok: true, id: r.id, version, scope: scope || 'PLATFORM' });
}

async function archiveDraft(env: Env, user: AuthUser, q: any, version: number) {
  const r = await findVersion(env, user, q.id, version); if (!r) return fail(404, 'NOT_FOUND', 'Rubrik sürümü bulunamadı.');
  if (r.status !== 'DRAFT') return fail(409, 'RUBRIC_LOCKED', 'Yalnız taslak sürüm kaldırılabilir; onaylı sürüm kayıt olarak kalır.');
  if (!canEditDraft(user, r)) return fail(403, 'FORBIDDEN', 'Bu taslağı kaldırma yetkiniz yok.');
  await env.DB.prepare(`UPDATE question_rubrics SET status='ARCHIVED' WHERE id=? AND status='DRAFT'`).bind(r.id).run();
  await audit(env.DB, user.id, r.institution_id || null, 'RUBRIC_VERSION_ARCHIVED', 'question_rubric', r.id, { questionId: q.id, version });
  return json({ ok: true, id: r.id, version });
}

export async function handleQuestionRubrics(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/question-rubrics')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (!['SUPER_ADMIN', 'TEACHER'].includes(user.role) || user.must_change_password) return fail(403, 'FORBIDDEN', 'Rubrikleri branş öğretmeni ve Süper Admin yönetir.');
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  if (url.pathname === '/api/question-rubrics' && request.method === 'GET') return listQuestions(env, user, url);
  const m = url.pathname.match(/^\/api\/question-rubrics\/([^/]+)(?:\/versions(?:\/(\d+)(?:\/(approve|archive))?)?)?$/);
  if (!m) return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
  const q = await accessibleQuestion(env, user, m[1]);
  if (!q) return fail(404, 'NOT_FOUND', 'Yazılı soru bulunamadı veya branşınız dışında.');
  const version = m[2] ? Number(m[2]) : null;
  if (!url.pathname.includes('/versions')) {
    if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    const effective = await effectiveRubric(env, q.id, user.role === 'SUPER_ADMIN' ? null : user.institution_id);
    return json({ ok: true, question: q, versions: await loadVersions(env, user, q.id), effectiveVersion: effective?.version ?? null });
  }
  if (version === null) return request.method === 'POST' ? createVersion(request, env, user, q) : fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  if (!m[3]) return request.method === 'PUT' ? updateVersion(request, env, user, q, version) : fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  return m[3] === 'approve' ? approveVersion(request, env, user, q, version) : archiveDraft(env, user, q, version);
}
