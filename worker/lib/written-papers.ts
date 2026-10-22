/**
 * A040: written exam paper and answer key.
 * The paper follows the scenario the school's committee chose (A037) on a verified ÖDSGM/provincial table or
 * the school's own committee table. Each scenario row gets exactly its question count: approved written bank
 * items with an approved rubric (A039), or questions the school committee writes into the paper. Where the
 * "two questions by the school committee" rule is confirmed (policy scope) it is enforced; outside it the rule
 * is not imposed and the paper says it must be re-verified. Finalising pins the rubric versions; the paper
 * totals 100 and can then be printed with its key, and never changes.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, one, uuid } from './db';
import policy from '../../data/common-written-policy-20261019.json';
import { effectiveRubric, normalizeRubric } from './question-rubrics';
import { looksMultipleChoice } from './open-ended-generation';

export type ZumreRule = 'REQUIRED_2' | 'NOT_APPLICABLE' | 'UNVERIFIED';
/** Whether the "two jointly authored questions" rule applies, from the verified common-written policy only. */
export function zumreRule(t: { authority: string; academic_year: string; grade_level: number }, subjectCode: string | null): ZumreRule {
  if (t.authority !== 'ODSGM') return 'NOT_APPLICABLE';
  const s = policy.sourceScope;
  const inScope = (s.middleGrades.includes(t.grade_level) && s.middleSubjects.includes(subjectCode || '')) || (s.highGrades.includes(t.grade_level) && s.highSubjects.includes(subjectCode || ''));
  if (!inScope) return 'NOT_APPLICABLE';
  return t.academic_year === policy.source.academicYear ? 'REQUIRED_2' : 'UNVERIFIED';
}
export const ZUMRE_RULE_TEXT: Record<ZumreRule, string> = {
  REQUIRED_2: 'Bu kapsamda 2 soruyu okul zümresi ortak hazırlar (ÖDSGM duyurusu, 2026-2027).',
  NOT_APPLICABLE: 'Bu tablo için zümre ortak soru kuralı uygulanmaz.',
  UNVERIFIED: 'Bu yıl için zümre ortak soru kuralı resmî kaynakla yeniden doğrulanmadı; zorunlu tutulmuyor, zümre kararınızı uygulayın.',
};

const fail = (status: number, code: string, message: string, details?: unknown) => json({ ok: false, error: { code, message, ...(details ? { details } : {}) } }, status);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function hasSubject(env: Env, user: AuthUser, institutionId: string, subjectId: string) {
  return !!(await one(env.DB.prepare(`SELECT 1 FROM teacher_assignments WHERE user_id=? AND institution_id=? AND active=1 AND assignment_type='SUBJECT' AND subject_id=?`).bind(user.id, institutionId, subjectId)));
}
async function canManage(env: Env, user: AuthUser, institutionId: string, subjectId: string) {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.institution_id !== institutionId) return false;
  if (user.role === 'INSTITUTION_MANAGER') return true;
  return user.role === 'TEACHER' && hasSubject(env, user, institutionId, subjectId);
}

async function loadPaper(env: Env, id: string) {
  return one<any>(env.DB.prepare(`SELECT p.*,t.academic_year,t.term,t.exam_no,t.grade_level,t.subject_id,t.authority,t.province,t.status table_status,t.source_title,s.name subject_name,s.code subject_code,sc.label scenario_label,i.name institution_name
    FROM written_papers p JOIN written_exam_tables t ON t.id=p.table_id JOIN subjects s ON s.id=t.subject_id JOIN written_exam_scenarios sc ON sc.id=p.scenario_id JOIN institutions i ON i.id=p.institution_id WHERE p.id=?`).bind(id));
}
const scenarioRows = (env: Env, scenarioId: string) => all<any>(env.DB.prepare('SELECT * FROM written_exam_scenario_rows WHERE scenario_id=? ORDER BY sort_order').bind(scenarioId));
const paperItems = (env: Env, id: string) => all<any>(env.DB.prepare(`SELECT i.*,q.stem_text,q.solution_text FROM written_paper_items i LEFT JOIN question_bank q ON q.id=i.question_id WHERE i.paper_id=? ORDER BY i.sort_order`).bind(id));

