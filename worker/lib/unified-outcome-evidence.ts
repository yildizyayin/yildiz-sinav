import type { Env } from '../types';
import { all } from './db';

/**
 * Birleşik Karne, step 1 (owner, 9 Nov 2026): every answered question a student met — in exams, the question bank,
 * mini tests and worksheets (föy) — read from the tables those features already write, and joined into one record
 * per outcome. Nothing is copied: the sources stay the record, so frozen results and past years are untouched.
 *
 * Owner decisions:
 *  - target: 30 different questions per outcome (institutions may later choose 20–100);
 *  - "learned": in the last 30 days at least 8 different questions, at least 80% of them right.
 * Rules kept from the plan:
 *  - a question solved again counts once among different questions; every attempt counts in the attempt total;
 *  - "learned" looks at each question's latest attempt in the window, so drilling one question cannot earn it;
 *  - no evidence is "veri yok", never a failure; game XP is not read here at all.
 */
export const OUTCOME_QUESTION_TARGET = 30;
export const LEARNED_RULE = { days: 30, minQuestions: 8, minRate: 0.8 } as const;

export type EvidenceSource = 'EXAM' | 'QUESTION_BANK' | 'MINI_TEST' | 'FOY';
type Row = { outcome_id: string; question_key: string; source: EvidenceSource; result: number | null; at: string | null };

export type OutcomeEvidence = {
  outcomeId: string; code: string | null; title: string; subjectId: string | null; subjectName: string | null;
  gradeLevel: number | null; academicYear: string | null; programVersion: string | null;
  uniqueQuestions: number; attempts: number; correct: number; wrong: number; blank: number;
  target: number; targetProgress: number;
  bySource: Record<EvidenceSource, { attempts: number; correct: number }>;
  recent: { days: number; uniqueQuestions: number; correct: number; rate: number | null };
  status: 'LEARNED' | 'DEVELOPING' | 'NO_DATA';
  lastAt: string | null;
};

export type EvidenceOptions = {
  /** the institution's own target (20–100); OUTCOME_QUESTION_TARGET when it has none */
  target?: number;
  /** students and parents only see exams whose results were published to them */
  learnerView: boolean;
  /** teachers limited to their subjects */
  subjectIds?: string[] | null;
  academicYear?: string | null;
  now?: Date;
};

const PUBLISHED = `EXISTS (SELECT 1 FROM exam_delivery_profiles publication WHERE publication.exam_id=e.id AND publication.result_freeze_status='PUBLISHED' AND publication.published_at IS NOT NULL AND (publication.result_publish_at IS NULL OR datetime(publication.result_publish_at)<=CURRENT_TIMESTAMP))`;

async function evidenceRows(env: Env, studentId: string, learnerView: boolean): Promise<Row[]> {
  const [exam, bank, mini, foy] = await Promise.all([
    all<Row>(env.DB.prepare(`SELECT qo.outcome_id, 'EQ:'||sa.exam_question_id question_key, 'EXAM' source,
        CASE sa.status WHEN 'CORRECT' THEN 1 WHEN 'BLANK' THEN NULL ELSE 0 END result,
        coalesce(e.exam_date, e.created_at) at
      FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id
      JOIN student_answers sa ON sa.participant_id=ep.id
      JOIN question_outcomes qo ON qo.exam_question_id=sa.exam_question_id
      WHERE ep.student_id=? ${learnerView ? `AND ${PUBLISHED}` : ''}`).bind(studentId)),
    all<Row>(env.DB.prepare(`SELECT o.id outcome_id, 'QB:'||a.question_id question_key, 'QUESTION_BANK' source, a.is_correct result, a.created_at at
      FROM question_practice_attempts a
      JOIN question_learning_links l ON l.question_id=a.question_id
      JOIN learning_nodes n ON n.id=l.node_id AND n.node_type='OUTCOME' AND n.code IS NOT NULL
      JOIN curriculum_versions cv ON cv.academic_year=n.academic_year
      JOIN outcomes o ON o.curriculum_version_id=cv.id AND o.code=n.code AND o.active=1
      WHERE a.student_id=?`).bind(studentId)),
    all<Row>(env.DB.prepare(`SELECT t.outcome_id, 'QB:'||q.question_id question_key, 'MINI_TEST' source,
        CASE WHEN q.student_answer IS NULL OR q.student_answer='' THEN NULL ELSE q.correct END result, q.answered_at at
      FROM coach_mini_tests t JOIN coach_mini_test_questions q ON q.test_id=t.id
      WHERE t.student_id=? AND q.answered_at IS NOT NULL AND t.status IN ('PASSED','FAILED')`).bind(studentId)),
    all<Row>(env.DB.prepare(`SELECT w.outcome_id, 'WS:'||run.source_id||':'||r.worksheet_subject_id||':'||r.worksheet_question_no question_key, 'FOY' source,
        r.is_correct result, coalesce(run.completed_at, r.created_at) at
      FROM assessment_runs run JOIN assessment_responses r ON r.run_id=run.id
      JOIN worksheet_question_links w ON w.worksheet_id=run.source_id AND w.subject_id=r.worksheet_subject_id AND w.question_no=r.worksheet_question_no
      WHERE run.student_id=? AND run.source_type='FOY' AND run.status IN ('SUBMITTED','SCORED') AND w.outcome_id IS NOT NULL`).bind(studentId)),
  ]);
  return [...exam, ...bank, ...mini, ...foy];
}

