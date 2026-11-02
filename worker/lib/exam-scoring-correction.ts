import type { AuthUser, Env } from '../types';
import { all, audit, json, one } from './db';
import { examCorrectionOpen, examPublicationGuard } from './exam-publication-guard';

/**
 * Puanlama profili düzeltmesi (owner decision 2 Nov). An active exam's definition stays locked; only while its
 * publication is opened for correction (the same state that lets the answer key be corrected) may the scoring profile
 * change, to another verified profile of the same exam type, with a written reason. Nothing is recalculated here:
 * the uploads re-evaluated after the reopening use the new profile, and the next publication freezes them.
 */
const err = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
// A combined TYT+AYT exam uses the YKS score types (OSYM_YKS_SAY…); every other type matches its own token.
const sameType = (ruleCode: unknown, examType: unknown) => { const t = String(examType || '').toUpperCase(); return String(ruleCode || '').toUpperCase().split('_').includes(t === 'TYT_AYT' ? 'YKS' : t); };

export async function scoringProfileOptions(env: Env, exam: any) {
  const rows = await all<any>(env.DB.prepare(`SELECT srv.id,srv.academic_year,srv.version,sr.code rule_code,sr.name rule_name FROM scoring_rule_versions srv JOIN scoring_rules sr ON sr.id=srv.rule_id WHERE srv.verified=1 ORDER BY sr.name,srv.academic_year DESC,srv.version`));
  return rows.filter((r) => sameType(r.rule_code, exam.exam_type));
}

export async function getScoringCorrection(env: Env, exam: any): Promise<Response> {
  const correctionOpen = exam.status === 'DRAFT' ? false : await examCorrectionOpen(env, exam.id);
  return json({ ok: true, current: exam.scoring_rule_version_id || null, correctionOpen, options: await scoringProfileOptions(env, exam) });
}

export async function putScoringCorrection(request: Request, env: Env, user: AuthUser, exam: any): Promise<Response> {
  if (exam.status === 'DRAFT') return err(409, 'USE_EXAM_CARD', 'Taslak sınavda puanlama profili sınav kartından değiştirilir.');
  if (!await examCorrectionOpen(env, exam.id)) return err(409, 'CORRECTION_NOT_OPEN', 'Puanlama profili yalnız sınav gerekçeyle düzeltmeye açıldığında değiştirilebilir. Önce Sonuç Ağı\'nda "Düzeltmeye aç"ı kullanın.');
  const gate = await examPublicationGuard(env, exam.id); if (gate) return gate;
  const body: any = await request.json().catch(() => ({}));
  const reason = String(body.reason || '').trim();
  if (reason.length < 10 || reason.length > 500) return err(400, 'REASON_REQUIRED', 'Değişikliğin gerekçesini yazın (10–500 karakter).');
  const target = (await scoringProfileOptions(env, exam)).find((o) => o.id === String(body.scoringRuleVersionId || ''));
  if (!target) return err(400, 'SCORING_PROFILE_NOT_ALLOWED', 'Bu sınav türü için doğrulanmış bir puanlama profili seçin.');
  if (target.id === exam.scoring_rule_version_id) return err(400, 'SCORING_PROFILE_UNCHANGED', 'Seçilen profil zaten kullanılıyor.');
  await env.DB.prepare(`UPDATE exams SET scoring_rule_version_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'DRAFT'`).bind(target.id, exam.id).run();
  await audit(env.DB, user.id, exam.institution_id || null, 'EXAM_SCORING_PROFILE_CORRECTED', 'exam', exam.id, { from: exam.scoring_rule_version_id, to: target.id, reason });
  const pending = await one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM scan_batches WHERE exam_id=? AND status IN ('READY','NEEDS_REVIEW','PREVIEW')`).bind(exam.id));
  return json({ ok: true, current: target.id, reevaluate: Number(pending?.c || 0), next: 'Sonuç Ağı\'nda bu sınavın yüklemelerini yeniden "Değerlendir"in, sonra "Sonuçları yayınla"ya basın. Puanlar yeni profille hesaplanır.' });
}
