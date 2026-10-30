import type { AuthUser, CanonicalRecord, Env, MatchCandidate } from '../types';
import { all, audit, badRequest, forbidden, json, one, uuid } from './db';
import { matchParticipant } from './matching';
import { decodeUploadedBytes, parseUploadedText, parseWithTemplate, type ParserTemplate } from './parse';
import { alignRecordsToExam, mergeSessionRecords } from './two-session';

/**
 * Föy değerlendirme (owner decision 30 Oct): a föy is scored against one answer key, entered by the Super Admin per
 * subject and question number. Two channels use it: a paper optic uploaded on sonuc (kurum, bayi or Super Admin) and
 * the student's online optic in the app. Both write the same FOY evidence; there is no central ranking.
 *
 * First submission counts (A054): the run id is fixed per föy and student, so a later sheet for the same student
 * is set aside with its reason instead of overwriting the evidence.
 *
 * A föy answer is identified by (föy, ders, soru no). It is never a question-bank question, so nothing here enters
 * the central pool.
 */
export const FOY_ANSWERS = ['A', 'B', 'C', 'D', 'E'] as const;
export const foyRunId = (worksheetId: string, studentId: string) => `asr_foyws_${worksheetId}_${studentId}`;
const NAME_ONLY = /Öğrenci numarası bulunamadı; ad soyad ve sınıf ile eşleşti/i;

const fail = (status: number, code: string, message: string, details?: unknown) => json({ ok: false, error: { code, message, details } }, status);

export type FoyKeySubject = { subjectId: string; code: string; name: string; questionCount: number; answers: Array<string | null> };
export type FoyKey = { worksheet: any; subjects: FoyKeySubject[]; complete: boolean; missing: number };

/** The föy's subjects in their stored order with the key position by position (null where no answer is entered). */
export async function loadFoyKey(env: Env, worksheetId: string): Promise<FoyKey | null> {
  const worksheet = await one<any>(env.DB.prepare(`SELECT id,title,academic_year,grade_level,program_code,track,sequence_no,status FROM worksheets WHERE id=?`).bind(worksheetId));
  if (!worksheet) return null;
  const [subjects, keys] = await Promise.all([
    all<any>(env.DB.prepare(`SELECT ws.subject_id,s.code,s.name,ws.question_count FROM worksheet_subjects ws JOIN subjects s ON s.id=ws.subject_id WHERE ws.worksheet_id=? ORDER BY s.name,s.code`).bind(worksheetId)),
    all<any>(env.DB.prepare(`SELECT subject_id,question_no,correct_answer FROM worksheet_answer_keys WHERE worksheet_id=?`).bind(worksheetId)),
  ]);
  let missing = 0;
  const out = subjects.map((s: any) => {
    const count = Number(s.question_count || 0);
    const answers: Array<string | null> = Array.from({ length: count }, (_, i) => keys.find((k: any) => k.subject_id === s.subject_id && Number(k.question_no) === i + 1)?.correct_answer || null);
    missing += answers.filter((a) => !a).length;
    return { subjectId: s.subject_id, code: String(s.code || '').toUpperCase(), name: s.name, questionCount: count, answers };
  });
  return { worksheet, subjects: out, complete: out.length > 0 && missing === 0, missing };
}

/** A föy whose evidence already exists keeps its key: changing it would silently change scored results. */
async function keyLocked(env: Env, worksheetId: string) {
  return Boolean(await one(env.DB.prepare(`SELECT 1 x FROM assessment_runs WHERE source_type='FOY' AND source_id=? AND assignment_id IS NULL AND substr(id,1,10)='asr_foyws_' LIMIT 1`).bind(worksheetId)));
}

export async function getFoyAnswerKey(env: Env, worksheetId: string): Promise<Response> {
  const key = await loadFoyKey(env, worksheetId);
  if (!key) return fail(404, 'WORKSHEET_NOT_FOUND', 'Föy bulunamadı.');
  return json({ ok: true, ...key, locked: await keyLocked(env, worksheetId) });
}

