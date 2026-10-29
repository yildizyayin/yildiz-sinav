import type { Env } from '../types';
import { badRequest, forbidden, one } from './db';
import { centralExamOpenTo } from './exam-audience';

/** Validate the selected institution as well as the actor's institution access. */
export async function examEvaluationAccess(env: Env, exam: {id: string; status: string; owner_type: string; institution_id: string | null}, institutionId: string, allowClosed = false): Promise<Response | null> {
  if (exam.status !== 'ACTIVE' && !(allowClosed && exam.status === 'CLOSED')) return badRequest('Sınav değerlendirmeye açık değil. Önce sınavı aktifleştirin.', 'EXAM_NOT_ACTIVE');
  if (exam.owner_type === 'INSTITUTION' && exam.institution_id !== institutionId) return forbidden('Bu sınav seçilen kuruma ait değil.');
  // S042: a dealer's own exam is used in the schools of the dealer's scope (the actor is checked by the result network).
  const dealerOwn = exam.owner_type === 'CENTRAL' ? await one<any>(env.DB.prepare(`SELECT dealer_id FROM result_network_own_exams WHERE exam_id=? AND owner_kind='DEALER'`).bind(exam.id)) : null;
  if (dealerOwn) {
    const { dealerScopeIncludes } = await import('./own-exams');
    if (!await dealerScopeIncludes(env, dealerOwn.dealer_id, institutionId)) return forbidden('Bu bayi sınavı yalnız bayiye kayıtlı kurumlarda kullanılabilir.');
  } else if (exam.owner_type === 'CENTRAL' && !await centralExamOpenTo(env, exam.id, institutionId)) return forbidden('Bu merkezi sınav yalnız seçili kurumlara açık; seçilen kurum listede yok.');
  const hidden=await one(env.DB.prepare(`SELECT 1 FROM exams e WHERE e.id=? AND (EXISTS(SELECT 1 FROM exam_revision_state r WHERE r.exam_id=e.id AND r.app_trashed_at IS NOT NULL) OR EXISTS(SELECT 1 FROM exam_channel_publications p WHERE p.exam_id=e.id AND p.channel='LICENSED' AND p.status<>'ACTIVE'))`).bind(exam.id));
  if(hidden)return badRequest('Sınav uygulama yayınından kaldırılmış.','EXAM_NOT_AVAILABLE');
  return null;
}
