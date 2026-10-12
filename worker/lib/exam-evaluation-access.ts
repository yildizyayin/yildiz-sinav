import type { Env } from '../types';
import { badRequest, forbidden, one } from './db';

/** Validate the selected institution as well as the actor's institution access. */
export async function examEvaluationAccess(env: Env, exam: {id: string; status: string; owner_type: string; institution_id: string | null}, institutionId: string, allowClosed = false): Promise<Response | null> {
  if (exam.status !== 'ACTIVE' && !(allowClosed && exam.status === 'CLOSED')) return badRequest('Sınav değerlendirmeye açık değil. Önce sınavı aktifleştirin.', 'EXAM_NOT_ACTIVE');
  if (exam.owner_type === 'INSTITUTION' && exam.institution_id !== institutionId) return forbidden('Bu sınav seçilen kuruma ait değil.');
  if (exam.owner_type === 'CENTRAL' && !await one(env.DB.prepare('SELECT id FROM exam_institutions WHERE exam_id=? AND institution_id=? AND enabled=1').bind(exam.id, institutionId))) return forbidden('Bu merkezi sınav seçilen kuruma açılmamış.');
  return null;
}