/** PUT body: { subjects: [{ subjectId, answers: "ABCDA…" | ["A", …] }] }. Every position must be A–E; a partial key is kept as entered. */
export async function saveFoyAnswerKey(request: Request, env: Env, actor: AuthUser, worksheetId: string): Promise<Response> {
  if (actor.role !== 'SUPER_ADMIN') return forbidden('Föy cevap anahtarını yalnız Süper Admin girebilir.');
  const key = await loadFoyKey(env, worksheetId);
  if (!key) return fail(404, 'WORKSHEET_NOT_FOUND', 'Föy bulunamadı.');
  if (await keyLocked(env, worksheetId)) return fail(409, 'FOY_KEY_LOCKED', 'Bu föy değerlendirildi; cevap anahtarı artık değiştirilemez. Hatalı bir anahtar için Süper Admin ile düzeltme kararı alın.');
  const body: any = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.subjects) ? body.subjects : [];
  if (!rows.length) return badRequest('En az bir dersin cevaplarını gönderin.', 'FOY_KEY_EMPTY');
  const statements: D1PreparedStatement[] = [];
  for (const row of rows) {
    const subject = key.subjects.find((s) => s.subjectId === String(row?.subjectId || ''));
    if (!subject) return badRequest('Ders bu föyde tanımlı değil.', 'FOY_KEY_SUBJECT');
    const raw: string[] = Array.isArray(row.answers) ? row.answers.map((x: unknown) => String(x ?? '')) : Array.from(String(row.answers ?? ''));
    const answers = raw.map((x) => x.trim().toLocaleUpperCase('tr-TR'));
    if (answers.length > subject.questionCount) return badRequest(`${subject.name}: ${subject.questionCount} soru var, ${answers.length} cevap gönderildi.`, 'FOY_KEY_LENGTH');
    const bad = answers.findIndex((a) => a && !(FOY_ANSWERS as readonly string[]).includes(a));
    if (bad >= 0) return badRequest(`${subject.name} ${bad + 1}. soru: cevap A, B, C, D veya E olmalı.`, 'FOY_KEY_INVALID');
    statements.push(env.DB.prepare(`DELETE FROM worksheet_answer_keys WHERE worksheet_id=? AND subject_id=?`).bind(worksheetId, subject.subjectId));
    answers.forEach((a, i) => { if (a) statements.push(env.DB.prepare(`INSERT INTO worksheet_answer_keys(worksheet_id,subject_id,question_no,correct_answer,updated_by) VALUES(?,?,?,?,?)`).bind(worksheetId, subject.subjectId, i + 1, a, actor.id)); });
  }
  for (let i = 0; i < statements.length; i += 90) await env.DB.batch(statements.slice(i, i + 90));
  await audit(env.DB, actor.id, null, 'WORKSHEET_ANSWER_KEY_SAVED', 'worksheet', worksheetId, { subjects: rows.length });
  return getFoyAnswerKey(env, worksheetId);
}

export type FoyResponse = { subjectId: string; questionNo: number; selected: string | null; correct: boolean };
export type FoyScore = { responses: FoyResponse[]; correct: number; wrong: number; blank: number; total: number; score: number };

/** answers: subject code → positional string (n-th character is question n; anything but A–E is blank). */
export function scoreFoySheet(key: FoyKey, answers: Record<string, string>): FoyScore {
  const responses: FoyResponse[] = [];
  let correct = 0, wrong = 0, blank = 0;
  for (const s of key.subjects) {
    const marks = Array.from(String(answers[s.code] ?? ''));
    s.answers.forEach((expected, i) => {
      const mark = String(marks[i] || '').toLocaleUpperCase('tr-TR');
      const selected = (FOY_ANSWERS as readonly string[]).includes(mark) ? mark : null;
      const ok = Boolean(selected && expected && selected === expected);
      if (!selected) blank++; else if (ok) correct++; else wrong++;
      responses.push({ subjectId: s.subjectId, questionNo: i + 1, selected, correct: ok });
    });
  }
  const total = correct + wrong + blank;
  return { responses, correct, wrong, blank, total, score: total ? correct / total : 0 };
}

