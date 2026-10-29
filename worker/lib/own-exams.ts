import type { AuthUser, Env } from '../types';
import { all, json, one, uuid } from './db';
import { EXAM_TEMPLATES } from '../../src/lib/guidedDefinitions';

/**
 * S042 (D-S039, D-S041): a school or a dealer adds its own practice exam on sonuc.anunex.com.
 *
 * - A school's exam is used only by that school. A dealer's exam is used by the dealer and the schools in its scope.
 * - The structure comes from a ready template (LGS, TYT, AYT, 5–7. sınıf); booklets A–D; one answer key per booklet.
 * - It is built through the same definition steps as the app (structure, answer key, readiness, activation), so the
 *   same checks apply. A dealer has no institution, so like every dealer action on sonuc it acts as the platform for
 *   an exam that is recorded as the dealer's own and is never open to anyone else.
 * - Own exams have no Türkiye rank.
 */
export const OWN_PRESETS: Record<string, { label: string; template: string }> = {
  LGS: { label: '8. Sınıf · LGS', template: 'LGS' },
  TYT: { label: 'TYT', template: 'TYT' },
  AYT: { label: 'AYT', template: 'AYT' },
  SCHOOL_5: { label: '5. Sınıf', template: 'SCHOOL_5' },
  SCHOOL_6: { label: '6. Sınıf', template: 'SCHOOL_6' },
  SCHOOL_7: { label: '7. Sınıf', template: 'SCHOOL_7' },
};
const BOOKLETS = ['A', 'B', 'C', 'D'];

export function presetSections(preset: string) {
  const p = OWN_PRESETS[preset];
  const t = p && EXAM_TEMPLATES.find((x) => x.key === p.template);
  return t ? { label: p.label, examType: t.examType, gradeLevel: t.gradeLevel, scoringCode: t.scoringCode, sections: t.sections } : null;
}

