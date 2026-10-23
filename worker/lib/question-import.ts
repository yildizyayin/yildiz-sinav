/**
 * A082: bulk import of outside questions (Excel/CSV/JSON parsed in the browser into rows).
 * Super Admin only. Every row must name its source, its rights status and an official, verified 2027–2028
 * outcome of the same grade; nothing is guessed. Valid rows enter the bank as REVIEW (never APPROVED), so the
 * single-question / A008 batch review gate still decides. An exact copy of a bank question is skipped, so
 * re-uploading the same file adds nothing; near-identical stems are flagged as a warning only.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, uuid } from './db';

export const IMPORT_ACADEMIC_YEAR = '2027-2028';
export const IMPORT_MAX_ROWS = 500;
const COPYRIGHTS = ['OWNED', 'LICENSED', 'PUBLIC_DOMAIN', 'USER_PROVIDED', 'RESTRICTED'] as const;
const LABELS = ['A', 'B', 'C', 'D', 'E'];
const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
export const normalizedStem = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
const words = (s: string) => new Set(normalizedStem(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1));
export function stemSimilarity(a: string, b: string) {
  const x = words(a), y = words(b); if (!x.size || !y.size) return 0;
  let both = 0; for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}
export const SIMILAR_AT = 0.7; // a warning only, so a false alarm costs little

export type ImportRow = { sourceLabel?: unknown; gradeLevel?: unknown; outcomeCode?: unknown; stem?: unknown; optionA?: unknown; optionB?: unknown; optionC?: unknown; optionD?: unknown; optionE?: unknown; correctAnswer?: unknown; solution?: unknown; difficultyLevel?: unknown; copyrightStatus?: unknown };
type Clean = { sourceLabel: string; gradeLevel: number; outcomeCode: string; stem: string; options: { label: string; text: string }[]; correctAnswer: string; solution: string | null; difficultyLevel: number; copyrightStatus: string };

/** Shape checks that need no database. */
export function checkRow(r: ImportRow): { row?: Clean; errors: string[] } {
  const errors: string[] = [];
  const sourceLabel = str(r.sourceLabel); if (!sourceLabel) errors.push('Kaynak etiketi zorunlu (ör. Claude, yayınevi, öğretmen).'); else if (sourceLabel.length > 120) errors.push('Kaynak etiketi en çok 120 karakter olabilir.');
  const gradeLevel = Number(str(r.gradeLevel)); if (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 12) errors.push('Sınıf 1–12 arasında bir sayı olmalı.');
  const outcomeCode = str(r.outcomeCode); if (!outcomeCode) errors.push('Kazanım kodu zorunlu.');
  const stem = str(r.stem); if (!stem) errors.push('Soru kökü zorunlu.'); else if (stem.length > 4000) errors.push('Soru kökü en çok 4000 karakter olabilir.');
  const texts = [r.optionA, r.optionB, r.optionC, r.optionD, r.optionE].map(str);
  const count = texts[4] ? 5 : 4;
  if (texts.slice(0, count).some((t) => !t)) errors.push('A, B, C, D şıkları zorunlu; E şıkkı varsa dolu olmalı.');
  if (texts.some((t) => t.length > 1000)) errors.push('Bir şık en çok 1000 karakter olabilir.');
  const options = texts.slice(0, count).map((text, i) => ({ label: LABELS[i], text }));
  if (new Set(options.map((o) => normalizedStem(o.text))).size !== options.length) errors.push('Aynı metinli iki şık var.');
  const correctAnswer = str(r.correctAnswer).toUpperCase(); if (!LABELS.slice(0, count).includes(correctAnswer)) errors.push(`Doğru cevap ${LABELS.slice(0, count).join('/')} olmalı.`);
  const solution = str(r.solution) || null; if (solution && solution.length > 4000) errors.push('Çözüm en çok 4000 karakter olabilir.');
  const d = str(r.difficultyLevel); const difficultyLevel = d ? Number(d) : 3; if (!Number.isInteger(difficultyLevel) || difficultyLevel < 1 || difficultyLevel > 6) errors.push('Zorluk 1–6 arasında olmalı.');
  const copyrightStatus = str(r.copyrightStatus).toUpperCase(); if (!(COPYRIGHTS as readonly string[]).includes(copyrightStatus)) errors.push(`Telif durumu zorunlu: ${COPYRIGHTS.join(', ')}.`);
  return errors.length ? { errors } : { row: { sourceLabel, gradeLevel, outcomeCode, stem, options, correctAnswer, solution, difficultyLevel, copyrightStatus }, errors };
}