/**
 * Writes the student's FOY run with one response per question. Returns false when the student already has the föy's
 * evidence (first submission counts). The insert itself is the guard, so two uploads at once cannot both write.
 */
export async function writeFoyRun(env: Env, input: { worksheetId: string; institutionId: string; studentId: string; channel: 'OPTICAL' | 'DIGITAL'; scored: FoyScore; metadata: Record<string, unknown> }): Promise<{ written: boolean; runId: string }> {
  const runId = foyRunId(input.worksheetId, input.studentId);
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO assessment_runs(id,institution_id,student_id,source_type,source_id,delivery_mode,status,score,metadata_json,completed_at) VALUES(?,?,?,'FOY',?,?, 'SCORED',?,?,CURRENT_TIMESTAMP)`)
    .bind(runId, input.institutionId, input.studentId, input.worksheetId, input.channel, input.scored.score, JSON.stringify({ ...input.metadata, correct: input.scored.correct, wrong: input.scored.wrong, blank: input.scored.blank, total: input.scored.total })).run();
  if (!inserted.meta?.changes) return { written: false, runId };
  const statements = input.scored.responses.map((r) => env.DB.prepare(`INSERT INTO assessment_responses(id,run_id,student_id,selected_answer,is_correct,source_channel,worksheet_subject_id,worksheet_question_no) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(uuid('ars'), runId, input.studentId, r.selected, r.selected ? (r.correct ? 1 : 0) : null, input.channel, r.subjectId, r.questionNo));
  for (let i = 0; i < statements.length; i += 90) await env.DB.batch(statements.slice(i, i + 90));
  return { written: true, runId };
}

/* ───────────────────────── sonuc: paper optic ───────────────────────── */

type OperatorContext = { user: AuthUser; institution: any; dealerId: string | null };
export type FoyOperatorDeps = {
  context: (request: Request, env: Env, institutionId: string) => Promise<OperatorContext | Response>;
  institutions: (env: Env, user: AuthUser, mode: string) => Promise<any[]>;
  user: (request: Request) => Promise<AuthUser | null>;
};

const usable = `w.status='PUBLISHED' AND EXISTS(SELECT 1 FROM worksheet_subjects ws WHERE ws.worksheet_id=w.id)
  AND NOT EXISTS(SELECT 1 FROM worksheet_subjects ws WHERE ws.worksheet_id=w.id AND ws.question_count>(SELECT count(*) FROM worksheet_answer_keys k WHERE k.worksheet_id=w.id AND k.subject_id=ws.subject_id AND k.question_no<=ws.question_count))`;

