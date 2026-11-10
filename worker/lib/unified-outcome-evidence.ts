import type { Env } from '../types';
import { all } from './db';
import { SERVABLE_VIDEO_SQL } from './video-links';

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

export type EvidenceSource = 'EXAM' | 'QUESTION_BANK' | 'MINI_TEST' | 'FOY' | 'WRITTEN' | 'GAME';
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
  const [exam, bank, mini, foy, game] = await Promise.all([
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
      JOIN outcomes o ON l.node_id='ln_'||o.id AND o.active=1
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
    // Nibiru outcome mini game: server-graded approved questions of the outcome; its XP is not read here
    all<Row>(env.DB.prepare(`SELECT g.outcome_id, 'QB:'||q.question_id question_key, 'GAME' source,
        CASE WHEN q.student_answer IS NULL OR q.student_answer='' THEN NULL ELSE q.correct END result, q.answered_at at
      FROM nibiru_game_rounds g JOIN nibiru_game_questions q ON q.round_id=g.id
      WHERE g.student_id=? AND g.status IN ('PASSED','FAILED') AND q.answered_at IS NOT NULL`).bind(studentId)),
  ]);
  return [...exam, ...bank, ...mini, ...foy, ...game, ...(learnerView ? [] : await writtenRows(env, studentId))];
}

/**
 * Written exams: the teacher's finalised grade (latest version) per item, in points. An item counts as right when the
 * student earned at least WRITTEN_RIGHT_AT of its points — the "strong" threshold of the written outcome report.
 * The item's outcome comes from its bank question's outcome link or the committee scenario row's outcome.
 * Written grades are not shown to students and parents anywhere yet, so this source is for staff only.
 */
export const WRITTEN_RIGHT_AT = 0.7;
async function writtenRows(env: Env, studentId: string): Promise<Row[]> {
  const items = await all<any>(env.DB.prepare(`SELECT f.paper_id, i.id item_id, i.points possible, i.question_id, r.outcome_id row_outcome_id, r.outcome_code,
      t.academic_year, t.grade_level, t.subject_id, coalesce(p.exam_date, f.finalized_at) at,
      (SELECT json_extract(j.value,'$.points') FROM json_each(f.scores_json) j WHERE json_extract(j.value,'$.itemId')=i.id) earned
    FROM written_grade_finalizations f
    JOIN written_papers p ON p.id=f.paper_id AND p.status='FINAL'
    JOIN written_exam_tables t ON t.id=p.table_id
    JOIN written_paper_items i ON i.paper_id=p.id
    JOIN written_exam_scenario_rows r ON r.id=i.scenario_row_id
    WHERE f.student_id=? AND f.version=(SELECT max(x.version) FROM written_grade_finalizations x WHERE x.paper_id=f.paper_id AND x.student_id=f.student_id)`).bind(studentId));
  const rows: Row[] = [];
  for (const it of items) {
    let outcomes: string[] = [];
    if (it.question_id) outcomes = (await all<any>(env.DB.prepare(`SELECT o.id FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id AND o.active=1 WHERE l.question_id=?`).bind(it.question_id))).map((o) => o.id);
    if (!outcomes.length && it.row_outcome_id) outcomes = [it.row_outcome_id];
    if (!outcomes.length && it.outcome_code) {
      const o = await env.DB.prepare(`SELECT o.id FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.code=? AND cv.verified=1 AND cv.academic_year=? AND o.grade_level=? AND o.subject_id=? AND o.active=1 LIMIT 1`).bind(it.outcome_code, it.academic_year, it.grade_level, it.subject_id).first<{ id: string }>();
      if (o) outcomes = [o.id];
    }
    const possible = Number(it.possible || 0), earned = it.earned == null ? 0 : Number(it.earned);
    if (!possible) continue;
    for (const outcomeId of outcomes) rows.push({ outcome_id: outcomeId, question_key: `WR:${it.item_id}`, source: 'WRITTEN', result: earned / possible >= WRITTEN_RIGHT_AT ? 1 : 0, at: it.at });
  }
  return rows;
}

