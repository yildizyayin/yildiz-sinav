/**
 * Testlerim (owner, 26 Nov 2026: "oluşturduğum testleri silemiyorum silmem gerekli yada düzenlemem gerekli").
 * One list of the tests a teacher prepared (Studio documents), with what happened to each:
 *  - a draft can be continued, edited or deleted;
 *  - a test that reached students (homework, online exam, optical results) is never edited in place: "Kopyala ve
 *    düzenle" makes a new draft with the same questions, and the first test keeps its students' answers;
 *  - deleting such a test only takes it off the list (ARCHIVED) — results, karne and delivery records stay.
 * A teacher sees and changes only their own tests; a manager the institution's; the Super Admin any.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, badRequest, forbidden, json, notFound, one, uuid } from './db';

const STAFF = ['SUPER_ADMIN', 'INSTITUTION_MANAGER', 'TEACHER'];

async function studioOn(env: Env, user: AuthUser) {
  if (user.role === 'SUPER_ADMIN') return true;
  const row = await one<any>(env.DB.prepare(`SELECT COALESCE(o.enabled,f.enabled_default) enabled FROM platform_features f LEFT JOIN institution_feature_overrides o
    ON o.feature_key=f.feature_key AND o.institution_id=? WHERE f.feature_key='STUDIO'`).bind(user.institution_id));
  return Number(row?.enabled || 0) === 1;
}

async function ownTest(env: Env, user: AuthUser, id: string) {
  const doc = await one<any>(env.DB.prepare(`SELECT * FROM studio_documents WHERE id=? AND status<>'ARCHIVED'`).bind(id));
  if (!doc) return notFound('Test bulunamadı.');
  if (user.role !== 'SUPER_ADMIN' && doc.institution_id !== user.institution_id) return forbidden();
  if (user.role === 'TEACHER' && doc.created_by !== user.id) return forbidden('Öğretmen yalnız kendi testini değiştirebilir.');
  return doc;
}

/** Has this test reached students? Then it is kept, never changed in place. */
async function reached(env: Env, id: string) {
  const r = await one<any>(env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM studio_delivery_links WHERE document_id=?) deliveries,
      (SELECT COUNT(*) FROM assessment_runs WHERE source_type='QUESTION_BANK' AND source_id=?) results`).bind(id, id));
  return { deliveries: Number(r?.deliveries || 0), results: Number(r?.results || 0) };
}

async function list(env: Env, user: AuthUser) {
  const scope = user.role === 'SUPER_ADMIN' ? null : user.institution_id;
  const rows = await all<any>(env.DB.prepare(`SELECT d.id,d.title,d.document_type,d.grade_level,d.subject_id,s.name subject_name,d.status,d.config_json,d.created_at,d.updated_at,d.created_by,u.display_name teacher_name,
      CASE WHEN d.pdf_r2_key IS NOT NULL OR EXISTS(SELECT 1 FROM studio_document_assets a WHERE a.document_id=d.id AND a.asset_type='QUESTION_PDF') THEN 1 ELSE 0 END printed,
      (SELECT COUNT(DISTINCT i.question_id) FROM studio_document_items i WHERE i.document_id=d.id) question_count,
      (SELECT GROUP_CONCAT(DISTINCT i.booklet_code) FROM studio_document_items i WHERE i.document_id=d.id) booklets,
      (SELECT COUNT(*) FROM assessment_runs r WHERE r.source_type='QUESTION_BANK' AND r.source_id=d.id) optical_results
    FROM studio_documents d LEFT JOIN subjects s ON s.id=d.subject_id LEFT JOIN users u ON u.id=d.created_by
    WHERE d.status<>'ARCHIVED' AND (? IS NULL OR d.institution_id=?) AND (?<>'TEACHER' OR d.created_by=?)
    ORDER BY d.updated_at DESC, d.created_at DESC LIMIT 300`).bind(scope, scope, user.role, user.id));
  const ids = rows.map((r) => r.id);
  const links = ids.length ? await all<any>(env.DB.prepare(`SELECT l.document_id,l.delivery_kind,l.external_id,
      (SELECT COUNT(*) FROM assignment_recipients ar WHERE l.delivery_kind='HOMEWORK' AND ar.assignment_id=l.external_id) total,
      (SELECT COUNT(*) FROM assignment_recipients ar WHERE l.delivery_kind='HOMEWORK' AND ar.assignment_id=l.external_id AND ar.status='COMPLETED') done,
      (SELECT a.due_at FROM assignments a WHERE l.delivery_kind='HOMEWORK' AND a.id=l.external_id) due_at
    FROM studio_delivery_links l WHERE l.document_id IN (${ids.map(() => '?').join(',')}) ORDER BY l.created_at`).bind(...ids)) : [];
  // has the teacher confirmed this exact set of questions? (one query for the sets, one for the confirmations)
  const sets = ids.length ? await all<any>(env.DB.prepare(`SELECT document_id,GROUP_CONCAT(question_id,'|') qs FROM (SELECT document_id,question_id FROM studio_document_items
    WHERE booklet_code='A' AND document_id IN (${ids.map(() => '?').join(',')}) ORDER BY document_id,sort_order) GROUP BY document_id`).bind(...ids)) : [];
  const checks = ids.length ? await all<any>(env.DB.prepare(`SELECT DISTINCT document_id,items_hash FROM teacher_test_checks WHERE document_id IN (${ids.map(() => '?').join(',')})`).bind(...ids)) : [];
  const hex = async (t: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const checked = new Set<string>();
  for (const x of sets) { const h = await hex(String(x.qs || '')); if (checks.some((c) => c.document_id === x.document_id && c.items_hash === h)) checked.add(x.document_id); }
  const tests = rows.map((r) => {
    const own = links.filter((l) => l.document_id === r.id);
    const hw = own.filter((l) => l.delivery_kind === 'HOMEWORK');
    const kind = hw.length ? 'HOMEWORK' : own.some((l) => l.delivery_kind === 'EXAM') ? 'ONLINE' : Number(r.optical_results) > 0 || Number(r.printed) ? 'PRINTED' : 'DRAFT';
    return {
      id: r.id, title: r.title, type: r.document_type, gradeLevel: r.grade_level, subject: r.subject_name || r.subject_id, status: r.status, kind,
      questionCount: Number(r.question_count || 0), booklets: String(r.booklets || 'A').split(',').filter(Boolean).sort(), updatedAt: r.updated_at || r.created_at,
      homework: hw.length ? { total: hw.reduce((t, l) => t + Number(l.total || 0), 0), done: hw.reduce((t, l) => t + Number(l.done || 0), 0), dueAt: hw.at(-1)?.due_at || null } : null,
      opticalResults: Number(r.optical_results || 0), locked: own.length > 0 || Number(r.optical_results) > 0, mine: r.created_by === user.id, checked: checked.has(r.id), teacher: { id: r.created_by, name: r.teacher_name || 'Öğretmen' },
      // the Studio document itself, for the preview / download / optical tools the page reuses
      doc: { id: r.id, title: r.title, document_type: r.document_type, grade_level: r.grade_level, subject_id: r.subject_id, subject_name: r.subject_name, status: r.status, config_json: r.config_json, created_at: r.created_at, question_count: Number(r.question_count || 0) },
    };
  });
  // Hızlı Testler (PDF / fotoğraftan kırpılan sorularla) stand next to them, so a teacher finds every test in one place.
  const quick = await all<any>(env.DB.prepare(`SELECT t.id,t.title,t.grade_level,t.subject_label,t.updated_at,t.created_by,u.display_name teacher_name,
      (SELECT COUNT(*) FROM quick_test_questions q WHERE q.test_id=t.id) questions,
      (SELECT COUNT(*) FROM quick_test_questions q WHERE q.test_id=t.id AND q.correct_answer IS NULL) unanswered,
      (SELECT COUNT(*) FROM quick_test_attempts a WHERE a.test_id=t.id AND a.submitted_at IS NOT NULL) results
    FROM quick_tests t LEFT JOIN users u ON u.id=t.created_by
    WHERE t.status='ACTIVE' AND (? IS NULL OR t.institution_id=?) AND (?<>'TEACHER' OR t.created_by=?) ORDER BY t.updated_at DESC LIMIT 200`).bind(scope, scope, user.role, user.id)).catch(() => [] as any[]);
  const quickTests = quick.map((q) => ({ id: q.id, title: q.title, gradeLevel: q.grade_level, subject: q.subject_label || null, questionCount: Number(q.questions || 0), unanswered: Number(q.unanswered || 0), results: Number(q.results || 0), updatedAt: q.updated_at, mine: q.created_by === user.id, teacher: { id: q.created_by, name: q.teacher_name || 'Öğretmen' } }));
  return json({ ok: true, tests, quickTests, scope: user.role === 'TEACHER' ? 'OWN' : 'INSTITUTION' });
}

async function remove(env: Env, user: AuthUser, id: string) {
  const doc = await ownTest(env, user, id); if (doc instanceof Response) return doc;
  const r = await reached(env, id);
  if (r.deliveries || r.results) {
    await env.DB.prepare(`UPDATE studio_documents SET status='ARCHIVED',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
    await audit(env.DB, user.id, doc.institution_id, 'TEACHER_TEST_ARCHIVED', 'studio_document', id, r);
    return json({ ok: true, removed: 'ARCHIVED', message: 'Test listeden kaldırıldı; öğrenci sonuçları korunuyor.' });
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE quick_tests SET studio_document_id=NULL WHERE studio_document_id=?`).bind(id),
    env.DB.prepare(`DELETE FROM studio_documents WHERE id=?`).bind(id),
  ]);
  await audit(env.DB, user.id, doc.institution_id, 'TEACHER_TEST_DELETED', 'studio_document', id, { title: doc.title });
  return json({ ok: true, removed: 'DELETED', message: 'Taslak silindi.' });
}

async function copy(env: Env, user: AuthUser, id: string) {
  const doc = await ownTest(env, user, id); if (doc instanceof Response) return doc;
  const items = await all<any>(env.DB.prepare(`SELECT question_id,booklet_code,sort_order,points FROM studio_document_items WHERE document_id=? ORDER BY booklet_code,sort_order`).bind(id));
  if (!items.length) return badRequest('Kopyalanacak soru yok.', 'EMPTY_TEST');
  const copyId = uuid('sd');
  const title = `${String(doc.title).replace(/\s*\(kopya\)$/i, '')} (kopya)`.slice(0, 200);
  // a copy is always the copier's own draft: a manager's copy of a teacher's test belongs to the manager
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO studio_documents(id,institution_id,created_by,document_type,title,grade_level,subject_id,status,config_json) VALUES(?,?,?,?,?,?,?,'DRAFT',?)`)
      .bind(copyId, doc.institution_id, user.id, doc.document_type, title, doc.grade_level, doc.subject_id, doc.config_json),
    ...items.map((i) => env.DB.prepare(`INSERT INTO studio_document_items(document_id,question_id,booklet_code,sort_order,points) VALUES(?,?,?,?,?)`).bind(copyId, i.question_id, i.booklet_code, i.sort_order, i.points)),
  ]);
  await audit(env.DB, user.id, doc.institution_id, 'TEACHER_TEST_COPIED', 'studio_document', copyId, { from: id });
  return json({ ok: true, id: copyId, title }, 201);
}

