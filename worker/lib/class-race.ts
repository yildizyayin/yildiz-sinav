import type { AuthUser, Env } from '../types';
import { all, json, one } from './db';
import { hydrateQuestionMedia } from './question-content';
import { universeXp } from './learning-universe/sessions';
import { featureEnabledFor } from './platform-feature-policy';
import type { RaceQuestion, RaceState } from './class-race-engine';
import { report } from './class-race-engine';

/**
 * Sınıf Uzay Yarışı (owner, 25–26 Nov 2026: "yap"; "En iyi şekilde yap izin veriyorum" for the Durable Object).
 *  - A teacher of the class (or its manager) starts a race on a verified MEB outcome of the class's grade, with
 *    approved questions of that outcome only; the class joins with a 4-digit code.
 *  - The live play runs in the RACE_ROOMS Durable Object (free tier); this file checks who may come in and passes
 *    only trusted facts (role, id, shown name) to the room.
 *  - When the race ends, each student's answers become a finished Öğrenme Evreni play of that outcome: evidence for
 *    the karne, a piece on their planet, XP once. Speed never counts.
 */
const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const STAFF = ['SUPER_ADMIN', 'INSTITUTION_MANAGER', 'TEACHER', 'GUIDANCE_TEACHER'];
const RIGHTS_SQL = `('OWNED','LICENSED','PUBLIC_DOMAIN')`;
const parse = (v: unknown, f: any = null) => { try { return v ? JSON.parse(String(v)) : f; } catch { return f; } };
const shownName = (first: string, last: string) => `${String(first || '').trim().split(/\s+/)[0] || 'Öğrenci'} ${String(last || '').trim().charAt(0).toLocaleUpperCase('tr-TR')}.`.trim();

/** Classes this staff member may race with: their own classes (teacher) or every class of the school (manager). */
export async function raceClasses(env: Env, user: AuthUser) {
  if (user.role === 'INSTITUTION_MANAGER' || user.role === 'SUPER_ADMIN') {
    return all<any>(env.DB.prepare(`SELECT c.id,c.name,c.grade_level,c.season_id,s.academic_year FROM classes c JOIN institution_seasons s ON s.id=c.season_id
      WHERE c.institution_id=? AND c.active=1 AND s.status='ACTIVE' ORDER BY c.grade_level,c.name`).bind(user.institution_id || '')).catch(() => []);
  }
  return all<any>(env.DB.prepare(`SELECT DISTINCT c.id,c.name,c.grade_level,c.season_id,s.academic_year FROM teacher_assignments t JOIN classes c ON c.id=t.class_id JOIN institution_seasons s ON s.id=c.season_id
    WHERE t.user_id=? AND t.active=1 AND c.active=1 AND s.status='ACTIVE' ORDER BY c.grade_level,c.name`).bind(user.id)).catch(() => []);
}

