/**
 * Rehberlik R3 — ölçme araçları (owner, 12 Nov 2026).
 *  - a test is opened for a whole class at once;
 *  - the class report: who answered, dimension averages, and for the classmate-choice tool a sociogram summary that
 *    only the guidance teacher sees;
 *  - a guidance teacher may draft their own tool; it reaches students only after the Super Admin (expert) approves;
 *  - anonymous school surveys (okul iklimi; RİBA is not used — owner, 12 Nov 2026): a sample of each class is invited, the answers carry no person, and
 *    groups of fewer than five answers are never shown on their own.
 * Nothing here diagnoses or labels a student.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, one, uuid } from './db';
import { guidanceStudentIds } from './guidance-records';
import { scoreGuidanceResponses } from './guidance-assessments';

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const parse = <T>(v: unknown, d: T): T => { if (typeof v !== 'string' || !v) return d; try { return JSON.parse(v) as T; } catch { return d; } };
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');
export const MIN_GROUP = 5;

// ---------------------------------------------------------------- item validation (drafts and survey forms)
const TYPES = ['LIKERT', 'YESNO', 'AB', 'CHOICE', 'TEXT', 'PEER'];
export function validateItems(items: any, opts: { survey?: 'RIBA' | 'CLIMATE' } = {}): string | null {
  if (!Array.isArray(items) || !items.length) return 'En az bir madde yazılmalıdır.';
  if (items.length > 120) return 'Bir araçta en fazla 120 madde olabilir.';
  const ids = new Set<string>();
  for (const it of items) {
    if (!it || typeof it.id !== 'string' || !/^[a-z0-9_]{1,20}$/i.test(it.id) || ids.has(it.id)) return 'Her maddenin benzersiz bir kimliği olmalıdır.';
    ids.add(it.id);
    if (typeof it.text !== 'string' || it.text.trim().length < 3 || it.text.length > 400) return `“${it.id}” maddesinin metni geçersiz.`;
    const type = it.type || 'LIKERT';
    if (opts.survey === 'RIBA') continue;                 // RİBA: every item is answered A or B
    if (opts.survey === 'CLIMATE' && type !== 'LIKERT') return 'Okul iklimi anketinde yalnız 1–5 puanlı maddeler kullanılır.';
    if (!TYPES.includes(type)) return `“${it.id}” maddesinin türü geçersiz.`;
    if (opts.survey && (type === 'PEER' || type === 'TEXT')) return 'İsimsiz ankette arkadaş seçimi ve açık uçlu madde kullanılamaz.';
    if (type === 'AB' && !(it.a?.text && it.a?.dimension && it.b?.text && it.b?.dimension)) return `“${it.id}” A/B maddesinin iki seçeneği ve alanı yazılmalıdır.`;
    if (type === 'CHOICE' && (!Array.isArray(it.options) || it.options.length < 2 || it.options.some((o: any) => !o?.id || !o?.text))) return `“${it.id}” maddesinin en az iki seçeneği olmalıdır.`;
    if (type === 'PEER' && !(Number(it.max) >= 1 && Number(it.max) <= 5)) return 'Arkadaş seçimi en fazla 1–5 kişi olmalıdır.';
  }
  return null;
}

// ---------------------------------------------------------------- catalogue and bulk assignment
async function catalog(env: Env, user: AuthUser) {
  const instruments = await all<any>(env.DB.prepare(`SELECT id,code,title,category,description,grade_min,grade_max,active,review_status,review_note,owner_user_id,question_schema_json FROM guidance_assessment_instruments
    WHERE clinical_use=0 AND ((active=1 AND (institution_id IS NULL OR institution_id=?)) OR owner_user_id=?) ORDER BY active DESC,CASE category WHEN 'RBA' THEN 0 ELSE 1 END,title`).bind(user.institution_id, user.id));
  const templates = await all<any>(env.DB.prepare(`SELECT id,code,kind,title,description,active,review_status FROM guidance_survey_templates WHERE kind<>'RIBA' ORDER BY code`));
  return json({ ok: true, instruments: instruments.map((i) => ({ ...i, itemCount: (parse<any>(i.question_schema_json, {}).items || []).length, question_schema_json: undefined, mine: i.owner_user_id === user.id })), templates });
}

async function bulkAssign(request: Request, env: Env, user: AuthUser) {
  const b = await request.json().catch(() => ({})) as any;
  const code = text(b?.instrumentCode, 60);
  const inst = await one<any>(env.DB.prepare(`SELECT * FROM guidance_assessment_instruments WHERE code=? AND active=1 AND clinical_use=0 AND (institution_id IS NULL OR institution_id=?)`).bind(code, user.institution_id));
  if (!inst) return fail(404, 'NOT_FOUND', 'Seçilen ölçme aracı bulunamadı ya da henüz onaylanmadı.');
  const scope = await guidanceStudentIds(env, user);
  let ids: string[] = Array.isArray(b?.studentIds) ? b.studentIds.map(String) : [];
  if (b?.classId) ids = (await all<any>(env.DB.prepare(`SELECT student_id FROM student_enrollments WHERE class_id=? AND status='ACTIVE'`).bind(String(b.classId)))).map((r) => r.student_id);
  ids = [...new Set(ids)];
  if (!ids.length) return fail(400, 'VALIDATION_ERROR', 'Sınıf ya da öğrenci seçin.');
  if (ids.some((id) => !scope.includes(id))) return fail(403, 'FORBIDDEN', 'Yalnız rehberliğini yaptığınız öğrencilere test açılır.');
  let opened = 0, reused = 0, skippedGrade = 0;
  const note = text(b?.note, 500) || null;
  for (const sid of ids) {
    const enr = await one<any>(env.DB.prepare(`SELECT institution_id,grade_level FROM student_enrollments WHERE student_id=? AND status='ACTIVE' LIMIT 1`).bind(sid));
    if (!enr) continue;
    if ((inst.grade_min && enr.grade_level < inst.grade_min) || (inst.grade_max && enr.grade_level > inst.grade_max)) { skippedGrade++; continue; }
    const open = await one(env.DB.prepare(`SELECT 1 FROM guidance_assessment_sessions WHERE student_id=? AND instrument_id=? AND status IN ('PROPOSED','APPROVED','IN_PROGRESS','SUBMITTED')`).bind(sid, inst.id));
    if (open) { reused++; continue; }
    await env.DB.prepare(`INSERT INTO guidance_assessment_sessions(id,institution_id,student_id,instrument_id,proposed_by,proposed_by_user_id,proposal_reason,status,approved_by,approved_at,approval_note) VALUES(?,?,?,?,'GUIDANCE_TEACHER',?,?,'APPROVED',?,CURRENT_TIMESTAMP,?)`)
      .bind(uuid('gas'), enr.institution_id, sid, inst.id, user.id, 'Rehber öğretmen sınıfa uyguladı.', user.id, note).run();
    opened++;
  }
  if (opened) {
    const users = await all<any>(env.DB.prepare(`SELECT id FROM users WHERE role='STUDENT' AND active=1 AND student_id IN (${marks(ids.length)})`).bind(...ids));
    if (users.length) await env.DB.batch(users.map((u) => env.DB.prepare(`INSERT INTO notifications(id,recipient_user_id,institution_id,type,title,body,action_url,entity_type,entity_id) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(uuid('ntf'), u.id, user.institution_id, 'GUIDANCE_TEST', 'Rehberlik değerlendirmesi açıldı', `${inst.title} senin için açıldı.`, '/guidance-tests', 'guidance_instrument', inst.id)));
  }
  await audit(env.DB, user.id, user.institution_id, 'GUIDANCE_ASSESSMENT_BULK_ASSIGNED', 'guidance_instrument', inst.id, { opened, reused, skippedGrade });
  return json({ ok: true, opened, reused, skippedGrade });
}

// ---------------------------------------------------------------- class report (+ sociogram)
async function classReport(env: Env, user: AuthUser, url: URL) {
  const code = text(url.searchParams.get('instrumentCode'), 60); const classId = text(url.searchParams.get('classId'), 80);
  const inst = await one<any>(env.DB.prepare(`SELECT * FROM guidance_assessment_instruments WHERE code=? AND (institution_id IS NULL OR institution_id=?)`).bind(code, user.institution_id));
  if (!inst) return fail(404, 'NOT_FOUND', 'Ölçme aracı bulunamadı.');
  const scope = await guidanceStudentIds(env, user);
  const students = (await all<any>(env.DB.prepare(`SELECT s.id,s.first_name||' '||s.last_name name,e.student_number FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.class_id=? AND e.status='ACTIVE' ORDER BY e.student_number,s.last_name`).bind(classId))).filter((s) => scope.includes(s.id));
  if (!students.length) return fail(403, 'FORBIDDEN', 'Bu sınıfın rehber öğretmeni değilsiniz.');
  const ids = students.map((s) => s.id);
  const sessions = await all<any>(env.DB.prepare(`SELECT id,student_id,status,scored_result_json,response_json,submitted_at,reviewed_at FROM guidance_assessment_sessions WHERE instrument_id=? AND student_id IN (${marks(ids.length)}) ORDER BY created_at DESC`).bind(inst.id, ...ids));
  const latest = new Map<string, any>(); for (const s of sessions) if (!latest.has(s.student_id)) latest.set(s.student_id, s);
  const schema = parse<any>(inst.question_schema_json, {});
  const dims = new Map<string, number[]>();
  const rows = students.map((st) => {
    const s = latest.get(st.id); const res = parse<any>(s?.scored_result_json, null);
    if (res && ['SUBMITTED', 'REVIEWED'].includes(s.status)) for (const [k, v] of Object.entries(res.dimensions || {})) { const l = dims.get(k) || []; l.push(Number(v)); dims.set(k, l); }
    return { id: st.id, name: st.name, number: st.student_number, status: s?.status || null, dimensions: res?.dimensions || null, submittedAt: s?.submitted_at || null };
  });
  const answered = rows.filter((r) => r.dimensions).length;
  const averages = [...dims.entries()].map(([k, l]) => ({ dimension: k, average: Number((l.reduce((a, b) => a + b, 0) / l.length).toFixed(1)), n: l.length, low: l.filter((v) => v < 40).length })).sort((a, b) => a.average - b.average);
  // the sociogram: who chose whom (positive choices only)
  let sociogram: any = null;
  const peer = (schema.items || []).filter((i: any) => i.type === 'PEER');
  if (peer.length) {
    const received = new Map<string, number>(); const mutual: Array<[string, string]> = []; const choices = new Map<string, Set<string>>();
    for (const r of rows) {
      const s = latest.get(r.id); if (!s || !['SUBMITTED', 'REVIEWED'].includes(s.status)) continue;
      const resp = parse<any>(s.response_json, {}); const set = new Set<string>();
      for (const it of peer) for (const x of (Array.isArray(resp[it.id]) ? resp[it.id] : [])) { if (ids.includes(String(x))) { set.add(String(x)); received.set(String(x), (received.get(String(x)) || 0) + 1); } }
      choices.set(r.id, set);
    }
    for (const [a, set] of choices) for (const b of set) if (a < b && choices.get(b)?.has(a)) mutual.push([a, b]);
    const name = new Map(rows.map((r) => [r.id, r.name]));
    sociogram = { answered: choices.size, received: rows.map((r) => ({ id: r.id, name: r.name, count: received.get(r.id) || 0 })).sort((a, b) => b.count - a.count),
      notChosen: choices.size >= MIN_GROUP ? rows.filter((r) => !received.get(r.id)).map((r) => ({ id: r.id, name: r.name })) : [],
      mutual: mutual.map(([a, b]) => [name.get(a), name.get(b)]), note: 'Seçilmeyen öğrenci “sorunlu” değildir; sınıf içi iş birliğini güçlendirmek için bir başlangıç noktasıdır. Bu bilgi yalnız sizde kalır.' };
    await audit(env.DB, user.id, user.institution_id, 'GUIDANCE_SOCIOGRAM_READ', 'class', classId, { instrument: code });
  }
  return json({ ok: true, instrument: { code: inst.code, title: inst.title, category: inst.category }, total: rows.length, answered, averages, students: rows, sociogram, note: 'Puanlar 0–100 arasıdır; düşük puan “bu alanda destek” demektir, tanı değildir.' });
}

// ---------------------------------------------------------------- counsellor drafts and the Super Admin review
async function draft(request: Request, env: Env, user: AuthUser) {
  const b = await request.json().catch(() => ({})) as any;
  const title = text(b?.title, 120); const description = text(b?.description, 600);
  if (!title || !description) return fail(400, 'VALIDATION_ERROR', 'Başlık ve kısa açıklama yazılmalıdır.');
  const err = validateItems(b?.items); if (err) return fail(400, 'VALIDATION_ERROR', err);
  const schema = { scale: { min: 1, max: 5, labels: ['Hiç', 'Nadiren', 'Bazen', 'Çoğu zaman', 'Her zaman'] }, items: b.items };
  try { scoreGuidanceResponses(schema as any, Object.fromEntries((b.items as any[]).map((i) => [i.id, i.type === 'YESNO' ? true : i.type === 'AB' ? 'A' : i.type === 'CHOICE' ? i.options[0].id : i.type === 'TEXT' ? 'x' : i.type === 'PEER' ? ['x'] : 3]))); }
  catch { return fail(400, 'VALIDATION_ERROR', 'Maddeler puanlanamıyor; türleri ve seçenekleri kontrol edin.'); }
  const id = uuid('gi'); const code = `OKUL_${id.slice(-8).toUpperCase()}`;
  const gmin = Number(b?.gradeMin) || null, gmax = Number(b?.gradeMax) || null;
  await env.DB.prepare(`INSERT INTO guidance_assessment_instruments(id,code,title,category,version,description,question_schema_json,evidence_level,active,review_status,institution_id,owner_user_id,grade_min,grade_max) VALUES(?,?,?,'CUSTOM_EDUCATIONAL','1.0',?,?,'INTERNAL_EDUCATIONAL',0,'REVIEW',?,?,?,?)`)
    .bind(id, code, title, description, JSON.stringify(schema), user.institution_id, user.id, gmin, gmax).run();
  await audit(env.DB, user.id, user.institution_id, 'GUIDANCE_INSTRUMENT_DRAFTED', 'guidance_instrument', id, { items: b.items.length });
  return json({ ok: true, id, code, status: 'REVIEW' }, 201);
}

async function reviewQueue(env: Env) {
  const instruments = await all<any>(env.DB.prepare(`SELECT i.id,i.code,i.title,i.category,i.description,i.question_schema_json,i.review_status,i.grade_min,i.grade_max,i.institution_id,inst.name institution_name,u.display_name owner FROM guidance_assessment_instruments i LEFT JOIN institutions inst ON inst.id=i.institution_id LEFT JOIN users u ON u.id=i.owner_user_id WHERE i.review_status='REVIEW' ORDER BY i.created_at`));
  const templates = await all<any>(env.DB.prepare(`SELECT * FROM guidance_survey_templates ORDER BY code`));
  return json({ ok: true, instruments: instruments.map((i) => ({ ...i, schema: parse(i.question_schema_json, {}), question_schema_json: undefined })), templates: templates.map((t) => ({ ...t, forms: parse(t.forms_json, {}), forms_json: undefined })) });
}

async function decide(request: Request, env: Env, user: AuthUser, kind: string, id: string) {
  const b = await request.json().catch(() => ({})) as any;
  const approve = b?.decision === 'APPROVE'; const note = text(b?.note, 600) || null;
  if (!approve && b?.decision !== 'REJECT') return fail(400, 'VALIDATION_ERROR', 'Karar geçersiz.');
  if (kind === 'instruments') {
    const r = await env.DB.prepare(`UPDATE guidance_assessment_instruments SET review_status=?,review_note=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND review_status IN ('REVIEW','APPROVED','REJECTED')`).bind(approve ? 'APPROVED' : 'REJECTED', note, approve ? 1 : 0, id).run();
    if (!r.meta.changes) return fail(404, 'NOT_FOUND', 'Araç bulunamadı.');
  } else {
    const t = await one<any>(env.DB.prepare(`SELECT * FROM guidance_survey_templates WHERE id=?`).bind(id));
    if (!t) return fail(404, 'NOT_FOUND', 'Anket şablonu bulunamadı.');
    if (approve && parse<any>(t.forms_json, {}).forms?.some((f: any) => !f.items?.length)) return fail(400, 'FORMS_EMPTY', 'Formlardan birinde madde yok; önce maddeleri yükleyin.');
    if (approve && t.kind === 'RIBA') return fail(410, 'RETIRED', 'RİBA kullanılmıyor.');
    await env.DB.prepare(`UPDATE guidance_survey_templates SET review_status=?,review_note=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(approve ? 'APPROVED' : 'REJECTED', note, approve ? 1 : 0, id).run();
  }
  await audit(env.DB, user.id, null, approve ? 'GUIDANCE_TOOL_APPROVED' : 'GUIDANCE_TOOL_REJECTED', kind === 'instruments' ? 'guidance_instrument' : 'guidance_survey_template', id, { note });
  return json({ ok: true });
}

/** The Super Admin loads a survey form's items. RİBA is not used (owner, 12 Nov 2026): its forms cannot be loaded. */
async function saveTemplateForm(request: Request, env: Env, user: AuthUser, id: string) {
  const t = await one<any>(env.DB.prepare(`SELECT * FROM guidance_survey_templates WHERE id=?`).bind(id));
  if (!t) return fail(404, 'NOT_FOUND', 'Anket şablonu bulunamadı.');
  if (t.kind === 'RIBA') return fail(410, 'RETIRED', 'RİBA kullanılmıyor.');
  const b = await request.json().catch(() => ({})) as any;
  const forms = parse<any>(t.forms_json, {});
  const form = (forms.forms || []).find((f: any) => f.code === b?.formCode);
  if (!form) return fail(404, 'NOT_FOUND', 'Form bulunamadı.');
  const err = validateItems(b?.items, { survey: t.kind }); if (err) return fail(400, 'VALIDATION_ERROR', err);
  form.items = b.items;
  await env.DB.prepare(`UPDATE guidance_survey_templates SET forms_json=?,review_status='REVIEW',active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify(forms), id).run();
  await audit(env.DB, user.id, null, 'GUIDANCE_SURVEY_FORM_SAVED', 'guidance_survey_template', id, { form: form.code, items: b.items.length });
  return json({ ok: true });
}

// ---------------------------------------------------------------- anonymous surveys
function shuffle<T>(list: T[]) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const sampleOf = <T>(list: T[], pct: number) => shuffle(list).slice(0, Math.max(1, Math.ceil(list.length * pct / 100)));

async function openSurvey(request: Request, env: Env, user: AuthUser) {
  const b = await request.json().catch(() => ({})) as any;
  const t = await one<any>(env.DB.prepare(`SELECT * FROM guidance_survey_templates WHERE code=? AND active=1 AND review_status='APPROVED'`).bind(text(b?.templateCode, 40)));
  if (!t) return fail(404, 'NOT_FOUND', 'Bu anket henüz onaylanmadı.');
  const pct = Math.min(100, Math.max(5, Math.round(Number(b?.samplePct) || (t.kind === 'RIBA' ? 30 : 100))));
  const forms = parse<any>(t.forms_json, {}).forms || [];
  const surveyId = uuid('gsv');
  const invites: Array<[string, string | null, string]> = [];
  const classes = await all<any>(env.DB.prepare(`SELECT c.id,c.grade_level FROM classes c JOIN institution_seasons se ON se.id=c.season_id AND se.status='ACTIVE' WHERE c.institution_id=?`).bind(user.institution_id));
  for (const c of classes) {
    const students = await all<any>(env.DB.prepare(`SELECT u.id user_id,e.student_id FROM student_enrollments e JOIN users u ON u.student_id=e.student_id AND u.role='STUDENT' AND u.active=1 WHERE e.class_id=? AND e.status='ACTIVE'`).bind(c.id));
    const sForm = forms.find((f: any) => f.audience === 'STUDENT' && (!f.gradeMin || c.grade_level >= f.gradeMin) && (!f.gradeMax || c.grade_level <= f.gradeMax));
    if (sForm && students.length) for (const s of sampleOf(students, pct)) invites.push([sForm.code, c.id, s.user_id]);
    const pForm = forms.find((f: any) => f.audience === 'PARENT');
    if (pForm && students.length) {
      const parents = await all<any>(env.DB.prepare(`SELECT DISTINCT l.parent_user_id user_id FROM parent_student_links l JOIN users u ON u.id=l.parent_user_id AND u.active=1 WHERE l.active=1 AND l.student_id IN (${marks(students.length)})`).bind(...students.map((s) => s.student_id)));
      for (const p of sampleOf(parents, pct)) if (parents.length) invites.push([pForm.code, c.id, p.user_id]);
    }
  }
  const tForm = forms.find((f: any) => f.audience === 'TEACHER');
  if (tForm) {
    const teachers = await all<any>(env.DB.prepare(`SELECT id user_id FROM users WHERE institution_id=? AND role IN ('TEACHER','GUIDANCE_TEACHER') AND active=1`).bind(user.institution_id));
    if (teachers.length) for (const x of sampleOf(teachers, pct)) invites.push([tForm.code, null, x.user_id]);
  }
  if (!invites.length) return fail(400, 'NO_RESPONDENTS', 'Ankete katılabilecek kullanıcı bulunamadı.');
  await env.DB.prepare(`INSERT INTO guidance_surveys(id,institution_id,template_id,title,forms_json,sample_pct,created_by) VALUES(?,?,?,?,?,?,?)`).bind(surveyId, user.institution_id, t.id, `${t.title} · ${new Date().getFullYear()}`, t.forms_json, pct, user.id).run();
  const seen = new Set<string>();
  const stmts = invites.filter(([f, , u]) => !seen.has(`${f}|${u}`) && (seen.add(`${f}|${u}`), true)).map(([f, c, u]) => env.DB.prepare(`INSERT INTO guidance_survey_invites(id,survey_id,form_code,class_id,user_id) VALUES(?,?,?,?,?)`).bind(uuid('gsi'), surveyId, f, c, u));
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
  await audit(env.DB, user.id, user.institution_id, 'GUIDANCE_SURVEY_OPENED', 'guidance_survey', surveyId, { template: t.code, invites: stmts.length, pct });
  return json({ ok: true, id: surveyId, invited: stmts.length }, 201);
}

async function surveyResults(env: Env, user: AuthUser, id: string) {
  const s = await one<any>(env.DB.prepare(`SELECT s.*,t.kind,t.code FROM guidance_surveys s JOIN guidance_survey_templates t ON t.id=s.template_id WHERE s.id=? AND s.institution_id=?`).bind(id, user.institution_id));
  if (!s) return fail(404, 'NOT_FOUND', 'Anket bulunamadı.');
  const forms = parse<any>(s.forms_json, {});
  const invited = await all<any>(env.DB.prepare(`SELECT form_code,count(*) n,sum(responded) r FROM guidance_survey_invites WHERE survey_id=? GROUP BY form_code`).bind(id));
  const responses = await all<any>(env.DB.prepare(`SELECT r.form_code,r.class_id,c.name class_name,r.answers_json FROM guidance_survey_responses r LEFT JOIN classes c ON c.id=r.class_id WHERE r.survey_id=?`).bind(id));
  const out = (forms.forms || []).map((f: any) => {
    const rs = responses.filter((r) => r.form_code === f.code);
    const tally = (list: any[]) => f.items.map((it: any, k: number) => {
      const vals = list.map((r) => parse<any>(r.answers_json, {})[it.id]).filter((v) => v !== undefined && v !== null);
      if (s.kind === 'RIBA') { const a = vals.filter((v) => v === 'A').length, b = vals.filter((v) => v === 'B').length; return { no: k + 1, id: it.id, text: it.text, area: it.area || null, a, b, aPct: a + b ? a / (a + b) : 0 }; }
      const nums = vals.map(Number).filter(Number.isFinite); const max = Number(forms.scale?.max || 5), min = Number(forms.scale?.min || 1);
      const avg = nums.length ? nums.reduce((x, y) => x + y, 0) / nums.length : null;
      const score = avg == null ? null : ((it.reverse ? max - (avg - min) : avg) - min) / (max - min) * 100;
      return { no: k + 1, id: it.id, text: it.text, dimension: it.dimension, n: nums.length, average: avg == null ? null : Number(avg.toFixed(2)), score: score == null ? null : Number(score.toFixed(1)) };
    });
    // classes with fewer than five answers are pooled, so no small group can be singled out
    const byClass = new Map<string, any[]>();
    for (const r of rs) { const k = r.class_name || 'Sınıfsız'; byClass.set(k, [...(byClass.get(k) || []), r]); }
    const small: any[] = []; const classes: any[] = [];
    for (const [name, list] of byClass) { if (list.length >= MIN_GROUP) classes.push({ className: name, n: list.length, items: tally(list) }); else small.push(...list); }
    if (small.length >= MIN_GROUP) classes.push({ className: 'Diğer sınıflar (birleştirildi)', n: small.length, items: tally(small) });
    const school = rs.length >= MIN_GROUP ? tally(rs) : null;
    const ranked = school && s.kind === 'RIBA' ? [...school].sort((a: any, b: any) => b.aPct - a.aPct).map((x: any, k: number) => ({ ...x, rank: k + 1 })) : school;
    const inv = invited.find((x) => x.form_code === f.code);
    return { code: f.code, title: f.title, audience: f.audience, invited: Number(inv?.n || 0), responded: rs.length, school: ranked, classes: school ? classes : [], hidden: !school };
  });
  return json({ ok: true, survey: { id: s.id, title: s.title, kind: s.kind, status: s.status, samplePct: s.sample_pct, createdAt: s.created_at }, minGroup: MIN_GROUP, forms: out,
    note: s.kind === 'RIBA' ? 'Okul sonuç çizelgesi RAM’a gönderilmeden önce güncel MEB şablonuyla karşılaştırılmalıdır.' : 'Puan 0–100; düşük puan o alanda önleyici çalışma gerektiğini gösterir.' });
}

async function mySurveys(env: Env, user: AuthUser) {
  const rows = await all<any>(env.DB.prepare(`SELECT i.id,i.form_code,s.title,s.forms_json,t.kind FROM guidance_survey_invites i JOIN guidance_surveys s ON s.id=i.survey_id JOIN guidance_survey_templates t ON t.id=s.template_id WHERE i.user_id=? AND i.responded=0 AND s.status='OPEN' ORDER BY s.created_at DESC`).bind(user.id));
  return json({ ok: true, surveys: rows.map((r) => { const forms = parse<any>(r.forms_json, {}); const f = (forms.forms || []).find((x: any) => x.code === r.form_code); return { inviteId: r.id, title: r.title, kind: r.kind, formTitle: f?.title, items: f?.items || [], scale: forms.scale || null, answerLabels: forms.answerLabels || null }; }) });
}

async function answerSurvey(request: Request, env: Env, user: AuthUser, inviteId: string) {
  const inv = await one<any>(env.DB.prepare(`SELECT i.*,s.forms_json,s.status,t.kind FROM guidance_survey_invites i JOIN guidance_surveys s ON s.id=i.survey_id JOIN guidance_survey_templates t ON t.id=s.template_id WHERE i.id=? AND i.user_id=?`).bind(inviteId, user.id));
  if (!inv || inv.status !== 'OPEN') return fail(404, 'NOT_FOUND', 'Anket bulunamadı ya da kapandı.');
  if (inv.responded) return fail(409, 'ALREADY_ANSWERED', 'Bu anketi zaten yanıtladın. Teşekkürler!');
  const forms = parse<any>(inv.forms_json, {}); const f = (forms.forms || []).find((x: any) => x.code === inv.form_code);
  const b = await request.json().catch(() => ({})) as any; const answers = b?.answers && typeof b.answers === 'object' ? b.answers : {};
  const clean: Record<string, unknown> = {};
  for (const it of f?.items || []) {
    const v = answers[it.id];
    if (inv.kind === 'RIBA') { if (v !== 'A' && v !== 'B') return fail(400, 'VALIDATION_ERROR', 'Her madde için A ya da B seçilmelidir.'); clean[it.id] = v; continue; }
    const n = Number(v); const min = Number(forms.scale?.min || 1), max = Number(forms.scale?.max || 5);
    if (!Number.isInteger(n) || n < min || n > max) return fail(400, 'VALIDATION_ERROR', 'Her maddeyi yanıtlayın.');
    clean[it.id] = n;
  }
  const done = await env.DB.prepare(`UPDATE guidance_survey_invites SET responded=1 WHERE id=? AND responded=0`).bind(inviteId).run();
  if (!done.meta.changes) return fail(409, 'ALREADY_ANSWERED', 'Bu anketi zaten yanıtladın.');
  await env.DB.prepare(`INSERT INTO guidance_survey_responses(id,survey_id,form_code,class_id,answers_json) VALUES(?,?,?,?,?)`).bind(uuid('gsr'), inv.survey_id, inv.form_code, inv.class_id, JSON.stringify(clean)).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- router
export async function handleGuidanceTools(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/guidance-tools')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.must_change_password) return fail(403, 'PASSWORD_CHANGE_REQUIRED', 'Önce şifrenizi değiştirin.');
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  const p = url.pathname.replace(/\/+$/, '');
  if (p === '/api/guidance-tools/my-surveys' && request.method === 'GET') return mySurveys(env, user);
  let m = p.match(/^\/api\/guidance-tools\/my-surveys\/([^/]+)$/);
  if (m && request.method === 'POST') return answerSurvey(request, env, user, decodeURIComponent(m[1]));
  if (user.role === 'SUPER_ADMIN') {
    if (p === '/api/guidance-tools/review-queue' && request.method === 'GET') return reviewQueue(env);
    m = p.match(/^\/api\/guidance-tools\/review\/(instruments|templates)\/([^/]+)$/);
    if (m && request.method === 'POST') return decide(request, env, user, m[1], decodeURIComponent(m[2]));
    m = p.match(/^\/api\/guidance-tools\/templates\/([^/]+)\/form$/);
    if (m && request.method === 'PUT') return saveTemplateForm(request, env, user, decodeURIComponent(m[1]));
  }
  if (/^\/api\/guidance-tools\/(review|templates)/.test(p)) return fail(403, 'FORBIDDEN', 'Bu işlem Süper Admin’e açıktır.');
  if (user.role !== 'GUIDANCE_TEACHER' || !user.institution_id) return fail(403, 'FORBIDDEN', 'Ölçme araçları rehber öğretmene açıktır.');
  if (p === '/api/guidance-tools/catalog' && request.method === 'GET') return catalog(env, user);
  if (p === '/api/guidance-tools/assign' && request.method === 'POST') return bulkAssign(request, env, user);
  if (p === '/api/guidance-tools/report' && request.method === 'GET') return classReport(env, user, url);
  if (p === '/api/guidance-tools/drafts' && request.method === 'POST') return draft(request, env, user);
  if (p === '/api/guidance-tools/surveys' && request.method === 'GET') return json({ ok: true, surveys: await all<any>(env.DB.prepare(`SELECT s.id,s.title,s.status,s.sample_pct,s.created_at,t.kind,(SELECT count(*) FROM guidance_survey_invites i WHERE i.survey_id=s.id) invited,(SELECT count(*) FROM guidance_survey_responses r WHERE r.survey_id=s.id) responded FROM guidance_surveys s JOIN guidance_survey_templates t ON t.id=s.template_id WHERE s.institution_id=? ORDER BY s.created_at DESC`).bind(user.institution_id)) });
  if (p === '/api/guidance-tools/surveys' && request.method === 'POST') return openSurvey(request, env, user);
  m = p.match(/^\/api\/guidance-tools\/surveys\/([^/]+)$/);
  if (m && request.method === 'GET') return surveyResults(env, user, decodeURIComponent(m[1]));
  m = p.match(/^\/api\/guidance-tools\/surveys\/([^/]+)\/close$/);
  if (m && request.method === 'POST') { const r = await env.DB.prepare(`UPDATE guidance_surveys SET status='CLOSED',closed_at=CURRENT_TIMESTAMP WHERE id=? AND institution_id=? AND status='OPEN'`).bind(decodeURIComponent(m[1]), user.institution_id).run(); return r.meta.changes ? json({ ok: true }) : fail(404, 'NOT_FOUND', 'Anket bulunamadı.'); }
  return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
}
