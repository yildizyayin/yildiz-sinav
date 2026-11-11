import type { AuthUser, Env } from '../../types';
import { all, audit, one, uuid } from '../db';
import { gameAvailability } from './map';
import { studentContext } from './sessions';

/**
 * Öğrenme Evreni — teacher tasks (owner, 11 Nov 2026): a teacher gives an outcome (optionally one game kind) to a class
 * or to chosen students. The student sees it first among the day's missions; it counts as done once the student has
 * finished an Evren game of that outcome (that kind, if one was named) after the task was given. Only a verified outcome
 * of the class's own grade and year, and only students the teacher may see for that subject.
 */
export const TASK_STAFF = ['SUPER_ADMIN', 'INSTITUTION_MANAGER', 'TEACHER', 'GUIDANCE_TEACHER'];
export const TASK_CLASS_LIMIT = 60;

type Access = (studentId: string) => Promise<{ allowed: boolean; subjectFilter: string[] | null; student: any | null }>;

const DONE_SQL = `EXISTS(SELECT 1 FROM lu_sessions s WHERE s.student_id=r.student_id AND s.outcome_id=t.outcome_id AND s.status='SUBMITTED'
  AND (t.template_code IS NULL OR s.template_code=t.template_code) AND s.started_at>=t.created_at)`;

export async function createUniverseTask(env: Env, user: AuthUser, body: any, access: Access) {
  const outcomeId = String(body?.outcomeId || ''), templateCode = body?.templateCode ? String(body.templateCode) : null;
  const note = body?.note ? String(body.note).trim().slice(0, 300) : null;
  const dueAt = body?.dueAt && /^\d{4}-\d{2}-\d{2}$/.test(String(body.dueAt)) ? String(body.dueAt) : null;
  let ids: string[] = [];
  let classId: string | null = null;
  if (body?.classId) {
    classId = String(body.classId);
    ids = (await all<any>(env.DB.prepare(`SELECT e.student_id id FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id AND s.status='ACTIVE' WHERE e.class_id=? AND e.status='ACTIVE' LIMIT ?`).bind(classId, TASK_CLASS_LIMIT + 1))).map((r) => r.id);
    if (ids.length > TASK_CLASS_LIMIT) return { ok: false, status: 413, code: 'CLASS_TOO_LARGE', message: `Bir görev tek seferde en çok ${TASK_CLASS_LIMIT} öğrenciye verilir.` } as const;
  } else if (Array.isArray(body?.studentIds)) ids = [...new Set(body.studentIds.map(String))].slice(0, TASK_CLASS_LIMIT) as string[];
  if (!ids.length) return { ok: false, status: 400, code: 'NO_STUDENTS', message: 'Görev için sınıf ya da öğrenci seçin.' } as const;
  const outcome = await one<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.subject_id,o.grade_level,cv.academic_year FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
    WHERE o.id=? AND o.active=1 AND cv.verified=1 AND o.grade_level=cv.grade_level`).bind(outcomeId));
  if (!outcome) return { ok: false, status: 400, code: 'OUTCOME_NOT_VERIFIED', message: 'Yalnız doğrulanmış MEB programındaki bir kazanım görev olarak verilebilir.' } as const;
  if (templateCode && !(await one(env.DB.prepare(`SELECT 1 FROM lu_game_templates WHERE code=? AND active=1`).bind(templateCode))))
    return { ok: false, status: 400, code: 'TEMPLATE_NOT_FOUND', message: 'Oyun türü bulunamadı.' } as const;
  const recipients: string[] = [];
  let institutionId: string | null = null, seasonId: string | null = null;
  for (const id of ids) {
    const a = await access(id);
    if (!a.allowed || !a.student) continue;
    if (a.subjectFilter && !a.subjectFilter.includes(outcome.subject_id)) continue;            // a subject teacher gives only own-subject tasks
    const year = await one<any>(env.DB.prepare(`SELECT academic_year FROM institution_seasons WHERE id=?`).bind(a.student.season_id));
    if (Number(a.student.grade_level) !== Number(outcome.grade_level) || year?.academic_year !== outcome.academic_year) continue;   // own grade and year only
    if (institutionId && institutionId !== a.student.institution_id) continue;
    institutionId = a.student.institution_id; seasonId = a.student.season_id;
    recipients.push(id);
  }
  if (!recipients.length) return { ok: false, status: 403, code: 'NO_ELIGIBLE_STUDENTS', message: 'Bu kazanım seçilen öğrencilerin sınıf düzeyine ya da sizin dersinize ait değil.' } as const;
  const id = uuid('lut');
  const st: D1PreparedStatement[] = [env.DB.prepare(`INSERT INTO lu_tasks(id,institution_id,season_id,class_id,created_by,outcome_id,template_code,note,due_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(id, institutionId, seasonId, classId, user.id, outcome.id, templateCode, note, dueAt)];
  for (const sid of recipients) st.push(env.DB.prepare(`INSERT INTO lu_task_recipients(task_id,student_id) VALUES(?,?)`).bind(id, sid));
  await env.DB.batch(st);
  await audit(env.DB, user.id, institutionId, 'LU_TASK_ASSIGNED', 'lu_task', id, { outcomeId: outcome.id, templateCode, recipients: recipients.length });
  return { ok: true, id, recipients: recipients.length, skipped: ids.length - recipients.length } as const;
}

