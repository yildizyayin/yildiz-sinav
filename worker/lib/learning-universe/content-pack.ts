import type { AuthUser, Env } from '../../types';
import { audit, one } from '../db';
import { validateContent } from './grading';

/**
 * Tazelik motoru, aylık içerik paketleri (oyun yol haritası, Aşama 1; owner 25 Nov 2026: "oyun içeriklerini sürekli
 * güncel tutmalıyız"). Many activities in one go, each tied to a verified MEB outcome by its code, each checked like a
 * single one and saved as REVIEW: nothing reaches a student before a person approves it. The same activity sent twice
 * for the same outcome is skipped, so a pack can be sent again after a fix without doubling anything.
 */
export const PACK_KINDS = ['PAIRS', 'SEQUENCE', 'CLOZE', 'HOTSPOT', 'AUDIO_QUESTION', 'STEPS'];
const RIGHTS = ['OWNED', 'LICENSED', 'PUBLIC_DOMAIN', 'UNKNOWN'];
export const PACK_MAX = 200;
type RowResult = { row: number; ok: boolean; id?: string; skipped?: boolean; message?: string };

async function outcomeByCode(env: Env, code: string, grade: number | null, year: string | null) {
  return one<any>(env.DB.prepare(`SELECT o.id,o.code,o.subject_id,o.grade_level,cv.academic_year FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
      WHERE o.code=? AND o.active=1 AND cv.verified=1 AND (? IS NULL OR o.grade_level=?) AND (? IS NULL OR cv.academic_year=?)
      ORDER BY cv.academic_year DESC LIMIT 1`).bind(code, grade, grade, year, year));
}

export async function importContentPack(env: Env, user: AuthUser, body: any) {
  const items: any[] = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return { ok: false as const, status: 400, code: 'EMPTY_PACK', message: 'Pakette etkinlik yok.' };
  if (items.length > PACK_MAX) return { ok: false as const, status: 400, code: 'PACK_TOO_LARGE', message: `Bir pakette en çok ${PACK_MAX} etkinlik olabilir.` };
  const ownerType = user.role === 'SUPER_ADMIN' ? 'PLATFORM' : 'INSTITUTION', ownerId = ownerType === 'PLATFORM' ? null : user.institution_id;
  if (ownerType === 'INSTITUTION' && !ownerId) return { ok: false as const, status: 403, code: 'FORBIDDEN', message: 'Kurum bilgisi bulunamadı.' };
  const results: RowResult[] = [];
  for (let k = 0; k < items.length; k++) {
    const b = items[k] || {}, row = k + 1;
    const kind = String(b.contentKind || '');
    if (!PACK_KINDS.includes(kind)) { results.push({ row, ok: false, message: 'İçerik türü geçersiz.' }); continue; }
    const code = String(b.outcomeCode || '').trim();
    const grade = Number.isInteger(Number(b.gradeLevel)) && Number(b.gradeLevel) ? Number(b.gradeLevel) : null;
    const outcome = code ? await outcomeByCode(env, code, grade, typeof b.academicYear === 'string' ? b.academicYear : null) : null;
    if (!outcome) { results.push({ row, ok: false, message: `${code || 'Kod yok'}: doğrulanmış bir MEB kazanımı bulunamadı.` }); continue; }
    const errors = validateContent(kind, b.public, b.answer);
    if (errors.length) { results.push({ row, ok: false, message: errors.join(' ') }); continue; }
    const pub = JSON.stringify(b.public);
    const dup = await one<any>(env.DB.prepare(`SELECT id FROM lu_game_contents WHERE outcome_id=? AND content_kind=? AND public_json=? AND owner_type=? AND COALESCE(owner_id,'')=COALESCE(?,'') AND review_status<>'REJECTED'`)
      .bind(outcome.id, kind, pub, ownerType, ownerId));
    if (dup) { results.push({ row, ok: true, id: dup.id, skipped: true, message: 'Bu etkinlik zaten var; atlandı.' }); continue; }
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO lu_game_contents(id,content_kind,outcome_id,academic_year,grade_level,subject_id,title,public_json,answer_json,difficulty,owner_type,owner_id,copyright_status,review_status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'REVIEW',?)`)
      .bind(id, kind, outcome.id, outcome.academic_year, outcome.grade_level, outcome.subject_id, typeof b.title === 'string' ? b.title.slice(0, 160) : null, pub, JSON.stringify(b.answer),
        Number.isInteger(b.difficulty) && b.difficulty >= 1 && b.difficulty <= 5 ? b.difficulty : null, ownerType, ownerId, RIGHTS.includes(String(b.copyrightStatus)) ? String(b.copyrightStatus) : 'UNKNOWN', user.id).run();
    results.push({ row, ok: true, id });
  }
  const created = results.filter((r) => r.ok && !r.skipped).length;
  await audit(env.DB, user.id, ownerId, 'LU_CONTENT_PACK_SUBMITTED', 'lu_game_content', undefined, { pack: typeof body?.name === 'string' ? body.name.slice(0, 120) : null, rows: items.length, created });
  return { ok: true as const, created, skipped: results.filter((r) => r.skipped).length, failed: results.filter((r) => !r.ok).length, results };
}
