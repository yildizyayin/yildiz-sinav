import type { Env } from '../types';
import { one } from './db';

/**
 * S027: who may use a central exam.
 * A central exam with no enabled rows in exam_institutions is open to every institution.
 * Rows in exam_institutions narrow it to those institutions only.
 * An institution's own exam (owner_type='INSTITUTION') is seen only by that institution.
 */
export const centralOpenToAllSql = (examAlias = 'e') => `NOT EXISTS(SELECT 1 FROM exam_institutions eaud WHERE eaud.exam_id=${examAlias}.id AND eaud.enabled=1)`;

/** SQL that is true when the exam may be used by an institution. It has two `?` placeholders: bind the institution id twice. */
export const examOpenToInstitutionSql = (examAlias = 'e') => `((${examAlias}.owner_type='INSTITUTION' AND ${examAlias}.institution_id=?) OR (${examAlias}.owner_type='CENTRAL' AND (${centralOpenToAllSql(examAlias)} OR EXISTS(SELECT 1 FROM exam_institutions eaun WHERE eaun.exam_id=${examAlias}.id AND eaun.institution_id=? AND eaun.enabled=1))))`;

export async function centralExamOpenTo(env: Env, examId: string, institutionId: string): Promise<boolean> {
  const row = await one<{ ok: number }>(env.DB.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM exam_institutions WHERE exam_id=? AND enabled=1) OR EXISTS(SELECT 1 FROM exam_institutions WHERE exam_id=? AND institution_id=? AND enabled=1) THEN 1 ELSE 0 END ok`).bind(examId, examId, institutionId));
  return Number(row?.ok) === 1;
}