export const CHECK_STATEMENT = 'Soruları kontrol ettim, testi sınıfım için uygun buluyorum.';
export async function itemsHash(env: Env, id: string) {
  const rows = await all<any>(env.DB.prepare(`SELECT question_id FROM studio_document_items WHERE document_id=? AND booklet_code='A' ORDER BY sort_order`).bind(id));
  const bytes = new TextEncoder().encode(rows.map((r) => r.question_id).join('|'));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function lastCheck(env: Env, id: string) {
  const hash = await itemsHash(env, id);
  const row = await one<any>(env.DB.prepare(`SELECT c.confirmed_at,u.display_name FROM teacher_test_checks c LEFT JOIN users u ON u.id=c.user_id WHERE c.document_id=? AND c.items_hash=? ORDER BY c.confirmed_at DESC LIMIT 1`).bind(id, hash));
  return row ? { at: row.confirmed_at, by: row.display_name || 'Öğretmen' } : null;
}

/** The teacher's confirmation that the questions suit the class (asked once per set of questions). */
async function check(request: Request, env: Env, user: AuthUser, id: string) {
  const doc = await ownTest(env, user, id); if (doc instanceof Response) return doc;
  const b: any = await request.json().catch(() => ({}));
  if (b?.confirm !== true) return badRequest('Onay kutusu işaretlenmeden devam edilemez.', 'CHECK_REQUIRED');
  await env.DB.prepare(`INSERT INTO teacher_test_checks(id,document_id,user_id,items_hash,statement) VALUES(?,?,?,?,?)`).bind(uuid('ttc'), id, user.id, await itemsHash(env, id), CHECK_STATEMENT).run();
  await audit(env.DB, user.id, doc.institution_id, 'TEACHER_TEST_CHECKED', 'studio_document', id, {});
  return json({ ok: true, checked: await lastCheck(env, id) });
}

/**
 * Test Hazırla (owner, 27 Nov 2026): "Çıkar" — the question leaves every booklet and the rest close ranks. Only while
 * the test has not reached students; a question that shares a stem with others never leaves alone; the last question
 * stays (delete the test instead). Printed copies are invalidated and the "sorular uygun" check is asked again.
 */
async function removeQuestion(request: Request, env: Env, user: AuthUser, id: string) {
  const doc = await ownTest(env, user, id); if (doc instanceof Response) return doc;
  const b: any = await request.json().catch(() => ({}));
  const qid = typeof b?.questionId === 'string' ? b.questionId : '';
  if (!qid) return badRequest('Çıkarılacak soru gerekli.', 'QUESTION_REQUIRED');
  const r = await reached(env, id);
  if (r.deliveries || r.results) return json({ ok: false, error: { code: 'TEST_LOCKED', message: 'Bu test öğrencilere ulaştı; soruları artık değişmez. “Kopyala ve düzenle” ile yeni bir test yapın.' } }, 409);
  const rows = await all<any>(env.DB.prepare(`SELECT question_id,booklet_code,sort_order FROM studio_document_items WHERE document_id=? ORDER BY booklet_code,sort_order`).bind(id));
  if (!rows.some((x) => x.question_id === qid)) return notFound('Soru bu testte değil.');
  if (new Set(rows.map((x) => x.question_id)).size <= 1) return badRequest('Testte en az bir soru kalmalı. Testi istemiyorsan Testlerim’den silebilirsin.', 'LAST_QUESTION');
  const grouped = await one<any>(env.DB.prepare(`SELECT stem_group_id FROM question_bank WHERE id=?`).bind(qid)).catch(() => null);
  if (grouped?.stem_group_id) return json({ ok: false, error: { code: 'STEM_GROUP', message: 'Bu soru ortak bir metne bağlı; tek başına çıkarılamaz.' } }, 409);
  const statements = [env.DB.prepare(`DELETE FROM studio_document_items WHERE document_id=? AND question_id=?`).bind(id, qid)];
  for (const code of [...new Set(rows.map((x) => x.booklet_code))]) {
    rows.filter((x) => x.booklet_code === code && x.question_id !== qid).forEach((x, i) => {
      if (x.sort_order !== i + 1) statements.push(env.DB.prepare(`UPDATE studio_document_items SET sort_order=? WHERE document_id=? AND booklet_code=? AND question_id=?`).bind(i + 1, id, code, x.question_id));
    });
  }
  statements.push(env.DB.prepare(`DELETE FROM studio_document_assets WHERE document_id=? AND asset_type='QUESTION_PDF'`).bind(id));
  statements.push(env.DB.prepare(`UPDATE studio_documents SET pdf_r2_key=NULL,status=CASE WHEN status='READY' THEN 'DRAFT' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id));
  await env.DB.batch(statements);
  await audit(env.DB, user.id, doc.institution_id, 'TEACHER_TEST_QUESTION_REMOVED', 'studio_document', id, { questionId: qid });
  return json({ ok: true, questionCount: new Set(rows.map((x) => x.question_id)).size - 1 });
}

/** What the printed paper shows: the institution's name and logo top-left, ANUNEX top-right (both can be turned off). */
async function printChoices(request: Request, env: Env, user: AuthUser, id: string) {
  const doc = await ownTest(env, user, id); if (doc instanceof Response) return doc;
  const b: any = await request.json().catch(() => ({}));
  let config: any = {}; try { config = JSON.parse(doc.config_json || '{}'); } catch { config = {}; }
  const cur = config.branding && typeof config.branding === 'object' ? config.branding : {};
  const next = { showAnunex: typeof b?.showAnunex === 'boolean' ? b.showAnunex : cur.showAnunex !== false, showNibiru: cur.showNibiru !== false, useInstitution: typeof b?.useInstitution === 'boolean' ? b.useInstitution : cur.useInstitution !== false };
  await env.DB.prepare(`UPDATE studio_documents SET config_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify({ ...config, branding: next }), id).run();
  await audit(env.DB, user.id, doc.institution_id, 'TEACHER_TEST_PRINT_CHOICES', 'studio_document', id, next);
  return json({ ok: true, branding: next });
}

/**
 * The institution's print identity for the Test Hazırla screens: its name, whether a print logo is uploaded and who
 * may upload one (the institution manager; a teacher is told to ask them). The logo itself is served for the
 * on-screen paper preview only to staff of that institution.
 */
function brandInstitution(user: AuthUser, url: URL) {
  return user.role === 'SUPER_ADMIN' ? url.searchParams.get('institutionId') || user.institution_id || null : user.institution_id || null;
}
async function branding(env: Env, user: AuthUser, url: URL) {
  const inst = brandInstitution(user, url);
  if (!inst) return json({ ok: true, institutionId: null, institutionName: null, hasLogo: false, canUpload: false });
  const row = await one<any>(env.DB.prepare(`SELECT i.name,b.logo_r2_key,b.updated_at FROM institutions i LEFT JOIN campus_branding b ON b.institution_id=i.id WHERE i.id=?`).bind(inst));
  return json({ ok: true, institutionId: inst, institutionName: row?.name || null, hasLogo: !!row?.logo_r2_key, logoVersion: row?.logo_r2_key ? String(row.updated_at || '') : null, canUpload: user.role === 'SUPER_ADMIN' || user.role === 'INSTITUTION_MANAGER' });
}
async function brandingLogo(env: Env, user: AuthUser, url: URL) {
  const inst = brandInstitution(user, url);
  const row = inst ? await one<any>(env.DB.prepare(`SELECT logo_r2_key FROM campus_branding WHERE institution_id=?`).bind(inst)) : null;
  const obj = row?.logo_r2_key ? await env.FILES.get(row.logo_r2_key) : null;
  if (!obj) return notFound('Kurum logosu yüklenmemiş.');
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const type = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : null;
  if (!type) return notFound('Kurum logosu okunamadı.');
  return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
}

/**
 * "Cevap anahtarı ve çözüm QR'ları" (owner, 27 Nov 2026): the student sheet after the test, one QR per question that
 * opens its solution video without an account (only approved questions with an approved video get a QR).
 */
async function solutionSheet(request: Request, env: Env, user: AuthUser, id: string, url: URL) {
  const doc = await ownTest(env, user, id); if (doc instanceof Response) return doc;
  const booklet = (url.searchParams.get('booklet') || 'A').toUpperCase();
  if (!['A', 'B'].includes(booklet)) return badRequest('Kitapçık A veya B olmalı.', 'INVALID_BOOKLET');
  const { bookletVideoCodes, videoOrigin } = await import('./public-video');
  const { renderSolutionSheet, StudioPrintError } = await import('./studio-pdf');
  const { studioBranding } = await import('./platform-expansion');
  const rows = await bookletVideoCodes(env, id, booklet);
  try {
    const bytes = await renderSolutionSheet(env, id, booklet, await studioBranding(env, doc), videoOrigin(env, request), rows);
    await audit(env.DB, user.id, doc.institution_id, 'STUDIO_SOLUTION_SHEET_DOWNLOADED', 'studio_document', id, { booklet, withVideo: rows.filter((r) => r.code).length, questions: rows.length });
    const name = `${String(doc.title || 'test')}-${booklet}-cozum-videolari.pdf`.replace(/[^\p{L}\p{N} ._-]/gu, '_');
    return new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'private, no-store', 'X-Anunex-Videos': String(rows.filter((r) => r.code).length) } });
  } catch (e: any) {
    if (e instanceof StudioPrintError) return json({ ok: false, error: { code: e.code, message: e.message } }, 409);
    throw e;
  }
}

