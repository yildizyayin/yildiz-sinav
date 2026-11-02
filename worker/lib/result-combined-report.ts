import type { Env } from '../types';
import { all, json, one, uuid } from './db';
import { RESULT_NETWORK_SNAPSHOT_SQL, RESULT_NETWORK_SUMMARY_SQL, readNetworkSnapshot, snapshotSummary } from './result-network-snapshot';
import { examOutcomePayloadSql } from './exam-outcome-history';

/**
 * Birleşik karne (docs/design/student-results-v2/combined-report-cloud.md, owner go-ahead 2 Nov).
 * Built only from the signed-in result identity's own published, currently accessible, frozen snapshots; nothing the
 * page sends about who the student is is trusted. One report = one academic year + one exam family. Scores are
 * averaged only when every used exam shares one scoring profile; no new rank of any kind is produced; outcomes are
 * pooled by verified outcome id from each exam's published analysis; unknown counts stay unknown.
 */
export const COMBINED_MAX_EXAMS = 20;
const SUMMARY_PAGE = 50, SUMMARY_MAX = 500, HOURLY_LIMIT = 30;
const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const round2 = (v: number) => Math.round(v * 100) / 100;

export function familyOf(examType: unknown, grade: unknown): string {
  const t = String(examType || '').toUpperCase();
  if (['LGS', 'TYT', 'AYT', 'YDT', 'TYT_AYT'].includes(t)) return t;
  return `OKUL_${Number(grade) || 0}`;
}
export function familyLabel(f: string) { return f.startsWith('OKUL_') ? `Okul içi ${f.slice(5)}. sınıf` : f === 'TYT_AYT' ? 'TYT + AYT' : f; }

type Identity = { id: string; meb_code: string; normalized_name: string; grade_level: number; student_number_lookup_token: string | null; tckn_lookup_token: string | null };
const params = (i: Identity) => [i.meb_code, i.normalized_name, i.grade_level, i.student_number_lookup_token || '', i.student_number_lookup_token || '', i.tckn_lookup_token || '', i.tckn_lookup_token || ''];