/** The tasks a staff member gave (managers: the whole institution), with how many students finished each. */
export async function listUniverseTasks(env: Env, user: AuthUser, classId: string | null) {
  const where: string[] = [`t.status='ACTIVE'`], args: any[] = [];
  if (user.role === 'INSTITUTION_MANAGER') { where.push('t.institution_id=?'); args.push(user.institution_id); }
  else if (user.role !== 'SUPER_ADMIN') { where.push('t.created_by=?'); args.push(user.id); }
  if (classId) { where.push('t.class_id=?'); args.push(classId); }
  const rows = await all<any>(env.DB.prepare(`SELECT t.id,t.outcome_id,t.template_code,t.note,t.due_at,t.created_at,t.class_id,c.name class_name,o.code,o.title,gt.title template_title,u.display_name created_by_name,
      count(r.student_id) recipients,sum(CASE WHEN ${DONE_SQL} THEN 1 ELSE 0 END) done
    FROM lu_tasks t JOIN outcomes o ON o.id=t.outcome_id LEFT JOIN classes c ON c.id=t.class_id LEFT JOIN lu_game_templates gt ON gt.code=t.template_code LEFT JOIN users u ON u.id=t.created_by
    JOIN lu_task_recipients r ON r.task_id=t.id WHERE ${where.join(' AND ')} GROUP BY t.id ORDER BY t.created_at DESC LIMIT 100`).bind(...args));
  return rows.map((r) => ({ id: r.id, outcome: { id: r.outcome_id, code: r.code, title: r.title }, template: r.template_code ? { code: r.template_code, title: r.template_title } : null,
    note: r.note, dueAt: r.due_at, createdAt: r.created_at, className: r.class_name, createdBy: r.created_by_name, recipients: Number(r.recipients), done: Number(r.done || 0) }));
}

export async function universeTaskDetail(env: Env, user: AuthUser, taskId: string, access: Access) {
  const t = await one<any>(env.DB.prepare(`SELECT * FROM lu_tasks WHERE id=?`).bind(taskId));
  if (!t || !(await canManage(env, user, t))) return null;
  const rows = await all<any>(env.DB.prepare(`SELECT r.student_id,s.first_name,s.last_name,${DONE_SQL} done FROM lu_task_recipients r JOIN lu_tasks t ON t.id=r.task_id JOIN student_entities s ON s.id=r.student_id
    WHERE r.task_id=? ORDER BY s.last_name,s.first_name`).bind(taskId));
  const visible = [];
  for (const r of rows) if ((await access(r.student_id)).allowed) visible.push({ studentId: r.student_id, firstName: r.first_name, lastName: r.last_name, done: !!r.done });
  return { ok: true, id: t.id, students: visible };
}