export function academicYearOf(date = new Date()) {
  const y = date.getUTCFullYear();
  return date.getUTCMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

async function approvedDealerId(env: Env, userId: string): Promise<string | null> {
  return (await one<any>(env.DB.prepare(`SELECT id FROM result_network_dealers WHERE user_id=? AND status='APPROVED'`).bind(userId)))?.id || null;
}

/** SQL (alias d = national_institution_directory row of the school) true when the school is in dealer `dealerAlias`'s scope. */
const inDealerScope = (dealerExpr: string) => `EXISTS(SELECT 1 FROM result_network_dealers rdo JOIN result_network_dealer_scopes so ON so.dealer_id=rdo.id AND so.active=1 WHERE rdo.id=${dealerExpr} AND rdo.status='APPROVED' AND (so.scope_type='NATIONAL' OR (so.scope_type='INSTITUTION' AND so.meb_code=d.meb_code) OR (so.scope_type='CITY' AND so.city=d.city) OR (so.scope_type='DISTRICT' AND so.city=d.city AND so.district=d.district)))`;

/** Catalog filter: an own exam is listed only to its owner (and, for a dealer's exam, the schools in its scope). */
export async function ownExamCatalogSql(env: Env, user: AuthUser, alias = 'e'): Promise<{ sql: string; args: unknown[] }> {
  if (user.role === 'SUPER_ADMIN') return { sql: '', args: [] };
  const dealerId = await approvedDealerId(env, user.id);
  return {
    sql: ` AND (NOT EXISTS(SELECT 1 FROM result_network_own_exams o WHERE o.exam_id=${alias}.id) OR EXISTS(SELECT 1 FROM result_network_own_exams o WHERE o.exam_id=${alias}.id AND (
      (o.owner_kind='INSTITUTION' AND o.institution_id=?)
      OR (o.owner_kind='DEALER' AND (o.dealer_id=? OR EXISTS(SELECT 1 FROM institutions ui JOIN national_institution_directory d ON d.meb_code=COALESCE(ui.meb_code,ui.code) WHERE ui.id=? AND ${inDealerScope('o.dealer_id')}))))))`,
    args: [user.institution_id || '', dealerId || '', user.institution_id || ''],
  };
}

/** Whether `user` may upload/evaluate `examId` for school `institutionId`. Central exams are not decided here. */
export async function ownExamAllows(env: Env, user: AuthUser, examId: string, institutionId: string): Promise<{ ok: boolean; message?: string }> {
  const own = await one<any>(env.DB.prepare('SELECT * FROM result_network_own_exams WHERE exam_id=?').bind(examId));
  if (!own || user.role === 'SUPER_ADMIN') return { ok: true };
  if (own.owner_kind === 'INSTITUTION') {
    return own.institution_id === institutionId && user.institution_id === institutionId ? { ok: true } : { ok: false, message: 'Bu sınav başka bir kurumun kendi sınavı; yalnız o kurum kullanabilir.' };
  }
  if (!(await dealerScopeIncludes(env, own.dealer_id, institutionId))) return { ok: false, message: 'Bu bayi sınavı yalnız bayiye kayıtlı kurumlarda kullanılabilir.' };
  const dealerId = await approvedDealerId(env, user.id);
  return dealerId === own.dealer_id || user.institution_id === institutionId ? { ok: true } : { ok: false, message: 'Bu sınav bir bayinin kendi sınavı.' };
}

export async function dealerScopeIncludes(env: Env, dealerId: string, institutionId: string): Promise<boolean> {
  return !!(await one(env.DB.prepare(`SELECT 1 x FROM institutions ui JOIN national_institution_directory d ON d.meb_code=COALESCE(ui.meb_code,ui.code) WHERE ui.id=? AND ${inDealerScope('?')}`).bind(institutionId, dealerId)));
}

export async function isOwnExam(env: Env, examId: string) {
  return !!(await one(env.DB.prepare('SELECT 1 x FROM result_network_own_exams WHERE exam_id=?').bind(examId)));
}

/** Own optics: a dealer's optics are seen only by that dealer; a school's own optic is already owner-scoped. */
export async function ownOpticalCatalogSql(env: Env, user: AuthUser, alias = 't'): Promise<{ sql: string; args: unknown[] }> {
  if (user.role === 'SUPER_ADMIN') return { sql: '', args: [] };
  const dealerId = await approvedDealerId(env, user.id);
  return { sql: ` AND (NOT EXISTS(SELECT 1 FROM result_network_own_opticals oo WHERE oo.template_id=${alias}.id) OR EXISTS(SELECT 1 FROM result_network_own_opticals oo WHERE oo.template_id=${alias}.id AND (oo.dealer_id=? OR EXISTS(SELECT 1 FROM institutions ui JOIN national_institution_directory d ON d.meb_code=COALESCE(ui.meb_code,ui.code) WHERE ui.id=? AND ${inDealerScope('oo.dealer_id')}))))`, args: [dealerId || '', user.institution_id || ''] };
}

const fail = (status: number, code: string, message: string, extra: object = {}) => json({ ok: false, error: { code, message, ...(Object.keys(extra).length ? { details: extra } : {}) }, ...extra }, status);

async function step(res: Response, label: string): Promise<any> {
  const data: any = await res.clone().json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`${label}: ${data?.error?.message || 'işlem tamamlanamadı'}`), { code: data?.error?.code || 'OWN_EXAM_STEP_FAILED', status: res.status });
  return data;
}

/**
 * POST /api/admin/result-network/operations/own-exams
 * { mode: 'INSTITUTION' | 'DEALER', title, preset, examDate?, booklets: ['A',…], keys: { A: { TUR: 'ABCD…', … }, … } }
 */