/** A bank item usable in this slot, with the rubric grading would use for this school; or the reason it is not. */
async function bankCandidate(env: Env, p: any, row: any, questionId: string): Promise<{ ok: true; rubric: any } | { ok: false; reason: string }> {
  const q = await one<any>(env.DB.prepare(`SELECT q.id FROM question_bank q WHERE q.id=? AND q.question_type='OPEN_ENDED' AND q.review_status='APPROVED'
    AND q.copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED') AND (q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?))
    AND q.grade_level=? AND q.subject_id=? AND q.academic_year=?
    AND (? IS NULL OR EXISTS(SELECT 1 FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id WHERE l.question_id=q.id AND o.code=?))`)
    .bind(questionId, p.institution_id, p.grade_level, p.subject_id, p.academic_year, row.outcome_code || null, row.outcome_code || null));
  if (!q) return { ok: false, reason: 'Soru bu satırın sınıf, ders, yıl veya kazanımına uygun onaylı bir yazılı soru değil.' };
  const rubric = await effectiveRubric(env, questionId, p.institution_id);
  if (!rubric) return { ok: false, reason: 'Sorunun okulunuz için onaylı rubriği yok (Yazılı Rubrikleri).' };
  return { ok: true, rubric };
}

async function candidates(env: Env, p: any, row: any, exclude: Set<string>) {
  const rows = await all<any>(env.DB.prepare(`SELECT q.id,substr(q.stem_text,1,200) stem FROM question_bank q WHERE q.question_type='OPEN_ENDED' AND q.review_status='APPROVED'
    AND q.copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED') AND (q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?))
    AND q.grade_level=? AND q.subject_id=? AND q.academic_year=?
    AND (? IS NULL OR EXISTS(SELECT 1 FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id WHERE l.question_id=q.id AND o.code=?)) ORDER BY q.created_at LIMIT 40`)
    .bind(p.institution_id, p.grade_level, p.subject_id, p.academic_year, row.outcome_code || null, row.outcome_code || null));
  const out = [];
  for (const r of rows) { if (exclude.has(r.id)) continue; const rubric = await effectiveRubric(env, r.id, p.institution_id); if (rubric) out.push({ ...r, points: rubric.total_points, rubricVersion: rubric.version }); }
  return out;
}

