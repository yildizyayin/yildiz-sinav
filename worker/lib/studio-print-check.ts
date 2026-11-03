import type { Env } from '../types';
import { all, one } from './db';
import { contentRevision, normalizeLayoutSettings, type LayoutPlan, type PrintLayoutSettings } from './print-layout';
import { bookletOrder, sharedPassages, stemGroupsInstalled, USABLE_BOOKLETS } from './studio-booklets';
import { layoutStudioBooklet, printableIssue, STUDIO_OPTICAL_CAPACITY, StudioPrintError, type StudioBranding } from './studio-pdf';

/**
 * P02: the print check for a Studio document. It collects every problem instead of stopping at the first, names
 * the question and what to fix (`target`), and carries the revision of everything that changes the paper. The PDF
 * route runs the same check on the server before printing; a stored PDF whose revision differs is stale.
 */
export type CheckTarget = 'ANSWER_KEY' | 'APPROVAL' | 'RIGHTS' | 'MEDIA' | 'CONTENT' | 'LAYOUT' | 'SETTINGS' | 'BOOKLET' | 'OPTICAL';
export type CheckIssue = { code: string; message: string; questionId: string | null; booklet: string | null; target: CheckTarget };
export type PrintCheck = {
  revision: string;
  status: 'READY' | 'WARNINGS' | 'BLOCKED';
  blockers: CheckIssue[];
  warnings: CheckIssue[];
  settings: PrintLayoutSettings | null;
  deliveryMode: string;
  opticalCapacity: number;
  booklets: Record<string, { questionCount: number; pages: number | null; pdf: { generated: boolean; stale: boolean } }>;
};

export const LOW_DPI_WARNING = 150;
const RIGHTS_OK = ['OWNED', 'LICENSED', 'PUBLIC_DOMAIN'];
const MEDIA_CODES = /IMAGE|MEDIA|EXTERNAL|OPTION_IMAGE|LOGO/;

function parseConfig(doc: any) { try { return JSON.parse(doc.config_json || '{}'); } catch { return {}; } }

/**
 * The governance columns and media tables exist in every deployed database. A reduced schema (older fixtures) is
 * detected once and reported as a CHECK_UNAVAILABLE warning for the part that could not be checked — never as a pass.
 */