export async function createOwnExam(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const body: any = await request.json().catch(() => ({}));
  const mode = body.mode === 'DEALER' ? 'DEALER' : 'INSTITUTION';
  let owner: { kind: 'INSTITUTION'; institutionId: string; name: string } | { kind: 'DEALER'; dealerId: string; name: string };
  if (user.role === 'SUPER_ADMIN') return fail(400, 'USE_APP', 'Merkez sınavları app.anunex.com Sınav Merkezi\'nden eklenir.');
  if (mode === 'DEALER') {
    const d = await one<any>(env.DB.prepare(`SELECT rd.id,COALESCE(rd.display_name,u.display_name) name FROM result_network_dealers rd JOIN users u ON u.id=rd.user_id WHERE rd.user_id=? AND rd.status='APPROVED'`).bind(user.id));
    if (!d) return fail(403, 'FORBIDDEN', 'Onaylı bayi hesabı gerekir.');
    owner = { kind: 'DEALER', dealerId: d.id, name: d.name || 'Bayi' };
  } else {
    if (user.role !== 'INSTITUTION_MANAGER' || !user.institution_id) return fail(403, 'FORBIDDEN', 'Kendi sınavını kurum yöneticisi ekler.');
    const i = await one<any>(env.DB.prepare(`SELECT i.id,i.name,COALESCE(iac.lifecycle_status,i.status) lifecycle FROM institutions i LEFT JOIN institution_access_controls iac ON iac.institution_id=i.id WHERE i.id=?`).bind(user.institution_id));
    if (!i || i.lifecycle !== 'ACTIVE') return fail(409, 'INSTITUTION_NOT_ACTIVE', 'Kurum aktif değil.');
    owner = { kind: 'INSTITUTION', institutionId: i.id, name: i.name };
  }

  const title = String(body.title || '').trim();
  if (title.length < 3 || title.length > 160) return fail(400, 'VALIDATION_ERROR', 'Sınav adını yazın (3–160 karakter).');
  const preset = presetSections(String(body.preset || ''));
  if (!preset) return fail(400, 'VALIDATION_ERROR', 'Sınav türünü seçin (LGS, TYT, AYT veya 5–7. sınıf).');
  const examDate = String(body.examDate || '').trim() || null;
  if (examDate && !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return fail(400, 'VALIDATION_ERROR', 'Sınav tarihi geçersiz.');
  const booklets = [...new Set((Array.isArray(body.booklets) ? body.booklets : []).map((b: unknown) => String(b).trim().toUpperCase()))].filter((b): b is string => BOOKLETS.includes(b as string)).sort();
  if (!booklets.length) return fail(400, 'VALIDATION_ERROR', 'En az bir kitapçık seçin (A, B, C, D).');

  const subjectRows = await all<any>(env.DB.prepare(`SELECT id,code FROM subjects WHERE active=1 AND code IN (${preset.sections.map(() => '?').join(',')})`).bind(...preset.sections.map((s) => s.subjectCode)));
  const subjectId = new Map(subjectRows.map((r) => [String(r.code), String(r.id)]));
  if (subjectId.size !== preset.sections.length) return fail(500, 'SUBJECTS_MISSING', 'Bu sınav türünün dersleri sistemde eksik. ANUNEX yönetimine bildirin.');

  // Every booklet's key is checked here first, so the person is told exactly which test is short or has a wrong letter.
  const keys = body.keys && typeof body.keys === 'object' ? body.keys : {};
  const problems: string[] = [];
  const entries: Array<{ subjectId: string; bookletCode: string; answers: string; optionCount: number; questionStatuses: string[] }> = [];
  for (const b of booklets) for (const s of preset.sections) {
    const raw = String(keys?.[b]?.[s.subjectCode] ?? '').toLocaleUpperCase('tr-TR').replace(/\s+/g, '');
    const letters = s.optionCount === 4 ? 'ABCD' : 'ABCDE';
    const bad = [...raw].findIndex((c) => !letters.includes(c) && c !== 'X');
    if (bad >= 0) problems.push(`${b} kitapçığı ${s.label}: ${bad + 1}. soruda geçersiz harf "${raw[bad]}" (${letters.split('').join(', ')} kullanın; iptal soru için X).`);
    else if (raw.length !== s.questionCount) problems.push(`${b} kitapçığı ${s.label}: ${s.questionCount} cevap olmalı, ${raw.length} yazıldı.`);
    // An X is a cancelled question: stored as cancelled with a placeholder letter, as the app does.
    else entries.push({ subjectId: subjectId.get(s.subjectCode)!, bookletCode: b, answers: raw.replace(/X/g, 'A'), optionCount: s.optionCount, questionStatuses: [...raw].map((c) => (c === 'X' ? 'CANCELLED' : 'ACTIVE')) });
  }
  if (problems.length) return fail(400, 'ANSWER_KEY_INVALID', 'Cevap anahtarında düzeltilmesi gerekenler var.', { problems });

  const scoring = await one<any>(env.DB.prepare(`SELECT srv.id FROM scoring_rule_versions srv JOIN scoring_rules sr ON sr.id=srv.rule_id WHERE sr.code=? AND srv.verified=1 ORDER BY srv.academic_year DESC,srv.version DESC LIMIT 1`).bind(preset.scoringCode));
  if (!scoring) return fail(500, 'SCORING_MISSING', 'Bu sınav türü için doğrulanmış puanlama kuralı yok. ANUNEX yönetimine bildirin.');

  // The acting identity: the school manager itself, or (dealer) the platform acting for the dealer's own exam.
  const actor: AuthUser = owner.kind === 'INSTITUTION' ? user : { ...user, role: 'SUPER_ADMIN', institution_id: null };
  const origin = new URL(request.url).origin;
  const req = (path: string, method: string, payload: unknown) => new Request(`${origin}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const admin = await import('../exam-admin-entry');
  let examId = '';
  try {
    const created = await step(await admin.createDefinition(req('/api/exam-definitions', 'POST', {
      ownerType: owner.kind === 'INSTITUTION' ? 'INSTITUTION' : 'CENTRAL', institutionId: owner.kind === 'INSTITUTION' ? owner.institutionId : null,
      academicYear: academicYearOf(examDate ? new Date(`${examDate}T12:00:00Z`) : new Date()), title, examType: preset.examType, gradeLevel: preset.gradeLevel,
      examDate, scoringRuleVersionId: scoring.id, publisherName: owner.name.slice(0, 160), sessionLabel: preset.label,
      description: owner.kind === 'DEALER' ? 'Bayinin kendi sınavı (sonuc.anunex.com)' : 'Kurumun kendi sınavı (sonuc.anunex.com)', outcomeMode: 'OPTIONAL',
    }), env, actor), 'Sınav kartı');
    examId = created.id;
    // Recorded as an own exam before anything can list it, so it is never open to other schools even for a moment.
    await env.DB.prepare(`INSERT INTO result_network_own_exams(exam_id,owner_kind,institution_id,dealer_id,created_by) VALUES(?,?,?,?,?)`)
      .bind(examId, owner.kind, owner.kind === 'INSTITUTION' ? owner.institutionId : null, owner.kind === 'DEALER' ? owner.dealerId : null, user.id).run();
    await step(await admin.replaceStructure(req(`/api/exam-definitions/${examId}/structure`, 'PUT', {
      booklets, subjects: preset.sections.map((s, i) => ({ subjectId: subjectId.get(s.subjectCode), questionCount: s.questionCount, questionStart: s.questionStart, questionEnd: s.questionEnd, optionCount: s.optionCount, wrongDivisor: s.wrongDivisor, sortOrder: i + 1 })),
      reason: 'Kendi sınavı: hazır yapı.',
    }), env, actor, examId), 'Ders yapısı');
    await step(await admin.replaceAnswerKey(req(`/api/exam-definitions/${examId}/answer-key`, 'PUT', { entries, outcomeMode: 'OPTIONAL' }), env, actor, examId), 'Cevap anahtarı');
    await step(await admin.setStatus(req(`/api/exam-definitions/${examId}/status`, 'PATCH', { status: 'ACTIVE', reason: 'Kendi sınavı sonuc.anunex.com\'da eklendi.' }), env, actor, examId), 'Etkinleştirme');
    // Listed in the result network for its owner (activation lists only central exams there by itself).
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO exam_channel_publications(id,exam_id,channel,status,published_by,published_at) VALUES(?,?,'RESULT_NETWORK','ACTIVE',?,CURRENT_TIMESTAMP) ON CONFLICT(exam_id,channel) DO UPDATE SET status='ACTIVE'`).bind(uuid('ecp'), examId, user.id),
      env.DB.prepare(`INSERT INTO channel_definition_publications(exam_id,channel,source_revision,definition_json,published_by,status) SELECT e.id,'RESULT_NETWORK',r.revision,json_object('title',e.title,'publisher_name',e.publisher_name,'exam_date',e.exam_date,'listed_by','OWN_EXAM'),?,'ACTIVE' FROM exams e JOIN exam_revision_state r ON r.exam_id=e.id WHERE e.id=? ON CONFLICT(exam_id,channel) DO UPDATE SET status='ACTIVE'`).bind(user.id, examId),
      // A dealer's exam lives on sonuc only; the app channel that activation opens for a central exam is closed again.
      ...(owner.kind === 'DEALER' ? [
        env.DB.prepare(`DELETE FROM channel_definition_publications WHERE exam_id=? AND channel<>'RESULT_NETWORK'`).bind(examId),
        env.DB.prepare(`DELETE FROM exam_channel_publications WHERE exam_id=? AND channel<>'RESULT_NETWORK'`).bind(examId),
      ] : []),
      env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)').bind(uuid('aud'), user.id, owner.kind === 'INSTITUTION' ? owner.institutionId : null, 'RESULT_OWN_EXAM_CREATED', 'exam', examId, JSON.stringify({ owner: owner.kind, preset: body.preset, booklets, title })),
    ]);
    return json({ ok: true, exam: { id: examId, title, preset: body.preset, booklets } }, 201);
  } catch (e: any) {
    // A half-built draft never stays behind: it had no result, so it is deleted at once.
    if (examId) {
      const { permanentlyDeleteExam } = await import('./exam-purge');
      await permanentlyDeleteExam(new Request(`${origin}/x`, { method: 'POST', body: '{}' }), env, actor, examId).catch(() => null);
    }
    return fail(e?.status && e.status < 500 ? e.status : 422, e?.code || 'OWN_EXAM_FAILED', e?.message || 'Sınav eklenemedi.');
  }
}