const time = (v: string | null) => { if (!v) return 0; const t = Date.parse(v.length <= 10 ? `${v}T00:00:00Z` : v.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? '' : 'Z')); return Number.isFinite(t) ? t : 0; };

/** Pure aggregation, so the rules are tested without a database. */
export function aggregateEvidence(rows: Row[], now = new Date(), target: number = OUTCOME_QUESTION_TARGET): Map<string, Omit<OutcomeEvidence, 'code' | 'title' | 'subjectId' | 'subjectName' | 'gradeLevel' | 'academicYear' | 'programVersion'>> {
  const since = now.getTime() - LEARNED_RULE.days * 86400000;
  const out = new Map<string, any>();
  for (const r of rows) {
    let o = out.get(r.outcome_id);
    if (!o) { o = { outcomeId: r.outcome_id, keys: new Set<string>(), latest: new Map<string, { t: number; result: number | null }>(), attempts: 0, correct: 0, wrong: 0, blank: 0, bySource: { EXAM: { attempts: 0, correct: 0 }, QUESTION_BANK: { attempts: 0, correct: 0 }, MINI_TEST: { attempts: 0, correct: 0 }, FOY: { attempts: 0, correct: 0 } }, lastAt: null as string | null, lastT: 0 }; out.set(r.outcome_id, o); }
    o.keys.add(r.question_key); o.attempts++;
    if (r.result === 1) o.correct++; else if (r.result === null) o.blank++; else o.wrong++;
    o.bySource[r.source].attempts++; if (r.result === 1) o.bySource[r.source].correct++;
    const t = time(r.at);
    if (t >= o.lastT) { o.lastT = t; o.lastAt = r.at; }
    if (t >= since && t <= now.getTime() + 86400000) { const prev = o.latest.get(r.question_key); if (!prev || t >= prev.t) o.latest.set(r.question_key, { t, result: r.result }); }
  }
  const result = new Map<string, any>();
  for (const [id, o] of out) {
    const recentQuestions = o.latest.size, recentCorrect = [...o.latest.values()].filter((x: any) => x.result === 1).length;
    const rate = recentQuestions ? recentCorrect / recentQuestions : null;
    const learned = recentQuestions >= LEARNED_RULE.minQuestions && rate !== null && rate >= LEARNED_RULE.minRate;
    result.set(id, {
      outcomeId: id, uniqueQuestions: o.keys.size, attempts: o.attempts, correct: o.correct, wrong: o.wrong, blank: o.blank,
      target, targetProgress: Math.min(1, o.keys.size / target), bySource: o.bySource,
      recent: { days: LEARNED_RULE.days, uniqueQuestions: recentQuestions, correct: recentCorrect, rate },
      status: learned ? 'LEARNED' : o.attempts ? 'DEVELOPING' : 'NO_DATA', lastAt: o.lastAt,
    });
  }
  return result;
}

export async function unifiedOutcomeEvidence(env: Env, studentId: string, options: EvidenceOptions): Promise<OutcomeEvidence[]> {
  const rows = await evidenceRows(env, studentId, options.learnerView);
  if (!rows.length) return [];
  const agg = aggregateEvidence(rows, options.now, options.target || OUTCOME_QUESTION_TARGET);
  const ids = [...agg.keys()];
  const meta: any[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    meta.push(...await all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.subject_id,s.name subject_name,o.grade_level,cv.academic_year,cv.program_version
      FROM outcomes o LEFT JOIN subjects s ON s.id=o.subject_id LEFT JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
      WHERE o.id IN (${part.map(() => '?').join(',')})`).bind(...part)));
  }
  const subjects = options.subjectIds?.length ? new Set(options.subjectIds) : null;
  return meta
    .filter((m) => (!subjects || subjects.has(m.subject_id)) && (!options.academicYear || m.academic_year === options.academicYear))
    .map((m) => ({ ...agg.get(m.id), code: m.code, title: m.title, subjectId: m.subject_id, subjectName: m.subject_name, gradeLevel: m.grade_level, academicYear: m.academic_year, programVersion: m.program_version }) as OutcomeEvidence)
    .sort((a, b) => (a.subjectName || '').localeCompare(b.subjectName || '', 'tr') || (a.code || '').localeCompare(b.code || '', 'tr', { numeric: true }));
}

export async function outcomeQuestionTarget(env: Env, institutionId: string | null | undefined): Promise<number> {
  if (!institutionId) return OUTCOME_QUESTION_TARGET;
  const row = await env.DB.prepare('SELECT outcome_question_target t FROM institution_learning_settings WHERE institution_id=?').bind(institutionId).first<{ t: number }>();
  const t = Number(row?.t);
  return Number.isInteger(t) && t >= 20 && t <= 100 ? t : OUTCOME_QUESTION_TARGET;
}