/** One test: what it is, who solved it and how each question and outcome went. */
async function detail(env: Env, user: AuthUser, id: string) {
  const doc = await ownTest(env, user, id); if (doc instanceof Response) return doc;
  const meta = await one<any>(env.DB.prepare(`SELECT s.name subject,u.display_name teacher FROM studio_documents d LEFT JOIN subjects s ON s.id=d.subject_id LEFT JOIN users u ON u.id=d.created_by WHERE d.id=?`).bind(id));
  const items = await all<any>(env.DB.prepare(`SELECT i.question_id,i.sort_order,q.stem_text,
      (SELECT o.title FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id WHERE l.question_id=i.question_id LIMIT 1) outcome
    FROM studio_document_items i JOIN question_bank q ON q.id=i.question_id WHERE i.document_id=? AND i.booklet_code='A' ORDER BY i.sort_order`).bind(id));
  const links = await all<any>(env.DB.prepare(`SELECT l.external_id,l.publication_revision,l.created_at,a.due_at FROM studio_delivery_links l LEFT JOIN assignments a ON a.id=l.external_id
    WHERE l.document_id=? AND l.delivery_kind='HOMEWORK' ORDER BY l.publication_revision`).bind(id));
  const deliveries = [] as any[];
  const perQuestion = new Map<string, { right: number; total: number }>();
  for (const l of links) {
    const students = await all<any>(env.DB.prepare(`SELECT ar.student_id,ar.status,TRIM(COALESCE(se.first_name,'')||' '||COALESCE(se.last_name,'')) name,
        (SELECT c.name FROM student_enrollments e JOIN classes c ON c.id=e.class_id WHERE e.student_id=ar.student_id AND e.status='ACTIVE' LIMIT 1) class_name,
        (SELECT ROUND(100.0*SUM(COALESCE(t.score,0))/NULLIF(COUNT(*),0)) FROM assignment_attempts t WHERE t.assignment_id=ar.assignment_id AND t.student_id=ar.student_id) pct
      FROM assignment_recipients ar LEFT JOIN student_entities se ON se.id=ar.student_id WHERE ar.assignment_id=? ORDER BY se.first_name,se.last_name`).bind(l.external_id));
    const attempts = await all<any>(env.DB.prepare(`SELECT ai.reference_id question_id,t.score FROM assignment_attempts t JOIN assignment_items ai ON ai.id=t.item_id WHERE t.assignment_id=?`).bind(l.external_id));
    for (const a of attempts) { const c = perQuestion.get(a.question_id) || { right: 0, total: 0 }; c.total++; if (Number(a.score) >= 1) c.right++; perQuestion.set(a.question_id, c); }
    const done = students.filter((x) => x.status === 'COMPLETED');
    const scores = done.map((x) => Number(x.pct)).filter((x) => Number.isFinite(x));
    deliveries.push({
      round: l.publication_revision, sentAt: l.created_at, dueAt: l.due_at || null,
      classes: [...new Set(students.map((x) => x.class_name).filter(Boolean))],
      total: students.length, done: done.length, average: scores.length ? Math.round(scores.reduce((t, x) => t + x, 0) / scores.length) : null,
      students: students.map((x) => ({ name: x.name || 'Öğrenci', className: x.class_name || null, done: x.status === 'COMPLETED', percent: x.status === 'COMPLETED' && x.pct != null ? Number(x.pct) : null })),
    });
  }
  const questions = items.map((q, n) => { const c = perQuestion.get(q.question_id); return { no: n + 1, outcome: q.outcome || null, stem: String(q.stem_text || '').slice(0, 140), correctRate: c && c.total ? Math.round((100 * c.right) / c.total) : null, answered: c?.total || 0 }; });
  const outcomeMap = new Map<string, { right: number; total: number }>();
  for (const q of items) { const c = perQuestion.get(q.question_id); if (!c || !q.outcome) continue; const o = outcomeMap.get(q.outcome) || { right: 0, total: 0 }; o.right += c.right; o.total += c.total; outcomeMap.set(q.outcome, o); }
  const optical = await one<any>(env.DB.prepare(`SELECT COUNT(*) n, ROUND(100.0*AVG(score)) avg FROM assessment_runs WHERE source_type='QUESTION_BANK' AND source_id=?`).bind(id));
  const r = await reached(env, id);
  return json({ ok: true, test: {
    id, title: doc.title, type: doc.document_type, gradeLevel: doc.grade_level, subject: meta?.subject || null, teacher: meta?.teacher || null, status: doc.status,
    questionCount: items.length, locked: r.deliveries + r.results > 0, canAssign: doc.document_type === 'WORKSHEET' && ['READY', 'PUBLISHED'].includes(doc.status),
    doc: { id, title: doc.title, document_type: doc.document_type, grade_level: doc.grade_level, subject_id: doc.subject_id, status: doc.status, config_json: doc.config_json },
  }, checked: await lastCheck(env, id), deliveries, questions,
  outcomes: [...outcomeMap.entries()].map(([title, c]) => ({ title, correctRate: c.total ? Math.round((100 * c.right) / c.total) : null })).sort((a, b) => (a.correctRate ?? 101) - (b.correctRate ?? 101)),
  optical: { count: Number(optical?.n || 0), average: optical?.avg != null ? Number(optical.avg) : null } });
}