async function catalog(request: Request, env: Env, deps: FoyOperatorDeps) {
  const user = await deps.user(request); if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  const mode = new URL(request.url).searchParams.get('mode') === 'DEALER' ? 'DEALER' : 'INSTITUTION';
  const institutions = await deps.institutions(env, user, mode);
  if (!institutions.length && user.role !== 'SUPER_ADMIN') return forbidden('Aktif kurum veya bayi kapsamınız bulunmuyor.');
  const [worksheets, waiting, opticals] = await Promise.all([
    all<any>(env.DB.prepare(`SELECT w.id,w.title,w.academic_year,w.grade_level,w.program_code,w.track,w.sequence_no,(SELECT group_concat(s.name,', ') FROM worksheet_subjects ws JOIN subjects s ON s.id=ws.subject_id WHERE ws.worksheet_id=w.id) subjects,(SELECT sum(question_count) FROM worksheet_subjects ws WHERE ws.worksheet_id=w.id) question_count FROM worksheets w WHERE ${usable} ORDER BY w.academic_year DESC,w.program_code,w.grade_level,w.track,w.sequence_no LIMIT 500`)),
    // A published föy without a complete key is not evaluable; the Super Admin sees how many wait for a key.
    user.role === 'SUPER_ADMIN' ? one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM worksheets w WHERE w.status='PUBLISHED' AND NOT (${usable})`)) : Promise.resolve(null),
    all<any>(env.DB.prepare(`SELECT v.id,t.name,v.version FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id WHERE v.active=1 AND t.active=1 AND t.owner_type='CENTRAL' AND v.parser_definition IS NOT NULL ORDER BY t.name,v.version DESC LIMIT 200`)),
  ]);
  return json({ ok: true, institutions, worksheets, opticals, waitingForKey: waiting?.c ?? null });
}

async function upload(request: Request, env: Env, deps: FoyOperatorDeps) {
  const form = await request.formData();
  const worksheetId = String(form.get('worksheetId') || ''), institutionId = String(form.get('institutionId') || ''), templateId = String(form.get('templateVersionId') || '');
  const file = form.get('file');
  if (!worksheetId || !institutionId) return badRequest('Föy ve kurum seçin.', 'FOY_SELECTION_REQUIRED');
  if (!file || typeof file === 'string') return badRequest('TXT/DAT dosyası seçin.', 'FILE_REQUIRED');
  if ((file as File).size > 12 * 1024 * 1024) return badRequest('Dosya 12 MB sınırını aşıyor.');
  const ctx = await deps.context(request, env, institutionId); if (ctx instanceof Response) return ctx;
  const key = await loadFoyKey(env, worksheetId);
  if (!key || key.worksheet.status !== 'PUBLISHED') return fail(404, 'FOY_NOT_AVAILABLE', 'Föy bulunamadı ya da yayında değil.');
  if (!key.complete) return fail(409, 'FOY_KEY_INCOMPLETE', `Bu föyün cevap anahtarı eksik (${key.missing} soru). Süper Admin anahtarı tamamlamalı.`);
  const season = await one<any>(env.DB.prepare(`SELECT id FROM institution_seasons WHERE institution_id=? AND academic_year=? ORDER BY created_at DESC LIMIT 1`).bind(institutionId, key.worksheet.academic_year));
  if (!season) return fail(409, 'FOY_NO_STUDENTS', `${ctx.institution.name} için ${key.worksheet.academic_year} öğrenci listesi yok. Föy sonucu kayıtlı öğrencinin karnesine yazılır; önce öğrenci listesini yükleyin.`);
  const bytes = await (file as File).arrayBuffer();
  const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const dup = await one<any>(env.DB.prepare(`SELECT id,created_at FROM foy_scan_batches WHERE worksheet_id=? AND institution_id=? AND file_sha256=? AND status<>'DELETED'`).bind(worksheetId, institutionId, sha));
  if (dup) return fail(409, 'DUPLICATE_UPLOAD', 'Bu dosya bu okula ve bu föye zaten yüklenmiş. Değerlendirme geçmişinden açabilirsiniz.', { batchId: dup.id });

  const templates = await all<ParserTemplate>(env.DB.prepare(`SELECT v.id,t.name,v.parser_definition FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id WHERE v.active=1 AND t.active=1 AND t.owner_type='CENTRAL' AND v.parser_definition IS NOT NULL`));
  const text = decodeUploadedBytes(bytes);
  let parsed;
  if (templateId) { const t = templates.find((x) => x.id === templateId); if (!t) return badRequest('Seçilen optik bulunamadı.', 'OPTICAL_NOT_FOUND'); parsed = parseWithTemplate(text, (file as File).name, t); }
  else parsed = parseUploadedText(text, (file as File).name, templates);
  if (!parsed.records.length) return badRequest(parsed.issues[0] || 'Dosya okunamadı. Optik formu seçip yeniden deneyin.', parsed.ambiguous ? 'OPTICAL_TEMPLATE_AMBIGUOUS' : 'OPTICAL_TEMPLATE_REQUIRED', { templates: parsed.ambiguous ? parsed.candidates : undefined });
  const codes = key.subjects.map((s) => s.code);
  const aligned = alignRecordsToExam(parsed.records, codes);
  const records: CanonicalRecord[] = mergeSessionRecords(aligned.records).records;
  if (!records.some((r) => Object.keys(r.answers_by_subject || {}).some((c) => codes.includes(c.toUpperCase())))) return badRequest(`Dosyada bu föyün derslerine (${key.subjects.map((s) => s.name).join(', ')}) ait cevap bulunamadı.`, 'NO_FOY_SUBJECTS_IN_FILE', { warnings: aligned.warnings });

  const candidates = await all<MatchCandidate>(env.DB.prepare(`SELECT s.id student_id,s.status,s.normalized_name,s.tckn,e.student_number,e.grade_level,e.section FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id WHERE e.institution_id=? AND e.season_id=? AND s.status IN ('ACTIVE','GUEST')`).bind(institutionId, season.id));
  const grade = key.worksheet.program_code === 'SCHOOL' ? Number(key.worksheet.grade_level || 0) : 0;
  const batchId = uuid('foyb');
  const seen = new Set<string>();
  const rows = records.map((record) => {
    const match = matchParticipant(record, candidates);
    const student = match.student_id ? candidates.find((c) => c.student_id === match.student_id) : undefined;
    let reason: string | null = null;
    // Only a registered (ACTIVE) student gets föy evidence; an exam guest is not on the school's list.
    if (!['ACTIVE_MATCH', 'GUEST_MATCH'].includes(match.status) || !student || student.status !== 'ACTIVE') reason = match.status === 'AMBIGUOUS' ? 'Birden çok öğrenciyle eşleşiyor; öğrenci numarasını kontrol edin.' : 'Kurumun öğrenci listesinde bulunamadı.';
    else if (match.issues.some((x) => NAME_ONLY.test(x))) reason = 'Yalnız ad soyadla eşleşti; öğrenci numarası okunamadı.';
    else if (match.issues.length) reason = `Eşleşme kesin değil: ${match.issues.join(' · ')}`;
    else if (grade && student.grade_level && Number(student.grade_level) !== grade) reason = `Föy ${grade}. sınıf için; öğrenci ${student.grade_level}. sınıfta.`;
    else if (seen.has(student.student_id)) reason = 'Aynı öğrencinin dosyada ikinci kâğıdı.';
    if (!reason && student) seen.add(student.student_id);
    const answers: Record<string, string> = {};
    for (const c of codes) if (record.answers_by_subject?.[c] != null) answers[c] = record.answers_by_subject[c];
    return { id: uuid('foyr'), row_no: record.row_no, name: record.name || null, number: record.student_number || null, answers, student: reason ? null : student!.student_id, status: reason ? 'SET_ASIDE' : 'READY', reason };
  });
  await env.DB.prepare(`INSERT INTO foy_scan_batches(id,worksheet_id,institution_id,season_id,optical_template_version_id,file_name,file_sha256,status,total,set_aside,created_by) VALUES(?,?,?,?,?,?,?,'READY',?,?,?)`)
    .bind(batchId, worksheetId, institutionId, season.id, parsed.templateId || templateId || null, (file as File).name.slice(0, 200), sha, rows.length, rows.filter((r) => r.status === 'SET_ASIDE').length, ctx.user.id).run();
  const statements = rows.map((r) => env.DB.prepare(`INSERT INTO foy_scan_records(id,batch_id,row_no,display_name,student_number,answers_json,matched_student_id,status,reason) VALUES(?,?,?,?,?,?,?,?,?)`).bind(r.id, batchId, r.row_no, r.name, r.number, JSON.stringify(r.answers), r.student, r.status, r.reason));
  for (let i = 0; i < statements.length; i += 90) await env.DB.batch(statements.slice(i, i + 90));
  await audit(env.DB, ctx.user.id, institutionId, 'FOY_OPTICAL_UPLOADED', 'foy_scan_batch', batchId, { worksheetId, rows: rows.length, setAside: rows.filter((r) => r.status === 'SET_ASIDE').length, template: parsed.templateName });
  return batchDetail(env, batchId, { notes: aligned.warnings, template: parsed.templateName || null });
}

async function batchContext(request: Request, env: Env, deps: FoyOperatorDeps, batchId: string) {
  const batch = await one<any>(env.DB.prepare(`SELECT * FROM foy_scan_batches WHERE id=? AND status<>'DELETED'`).bind(batchId));
  if (!batch) return fail(404, 'FOY_BATCH_NOT_FOUND', 'Föy yüklemesi bulunamadı.');
  const ctx = await deps.context(request, env, batch.institution_id); if (ctx instanceof Response) return ctx;
  return { ...ctx, batch };
}

async function batchDetail(env: Env, batchId: string, extra: Record<string, unknown> = {}) {
  const batch = await one<any>(env.DB.prepare(`SELECT b.*,w.title worksheet_title,w.academic_year,i.name institution_name FROM foy_scan_batches b JOIN worksheets w ON w.id=b.worksheet_id JOIN institutions i ON i.id=b.institution_id WHERE b.id=?`).bind(batchId));
  const records = await all<any>(env.DB.prepare(`SELECT r.id,r.row_no,r.display_name,r.student_number,r.status,r.reason,r.correct,r.wrong,r.blank,se.first_name||' '||se.last_name student_name FROM foy_scan_records r LEFT JOIN student_entities se ON se.id=r.matched_student_id WHERE r.batch_id=? ORDER BY r.row_no`).bind(batchId));
  return json({ ok: true, batch, records, counts: { total: records.length, ready: records.filter((r) => r.status === 'READY').length, scored: records.filter((r) => r.status === 'SCORED').length, setAside: records.filter((r) => r.status === 'SET_ASIDE').length }, ...extra });
}

async function evaluate(request: Request, env: Env, deps: FoyOperatorDeps, batchId: string) {
  const ctx = await batchContext(request, env, deps, batchId); if (ctx instanceof Response) return ctx;
  const key = await loadFoyKey(env, ctx.batch.worksheet_id);
  if (!key?.complete) return fail(409, 'FOY_KEY_INCOMPLETE', 'Föyün cevap anahtarı eksik.');
  const ready = await all<any>(env.DB.prepare(`SELECT id,row_no,answers_json,matched_student_id FROM foy_scan_records WHERE batch_id=? AND status='READY' ORDER BY row_no LIMIT 120`).bind(batchId));
  const updates: D1PreparedStatement[] = [];
  for (const r of ready) {
    let answers: Record<string, string> = {}; try { answers = JSON.parse(r.answers_json || '{}'); } catch { /* blank sheet */ }
    const scored = scoreFoySheet(key, answers);
    const done = await writeFoyRun(env, { worksheetId: ctx.batch.worksheet_id, institutionId: ctx.batch.institution_id, studentId: r.matched_student_id, channel: 'OPTICAL', scored, metadata: { channel: 'PAPER_OPTICAL', batchId, rowNo: r.row_no, worksheetTitle: key.worksheet.title } });
    updates.push(done.written
      ? env.DB.prepare(`UPDATE foy_scan_records SET status='SCORED',run_id=?,correct=?,wrong=?,blank=? WHERE id=?`).bind(done.runId, scored.correct, scored.wrong, scored.blank, r.id)
      : env.DB.prepare(`UPDATE foy_scan_records SET status='SET_ASIDE',reason=? WHERE id=?`).bind('Öğrenci bu föyü daha önce gönderdi (online ya da başka bir optik); ilk gönderim sayılır.', r.id));
  }
  for (let i = 0; i < updates.length; i += 90) await env.DB.batch(updates.slice(i, i + 90));
  const left = await one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM foy_scan_records WHERE batch_id=? AND status='READY'`).bind(batchId));
  const doneAll = !left?.c;
  await env.DB.prepare(`UPDATE foy_scan_batches SET scored=(SELECT count(*) FROM foy_scan_records WHERE batch_id=?1 AND status='SCORED'),set_aside=(SELECT count(*) FROM foy_scan_records WHERE batch_id=?1 AND status='SET_ASIDE'),status=CASE WHEN ?2 THEN 'COMMITTED' ELSE status END,evaluated_at=CASE WHEN ?2 THEN CURRENT_TIMESTAMP ELSE evaluated_at END WHERE id=?1`).bind(batchId, doneAll ? 1 : 0).run();
  if (doneAll) await audit(env.DB, ctx.user.id, ctx.batch.institution_id, 'FOY_OPTICAL_EVALUATED', 'foy_scan_batch', batchId, { worksheetId: ctx.batch.worksheet_id });
  return batchDetail(env, batchId, { done: doneAll });
}