async function createRace(env: Env, user: AuthUser, body: any) {
  const classes = await raceClasses(env, user);
  const cls = classes.find((c) => c.id === String(body?.classId || ''));
  if (!cls) return fail(403, 'CLASS_NOT_YOURS', 'Yarışı yalnız kendi sınıfın için başlatabilirsin.');
  const outcome = await one<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.subject_id FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
    WHERE o.id=? AND o.active=1 AND cv.verified=1 AND cv.academic_year=? AND o.grade_level=?`).bind(String(body?.outcomeId || ''), cls.academic_year, cls.grade_level));
  if (!outcome) return fail(409, 'OUTCOME_NOT_VERIFIED', 'Yarış, sınıfın düzeyindeki doğrulanmış bir MEB kazanımına bağlanmalı.');
  const count = Math.max(3, Math.min(10, Number(body?.questionCount) || 5));
  const seconds = Math.max(10, Math.min(60, Number(body?.seconds) || 20));
  const pool = await all<any>(env.DB.prepare(`SELECT q.id,q.stem_text,q.options_json,q.correct_answer,q.content_mode FROM question_bank q
    WHERE q.review_status='APPROVED' AND q.copyright_status IN ${RIGHTS_SQL} AND q.grade_level=? AND (q.subject_id=? OR ? IS NULL)
      AND COALESCE(q.question_type,'MULTIPLE_CHOICE')='MULTIPLE_CHOICE' AND q.correct_answer IS NOT NULL AND q.options_json IS NOT NULL
      AND (q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?))
      AND EXISTS(SELECT 1 FROM question_learning_links l WHERE l.question_id=q.id AND l.node_id='ln_'||?)
    ORDER BY RANDOM() LIMIT ?`).bind(cls.grade_level, outcome.subject_id, outcome.subject_id, user.institution_id, outcome.id, count));
  if (pool.length < 3) return fail(409, 'NOT_ENOUGH_QUESTIONS', `Bu kazanımda yarış için yeterli onaylı soru yok (en az 3 gerekir, ${pool.length} var).`);
  const hydrated = await hydrateQuestionMedia(env, pool);
  const questions: RaceQuestion[] = hydrated.map((q: any) => ({
    id: q.id, stem: q.stem_text,
    options: (parse(q.options_json, []) as any[]).map((o, i) => ({ key: 'ABCDE'[i], text: typeof o === 'string' ? o : String(o?.text ?? o?.label ?? '') })),
    assets: (q.assets || []).filter((a: any) => a.placement !== 'SOLUTION').map((a: any) => ({ url: a.url, alt: a.alt_text || null })),
    correct: String(q.correct_answer || '').trim().toUpperCase(),
  }));
  const roster = await all<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.class_id=? AND e.status='ACTIVE'`).bind(cls.id));
  if (!roster.length) return fail(409, 'EMPTY_CLASS', 'Bu sınıfta kayıtlı öğrenci yok.');
  if (!env.RACE_ROOMS) return fail(503, 'RACE_UNAVAILABLE', 'Canlı yarış bu ortamda kapalı.');
  // a 4-digit code no other open race uses
  let code = '';
  for (let k = 0; k < 20 && !code; k++) { const c = String(1000 + Math.floor(Math.random() * 9000)); if (!(await one(env.DB.prepare(`SELECT 1 FROM class_races WHERE code=? AND status IN ('LOBBY','RUNNING')`).bind(c)))) code = c; }
  if (!code) return fail(503, 'NO_CODE', 'Şu an yeni yarış kodu üretilemedi; biraz sonra yeniden dene.');
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO class_races(id,code,institution_id,season_id,class_id,outcome_id,academic_year,grade_level,teacher_user_id,question_ids_json,seconds_per_question) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, code, user.institution_id, cls.season_id, cls.id, outcome.id, cls.academic_year, cls.grade_level, user.id, JSON.stringify(questions.map((q) => q.id)), seconds).run();
  const init = { id, code, className: cls.name, outcome: { id: outcome.id, code: outcome.code ?? null, title: outcome.title }, seconds, questions, roster: Object.fromEntries(roster.map((r) => [r.id, shownName(r.first_name, r.last_name)])) };
  const r = await env.RACE_ROOMS.get(env.RACE_ROOMS.idFromName(id)).fetch('https://race/init', { method: 'POST', body: JSON.stringify(init) });
  if (!r.ok) { await env.DB.prepare(`UPDATE class_races SET status='CANCELLED' WHERE id=?`).bind(id).run(); return fail(503, 'RACE_UNAVAILABLE', 'Canlı yarış odası açılamadı; biraz sonra yeniden dene.'); }
  return json({ ok: true, race: { id, code, className: cls.name, outcome: init.outcome, questionCount: questions.length, seconds, students: roster.length } }, 201);
}

async function raceFor(env: Env, id: string) { return one<any>(env.DB.prepare(`SELECT r.*,c.name class_name FROM class_races r JOIN classes c ON c.id=r.class_id WHERE r.id=?`).bind(id)); }
async function mayRunBoard(env: Env, user: AuthUser, race: any) {
  if (race.teacher_user_id === user.id) return true;
  return (user.role === 'INSTITUTION_MANAGER' || user.role === 'SUPER_ADMIN') && race.institution_id === user.institution_id;
}
async function inClass(env: Env, user: AuthUser, race: any) {
  return !!(user.role === 'STUDENT' && user.student_id && await one(env.DB.prepare(`SELECT 1 FROM student_enrollments WHERE student_id=? AND class_id=? AND status='ACTIVE'`).bind(user.student_id, race.class_id)));
}