/** Everything that prevents finalising; warnings do not block. */
async function check(env: Env, p: any) {
  const blockers: string[] = []; const warnings: string[] = [];
  if (!['VERIFIED', 'ZUMRE'].includes(p.table_status)) blockers.push('Dağılım tablosu artık kullanılamıyor (doğrulanmış değil veya arşivde).');
  const choice = await one<any>(env.DB.prepare('SELECT scenario_id FROM written_exam_scenario_choices WHERE institution_id=? AND table_id=?').bind(p.institution_id, p.table_id));
  if (choice?.scenario_id !== p.scenario_id) blockers.push('Okulun zümre kararıyla seçtiği senaryo değişti; kâğıdı yeni senaryoyla yeniden oluşturun.');
  const rows = await scenarioRows(env, p.scenario_id); const items = await paperItems(env, p.id);
  const pinned: { itemId: string; rubricId: string; points: number }[] = [];
  let total = 0;
  for (const row of rows) {
    const own = items.filter((i) => i.scenario_row_id === row.id);
    if (own.length !== row.question_count) blockers.push(`${row.unit || row.topic || row.outcome_code}: ${row.question_count} soru gerekli, ${own.length} var.`);
  }
  for (const i of items) {
    const row = rows.find((r) => r.id === i.scenario_row_id);
    if (!row) { blockers.push(`${i.sort_order}. soru senaryodaki bir satıra bağlı değil.`); continue; }
    if (i.source === 'BANK') {
      const c = await bankCandidate(env, p, row, i.question_id);
      if (!c.ok) blockers.push(`${i.sort_order}. soru: ${c.reason}`);
      else { pinned.push({ itemId: i.id, rubricId: c.rubric.id, points: c.rubric.total_points }); total += c.rubric.total_points; }
    } else {
      const r = normalizeRubric(JSON.parse(i.zumre_rubric_json || 'null'));
      if (!r.value) blockers.push(`${i.sort_order}. soru (zümre): ${r.errors[0]}`); else total += r.value.totalPoints;
    }
  }
  const zumreCount = items.filter((i) => i.source === 'ZUMRE').length;
  if (p.zumre_rule === 'REQUIRED_2' && zumreCount !== 2) blockers.push(`Bu kapsamda okul zümresinin ortak hazırladığı tam 2 soru olmalı; şu an ${zumreCount}.`);
  if (p.zumre_rule === 'UNVERIFIED') warnings.push(ZUMRE_RULE_TEXT.UNVERIFIED);
  if (total !== 100) blockers.push(`Toplam puan ${total}; yazılı kâğıdının toplamı 100 olmalı. Soru puanlarını rubrik sürümleriyle ayarlayın.`);
  return { blockers, warnings, total, pinned, rows, items };
}