async function history(request: Request, env: Env, deps: FoyOperatorDeps) {
  const user = await deps.user(request); if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  const mode = new URL(request.url).searchParams.get('mode') === 'DEALER' ? 'DEALER' : 'INSTITUTION';
  const scope = user.role === 'SUPER_ADMIN' ? null : (await deps.institutions(env, user, mode)).map((x: any) => x.id);
  if (scope && !scope.length) return json({ ok: true, batches: [] });
  const where = scope ? `AND b.institution_id IN (${scope.map(() => '?').join(',')})` : '';
  const batches = await all<any>(env.DB.prepare(`SELECT b.id,b.worksheet_id,b.institution_id,b.status,b.total,b.scored,b.set_aside,b.file_name,b.created_at,b.evaluated_at,w.title worksheet_title,w.academic_year,i.name institution_name FROM foy_scan_batches b JOIN worksheets w ON w.id=b.worksheet_id JOIN institutions i ON i.id=b.institution_id WHERE b.status<>'DELETED' ${where} ORDER BY b.created_at DESC LIMIT 200`).bind(...(scope || [])));
  return json({ ok: true, batches });
}

/** /api/admin/result-network/operations/foy/… — routed from the sonuc operations handler. */
export async function handleFoyOperations(request: Request, env: Env, deps: FoyOperatorDeps): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const base = '/api/admin/result-network/operations/foy';
  if (!path.startsWith(base)) return null;
  if (path === `${base}/catalog` && request.method === 'GET') return catalog(request, env, deps);
  if (path === `${base}/batches` && request.method === 'GET') return history(request, env, deps);
  if (path === `${base}/upload` && request.method === 'POST') return upload(request, env, deps);
  const m = path.match(/^\/api\/admin\/result-network\/operations\/foy\/batches\/([^/]+)(\/evaluate)?$/);
  if (m && m[2] && request.method === 'POST') return evaluate(request, env, deps, m[1]);
  if (m && !m[2] && request.method === 'GET') { const ctx = await batchContext(request, env, deps, m[1]); if (ctx instanceof Response) return ctx; return batchDetail(env, m[1]); }
  if (m && !m[2] && request.method === 'DELETE') {
    const ctx = await batchContext(request, env, deps, m[1]); if (ctx instanceof Response) return ctx;
    if (ctx.batch.status === 'COMMITTED' || ctx.batch.scored > 0) return fail(409, 'FOY_BATCH_EVALUATED', 'Değerlendirilmiş föy yüklemesi silinemez; sonuçlar öğrenci karnesine yazıldı.');
    await env.DB.prepare(`UPDATE foy_scan_batches SET status='DELETED' WHERE id=?`).bind(m[1]).run();
    await audit(env.DB, ctx.user.id, ctx.batch.institution_id, 'FOY_OPTICAL_DELETED', 'foy_scan_batch', m[1], {});
    return json({ ok: true });
  }
  return null;
}