export async function handleTeacherTests(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/teacher-tests(?:\/([^/]+)(?:\/(copy|check|remove-question|print|logo|solution-sheet))?)?$/);
  if (!m) return null;
  const { getAuthUser } = await import('./auth');
  const user: AuthUser | null = await getAuthUser(env, request);
  if (!user) return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
  if (!STAFF.includes(user.role)) return forbidden('Testlerim yalnız öğretmen ve yöneticiler içindir.');
  if (!(await studioOn(env, user))) return json({ ok: false, error: { code: 'FEATURE_DISABLED', message: 'Bu özellik kurumunuz için henüz etkin değil.', feature: 'STUDIO' } }, 403);
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return forbidden('İsteği ANUNEX üzerinden başlatın.');
  const [, id, action] = m;
  if (id === 'branding' && request.method === 'GET') return action === 'logo' ? brandingLogo(env, user, url) : !action ? branding(env, user, url) : json({ ok: false, error: { code: 'NOT_FOUND', message: 'Bulunamadı.' } }, 404);
  if (id && action === 'remove-question' && request.method === 'POST') return removeQuestion(request, env, user, decodeURIComponent(id));
  if (id && action === 'solution-sheet' && request.method === 'GET') return solutionSheet(request, env, user, decodeURIComponent(id), url);
  if (id && action === 'print' && request.method === 'PUT') return printChoices(request, env, user, decodeURIComponent(id));
  if (!id && request.method === 'GET') return list(env, user);
  if (id && !action && request.method === 'GET') return detail(env, user, decodeURIComponent(id));
  if (id && !action && request.method === 'DELETE') return remove(env, user, decodeURIComponent(id));
  if (id && action === 'check' && request.method === 'POST') return check(request, env, user, decodeURIComponent(id));
  if (id && action === 'copy' && request.method === 'POST') return copy(env, user, decodeURIComponent(id));
  return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Bu yöntem desteklenmiyor.' } }, 405);
}