const schemaCache = new WeakMap<object, Promise<{ cols: Set<string>; tables: Set<string> }>>();
function schemaOf(env: Env) {
  let p = schemaCache.get(env.DB);
  if (!p) {
    p = (async () => ({
      cols: new Set((await all<any>(env.DB.prepare(`SELECT name FROM pragma_table_info('question_bank')`))).map((r) => String(r.name))),
      tables: new Set((await all<any>(env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('question_assets','question_content_blocks')`))).map((r) => String(r.name))),
    }))();
    schemaCache.set(env.DB, p);
  }
  return p;
}
const col = (cols: Set<string>, name: string) => (cols.has(name) ? name : `NULL ${name}`);

export function documentLayoutSettings(doc: any): { ok: true; value: PrintLayoutSettings } | { ok: false; errors: { code: string; message: string }[] } {
  return normalizeLayoutSettings(parseConfig(doc).layout);
}

/** Digest of everything that changes the printed paper. */
export async function studioRevision(env: Env, doc: any): Promise<string> {
  const config = parseConfig(doc);
  const items = await all<any>(env.DB.prepare(`SELECT booklet_code,question_id,sort_order FROM studio_document_items WHERE document_id=? ORDER BY booklet_code,sort_order`).bind(doc.id));
  const ids = [...new Set(items.map((r) => r.question_id))];
  const marks = ids.map(() => '?').join(',') || "''";
  const { cols, tables } = await schemaOf(env);
  const questions = ids.length ? await all<any>(env.DB.prepare(`SELECT id,${col(cols, 'updated_at')},stem_text,options_json,correct_answer,${col(cols, 'review_status')},${col(cols, 'copyright_status')},content_mode FROM question_bank WHERE id IN (${marks}) ORDER BY id`).bind(...ids)) : [];
  const assets = ids.length && tables.has('question_assets') ? await all<any>(env.DB.prepare(`SELECT question_id,asset_type,r2_key,external_url,placement,option_label,sort_order FROM question_assets WHERE question_id IN (${marks}) ORDER BY question_id,sort_order`).bind(...ids)) : [];
  const blocks = ids.length && tables.has('question_content_blocks') ? await all<any>(env.DB.prepare(`SELECT question_id,block_type,placement,text_content,payload_json,sort_order FROM question_content_blocks WHERE question_id IN (${marks}) ORDER BY question_id,sort_order`).bind(...ids)) : [];
  // P03: the shared texts printed with the questions are part of the paper too.
  const passages = await sharedPassages(env, ids);
  const shared = [...passages.byQuestion.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([id, p]) => [id, p.groupId, p.title, p.text]);
  return contentRevision(['studio-v1', config.layout ?? null, String(config.deliveryMode || 'PDF_OPTICAL').toUpperCase(), config.branding ?? null, items, questions, assets, blocks, ...(shared.length || passages.unapproved.length ? [shared, passages.unapproved] : [])]);
}

export async function studioPrintCheck(env: Env, doc: any, branding: StudioBranding): Promise<PrintCheck & { plans: Record<string, LayoutPlan> }> {
  const blockers: CheckIssue[] = [], warnings: CheckIssue[] = [];
  const config = parseConfig(doc);
  const deliveryMode = String(config.deliveryMode || 'PDF_OPTICAL').toUpperCase();
  const settingsResult = documentLayoutSettings(doc);
  const settings = settingsResult.ok ? settingsResult.value : null;
  if (!settingsResult.ok) for (const e of settingsResult.errors) blockers.push({ code: e.code, message: e.message, questionId: null, booklet: null, target: 'SETTINGS' });

  const items = await all<any>(env.DB.prepare(`SELECT booklet_code,question_id,sort_order FROM studio_document_items WHERE document_id=? ORDER BY booklet_code,sort_order`).bind(doc.id));
  const byBooklet = new Map<string, string[]>();
  for (const r of items) (byBooklet.get(r.booklet_code) || byBooklet.set(r.booklet_code, []).get(r.booklet_code)!).push(r.question_id);
  const a = byBooklet.get('A') || [];
  if (!a.length) blockers.push({ code: 'BOOKLET_EMPTY', message: 'A kitapçığında soru yok.', questionId: null, booklet: 'A', target: 'BOOKLET' });

  // Booklet mapping: same questions, positions 1..n, B exactly the id-derived order of A.
  const groupOf = new Map<string, string | null>();
  if (a.length && await stemGroupsInstalled(env)) {
    const rows = await all<any>(env.DB.prepare(`SELECT id,stem_group_id FROM question_bank WHERE id IN (${a.map(() => '?').join(',')})`).bind(...a));
    for (const r of rows) groupOf.set(r.id, r.stem_group_id || null);
  }
  for (const [code, list] of byBooklet) {
    if (!USABLE_BOOKLETS.includes(code)) { blockers.push({ code: 'BOOKLET_UNSUPPORTED', message: `${code} kitapçığı desteklenmiyor.`, questionId: null, booklet: code, target: 'BOOKLET' }); continue; }
    const positions = items.filter((r) => r.booklet_code === code).map((r) => Number(r.sort_order));
    if (positions.some((p, i) => p !== i + 1)) blockers.push({ code: 'BOOKLET_POSITIONS', message: `${code} kitapçığında soru numaraları kesintili.`, questionId: null, booklet: code, target: 'BOOKLET' });
    if (code === 'A') continue;
    if (list.length !== a.length || [...list].sort().join() !== [...a].sort().join()) { blockers.push({ code: 'BOOKLET_MAPPING', message: `${code} kitapçığı A ile aynı soruları içermiyor.`, questionId: null, booklet: code, target: 'BOOKLET' }); continue; }
    const expected = await bookletOrder(doc.id, code, a.map((id) => ({ id, groupId: groupOf.get(id) || null })));
    if (expected.join() !== list.join()) blockers.push({ code: 'BOOKLET_MAPPING', message: `${code} kitapçığının sırası A'dan türetilen sırayla uyuşmuyor; sırayı yeniden kaydedin.`, questionId: null, booklet: code, target: 'BOOKLET' });
  }

  // Per question: key, approval, rights, printable content/media.
  const { cols } = await schemaOf(env);
  for (const [name, target] of [['review_status', 'APPROVAL'], ['copyright_status', 'RIGHTS']] as const) if (!cols.has(name)) warnings.push({ code: 'CHECK_UNAVAILABLE', message: `Bu veritabanında ${name} alanı yok; ${target === 'APPROVAL' ? 'onay' : 'kullanım hakkı'} kontrolü yapılamadı.`, questionId: null, booklet: null, target });
  const questions = a.length ? await all<any>(env.DB.prepare(`SELECT id,stem_text,options_json,correct_answer,content_mode,${col(cols, 'origin_kind')},${col(cols, 'review_status')},${col(cols, 'copyright_status')},${col(cols, 'option_count')} FROM question_bank WHERE id IN (${a.map(() => '?').join(',')})`).bind(...a)) : [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  let printableAll = true;
  for (const [i, id] of a.entries()) {
    const q = byId.get(id), no = i + 1;
    if (!q) { blockers.push({ code: 'QUESTION_MISSING', message: `Soru ${no} artık havuzda yok.`, questionId: id, booklet: 'A', target: 'CONTENT' }); printableAll = false; continue; }
    let optionTotal = Number(q.option_count); if (!optionTotal) { try { const o = JSON.parse(q.options_json || '[]'); optionTotal = Array.isArray(o) ? o.length : 4; } catch { optionTotal = 4; } }
    const labels = ['A', 'B', 'C', 'D', 'E'].slice(0, optionTotal === 5 ? 5 : 4);
    if (!labels.includes(String(q.correct_answer || '').trim().toUpperCase())) blockers.push({ code: 'MISSING_ANSWER_KEY', message: `Soru ${no}: cevap anahtarı eksik veya geçersiz.`, questionId: id, booklet: null, target: 'ANSWER_KEY' });
    if (cols.has('review_status') && q.review_status !== 'APPROVED') blockers.push({ code: 'NOT_APPROVED', message: `Soru ${no}: editoryal onayı yok.`, questionId: id, booklet: null, target: 'APPROVAL' });
    if (cols.has('copyright_status') && !RIGHTS_OK.includes(String(q.copyright_status))) blockers.push({ code: 'RIGHTS_NOT_CLEARED', message: `Soru ${no}: kullanım hakkı baskıya uygun değil.`, questionId: id, booklet: null, target: 'RIGHTS' });
    const issue = await printableIssue(env, q, no);
    if (issue) { printableAll = false; blockers.push({ code: issue.code, message: issue.message, questionId: id, booklet: null, target: MEDIA_CODES.test(issue.code) ? 'MEDIA' : 'CONTENT' }); }
  }

  // P03: an unapproved shared text is never printed; name each question that waits for it.
  const passages = await sharedPassages(env, a);
  for (const id of passages.unapproved) { printableAll = false; blockers.push({ code: 'STEM_GROUP_NOT_APPROVED', message: `Soru ${a.indexOf(id) + 1}: ortak kök metni henüz onaylanmadı.`, questionId: id, booklet: null, target: 'APPROVAL' }); }

  if (deliveryMode === 'PDF_OPTICAL' && a.length > STUDIO_OPTICAL_CAPACITY) blockers.push({ code: 'OPTICAL_CAPACITY', message: `Telefon optiği en fazla ${STUDIO_OPTICAL_CAPACITY} soruyu okutabilir; belgede ${a.length} soru var. Soru sayısını azaltın veya optiksiz PDF seçin.`, questionId: null, booklet: null, target: 'OPTICAL' });

  // Layout: only when every question is printable and the settings are valid; overflow and image sharpness per booklet.
  const plans: Record<string, LayoutPlan> = {};
  if (printableAll && settings && a.length) {
    for (const code of byBooklet.keys()) {
      if (!USABLE_BOOKLETS.includes(code)) continue;
      const overflow: Array<{ questionId: string; no: number; height: number; room: number }> = [];
      try {
        const out = await layoutStudioBooklet(env, doc.id, code, branding, settings, overflow);
        plans[code] = out.plan;
        for (const o of overflow) blockers.push({ code: 'PRINT_QUESTION_TOO_LONG', message: `Soru ${o.no}: sütuna sığmıyor (${o.height} pt, sütunda ${o.room} pt yer var). Punto, sütun veya sayfa ayarını değiştirin ya da içeriği kısaltın.`, questionId: o.questionId, booklet: code, target: 'LAYOUT' });
        if (code === 'A') for (const p of out.plan.placements) if (p.minImageDpi !== undefined && p.minImageDpi < LOW_DPI_WARNING) warnings.push({ code: 'LOW_IMAGE_RESOLUTION', message: `Soru ${p.no}: görsel yaklaşık ${p.minImageDpi} dpi basılacak; bulanık görünebilir (önerilen en az ${LOW_DPI_WARNING} dpi).`, questionId: p.questionId, booklet: null, target: 'MEDIA' });
      } catch (error) {
        if (!(error instanceof StudioPrintError)) throw error;
        blockers.push({ code: error.code, message: error.message, questionId: null, booklet: code, target: MEDIA_CODES.test(error.code) ? 'MEDIA' : 'LAYOUT' });
      }
    }
  }

  const revision = await studioRevision(env, doc);
  const assets = await all<any>(env.DB.prepare(`SELECT booklet_code,metadata_json FROM studio_document_assets WHERE document_id=? AND asset_type='QUESTION_PDF'`).bind(doc.id));
  const booklets: PrintCheck['booklets'] = {};
  for (const [code, list] of byBooklet) {
    const asset = assets.find((x) => x.booklet_code === code);
    let stored: string | null = null; try { stored = JSON.parse(asset?.metadata_json || '{}').revision ?? null; } catch { stored = null; }
    booklets[code] = { questionCount: list.length, pages: plans[code]?.pages ?? null, pdf: { generated: Boolean(asset), stale: Boolean(asset) && stored !== revision } };
  }
  const status = blockers.length ? 'BLOCKED' : warnings.length ? 'WARNINGS' : 'READY';
  return { revision, status, blockers, warnings, settings, deliveryMode, opticalCapacity: STUDIO_OPTICAL_CAPACITY, booklets, plans };
}
