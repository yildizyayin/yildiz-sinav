import type { Env } from '../types';
import { badRequest, forbidden, one } from './db';

/** Validate the selected institution as well as the actor's institution access. */
export async function examEvaluationAccess(env: Env, exam: {id: string; status: string; owner_type: string; institution_id: string | null}, institutionId: string, allowClosed = false): Promise<Response | null> {
  if (exam.status !== 'ACTIVE' && !(allowClosed && exam.status === 'CLOSED')) return badRequest('Sınav değerlendirmeye açık değil. Önce sınavı aktifleştirin.', 'EXAM_NOT_ACTIVE');
  if (exam.owner_type === 'INSTITUTION' && exam.institution_id !== institutionId) return forbidden('Bu sınav seçilen kuruma ait değil.');
  if (exam.owner_type === 'CENTRAL' && !await one(env.DB.prepare('SELECT id FROM exam_institutions WHERE exam_id=? AND institution_id=? AND enabled=1').bind(exam.id, institutionId))) return forbidden('Bu merkezi sınav seçilen kuruma açılmamış.');
  const hidden=await one(env.DB.prepare(`SELECT 1 FROM exams e WHERE e.id=? AND (EXISTS(SELECT 1 FROM exam_revision_state r WHERE r.exam_id=e.id AND r.app_trashed_at IS NOT NULL) OR EXISTS(SELECT 1 FROM exam_channel_publications p WHERE p.exam_id=e.id AND p.channel='LICENSED' AND p.status<>'ACTIVE'))`).bind(exam.id));
  if(hidden)return badRequest('Sınav uygulama yayınından kaldırılmış.','EXAM_NOT_AVAILABLE');
  return null;
}