/** A dealer's own optic version is usable by that dealer and the schools in its scope (who use the dealer's exams). */
export async function ownOpticalAllows(env: Env, user: AuthUser, versionId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  const row = await one<any>(env.DB.prepare(`SELECT oo.dealer_id FROM optical_template_versions v JOIN result_network_own_opticals oo ON oo.template_id=v.template_id WHERE v.id=?`).bind(versionId));
  if (!row) return true;
  if ((await approvedDealerId(env, user.id)) === row.dealer_id) return true;
  if (!user.institution_id) return false;
  return !!(await one(env.DB.prepare(`SELECT 1 x FROM institutions ui JOIN national_institution_directory d ON d.meb_code=COALESCE(ui.meb_code,ui.code) WHERE ui.id=? AND ${inDealerScope('?')}`).bind(user.institution_id, row.dealer_id)));
}

/** The owner of an own exam (the school's manager or the dealer); the Super Admin always counts. */
async function isOwner(env: Env, user: AuthUser, examId: string): Promise<boolean> {
  const own = await one<any>(env.DB.prepare('SELECT * FROM result_network_own_exams WHERE exam_id=?').bind(examId));
  if (!own) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  if (own.owner_kind === 'INSTITUTION') return user.role === 'INSTITUTION_MANAGER' && user.institution_id === own.institution_id;
  return (await approvedDealerId(env, user.id)) === own.dealer_id;
}