/** Writes each student's answers as a finished play of the outcome, once; returns the class report. */
export async function persistRaceResults(env: Env, s: RaceState) {
  const race = await one<any>(env.DB.prepare(`SELECT * FROM class_races WHERE id=?`).bind(s.id));
  if (!race || race.status === 'FINISHED') return null;
  const claim = await env.DB.prepare(`UPDATE class_races SET status='FINISHED',finished_at=CURRENT_TIMESTAMP,report_json=? WHERE id=? AND status<>'FINISHED'`).bind(JSON.stringify(report(s)), s.id).run();
  if (!Number(claim.meta?.changes || 0)) return null;
  const cv = await one<any>(env.DB.prepare(`SELECT curriculum_version_id FROM outcomes WHERE id=?`).bind(race.outcome_id));
  const asked = s.questions.slice(0, s.qi + 1);
  const st: D1PreparedStatement[] = [];
  for (const studentId of Object.keys(s.players)) {
    const mine = asked.map((q, k) => ({ q, a: s.answers[k]?.[studentId] || null }));
    const answered = mine.filter((x) => x.a).length;
    if (!answered) continue;                                            // joined but never answered: nothing to record
    const correct = mine.filter((x) => x.a && x.a.key === x.q.correct).length;
    const xp = universeXp(correct, asked.length), sid = crypto.randomUUID();
    st.push(env.DB.prepare(`INSERT OR IGNORE INTO lu_sessions(id,student_id,institution_id,season_id,academic_year,grade_level,template_code,outcome_id,curriculum_version_id,mode,status,timed,item_count,answered_count,correct_count,xp_awarded,client_key,started_at,submitted_at,expires_at)
      VALUES(?,?,?,?,?,?,'LU_CHOICE',?,?,'PRACTICE','SUBMITTED',1,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
      .bind(sid, studentId, race.institution_id, race.season_id, race.academic_year, race.grade_level, race.outcome_id, cv?.curriculum_version_id ?? null, asked.length, answered, correct, xp, `race:${s.id}`, race.started_at));
    mine.forEach(({ q, a }, k) => st.push(env.DB.prepare(`INSERT OR IGNORE INTO lu_session_items(session_id,seq,kind,source,ref_id,repeat,public_json,answer_json,response_json,correct,partial,answered_at) VALUES(?,?,'QUESTION','QUESTION_BANK',?,0,?,?,?,?,?,?)`)
      .bind(sid, k + 1, q.id, JSON.stringify({ stem: q.stem, options: q.options, assets: q.assets }), JSON.stringify({ correct: q.correct }), a ? JSON.stringify({ answer: a.key }) : null,
        a ? (a.key === q.correct ? 1 : 0) : null, a ? (a.key === q.correct ? 1 : 0) : null, a ? new Date(a.at).toISOString().replace('T', ' ').slice(0, 19) : null)));
    st.push(env.DB.prepare(`INSERT OR IGNORE INTO lu_xp_ledger(student_id,source_type,source_id,xp,reason) VALUES(?,?,?,?,?)`).bind(studentId, 'LU_SESSION', sid, xp, 'Sınıf Uzay Yarışı'));
    st.push(env.DB.prepare(`INSERT INTO gamification_profiles(student_id,xp,level,last_activity_date) VALUES(?,?,1,date('now','+3 hours'))
      ON CONFLICT(student_id) DO UPDATE SET xp=xp+excluded.xp,last_activity_date=excluded.last_activity_date,updated_at=CURRENT_TIMESTAMP`).bind(studentId, xp));
  }
  for (let k = 0; k < st.length; k += 50) await env.DB.batch(st.slice(k, k + 50));
  return report(s);
}
export async function markRaceStarted(env: Env, id: string) {
  await env.DB.prepare(`UPDATE class_races SET status='RUNNING',started_at=COALESCE(started_at,CURRENT_TIMESTAMP) WHERE id=? AND status='LOBBY'`).bind(id).run();
}

export async function handleClassRace(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/class-race')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  if (!(await featureEnabledFor(env, user, 'LEARNING_UNIVERSE'))) return fail(403, 'FEATURE_DISABLED', 'Öğrenme Evreni bu kurumda kapalı.');
  const p = url.pathname, m = request.method;
  if (p === '/api/class-race/classes' && m === 'GET') {
    if (!STAFF.includes(user.role)) return fail(403, 'FORBIDDEN', 'Yarışı öğretmenler başlatır.');
    return json({ ok: true, live: !!env.RACE_ROOMS, classes: await raceClasses(env, user) });
  }
  if (p === '/api/class-race' && m === 'POST') {
    if (!STAFF.includes(user.role)) return fail(403, 'FORBIDDEN', 'Yarışı öğretmenler başlatır.');
    return createRace(env, user, await request.json().catch(() => ({})));
  }
  if (p === '/api/class-race/join' && m === 'GET') {
    const race = await one<any>(env.DB.prepare(`SELECT r.*,c.name class_name FROM class_races r JOIN classes c ON c.id=r.class_id WHERE r.code=? AND r.status IN ('LOBBY','RUNNING') ORDER BY r.created_at DESC LIMIT 1`).bind(String(url.searchParams.get('code') || '').trim()));
    if (!race) return fail(404, 'RACE_NOT_FOUND', 'Bu kodla açık bir yarış yok. Kodu tahtadan kontrol et.');
    if (!(await inClass(env, user, race))) return fail(403, 'NOT_IN_CLASS', 'Bu yarış başka bir sınıfın.');
    return json({ ok: true, race: { id: race.id, className: race.class_name } });
  }
  const x = p.match(/^\/api\/class-race\/([0-9a-f-]{36})(\/ws)?$/);
  if (!x) return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
  const race = await raceFor(env, x[1]);
  if (!race) return fail(404, 'RACE_NOT_FOUND', 'Yarış bulunamadı.');
  const board = await mayRunBoard(env, user, race), player = !board && await inClass(env, user, race);
  if (!board && !player) return fail(403, 'FORBIDDEN', 'Bu yarışa erişimin yok.');
  if (!x[2] && m === 'GET') return json({ ok: true, race: { id: race.id, code: board ? race.code : null, status: race.status, className: race.class_name, report: board ? parse(race.report_json) : null } });
  if (x[2] && m === 'GET') {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return fail(426, 'UPGRADE_REQUIRED', 'Canlı bağlantı gerekli.');
    if (!env.RACE_ROOMS) return fail(503, 'RACE_UNAVAILABLE', 'Canlı yarış bu ortamda kapalı.');
    // only facts this Worker checked go to the room; the room is reachable through this binding alone
    const headers = new Headers({ Upgrade: 'websocket', 'x-race-role': board ? 'board' : 'player', 'x-race-user': board ? user.id : user.student_id! });
    return env.RACE_ROOMS.get(env.RACE_ROOMS.idFromName(race.id)).fetch('https://race/ws', { headers });
  }
  return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
}