async function create(request: Request, env: Env, user: AuthUser) {
  const b = await request.json().catch(() => ({})) as any;
  const institutionId = user.role === 'SUPER_ADMIN' ? text(b.institutionId, 80) : user.institution_id;
  if (!institutionId) return fail(400, 'VALIDATION_ERROR', 'Okul seçilmelidir.');
  const t = await one<any>(env.DB.prepare(`SELECT t.*,s.code subject_code FROM written_exam_tables t JOIN subjects s ON s.id=t.subject_id WHERE t.id=?`).bind(text(b.tableId, 80)));
  const inst = await one<any>(env.DB.prepare('SELECT city FROM institutions WHERE id=?').bind(institutionId));
  const usable = t && inst && ((t.status === 'VERIFIED' && (t.authority === 'ODSGM' || (t.authority === 'IL_ZUMRE' && String(t.province || '').toLocaleLowerCase('tr-TR') === String(inst.city || '').toLocaleLowerCase('tr-TR')))) || (t.status === 'ZUMRE' && t.institution_id === institutionId));
  if (!usable) return fail(400, 'TABLE_NOT_USABLE', 'Kâğıt yalnız doğrulanmış ÖDSGM/il tablosundan veya okulunuzun zümre tablosundan oluşturulur.');
  if (!(await canManage(env, user, institutionId, t.subject_id))) return fail(403, 'FORBIDDEN', 'Bu ders için yazılı kâğıdı hazırlama yetkiniz yok.');
  const choice = await one<any>(env.DB.prepare('SELECT scenario_id FROM written_exam_scenario_choices WHERE institution_id=? AND table_id=?').bind(institutionId, t.id));
  if (!choice) return fail(409, 'SCENARIO_NOT_CHOSEN', 'Önce okul yöneticisi zümre kararıyla bu tablodan bir senaryo seçmelidir.');
  const title = text(b.title, 200); if (title.length < 3) return fail(400, 'VALIDATION_ERROR', 'Kâğıt başlığı gereklidir.');
  const rule = zumreRule(t, t.subject_code);
  const id = uuid('wp');
  await env.DB.prepare(`INSERT INTO written_papers(id,institution_id,table_id,scenario_id,title,class_label,exam_date,zumre_rule,created_by) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(id, institutionId, t.id, choice.scenario_id, title, text(b.classLabel, 60) || null, text(b.examDate, 10) || null, rule, user.id).run();
  await audit(env.DB, user.id, institutionId, 'WRITTEN_PAPER_CREATED', 'written_paper', id, { tableId: t.id, scenarioId: choice.scenario_id, zumreRule: rule });
  return json({ ok: true, id, zumreRule: rule }, 201);
}

async function setItems(request: Request, env: Env, user: AuthUser, p: any) {
  if (p.status !== 'DRAFT') return fail(409, 'PAPER_LOCKED', 'Kesinleşmiş kâğıt değiştirilemez.');
  const b = await request.json().catch(() => ({})) as any;
  const list = Array.isArray(b.items) ? b.items : [];
  if (list.length > 60) return fail(400, 'VALIDATION_ERROR', 'Bir kâğıtta en çok 60 soru olabilir.');
  const rows = await scenarioRows(env, p.scenario_id);
  const st: D1PreparedStatement[] = [env.DB.prepare('DELETE FROM written_paper_items WHERE paper_id=?').bind(p.id)];
  const used = new Set<string>();
  for (let k = 0; k < list.length; k++) {
    const it = list[k]; const row = rows.find((r) => r.id === it?.scenarioRowId);
    if (!row) return fail(400, 'VALIDATION_ERROR', `${k + 1}. soru senaryodaki bir satıra bağlanmalı.`);
    if (it.source === 'ZUMRE') {
      const stem = text(it.stemText, 3000), answer = text(it.modelAnswer, 4000);
      if (stem.length < 10 || answer.length < 1) return fail(400, 'VALIDATION_ERROR', `${k + 1}. soru (zümre): soru metni ve model cevap gereklidir.`);
      if (looksMultipleChoice(stem)) return fail(400, 'VALIDATION_ERROR', `${k + 1}. soru (zümre): yazılı soru çoktan seçmeli olamaz.`);
      const r = normalizeRubric(it.rubric); if (!r.value) return fail(400, 'VALIDATION_ERROR', `${k + 1}. soru (zümre): ${r.errors[0]}`, r.errors);
      st.push(env.DB.prepare(`INSERT INTO written_paper_items(id,paper_id,sort_order,scenario_row_id,source,zumre_stem,zumre_model_answer,zumre_rubric_json,points) VALUES(?,?,?,?,'ZUMRE',?,?,?,?)`).bind(uuid('wpi'), p.id, k + 1, row.id, stem, answer, JSON.stringify(r.value), r.value.totalPoints));
    } else {
      const qid = text(it.questionId, 80);
      if (used.has(qid)) return fail(400, 'VALIDATION_ERROR', `${k + 1}. soru kâğıtta zaten var.`); used.add(qid);
      const c = await bankCandidate(env, p, row, qid); if (!c.ok) return fail(400, 'QUESTION_NOT_ELIGIBLE', `${k + 1}. soru: ${c.reason}`);
      st.push(env.DB.prepare(`INSERT INTO written_paper_items(id,paper_id,sort_order,scenario_row_id,source,question_id,points) VALUES(?,?,?,?,'BANK',?,?)`).bind(uuid('wpi'), p.id, k + 1, row.id, qid, c.rubric.total_points));
    }
  }
  await env.DB.batch(st);
  await audit(env.DB, user.id, p.institution_id, 'WRITTEN_PAPER_ITEMS_SET', 'written_paper', p.id, { count: list.length, zumre: list.filter((i: any) => i?.source === 'ZUMRE').length });
  return json({ ok: true, id: p.id });
}

async function autofill(env: Env, user: AuthUser, p: any) {
  if (p.status !== 'DRAFT') return fail(409, 'PAPER_LOCKED', 'Kesinleşmiş kâğıt değiştirilemez.');
  const rows = await scenarioRows(env, p.scenario_id); const items = await paperItems(env, p.id);
  const used = new Set(items.filter((i) => i.question_id).map((i) => i.question_id));
  let order = items.reduce((m, i) => Math.max(m, i.sort_order), 0); const st: D1PreparedStatement[] = []; const missing: string[] = [];
  for (const row of rows) {
    let need = row.question_count - items.filter((i) => i.scenario_row_id === row.id).length;
    if (need <= 0) continue;
    for (const c of await candidates(env, p, row, used)) { if (need <= 0) break; used.add(c.id); need--; st.push(env.DB.prepare(`INSERT INTO written_paper_items(id,paper_id,sort_order,scenario_row_id,source,question_id,points) VALUES(?,?,?,?,'BANK',?,?)`).bind(uuid('wpi'), p.id, ++order, row.id, c.id, c.points)); }
    if (need > 0) missing.push(`${row.unit || row.topic || row.outcome_code}: ${need} soru için onaylı soru/rubrik yok`);
  }
  if (st.length) await env.DB.batch(st);
  await audit(env.DB, user.id, p.institution_id, 'WRITTEN_PAPER_AUTOFILLED', 'written_paper', p.id, { added: st.length, missing });
  return json({ ok: true, added: st.length, missing });
}

async function finalize(request: Request, env: Env, user: AuthUser, p: any) {
  if (p.status !== 'DRAFT') return fail(409, 'PAPER_LOCKED', 'Kâğıt zaten kesinleşmiş veya arşivde.');
  if (!['INSTITUTION_MANAGER', 'TEACHER', 'SUPER_ADMIN'].includes(user.role)) return fail(403, 'FORBIDDEN', 'Kâğıdı öğretmen veya okul yöneticisi kesinleştirir.');
  const b = await request.json().catch(() => ({})) as any;
  if (b?.confirm !== true) return fail(400, 'CONFIRMATION_REQUIRED', 'Soruları, dağılımı, puanları ve anahtarı kontrol ettiğinizi onaylayın.');
  const c = await check(env, p);
  if (c.blockers.length) return fail(409, 'PAPER_INCOMPLETE', c.blockers[0], c.blockers);
  try {
    await env.DB.batch([
      ...c.pinned.map((x) => env.DB.prepare(`UPDATE written_paper_items SET rubric_id=?,points=? WHERE id=?`).bind(x.rubricId, x.points, x.itemId)),
      env.DB.prepare(`UPDATE written_papers SET total_points=? WHERE id=? AND status='DRAFT'`).bind(c.total, p.id),
      env.DB.prepare(`UPDATE written_papers SET status='FINAL',finalized_by=?,finalized_at=CURRENT_TIMESTAMP WHERE id=? AND status='DRAFT'`).bind(user.id, p.id),
    ]);
  } catch { return fail(409, 'PAPER_INCOMPLETE', 'Kâğıt tutarlılık denetiminden geçmedi; yenileyip tekrar deneyin.'); }
  await audit(env.DB, user.id, p.institution_id, 'WRITTEN_PAPER_FINALIZED', 'written_paper', p.id, { total: c.total, items: c.items.length, pinnedRubrics: c.pinned.map((x) => x.rubricId), zumreRule: p.zumre_rule });
  return json({ ok: true, id: p.id, status: 'FINAL', total: c.total });
}

async function keyData(env: Env, p: any) {
  const items = await paperItems(env, p.id);
  const out = [];
  for (const i of items) {
    if (i.source === 'ZUMRE') { const r = JSON.parse(i.zumre_rubric_json); out.push({ no: i.sort_order, points: i.points, stem: i.zumre_stem, answer: i.zumre_model_answer, criteria: r.criteria, alternatives: r.alternatives, source: 'Okul zümresi' }); continue; }
    const crit = await all<any>(env.DB.prepare('SELECT * FROM question_rubric_criteria WHERE rubric_id=? ORDER BY sort_order').bind(i.rubric_id));
    const levels = crit.length ? await all<any>(env.DB.prepare(`SELECT * FROM question_rubric_levels WHERE criterion_id IN (${crit.map(() => '?').join(',')}) ORDER BY points`).bind(...crit.map((c) => c.id))) : [];
    const alts = await all<any>(env.DB.prepare('SELECT * FROM question_rubric_alternatives WHERE rubric_id=? ORDER BY sort_order').bind(i.rubric_id));
    const version = await one<any>(env.DB.prepare('SELECT version FROM question_rubrics WHERE id=?').bind(i.rubric_id));
    out.push({ no: i.sort_order, points: i.points, stem: i.stem_text, answer: i.solution_text, criteria: crit.map((c) => ({ criterion: c.criterion, points: c.points, levels: levels.filter((l) => l.criterion_id === c.id) })), alternatives: alts.map((a) => ({ answerText: a.answer_text, note: a.note })), source: `Rubrik v${version?.version}` });
  }
  return out;
}

const PAGE = (title: string, body: string) => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font-family:"Times New Roman",serif;max-width:780px;margin:24px auto;color:#000;font-size:14px}h1{font-size:18px;text-align:center;margin:0 0 4px}h2{font-size:15px;text-align:center;margin:0 0 12px}
.meta{display:flex;justify-content:space-between;border:1px solid #000;padding:6px 10px;margin-bottom:14px}.q{break-inside:avoid;margin:0 0 18px}.q .pts{float:right;font-weight:bold}.space{height:140px;border-bottom:1px dotted #999}
table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #444;padding:4px;vertical-align:top;font-size:13px}.note{font-size:12px;color:#333}@media print{button{display:none}}</style></head><body>${body}</body></html>`;

function paperHtml(p: any, items: any[]) {
  const head = `<h1>${esc(p.institution_name)}</h1><h2>${esc(p.academic_year)} · ${esc(p.term)}. dönem ${esc(p.exam_no)}. ${esc(p.subject_name)} yazılı sınavı — ${esc(p.title)}</h2>
  <div class="meta"><span>Adı Soyadı: ....................................</span><span>Sınıf/No: ${esc(p.class_label || '..........')} / ......</span><span>Tarih: ${esc(p.exam_date || '..........')}</span></div>`;
  return PAGE(p.title, head + items.map((i) => `<div class="q"><span class="pts">${i.points} puan</span><strong>${i.no}.</strong> <span style="white-space:pre-wrap">${esc(i.stem)}</span><div class="space"></div></div>`).join('') + `<p class="note">Toplam 100 puan. Başarılar.</p>`);
}
function keyHtml(p: any, items: any[]) {
  return PAGE(`${p.title} — cevap anahtarı`, `<h1>${esc(p.title)} — cevap anahtarı ve dereceli puanlama</h1><h2>${esc(p.institution_name)} · ${esc(p.subject_name)} · ${esc(p.scenario_label)}</h2>` + items.map((i) => `<div class="q"><span class="pts">${i.points} puan</span><strong>${i.no}.</strong> <span style="white-space:pre-wrap">${esc(i.stem)}</span>
  <p><strong>Model cevap:</strong> ${esc(i.answer)}</p><table><tr><th>Ölçüt</th><th>Puan</th><th>Kısmi puan düzeyleri</th></tr>${i.criteria.map((c: any) => `<tr><td>${esc(c.criterion)}</td><td>${c.points}</td><td>${c.levels.map((l: any) => `${l.points}: ${esc(l.descriptor)}`).join('<br>')}</td></tr>`).join('')}</table>
  ${i.alternatives?.length ? `<p><strong>Kabul edilen alternatif çözümler:</strong></p><ol>${i.alternatives.map((a: any) => `<li>${esc(a.answerText)}${a.note ? ` (${esc(a.note)})` : ''}</li>`).join('')}</ol>` : ''}<p class="note">Kaynak: ${esc(i.source)}</p></div>`).join(''));
}

export async function handleWrittenPapers(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/written-papers')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (!['SUPER_ADMIN', 'INSTITUTION_MANAGER', 'TEACHER'].includes(user.role) || user.must_change_password) return fail(403, 'FORBIDDEN', 'Yazılı kâğıtlarını öğretmen ve okul yöneticisi hazırlar.');
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  if (url.pathname === '/api/written-papers') {
    if (request.method === 'POST') return create(request, env, user);
    const where = user.role === 'SUPER_ADMIN' ? '1=1' : user.role === 'INSTITUTION_MANAGER' ? 'p.institution_id=?' : `p.institution_id=? AND t.subject_id IN (SELECT subject_id FROM teacher_assignments WHERE user_id=? AND institution_id=? AND active=1 AND assignment_type='SUBJECT')`;
    const params = user.role === 'SUPER_ADMIN' ? [] : user.role === 'INSTITUTION_MANAGER' ? [user.institution_id] : [user.institution_id, user.id, user.institution_id];
    const rows = await all<any>(env.DB.prepare(`SELECT p.id,p.title,p.class_label,p.exam_date,p.status,p.zumre_rule,p.total_points,p.institution_id,t.academic_year,t.term,t.exam_no,t.grade_level,s.name subject_name,(SELECT count(*) FROM written_paper_items i WHERE i.paper_id=p.id) item_count
      FROM written_papers p JOIN written_exam_tables t ON t.id=p.table_id JOIN subjects s ON s.id=t.subject_id WHERE ${where} AND (p.status<>'ARCHIVED' OR ?='1') ORDER BY p.created_at DESC LIMIT 200`).bind(...params, url.searchParams.get('archived') || ''));
    return json({ ok: true, papers: rows });
  }
  const m = url.pathname.match(/^\/api\/written-papers\/([^/]+)(?:\/(items|autofill|finalize|archive|paper|key))?$/);
  if (!m) return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
  const p = await loadPaper(env, m[1]);
  if (!p || !(await canManage(env, user, p.institution_id, p.subject_id))) return fail(404, 'NOT_FOUND', 'Kâğıt bulunamadı.');
  const action = m[2];
  if (!action && request.method === 'GET') {
    const c = await check(env, p);
    const used = new Set(c.items.filter((i) => i.question_id).map((i) => i.question_id));
    const rows = [];
    for (const r of c.rows) rows.push({ ...r, candidates: p.status === 'DRAFT' ? await candidates(env, p, r, used) : [] });
    return json({ ok: true, paper: { ...p, zumreRuleText: ZUMRE_RULE_TEXT[p.zumre_rule as ZumreRule] }, rows, items: c.items.map((i) => ({ ...i, zumre_rubric: i.zumre_rubric_json ? JSON.parse(i.zumre_rubric_json) : null, zumre_rubric_json: undefined })), blockers: p.status === 'DRAFT' ? c.blockers : [], warnings: c.warnings, total: c.total });
  }
  if ((action === 'paper' || action === 'key') && request.method === 'GET') {
    if (p.status !== 'FINAL') return fail(409, 'PAPER_NOT_FINAL', 'Kâğıt ve anahtar kesinleştirildikten sonra basılır.');
    const items = await keyData(env, p);
    await audit(env.DB, user.id, p.institution_id, action === 'key' ? 'WRITTEN_KEY_OPENED' : 'WRITTEN_PAPER_OPENED', 'written_paper', p.id, {});
    return new Response(action === 'key' ? keyHtml(p, items) : paperHtml(p, items), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } });
  }
  if (request.method === 'PUT' && action === 'items') return setItems(request, env, user, p);
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  if (action === 'autofill') return autofill(env, user, p);
  if (action === 'finalize') return finalize(request, env, user, p);
  if (action === 'archive') {
    await env.DB.prepare(`UPDATE written_papers SET status='ARCHIVED' WHERE id=?`).bind(p.id).run();
    await audit(env.DB, user.id, p.institution_id, 'WRITTEN_PAPER_ARCHIVED', 'written_paper', p.id, { previous: p.status });
    return json({ ok: true, id: p.id, status: 'ARCHIVED' });
  }
  return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
}
