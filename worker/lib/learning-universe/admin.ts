import type { AuthUser, Env } from '../../types';
import { all, audit, one } from '../db';
import { REVIEW_AFTER_DAYS, WEEKLY_GOAL } from './map';

/**
 * Öğrenme Evreni merkezi (owner, 11 Nov 2026) for the Super Admin: what is missing (content gaps students ran into),
 * the game templates (switch on/off, grade range, timer), usage and the fixed reward rules. Content is still written
 * and approved through /api/reporting/universe/contents; nothing here loosens approval or rights.
 */
export const XP_RULES = { perPlay: '10 + doğru oranı × 20 (bir oturum için bir kez)', perLevel: 200, weeklyGoal: WEEKLY_GOAL, reviewAfterDays: REVIEW_AFTER_DAYS,
  note: 'XP oynamanın ödülüdür; karne, kazanım durumu ve not hesabında kullanılmaz.' };

export async function contentGaps(env: Env, q: { academicYear?: string | null; gradeLevel?: number | null; limit?: number }) {
  const rows = await all<any>(env.DB.prepare(`SELECT g.academic_year,g.grade_level,g.outcome_id,g.template_kind,g.needed,g.available,g.hits,g.first_seen_at,g.last_seen_at,o.code,o.title,COALESCE(s.name,'Ders') subject_name,
      (SELECT count(*) FROM lu_game_contents c WHERE c.outcome_id=g.outcome_id AND c.review_status IN ('DRAFT','REVIEW')) waiting
    FROM lu_content_gaps g JOIN outcomes o ON o.id=g.outcome_id LEFT JOIN subjects s ON s.id=o.subject_id
    WHERE (? IS NULL OR g.academic_year=?) AND (? IS NULL OR g.grade_level=?) ORDER BY g.hits DESC,g.last_seen_at DESC LIMIT ?`)
    .bind(q.academicYear ?? null, q.academicYear ?? null, q.gradeLevel ?? null, q.gradeLevel ?? null, Math.min(500, q.limit ?? 200)));
  return rows.map((r) => ({ academicYear: r.academic_year, gradeLevel: r.grade_level, outcome: { id: r.outcome_id, code: r.code, title: r.title, subjectName: r.subject_name }, templateKind: r.template_kind,
    needed: r.needed, available: r.available, hits: r.hits, firstSeenAt: r.first_seen_at, lastSeenAt: r.last_seen_at, waitingForReview: Number(r.waiting || 0) }));
}

export async function listTemplates(env: Env) {
  return all<any>(env.DB.prepare(`SELECT code,kind,title,description,content_kind,min_grade,max_grade,min_items,max_items,seconds_per_item,active,sort_order,updated_at FROM lu_game_templates ORDER BY sort_order`));
}

/** Only the switches that change who sees a template; the content rules (kinds, item counts) stay as built. */
export async function updateTemplate(env: Env, user: AuthUser, code: string, b: any) {
  const t = await one<any>(env.DB.prepare(`SELECT * FROM lu_game_templates WHERE code=?`).bind(code));
  if (!t) return { ok: false, status: 404, code: 'TEMPLATE_NOT_FOUND', message: 'Şablon bulunamadı.' } as const;
  const active = b?.active === undefined ? t.active : b.active ? 1 : 0;
  const minGrade = b?.minGrade === undefined ? t.min_grade : Number(b.minGrade), maxGrade = b?.maxGrade === undefined ? t.max_grade : Number(b.maxGrade);
  if (!Number.isInteger(minGrade) || !Number.isInteger(maxGrade) || minGrade < 4 || maxGrade > 12 || minGrade > maxGrade) return { ok: false, status: 400, code: 'INVALID_GRADES', message: 'Sınıf aralığı 4–12 içinde olmalı.' } as const;
  let seconds = t.seconds_per_item;
  if (b?.secondsPerItem !== undefined) {
    if (t.seconds_per_item == null && b.secondsPerItem != null) return { ok: false, status: 400, code: 'NOT_TIMED', message: 'Bu şablon süreli değil.' } as const;
    seconds = b.secondsPerItem == null ? t.seconds_per_item : Number(b.secondsPerItem);
    if (seconds != null && (!Number.isInteger(seconds) || seconds < 15 || seconds > 180)) return { ok: false, status: 400, code: 'INVALID_SECONDS', message: 'Soru başına süre 15–180 saniye olmalı.' } as const;
  }
  await env.DB.prepare(`UPDATE lu_game_templates SET active=?,min_grade=?,max_grade=?,seconds_per_item=?,updated_at=CURRENT_TIMESTAMP WHERE code=?`).bind(active, minGrade, maxGrade, seconds, code).run();
  await audit(env.DB, user.id, null, 'LU_TEMPLATE_UPDATED', 'lu_game_template', code, { active, minGrade, maxGrade, seconds });
  return { ok: true } as const;
}

