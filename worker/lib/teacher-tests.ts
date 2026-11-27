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
  const tests = rows.map((r) => {
    const own = links.filter((l) => l.document_id === r.id);
    const hw = own.filter((l) => l.delivery_kind === 'HOMEWORK');
    const kind = hw.length ? 'HOMEWORK' : own.some((l) => l.delivery_kind === 'EXAM') ? 'ONLINE' : Number(r.optical_results) > 0 || Number(r.printed) ? 'PRINTED' : 'DRAFT';
    return {
      id: r.id, title: r.title, type: r.document_type, gradeLevel: r.grade_level, subject: r.subject_name || r.subject_id, status: r.status, kind,
      questionCount: Number(r.question_count || 0), booklets: String(r.booklets || 'A').split(',').filter(Boolean).sort(), updatedAt: r.updated_at || r.created_at,
      homework: hw.length ? { total: hw.reduce((t, l) => t + Number(l.total || 0), 0), done: hw.reduce((t, l) => t + Number(l.done || 0), 0), dueAt: hw.at(-1)?.due_at || null } : null,
      opticalResults: Number(r.optical_results || 0), locked: own.length > 0 || Number(r.optical_results) > 0, mine: r.created_by === user.id, teacher: { id: r.created_by, name: r.teacher_name || 'Öğretmen' },
      // the Studio document itself, for the preview / download / optical tools the page reuses
      doc: { id: r.id, title: r.title, document_type: r.document_type, grade_level: r.grade_level, subject_id: r.subject_id, subject_name: r.subject_name, status: r.status, config_json: r.config_json, created_at: r.created_at, question_count: Number(r.question_count || 0) },
    };
  });
  return json({ ok: true, tests, scope: user.role === 'TEACHER' ? 'OWN' : 'INSTITUTION' });
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

export async function handleTeacherTests(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/teacher-tests(?:\/([^/]+)(?:\/(copy))?)?$/);
  if (!m) return null;
  const { getAuthUser } = await import('./auth');
  const user: AuthUser | null = await getAuthUser(env, request);
  if (!user) return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
  if (!STAFF.includes(user.role)) return forbidden('Testlerim yalnız öğretmen ve yöneticiler içindir.');
  if (!(await studioOn(env, user))) return json({ ok: false, error: { code: 'FEATURE_DISABLED', message: 'Bu özellik kurumunuz için henüz etkin değil.', feature: 'STUDIO' } }, 403);
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return forbidden('İsteği ANUNEX üzerinden başlatın.');
  const [, id, action] = m;
  if (!id && request.method === 'GET') return list(env, user);
  if (id && !action && request.method === 'DELETE') return remove(env, user, decodeURIComponent(id));
  if (id && action === 'copy' && request.method === 'POST') return copy(env, user, decodeURIComponent(id));
  return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Bu yöntem desteklenmiyor.' } }, 405);
}