/** GET …/own-exams/:id — where the own exam stands for its owner: students evaluated and whether results are open. */
export async function ownExamStatus(env: Env, user: AuthUser, examId: string): Promise<Response> {
  if (!(await isOwner(env, user, examId))) return fail(403, 'FORBIDDEN', 'Bu sınavın sahibi değilsiniz.');
  const row = await one<any>(env.DB.prepare(`SELECT ea.id,ea.status,ea.published_at,(SELECT count(*) FROM exam_participants ep WHERE ep.exam_id=?) participants FROM exam_administrations ea WHERE ea.exam_id=? AND ea.channel='RESULT_NETWORK' ORDER BY ea.created_at DESC LIMIT 1`).bind(examId, examId));
  return json({ ok: true, administration: row ? { id: row.id, status: row.status, publishedAt: row.published_at } : null, participants: Number(row?.participants || 0) });
}

/**
 * POST …/own-exams/:id/publish — D-S041 (owner, 29 Oct): the owner opens its own exam's results to its students.
 * Central exams are unchanged (the Super Admin publishes them). After opening, later uploads join the live ranks.
 */
export async function publishOwnExam(env: Env, user: AuthUser, examId: string): Promise<Response> {
  if (!(await isOwner(env, user, examId))) return fail(403, 'FORBIDDEN', 'Bu sınavın sahibi değilsiniz.');
  const adm = await one<any>(env.DB.prepare(`SELECT id,status FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK' AND status IN ('UPLOADING','EVALUATING','READY','PUBLISHED') ORDER BY created_at DESC LIMIT 1`).bind(examId));
  if (!adm) return fail(409, 'NOTHING_TO_PUBLISH', 'Önce bu sınavda en az bir dosyayı değerlendirin.');
  if (adm.status === 'PUBLISHED') return json({ ok: true, alreadyPublished: true });
  const { freezeAndPublishAdministration } = await import('../result-network-entry');
  const res = await freezeAndPublishAdministration(new Request('https://internal.invalid/'), env, user, adm.id);
  if (res.ok) await env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)').bind(uuid('aud'), user.id, user.institution_id || null, 'RESULT_OWN_EXAM_PUBLISHED', 'exam', examId, JSON.stringify({ administrationId: adm.id })).run();
  return res;
}