async function canManage(env: Env, user: AuthUser, t: any) {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'INSTITUTION_MANAGER') return t.institution_id === user.institution_id;
  return t.created_by === user.id;
}

export async function cancelUniverseTask(env: Env, user: AuthUser, taskId: string) {
  const t = await one<any>(env.DB.prepare(`SELECT * FROM lu_tasks WHERE id=?`).bind(taskId));
  if (!t || !(await canManage(env, user, t))) return false;
  await env.DB.prepare(`UPDATE lu_tasks SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'`).bind(taskId).run();
  await audit(env.DB, user.id, t.institution_id, 'LU_TASK_CANCELLED', 'lu_task', taskId, {});
  return true;
}

/** The student's open teacher tasks for the map: newest first, with the game to start and whether content exists. */
export async function studentUniverseTasks(env: Env, user: AuthUser) {
  const ctx = await studentContext(env, user);
  if (!ctx) return [];
  const rows = await all<any>(env.DB.prepare(`SELECT t.id,t.outcome_id,t.template_code,t.note,t.due_at,o.code,o.title,u.display_name teacher FROM lu_tasks t JOIN lu_task_recipients r ON r.task_id=t.id
    JOIN outcomes o ON o.id=t.outcome_id LEFT JOIN users u ON u.id=t.created_by
    WHERE r.student_id=? AND t.status='ACTIVE' AND t.institution_id=? AND NOT ${DONE_SQL} ORDER BY COALESCE(t.due_at,'9999'),t.created_at DESC LIMIT 10`).bind(user.student_id, ctx.institution_id));
  if (!rows.length) return [];
  const kinds = await gameAvailability(env, ctx);
  return rows.map((r) => {
    const games = kinds(r.outcome_id);
    const game = r.template_code ? games.find((g) => g.code === r.template_code) : games[0];
    return { id: r.id, outcomeId: r.outcome_id, code: r.code, title: r.title, note: r.note, dueAt: r.due_at, teacher: r.teacher, game: game?.code ?? null, gameTitle: game?.title ?? null };
  });
}

/** Verified outcomes a staff member may give to a class (own subjects for a subject teacher), with the playable kinds. */
export async function classTaskOutcomes(env: Env, user: AuthUser, classId: string, access: Access) {
  const cls = await one<any>(env.DB.prepare(`SELECT c.id,c.name,c.grade_level,c.institution_id,s.academic_year FROM classes c JOIN institution_seasons s ON s.id=c.season_id WHERE c.id=?`).bind(classId));
  if (!cls) return null;
  const first = await one<any>(env.DB.prepare(`SELECT e.student_id id FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id AND s.status='ACTIVE' WHERE e.class_id=? AND e.status='ACTIVE' LIMIT 1`).bind(classId));
  const a = first ? await access(first.id) : null;
  if (!a?.allowed) return null;
  const subjects = a.subjectFilter;
  const outcomes = await all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.topic,o.subject_id,COALESCE(sb.name,'Ders') subject_name FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id LEFT JOIN subjects sb ON sb.id=o.subject_id
    WHERE o.active=1 AND cv.verified=1 AND cv.academic_year=? AND cv.grade_level=? AND o.grade_level=? ORDER BY sb.name,o.code`).bind(cls.academic_year, cls.grade_level, cls.grade_level));
  const kinds = await gameAvailability(env, { grade_level: cls.grade_level, academic_year: cls.academic_year, institution_id: cls.institution_id });
  return { ok: true, className: cls.name, gradeLevel: cls.grade_level, academicYear: cls.academic_year,
    outcomes: outcomes.filter((o) => !subjects || subjects.includes(o.subject_id)).map((o) => ({ id: o.id, code: o.code, title: o.title, topic: o.topic, subjectName: o.subject_name, games: kinds(o.id).map(({ code, title }) => ({ code, title })) })) };
}