/** Usage over the last 30 days, and the size of the stores; counts only, no student is named. */
export async function universeUsage(env: Env) {
  const [byTemplate, totals, contents, exams, tasks, gaps] = await Promise.all([
    all<any>(env.DB.prepare(`SELECT s.template_code code,t.title,count(*) plays,count(DISTINCT s.student_id) students,ROUND(AVG(CASE WHEN s.item_count>0 THEN 100.0*s.correct_count/s.item_count END),1) avg_percent
      FROM lu_sessions s JOIN lu_game_templates t ON t.code=s.template_code WHERE s.status='SUBMITTED' AND s.submitted_at>=datetime('now','-30 days') GROUP BY s.template_code ORDER BY plays DESC`)),
    one<any>(env.DB.prepare(`SELECT count(*) plays,count(DISTINCT student_id) students,COALESCE(SUM(xp_awarded),0) xp,
      (SELECT count(*) FROM lu_session_items i JOIN lu_sessions s2 ON s2.id=i.session_id WHERE s2.submitted_at>=datetime('now','-30 days')) items
      FROM lu_sessions WHERE status='SUBMITTED' AND submitted_at>=datetime('now','-30 days')`)),
    all<any>(env.DB.prepare(`SELECT content_kind kind,review_status status,count(*) n FROM lu_game_contents GROUP BY content_kind,review_status`)),
    one<any>(env.DB.prepare(`SELECT count(*) n,count(DISTINCT student_id) students FROM nibiru_practice_exams WHERE created_at>=datetime('now','-30 days')`)),
    one<any>(env.DB.prepare(`SELECT count(*) n FROM lu_tasks WHERE status='ACTIVE'`)),
    one<any>(env.DB.prepare(`SELECT count(*) n,COALESCE(SUM(hits),0) hits FROM lu_content_gaps`)),
  ]);
  return { days: 30, plays: Number(totals?.plays || 0), students: Number(totals?.students || 0), itemsAnswered: Number(totals?.items || 0), xpAwarded: Number(totals?.xp || 0),
    byTemplate: byTemplate.map((r) => ({ code: r.code, title: r.title, plays: Number(r.plays), students: Number(r.students), avgPercent: r.avg_percent })),
    contents, nibiruExams: { count: Number(exams?.n || 0), students: Number(exams?.students || 0) }, activeTasks: Number(tasks?.n || 0), gaps: { outcomes: Number(gaps?.n || 0), hits: Number(gaps?.hits || 0) } };
}

/** Verified outcomes to attach content to (grade and optional search), newest school year first. */
export async function authoringOutcomes(env: Env, gradeLevel: number, q: string | null) {
  const like = q ? `%${q.toLocaleLowerCase('tr-TR')}%` : null;
  return all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.topic,cv.academic_year,COALESCE(s.name,'Ders') subject_name FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id LEFT JOIN subjects s ON s.id=o.subject_id
    WHERE o.active=1 AND cv.verified=1 AND o.grade_level=? AND cv.grade_level=? AND (? IS NULL OR lower(o.code||' '||o.title||' '||COALESCE(o.topic,'')) LIKE ?)
    ORDER BY cv.academic_year DESC,s.name,o.code LIMIT 100`).bind(gradeLevel, gradeLevel, like, like));
}