const optionKey = (options: { label: string; text: string }[]) => JSON.stringify(options.map((o) => normalizedStem(o.text)));
const bankOptions = (raw: string | null) => { try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.map((o: any, i: number) => ({ label: LABELS[i], text: String(typeof o === 'string' ? o : o?.text ?? '') })) : []; } catch { return []; } };

type Planned = { line: number; status: 'READY' | 'DUPLICATE' | 'INVALID'; errors: string[]; warnings: string[]; row?: Clean; outcome?: any; duplicateOf?: string };

async function plan(env: Env, rows: ImportRow[]): Promise<Planned[]> {
  const out: Planned[] = []; const seen = new Map<string, number>();
  for (const [i, raw] of rows.entries()) {
    const line = i + 1; const c = checkRow(raw ?? {});
    if (!c.row) { out.push({ line, status: 'INVALID', errors: c.errors, warnings: [] }); continue; }
    const r = c.row; const errors: string[] = []; const warnings: string[] = [];
    const found = await all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.topic,o.subject_id,o.grade_level FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
      WHERE o.code=? AND cv.academic_year=? AND cv.verified=1 AND o.official=1 AND o.active=1`).bind(r.outcomeCode, IMPORT_ACADEMIC_YEAR));
    const sameGrade = found.filter((o) => Number(o.grade_level) === r.gradeLevel);
    if (!found.length) errors.push(`${r.outcomeCode} doğrulanmış ${IMPORT_ACADEMIC_YEAR} resmî kazanımları arasında yok.`);
    else if (!sameGrade.length) errors.push(`${r.outcomeCode} ${[...new Set(found.map((o) => o.grade_level))].join('/')}. sınıf kazanımı; satırdaki sınıf ${r.gradeLevel}.`);
    else if (sameGrade.length > 1) errors.push(`${r.outcomeCode} birden fazla kazanıma karşılık geliyor; satır elle eşleştirilmeli.`);
    if (errors.length) { out.push({ line, status: 'INVALID', errors, warnings }); continue; }
    const outcome = sameGrade[0];
    const key = `${r.gradeLevel}|${outcome.subject_id}|${normalizedStem(r.stem)}|${optionKey(r.options)}`;
    if (seen.has(key)) { out.push({ line, status: 'INVALID', errors: [`Dosyada ${seen.get(key)}. satırla aynı soru.`], warnings }); continue; }
    seen.set(key, line);
    const candidates = await all<any>(env.DB.prepare(`SELECT q.id,q.stem_text,q.options_json FROM question_bank q WHERE q.grade_level=? AND q.subject_id=? AND q.question_type='MULTIPLE_CHOICE' AND q.review_status<>'ARCHIVED'
      AND (lower(trim(q.stem_text))=lower(trim(?)) OR EXISTS(SELECT 1 FROM question_learning_links l WHERE l.question_id=q.id AND l.node_id=?)) ORDER BY q.created_at DESC LIMIT 300`).bind(r.gradeLevel, outcome.subject_id, r.stem, `ln_${outcome.id}`));
    const exact = candidates.find((q) => normalizedStem(q.stem_text) === normalizedStem(r.stem) && optionKey(bankOptions(q.options_json)) === optionKey(r.options));
    if (exact) { out.push({ line, status: 'DUPLICATE', errors, warnings: ['Bu soru havuzda zaten var; tekrar eklenmeyecek.'], row: r, outcome, duplicateOf: exact.id }); continue; }
    const similar = candidates.filter((q) => stemSimilarity(q.stem_text, r.stem) >= SIMILAR_AT).slice(0, 3);
    if (similar.length) warnings.push(`Havuzda benzer soru var: ${similar.map((q) => q.id).join(', ')}. İncelemede kontrol edin.`);
    out.push({ line, status: 'READY', errors, warnings, row: r, outcome });
  }
  return out;
}

const view = (p: Planned) => ({ line: p.line, status: p.status, errors: p.errors, warnings: p.warnings, outcome: p.outcome ? { code: p.outcome.code, title: p.outcome.title, gradeLevel: p.outcome.grade_level } : null, duplicateOf: p.duplicateOf ?? null });
const summary = (ps: Planned[]) => ({ total: ps.length, ready: ps.filter((p) => p.status === 'READY').length, duplicates: ps.filter((p) => p.status === 'DUPLICATE').length, invalid: ps.filter((p) => p.status === 'INVALID').length, warnings: ps.filter((p) => p.warnings.length && p.status === 'READY').length });

export async function handleQuestionImport(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/admin\/question-import\/(preview|commit)$/);
  if (!m) return null;
  const { getAuthUser } = await import('./auth');
  const user: AuthUser | null = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.role !== 'SUPER_ADMIN' || user.must_change_password) return fail(403, 'FORBIDDEN', 'Toplu soru aktarımını yalnız Süper Admin yapar.');
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  if (request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  const body: any = await request.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows || !rows.length) return fail(400, 'ROWS_REQUIRED', 'Aktarılacak en az bir satır gerekli.');
  if (rows.length > IMPORT_MAX_ROWS) return fail(400, 'TOO_MANY_ROWS', `Bir seferde en çok ${IMPORT_MAX_ROWS} satır aktarılabilir.`);
  const fileName = str(body.fileName).slice(0, 200) || null;
  const planned = await plan(env, rows);
  if (m[1] === 'preview') return json({ ok: true, academicYear: IMPORT_ACADEMIC_YEAR, summary: summary(planned), rows: planned.map(view) });
  if (body.confirm !== true) return fail(400, 'CONFIRMATION_REQUIRED', 'Aktarımı onaylayın.');
  const ready = planned.filter((p) => p.status === 'READY');
  const importId = uuid('qimp'); const created: { line: number; id: string }[] = [];
  const stmts: D1PreparedStatement[] = [];
  for (const p of ready) {
    const r = p.row!, o = p.outcome, id = uuid('q');
    // the NOT EXISTS repeats the exact-copy check inside the write, so two simultaneous uploads cannot both add it
    stmts.push(env.DB.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,topic,question_type,difficulty_level,option_count,stem_text,options_json,correct_answer,solution_text,source_label,copyright_status,review_status,created_by,origin_kind)
      SELECT ?,'PLATFORM',?,?,?,?,'MULTIPLE_CHOICE',?,?,?,?,?,?,?,?,'REVIEW',?,'IMPORT'
      WHERE NOT EXISTS(SELECT 1 FROM question_bank q WHERE q.grade_level=? AND q.subject_id=? AND q.question_type='MULTIPLE_CHOICE' AND lower(trim(q.stem_text))=lower(trim(?)) AND q.options_json=?)`)
      .bind(id, IMPORT_ACADEMIC_YEAR, r.gradeLevel, o.subject_id, o.topic || null, r.difficultyLevel, r.options.length, r.stem, JSON.stringify(r.options), r.correctAnswer, r.solution, r.sourceLabel, r.copyrightStatus, user.id,
        r.gradeLevel, o.subject_id, r.stem, JSON.stringify(r.options)));
    stmts.push(env.DB.prepare(`INSERT INTO question_learning_links(question_id,node_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM question_bank WHERE id=?)`).bind(id, `ln_${o.id}`, id));
    created.push({ line: p.line, id });
  }
  if (stmts.length) await env.DB.batch(stmts);
  const ids = created.length ? (await all<any>(env.DB.prepare(`SELECT id FROM question_bank WHERE id IN (${created.map(() => '?').join(',')})`).bind(...created.map((c) => c.id)))).map((r) => r.id) : [];
  const added = created.filter((c) => ids.includes(c.id));
  await audit(env.DB, user.id, null, 'QUESTION_IMPORT_COMMITTED', 'question_import', importId, { fileName, total: planned.length, added: added.length, duplicates: planned.filter((p) => p.status === 'DUPLICATE').length + (created.length - added.length), invalid: planned.filter((p) => p.status === 'INVALID').length, sources: [...new Set(ready.map((p) => p.row!.sourceLabel))].slice(0, 20) });
  return json({ ok: true, importId, academicYear: IMPORT_ACADEMIC_YEAR, summary: { ...summary(planned), added: added.length, skippedAsCopy: created.length - added.length }, added, rows: planned.map(view) });
}