const time = (v: string | null) => { if (!v) return 0; const t = Date.parse(v.length <= 10 ? `${v}T00:00:00Z` : v.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? '' : 'Z')); return Number.isFinite(t) ? t : 0; };

/** Pure aggregation, so the rules are tested without a database. */
export function aggregateEvidence(rows: Row[], now = new Date(), target: number = OUTCOME_QUESTION_TARGET): Map<string, Omit<OutcomeEvidence, 'code' | 'title' | 'subjectId' | 'subjectName' | 'gradeLevel' | 'academicYear' | 'programVersion'>> {
  const since = now.getTime() - LEARNED_RULE.days * 86400000;
  const out = new Map<string, any>();
  for (const r of rows) {
    let o = out.get(r.outcome_id);
    if (!o) { o = { outcomeId: r.outcome_id, keys: new Set<string>(), latest: new Map<string, { t: number; result: number | null }>(), attempts: 0, correct: 0, wrong: 0, blank: 0, bySource: { EXAM: { attempts: 0, correct: 0 }, QUESTION_BANK: { attempts: 0, correct: 0 }, MINI_TEST: { attempts: 0, correct: 0 }, FOY: { attempts: 0, correct: 0 }, WRITTEN: { attempts: 0, correct: 0 }, GAME: { attempts: 0, correct: 0 } }, lastAt: null as string | null, lastT: 0 }; out.set(r.outcome_id, o); }
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

/**
 * Birleşik Karne periods (plan: 3. ay, 6. ay, yıl sonu). Each period runs from the start of the school year to its end,
 * so a later period includes the earlier evidence; "learned" is judged at the period's end with the same 30-day rule.
 * The year starts on the institution season's start date when set, otherwise on MEB's first school day.
 */
const MEB_YEARS: Record<string, { start: string; end: string }> = {
  // MEB 2026-2027 çalışma takvimi: ders yılı 14 Eylül 2026 – 25 Haziran 2027
  '2026-2027': { start: '2026-09-14', end: '2027-06-25' },
};
export function schoolYearBounds(academicYear: string, seasonStart?: string | null): { start: string; end: string } {
  const known = MEB_YEARS[academicYear]; const first = Number(academicYear.slice(0, 4));
  const start = seasonStart && /^\d{4}-\d{2}-\d{2}/.test(seasonStart) ? seasonStart.slice(0, 10) : known?.start || `${first}-09-15`;
  return { start, end: known?.end || `${first + 1}-06-25` };
}
const addMonths = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
export type PeriodKey = 'M3' | 'M6' | 'YEAR';
export function schoolPeriods(bounds: { start: string; end: string }) {
  return [
    { key: 'M3' as PeriodKey, label: '3. ay', from: bounds.start, to: addMonths(bounds.start, 3) },
    { key: 'M6' as PeriodKey, label: '6. ay', from: bounds.start, to: addMonths(bounds.start, 6) },
    { key: 'YEAR' as PeriodKey, label: 'Yıl sonu', from: bounds.start, to: bounds.end },
  ];
}

export async function periodOutcomeEvidence(env: Env, studentId: string, options: EvidenceOptions & { academicYear: string; seasonStart?: string | null; today?: Date; allowedOutcomeIds: Set<string> }) {
  const today = options.today || new Date();
  const bounds = schoolYearBounds(options.academicYear, options.seasonStart);
  // only the outcomes this viewer may see (subject scope, academic year), as the current record already decided
  const rows = (await evidenceRows(env, studentId, options.learnerView)).filter((r) => options.allowedOutcomeIds.has(r.outcome_id));
  const startT = time(bounds.start);
  const periods = [] as any[];
  const byOutcome = new Map<string, Record<PeriodKey, string | null>>();
  for (const p of schoolPeriods(bounds)) {
    const endT = time(p.to) + 86400000 - 1;
    const state = today.getTime() < startT ? 'NOT_STARTED' : today.getTime() <= endT ? 'IN_PROGRESS' : 'COMPLETE';
    const asOf = new Date(Math.min(endT, today.getTime()));
    const inside = state === 'NOT_STARTED' ? [] : rows.filter((r) => { const t = time(r.at); return t >= startT && t <= asOf.getTime(); });
    const agg = aggregateEvidence(inside, asOf, options.target || OUTCOME_QUESTION_TARGET);
    let unique = 0, attempts = 0, recentQ = 0, recentC = 0, learned = 0;
    for (const o of agg.values()) {
      unique += o.uniqueQuestions; attempts += o.attempts; recentQ += o.recent.uniqueQuestions; recentC += o.recent.correct; if (o.status === 'LEARNED') learned++;
      if (!byOutcome.has(o.outcomeId)) byOutcome.set(o.outcomeId, { M3: null, M6: null, YEAR: null });
      byOutcome.get(o.outcomeId)![p.key] = o.status;
    }
    periods.push({ ...p, state, asOf: asOf.toISOString().slice(0, 10), summary: { outcomes: agg.size, learned, developing: agg.size - learned, uniqueQuestions: unique, attempts, recentRate: recentQ ? recentC / recentQ : null } });
  }
  return { bounds, periods, trajectories: [...byOutcome.entries()].map(([outcomeId, statuses]) => ({ outcomeId, statuses })) };
}

/**
 * Birleşik Karne: personal study suggestions for the outcomes still developing. Only content that already exists and
 * may be shown to the student is offered: approved, rights-cleared question bank items not yet solved, published
 * worksheets that cover the outcome, approved videos. When there is nothing, the suggestion says so and points to the
 * teacher — no content is made up.
 */
export async function studyRecommendations(env: Env, studentId: string, institutionId: string | null, outcomes: OutcomeEvidence[], limit = 5) {
  const developing = outcomes.filter((o) => o.status === 'DEVELOPING')
    .sort((a, b) => (a.recent.rate ?? 1) - (b.recent.rate ?? 1) || b.attempts - a.attempts).slice(0, limit);
  const out = [];
  for (const o of developing) {
    const [questions, worksheets, videos] = await Promise.all([
      env.DB.prepare(`SELECT count(*) n FROM question_bank q JOIN question_learning_links l ON l.question_id=q.id AND l.node_id=?
        WHERE q.review_status='APPROVED' AND q.copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN') AND q.correct_answer IS NOT NULL AND q.options_json IS NOT NULL
          AND (q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?))
          AND NOT EXISTS(SELECT 1 FROM question_practice_attempts a WHERE a.student_id=? AND a.question_id=q.id)`).bind(`ln_${o.outcomeId}`, institutionId, studentId).first<{ n: number }>(),
      all<any>(env.DB.prepare(`SELECT DISTINCT w.id,w.title FROM worksheet_question_links l JOIN worksheets w ON w.id=l.worksheet_id AND w.status='PUBLISHED' WHERE l.outcome_id=? ORDER BY w.title LIMIT 2`).bind(o.outcomeId)),
      all<any>(env.DB.prepare(`SELECT vl.id,vl.title,vl.url FROM video_links vl WHERE vl.outcome_id=? AND vl.link_type='TOPIC' AND ${SERVABLE_VIDEO_SQL} LIMIT 1`).bind(o.outcomeId)),
    ]);
    const needForLearned = Math.max(0, LEARNED_RULE.minQuestions - o.recent.uniqueQuestions);
    out.push({
      outcomeId: o.outcomeId, code: o.code, title: o.title, subjectName: o.subjectName,
      recentRate: o.recent.rate, needForLearned, targetGap: Math.max(0, o.target - o.uniqueQuestions),
      practice: { available: Number(questions?.n || 0), nodeId: `ln_${o.outcomeId}` },
      worksheets: worksheets.map((w) => ({ id: w.id, title: w.title })),
      video: videos[0] ? { title: videos[0].title, url: videos[0].url } : null,
      askTeacher: !Number(questions?.n || 0) && !worksheets.length && !videos.length,
    });
  }
  return out;
}