/** Every accessible summary of the identity, page by page (the list screen stops at 50). */
async function accessibleExams(env: Env, identity: Identity) {
  const rows: any[] = [];
  for (let offset = 0; offset < SUMMARY_MAX; offset += SUMMARY_PAGE) {
    const page = await all<any>(env.DB.prepare(RESULT_NETWORK_SUMMARY_SQL + ` ORDER BY ea.published_at DESC,ea.id LIMIT ${SUMMARY_PAGE} OFFSET ${offset}`).bind(...params(identity)));
    rows.push(...page);
    if (page.length < SUMMARY_PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** The choices the student can make: academic years and families present in their own published results. */
export async function combinedOptions(env: Env, identity: Identity) {
  const { rows, truncated } = await accessibleExams(env, identity);
  const ids = [...new Set(rows.map((r) => r.exam_id))];
  const meta = ids.length ? await all<any>(env.DB.prepare(`SELECT id,exam_type,grade_level FROM exams WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids)) : [];
  const exams = rows.map(snapshotSummary).filter(Boolean).map((s: any) => { const m = meta.find((x) => x.id === s.exam_id); const family = familyOf(m?.exam_type ?? s.exam_type, m?.grade_level ?? identity.grade_level); return { examId: s.exam_id, title: s.title, examDate: s.exam_date || null, academicYear: s.academic_year, family, familyLabel: familyLabel(family) }; });
  return json({ ok: true, maxExams: COMBINED_MAX_EXAMS, truncated, exams });
}

export async function combinedReport(request: Request, env: Env, identity: Identity) {
  const body: any = await request.json().catch(() => ({}));
  const mode = ['LAST5', 'ALL', 'CUSTOM'].includes(String(body.mode)) ? String(body.mode) : null;
  const academicYear = String(body.academicYear || ''), family = String(body.family || '');
  if (!mode || !/^\d{4}-\d{4}$/.test(academicYear) || !family) return fail(400, 'COMBINED_SELECTION_INVALID', 'Eğitim yılı, sınav türü ve seçim biçimini seçin.');
  const recent = await one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM result_combined_report_requests WHERE identity_id=? AND created_at>datetime('now','-1 hour')`).bind(identity.id));
  if (Number(recent?.c || 0) >= HOURLY_LIMIT) return fail(429, 'COMBINED_RATE_LIMITED', 'Bir saatte en fazla 30 birleşik karne oluşturulabilir. Biraz sonra tekrar deneyin.');
  await env.DB.prepare(`INSERT INTO result_combined_report_requests(id,identity_id) VALUES(?,?)`).bind(uuid('rcr'), identity.id).run();

  const { rows, truncated } = await accessibleExams(env, identity);
  const ids = [...new Set(rows.map((r) => r.exam_id))];
  const meta = ids.length ? await all<any>(env.DB.prepare(`SELECT id,exam_type,grade_level,scoring_rule_version_id FROM exams WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids)) : [];
  const skipped: Array<{ examId: string; title?: string; reason: string }> = [];
  const pool = rows.map((r) => ({ row: r, summary: snapshotSummary(r), meta: meta.find((m) => m.id === r.exam_id) }))
    .filter((x) => { if (!x.summary) { skipped.push({ examId: x.row.exam_id, reason: 'Sabit sonuç kaydı yok.' }); return false; } return true; })
    .filter((x) => x.summary.academic_year === academicYear && familyOf(x.meta?.exam_type ?? x.summary.exam_type, x.meta?.grade_level ?? identity.grade_level) === family)
    .sort((a, b) => String(b.summary.exam_date || '').localeCompare(String(a.summary.exam_date || '')) || String(b.row.exam_id).localeCompare(String(a.row.exam_id)));
  let chosen = pool;
  if (mode === 'LAST5') chosen = pool.slice(0, 5);
  if (mode === 'CUSTOM') {
    const wanted: string[] = [...new Set<string>((Array.isArray(body.examIds) ? body.examIds : []).map((x: unknown) => String(x)))];
    if (!wanted.length) return fail(400, 'COMBINED_EMPTY_SELECTION', 'En az bir sınav seçin.');
    for (const id of wanted) if (!pool.some((x) => x.row.exam_id === id)) skipped.push({ examId: id, reason: 'Bu sınav seçilen yıl/türde değil ya da size açık değil.' });
    chosen = pool.filter((x) => wanted.includes(x.row.exam_id));
  }
  const limited = chosen.length > COMBINED_MAX_EXAMS;
  chosen = chosen.slice(0, COMBINED_MAX_EXAMS);
  if (!chosen.length) return fail(404, 'COMBINED_NO_EXAMS', 'Bu seçimde yayımlanmış sonucunuz yok.');

  // Each chosen exam is read again through the same live access predicates (snapshot + published analysis).
  const detailSql = RESULT_NETWORK_SNAPSHOT_SQL.replace('SELECT s.*,ea.exam_id', `SELECT s.snapshot_version,${examOutcomePayloadSql('s', 'RESULT')} payload_json,ea.exam_id`) + ' AND ea.exam_id=? LIMIT 1';
  const used: Array<{ examId: string; summary: any; payload: any; snapshotVersion: number; profile: string | null }> = [];
  for (const x of chosen) {
    const peer = await one<any>(env.DB.prepare(detailSql).bind(...params(identity), x.row.exam_id));
    const payload = peer ? readNetworkSnapshot(peer.payload_json) : null;
    if (!payload) { skipped.push({ examId: x.row.exam_id, title: x.summary.title, reason: 'Yayın değişti ya da sabit kayıt okunamadı.' }); continue; }
    used.push({ examId: x.row.exam_id, summary: x.summary, payload, snapshotVersion: Number(peer.snapshot_version), profile: x.meta?.scoring_rule_version_id || null });
  }
  if (!used.length) return fail(409, 'COMBINED_SOURCES_UNAVAILABLE', 'Seçilen sınavların sabit kayıtları şu an okunamıyor.');
  used.sort((a, b) => String(a.summary.exam_date || '').localeCompare(String(b.summary.exam_date || '')) || a.examId.localeCompare(b.examId));

  // Subjects: main test rows only (sub-subject rows live in payload.branches). Averages say from how many exams.
  const subjects = new Map<string, any>();
  for (const u of used) for (const s of (u.payload.subjects || [])) {
    const key = String(s.subject_code || s.subject_id || s.subject_name);
    const e = subjects.get(key) || { code: s.subject_code || null, name: s.subject_name || s.subject || key, exams: 0, correct: 0, wrong: 0, blank: 0, net: 0, questionCounts: new Set<number>(), incomplete: false };
    const c = num(s.correct_count), w = num(s.wrong_count), b = num(s.blank_count), n = num(s.net);
    if (c == null || w == null || b == null || n == null) { e.incomplete = true; subjects.set(key, e); continue; }
    e.exams++; e.correct += c; e.wrong += w; e.blank += b; e.net += n; e.questionCounts.add(c + w + b); subjects.set(key, e);
  }
  const subjectRows = [...subjects.values()].map((e) => ({ code: e.code, name: e.name, exams: e.exams, avgCorrect: e.exams ? round2(e.correct / e.exams) : null, avgWrong: e.exams ? round2(e.wrong / e.exams) : null, avgBlank: e.exams ? round2(e.blank / e.exams) : null, avgNet: e.exams ? round2(e.net / e.exams) : null, questionCounts: [...e.questionCounts].sort((a: number, b: number) => a - b), questionCountsDiffer: e.questionCounts.size > 1, avgSuccessPercent: null as number | null, incomplete: e.incomplete }));
  // A normalised indicator only where question counts are known: success % = net / questions, labelled as such.
  for (const r of subjectRows) {
    const e = subjects.get(String(r.code || r.name))!;
    const qs = e ? [...e.questionCounts] as number[] : [];
    if (e && e.exams && qs.every((q) => q > 0)) r.avgSuccessPercent = round2(100 * used.reduce((acc, u) => { const s = (u.payload.subjects || []).find((x: any) => String(x.subject_code || x.subject_id || x.subject_name) === String(r.code || r.name)); const q = s ? (num(s.correct_count) ?? 0) + (num(s.wrong_count) ?? 0) + (num(s.blank_count) ?? 0) : 0; return acc + (s && q > 0 && num(s.net) != null ? Number(s.net) / q : 0); }, 0) / e.exams);
  }

  // Trend: each exam's own published total; success % only where its question count is known.
  const trend = used.map((u) => { const e = u.payload.exam || {}; const q = (num(e.correct_count) ?? NaN) + (num(e.wrong_count) ?? NaN) + (num(e.blank_count) ?? NaN); return { examId: u.examId, title: u.summary.title, examDate: u.summary.exam_date || null, net: num(e.net), score: num(e.score), questions: Number.isFinite(q) ? q : null, successPercent: Number.isFinite(q) && q > 0 && num(e.net) != null ? round2(100 * Number(e.net) / q) : null }; });
  const profiles = new Set(used.map((u) => u.profile));
  const scores = trend.map((t) => t.score);
  const scoreAverage = profiles.size === 1 && !profiles.has(null) && scores.every((s) => s != null) ? round2((scores as number[]).reduce((a, b) => a + b, 0) / scores.length) : null;
  const scoreNote = scoreAverage != null ? null : profiles.size > 1 ? 'Sınavlar farklı puanlama profilleriyle değerlendirildi; puanlar ortalanmadı.' : 'Bazı sınavlarda puan hesaplanmadı; puan ortalaması verilmedi.';

  // Outcomes: verified curriculum only; pooled by outcome id; wrong/blank only when every contributing record has them.
  const outcomeIds = [...new Set(used.flatMap((u) => (u.payload.outcomes || []).map((o: any) => o.outcome_id)).filter((x: any) => typeof x === 'string'))] as string[];
  const verified = new Set<string>();
  for (let i = 0; i < outcomeIds.length; i += 90) {
    const part = outcomeIds.slice(i, i + 90);
    for (const r of await all<any>(env.DB.prepare(`SELECT o.id,o.curriculum_version_id FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE cv.verified=1 AND o.id IN (${part.map(() => '?').join(',')})`).bind(...part))) verified.add(r.id);
  }
  const outcomes = new Map<string, any>();
  const outcomeSources: string[] = [];
  for (const u of used) {
    const list = (u.payload.outcomes || []).filter((o: any) => verified.has(o.outcome_id));
    if (list.length) outcomeSources.push(u.examId);
    for (const o of list) {
      const e = outcomes.get(o.outcome_id) || { outcomeId: o.outcome_id, code: o.code || null, title: o.title, subjectName: o.subject_name || null, exams: 0, evidence: 0, correct: 0, wrong: 0, blank: 0, wrongBlankKnown: true };
      const ev = num(o.evidence_count), c = num(o.correct_count);
      if (ev == null || c == null) continue;
      e.exams++; e.evidence += ev; e.correct += c;
      if (num(o.wrong_count) == null || num(o.blank_count) == null) e.wrongBlankKnown = false; else { e.wrong += Number(o.wrong_count); e.blank += Number(o.blank_count); }
      outcomes.set(o.outcome_id, e);
    }
  }
  const outcomeRows = [...outcomes.values()].map((e) => ({ outcomeId: e.outcomeId, code: e.code, title: e.title, subjectName: e.subjectName, exams: e.exams, evidence: e.evidence, correct: e.correct, wrong: e.wrongBlankKnown ? e.wrong : null, blank: e.wrongBlankKnown ? e.blank : null, successPercent: e.evidence > 0 ? round2(100 * e.correct / e.evidence) : null }))
    .sort((a, b) => (a.successPercent ?? 101) - (b.successPercent ?? 101) || b.evidence - a.evidence);

  const warnings: string[] = [];
  if (truncated) warnings.push(`Sonuç listeniz çok uzun; en yeni ${SUMMARY_MAX} yayın tarandı.`);
  if (limited) warnings.push(`Bir karnede en fazla ${COMBINED_MAX_EXAMS} sınav birleştirilir; en yeni ${COMBINED_MAX_EXAMS} sınav kullanıldı.`);
  if (subjectRows.some((r) => r.questionCountsDiffer)) warnings.push('Bazı derslerde sınavların soru sayıları farklı; ham net ortalaması yerine başarı yüzdesine bakın.');
  if (subjectRows.some((r) => r.incomplete)) warnings.push('Bazı sınavlarda ders ayrıntısı eksik; o dersler eksik kayıtlar olmadan hesaplandı.');
  if (outcomeSources.length < used.length) warnings.push(`${used.length - outcomeSources.length} sınavda doğrulanmış kazanım verisi yok; kazanım özeti yalnız ${outcomeSources.length} sınava dayanır.`);
  if (scoreNote) warnings.push(scoreNote);

  return json({
    ok: true,
    selection: { mode, academicYear, family, familyLabel: familyLabel(family), requested: mode === 'CUSTOM' ? (body.examIds || []).length : null },
    range: { from: used[0].summary.exam_date || null, to: used[used.length - 1].summary.exam_date || null },
    sources: used.map((u) => ({ examId: u.examId, title: u.summary.title, examDate: u.summary.exam_date || null, snapshotVersion: u.snapshotVersion, outcomeAnalysisRevision: u.payload.outcomeAnalysisRevision || null, usedForOutcomes: outcomeSources.includes(u.examId) })),
    skipped,
    totals: { exams: used.length, scoreAverage, netAverage: trend.every((t) => t.net != null) ? round2(trend.reduce((a, t) => a + Number(t.net), 0) / trend.length) : null },
    subjects: subjectRows,
    trend,
    outcomes: outcomeRows,
    outcomeSourceCount: outcomeSources.length,
    warnings,
    policy: 'Yalnız yayımlanmış sabit sonuçlar; yeni sıralama üretilmez; farklı puanlama profilleri ortalanmaz.',
  });
}
