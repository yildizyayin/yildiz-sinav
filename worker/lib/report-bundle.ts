import type { Env } from '../types';
import { all, one } from './db';

/**
 * S034 report family (owner samples 27 Oct: bayi kurum ortalamaları, okul/şube net listesi, kurum/şube karnesi,
 * sınıf raporu, AYT sonuç belgesi). Everything comes from saved results; nothing is evaluated again.
 *
 * - Columns: each test, or the sub-tests the answer key named (DERS column: Tarih-1, Coğrafya-1 …).
 * - Averages at general / il / ilçe / okul / şube level, ranks of students, schools and şubeler.
 * - Score types: TYT and LGS from the saved score; AYT either "TYT ile birleşik" (SAY/SÖZ/EA estimate with the student's
 *   own TYT, else the school's TYT average — always labelled) or "Yalnız AYT" (field nets, no score).
 * - Item analysis, topic success per school and şube, per-student answers for the report cards.
 * Capacity note: a whole exam's per-student rows are read once per request (fine for current volumes; precomputing them
 * at evaluation is the follow-up for 150k participants).
 */
export type Family = 'TYT' | 'AYT' | 'LGS' | 'OTHER';
export type AytMode = 'COMBINED' | 'AYT_ONLY';
type DYB = { d: number; y: number; b: number; n: number };
type Avg = { d: number; y: number; n: number };

const r2 = (x: number) => Math.round(x * 100) / 100;
export const up = (s: unknown) => String(s ?? '').toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/Â/g, 'A').replace(/\s+/g, ' ').trim();
export const normName = (s: unknown) => up(s).replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

export function familyOf(examType: unknown, gradeLevel: unknown, codes: string[]): Family {
  const t = up(examType);
  if (t.startsWith('AYT')) return 'AYT';
  if (t.startsWith('TYT')) return 'TYT';
  if (t.startsWith('LGS') || Number(gradeLevel) === 8) return 'LGS';
  if (codes.some((c) => up(c).startsWith('AYT_')) && !codes.some((c) => up(c).startsWith('TYT_'))) return 'AYT';
  if (codes.length && codes.every((c) => up(c).startsWith('TYT_'))) return 'TYT';
  return 'OTHER';
}

/** ÖSYM test a subject or sub-test belongs to (weights are published per test). */
export function componentFor(family: Family, text: string): string | null {
  const t = up(text);
  const code = t.match(/^(TYT|AYT)_([A-Z0-9]+)$/);
  if (code) return `${code[1]}_${code[2]}`;
  if (family === 'TYT') {
    if (/TURKCE|(^|[^A-Z])TUR($|[^A-Z])/.test(t)) return 'TYT_TUR';
    if (/SOSYAL|(^|[^A-Z])SOS($|[^A-Z])/.test(t)) return 'TYT_SOS';
    if (/MATEMATIK|GEOMETRI|(^|[^A-Z])MAT($|[^A-Z])/.test(t)) return 'TYT_MAT';
    if (/FEN|FIZIK|KIMYA|BIYOLOJI/.test(t)) return 'TYT_FEN';
    return null;
  }
  if (family === 'AYT') {
    if (/TARIH/.test(t)) return /TARIH\W*(2|II)\b/.test(t) ? 'AYT_TAR2' : 'AYT_TAR1';
    if (/COGRAFYA/.test(t)) return /COGRAFYA\W*(2|II)\b/.test(t) ? 'AYT_COG2' : 'AYT_COG1';
    if (/EDEBIYAT|TURK DILI/.test(t)) return 'AYT_TDE';
    if (/FELSEFE|PSIKOLOJI|SOSYOLOJI|MANTIK/.test(t)) return 'AYT_FEL';
    if (/(^|[^A-Z])DIN/.test(t)) return 'AYT_DIN';
    if (/MATEMATIK|GEOMETRI/.test(t)) return 'AYT_MAT';
    if (/FIZIK/.test(t)) return 'AYT_FIZ';
    if (/KIMYA/.test(t)) return 'AYT_KIM';
    if (/BIYOLOJI/.test(t)) return 'AYT_BIY';
  }
  return null;
}

/** Field nets for "Yalnız AYT" (no score): the tests each field's ÖSYM score is built on. */
export const FIELD_NETS: Record<string, string[]> = {
  SAY: ['AYT_MAT', 'AYT_FIZ', 'AYT_KIM', 'AYT_BIY'],
  SOZ: ['AYT_TDE', 'AYT_TAR1', 'AYT_COG1', 'AYT_TAR2', 'AYT_COG2', 'AYT_FEL', 'AYT_DIN'],
  EA: ['AYT_MAT', 'AYT_TDE', 'AYT_TAR1', 'AYT_COG1'],
};
export const FIELD_LABEL: Record<string, string> = { SAY: 'Sayısal', SOZ: 'Sözel', EA: 'Eşit Ağırlık', TYT: 'TYT', LGS: 'LGS', PUAN: 'Puan', NET: 'Net' };

/** A024 estimate (the same formula as scoring.ts): 100 + 400 × Σ (weight share × net / question count). */
export function weightedEstimate(weights: Record<string, number>, comps: Record<string, { net: number; q: number } | undefined>): number | null {
  const entries = Object.entries(weights || {}).filter(([, w]) => Number(w) > 0);
  if (!entries.length) return null;
  const total = entries.reduce((s, [, w]) => s + Number(w), 0);
  let sum = 0;
  for (const [k, w] of entries) { const c = comps[k]; if (!c || !(c.q > 0)) return null; sum += (Number(w) / total) * Math.max(0, c.net) / c.q; }
  return r2(100 + 400 * sum);
}

type RankKeys = { class: number; school: number; district: number; city: number; general: number };
function rankWithin<T>(rows: T[], group: (r: T) => string, value: (r: T) => number | null, tie: (r: T) => number, set: (r: T, rank: number, count: number) => void) {
  const groups = new Map<string, T[]>();
  for (const r of rows) { if (value(r) == null) continue; const g = group(r); const list = groups.get(g) || []; list.push(r); groups.set(g, list); }
  for (const list of groups.values()) {
    list.sort((a, b) => (value(b)! - value(a)!) || (tie(b) - tie(a)));
    let rank = 0, prev: [number, number] | null = null;
    list.forEach((r, i) => { const k: [number, number] = [value(r)!, tie(r)]; if (!prev || prev[0] !== k[0] || prev[1] !== k[1]) rank = i + 1; prev = k; set(r, rank, list.length); });
  }
}

export interface RawBundle {
  exam: any; subjects: Array<{ id: string; name: string; code: string; questionCount: number; wrongDivisor: number }>;
  questions: Array<{ id: string; subjectId: string; no: number; status: string; section: string | null; topic: string }>;
  keys: Array<{ questionId: string; booklet: string; answer: string; printed: number }>;
  participants: Array<{ id: string; inst: string; iname: string; city: string; district: string; name: string; no: string | null; cls: string; booklet: string | null; d: number; y: number; b: number; n: number; score: number | null }>;
  subjectRows: Array<{ p: string; s: string; d: number; y: number; b: number; n: number }>;
  sectionRows: Array<{ p: string; k: string; d: number; y: number }>;
  selected: string[];
  answers: Array<{ p: string; q: string; answer: string | null; status: string }>;
  items: Array<{ inst: string | null; cls: string | null; q: string; answer: string | null; status: string; c: number }>;
  weights: Record<string, Record<string, number>>;
  aytMode: AytMode;
  pair?: { exam: any; participants: Array<{ inst: string; name: string; no: string | null; comps: Record<string, { net: number; q: number }> }> } | null;
  provisional: boolean;
}

/** Pure part: everything the reports need, computed from raw rows (unit-tested without a database). */
export function buildBundle(raw: RawBundle) {
  const family = familyOf(raw.exam.exam_type, raw.exam.grade_level, raw.subjects.map((s) => s.code));
  const subjectById = new Map(raw.subjects.map((s) => [s.id, s]));
  // Columns: sub-tests where the key named them, else the test itself.
  const sectionsBySubject = new Map<string, string[]>();
  for (const q of raw.questions) if (q.section) { const l = sectionsBySubject.get(q.subjectId) || []; if (!l.includes(q.section)) l.push(q.section); sectionsBySubject.set(q.subjectId, l); }
  const activeCount = (pred: (q: RawBundle['questions'][number]) => boolean) => raw.questions.filter((q) => q.status === 'ACTIVE' && pred(q)).length;
  const columns: Array<{ key: string; subjectId: string; section: string | null; name: string; group: string; q: number; component: string | null }> = [];
  for (const s of raw.subjects) {
    const secs = sectionsBySubject.get(s.id);
    const own = componentFor(family, s.code) || componentFor(family, s.name);
    // TYT/LGS sub-tests stay in their test's score component; AYT composite tests (Edebiyat-Sosyal-1 …) split by sub-test
    if (secs?.length) for (const sec of secs) columns.push({ key: `${s.id}|${sec}`, subjectId: s.id, section: sec, name: sec, group: s.name, q: activeCount((q) => q.subjectId === s.id && q.section === sec), component: family === 'AYT' ? (componentFor(family, sec) || own) : own });
    else columns.push({ key: s.id, subjectId: s.id, section: null, name: s.name, group: s.name, q: s.questionCount, component: own });
  }
  const tests = raw.subjects.map((s) => ({ id: s.id, name: s.name, code: s.code, questionCount: s.questionCount, wrongDivisor: s.wrongDivisor }));
  const netOf = (d: number, y: number, div: number) => r2(d - (div > 0 ? y / div : 0));

  // Per-student values.
  const subj = new Map<string, Record<string, DYB>>();
  for (const r of raw.subjectRows) { const m = subj.get(r.p) || {}; m[r.s] = { d: Number(r.d), y: Number(r.y), b: Number(r.b), n: r2(Number(r.n)) }; subj.set(r.p, m); }
  const secs = new Map<string, Record<string, { d: number; y: number }>>();
  for (const r of raw.sectionRows) { const m = secs.get(r.p) || {}; m[r.k] = { d: Number(r.d), y: Number(r.y) }; secs.set(r.p, m); }
  const students = raw.participants.map((p) => {
    const t = subj.get(p.id) || {};
    const cols: Record<string, DYB> = {};
    for (const c of columns) {
      if (!c.section) { if (t[c.subjectId]) cols[c.key] = t[c.subjectId]; continue; }
      const v = secs.get(p.id)?.[c.key] || { d: 0, y: 0 };
      cols[c.key] = { d: v.d, y: v.y, b: Math.max(0, c.q - v.d - v.y), n: netOf(v.d, v.y, subjectById.get(c.subjectId)?.wrongDivisor || 0) };
    }
    const comps: Record<string, { net: number; q: number }> = {};
    for (const c of columns) if (c.component && cols[c.key]) { const x = comps[c.component] || { net: 0, q: 0 }; x.net += cols[c.key].n; x.q += c.q; comps[c.component] = x; }
    return { ...p, cls: p.cls || '', tests: t, cols, comps, total: { d: Number(p.d), y: Number(p.y), b: Number(p.b), n: r2(Number(p.n)) }, scores: {} as Record<string, number | null>, ranks: {} as Record<string, RankKeys>, counts: {} as Record<string, RankKeys>, tytSource: null as null | 'STUDENT' | 'SCHOOL' | 'NONE' };
  });

  // Score types.
  let scoreTypes: Array<{ key: string; label: string; isScore: boolean; note?: string }> = [];
  const hasScore = students.some((s) => s.score != null);
  if (family === 'AYT') {
    if (raw.aytMode === 'COMBINED') {
      const byNo = new Map<string, Record<string, { net: number; q: number }>>(), byName = new Map<string, Record<string, { net: number; q: number }>>();
      const schoolSum = new Map<string, { n: number; comps: Record<string, { net: number; q: number }> }>();
      for (const t of raw.pair?.participants || []) {
        if (t.no) byNo.set(`${t.inst}|${String(t.no).trim()}`, t.comps);
        byName.set(`${t.inst}|${normName(t.name)}`, t.comps);
        const s = schoolSum.get(t.inst) || { n: 0, comps: {} }; s.n++;
        for (const [k, v] of Object.entries(t.comps)) { const x = s.comps[k] || { net: 0, q: v.q }; x.net += v.net; s.comps[k] = x; }
        schoolSum.set(t.inst, s);
      }
      for (const st of students) {
        let tyt = (st.no && byNo.get(`${st.inst}|${String(st.no).trim()}`)) || byName.get(`${st.inst}|${normName(st.name)}`) || null;
        st.tytSource = tyt ? 'STUDENT' : 'NONE';
        if (!tyt) { const s = schoolSum.get(st.inst); if (s?.n) { tyt = Object.fromEntries(Object.entries(s.comps).map(([k, v]) => [k, { net: v.net / s.n, q: v.q }])); st.tytSource = 'SCHOOL'; } }
        for (const f of ['SAY', 'SOZ', 'EA']) st.scores[f] = tyt ? weightedEstimate(raw.weights[f] || {}, { ...tyt, ...st.comps }) : null;
      }
      scoreTypes = ['SAY', 'SOZ', 'EA'].map((k) => ({ key: k, label: FIELD_LABEL[k], isScore: true }));
    } else {
      for (const st of students) for (const f of ['SAY', 'SOZ', 'EA']) { const parts = FIELD_NETS[f].filter((k) => st.comps[k]); st.scores[f] = parts.length ? r2(parts.reduce((s, k) => s + st.comps[k].net, 0)) : null; }
      scoreTypes = ['SAY', 'SOZ', 'EA'].map((k) => ({ key: k, label: `${FIELD_LABEL[k]} net`, isScore: false }));
    }
    scoreTypes = scoreTypes.filter((t) => students.some((s) => s.scores[t.key] != null));
  } else if (family === 'TYT') {
    for (const st of students) st.scores.TYT = st.score ?? weightedEstimate(raw.weights.TYT || {}, st.comps);
    scoreTypes = [{ key: 'TYT', label: 'TYT', isScore: students.some((s) => s.scores.TYT != null) }];
    if (!scoreTypes[0].isScore) { for (const st of students) st.scores.TYT = st.total.n; scoreTypes[0].label = 'TYT net'; }
  } else if (family === 'LGS') {
    for (const st of students) st.scores.LGS = st.score ?? st.total.n;
    scoreTypes = [{ key: 'LGS', label: hasScore ? 'LGS' : 'LGS net', isScore: hasScore }];
  } else {
    for (const st of students) st.scores.PUAN = st.score ?? st.total.n;
    scoreTypes = [{ key: 'PUAN', label: hasScore ? 'Puan' : 'Net', isScore: hasScore }];
  }
  if (!scoreTypes.length) { for (const st of students) st.scores.NET = st.total.n; scoreTypes = [{ key: 'NET', label: 'Net', isScore: false }]; }
  const primary = scoreTypes[0].key;

  // Student ranks per score type.
  for (const t of scoreTypes) {
    const v = (s: typeof students[number]) => s.scores[t.key] ?? null, tie = (s: typeof students[number]) => s.total.d;
    const ensure = (s: typeof students[number]) => { s.ranks[t.key] ||= { class: 0, school: 0, district: 0, city: 0, general: 0 }; s.counts[t.key] ||= { class: 0, school: 0, district: 0, city: 0, general: 0 }; };
    const put = (lvl: keyof RankKeys) => (s: typeof students[number], r: number, c: number) => { ensure(s); s.ranks[t.key][lvl] = r; s.counts[t.key][lvl] = c; };
    rankWithin(students, () => '', v, tie, put('general'));
    rankWithin(students, (s) => s.city, v, tie, put('city'));
    rankWithin(students, (s) => `${s.city}|${s.district}`, v, tie, put('district'));
    rankWithin(students, (s) => s.inst, v, tie, put('school'));
    rankWithin(students, (s) => `${s.inst}|${s.cls}`, v, tie, put('class'));
  }

  // Averages.
  const average = (list: typeof students) => {
    const n = list.length || 1;
    const cols: Record<string, Avg> = {}, testsAvg: Record<string, Avg> = {}, scores: Record<string, number | null> = {};
    for (const c of columns) { let d = 0, y = 0, nn = 0, k = 0; for (const s of list) { const v = s.cols[c.key]; if (!v) continue; d += v.d; y += v.y; nn += v.n; k++; } cols[c.key] = k ? { d: r2(d / k), y: r2(y / k), n: r2(nn / k) } : { d: 0, y: 0, n: 0 }; }
    for (const t of tests) { let d = 0, y = 0, nn = 0, k = 0; for (const s of list) { const v = s.tests[t.id]; if (!v) continue; d += v.d; y += v.y; nn += v.n; k++; } testsAvg[t.id] = k ? { d: r2(d / k), y: r2(y / k), n: r2(nn / k) } : { d: 0, y: 0, n: 0 }; }
    for (const t of scoreTypes) { const v = list.map((s) => s.scores[t.key]).filter((x): x is number => x != null); scores[t.key] = v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null; }
    return { count: list.length, cols, tests: testsAvg, total: { d: r2(list.reduce((a, s) => a + s.total.d, 0) / n), y: r2(list.reduce((a, s) => a + s.total.y, 0) / n), n: r2(list.reduce((a, s) => a + s.total.n, 0) / n) }, scores };
  };
  const groupBy = (f: (s: typeof students[number]) => string) => { const m = new Map<string, typeof students>(); for (const s of students) { const k = f(s); const l = m.get(k) || []; l.push(s); m.set(k, l); } return m; };
  const byCity = groupBy((s) => s.city), byDistrict = groupBy((s) => `${s.city}|${s.district}`), byInst = groupBy((s) => s.inst), byClass = groupBy((s) => `${s.inst}|${s.cls}`);
  const general = average(students);

  // School and şube standings on the primary score (and each test's net for schools).
  const instRows = [...byInst.entries()].map(([id, list]) => ({ id, name: list[0].iname, city: list[0].city, district: list[0].district, avg: average(list), classes: new Set(list.map((s) => s.cls)).size }));
  const instRank: Record<string, { district: [number, number]; city: [number, number]; general: [number, number]; tests: Record<string, { district: number; city: number; general: number }> }> = {};
  for (const r of instRows) instRank[r.id] = { district: [0, 0], city: [0, 0], general: [0, 0], tests: {} };
  const rankInst = (lvl: 'district' | 'city' | 'general', g: (r: typeof instRows[number]) => string) => rankWithin(instRows, g, (r) => r.avg.scores[primary] ?? r.avg.total.n, (r) => r.avg.total.n, (r, rank, c) => { instRank[r.id][lvl] = [rank, c]; });
  rankInst('general', () => ''); rankInst('city', (r) => r.city); rankInst('district', (r) => `${r.city}|${r.district}`);
  for (const c of columns) for (const [lvl, g] of [['general', () => ''], ['city', (r: any) => r.city], ['district', (r: any) => `${r.city}|${r.district}`]] as const)
    rankWithin(instRows, g as any, (r) => r.avg.cols[c.key]?.n ?? null, () => 0, (r, rank) => { (instRank[r.id].tests[c.key] ||= { district: 0, city: 0, general: 0 })[lvl] = rank; });
  const classRows = [...byClass.entries()].map(([k, list]) => ({ k, inst: list[0].inst, city: list[0].city, district: list[0].district, cls: list[0].cls, v: average(list).scores[primary] ?? average(list).total.n }));
  const classRank: Record<string, { general: [number, number]; city: [number, number]; district: [number, number]; school: [number, number] }> = {};
  for (const r of classRows) classRank[r.k] = { general: [0, 0], city: [0, 0], district: [0, 0], school: [0, 0] };
  rankWithin(classRows, () => '', (r) => r.v, () => 0, (r, k, c) => { classRank[r.k].general = [k, c]; });
  rankWithin(classRows, (r) => r.city, (r) => r.v, () => 0, (r, k, c) => { classRank[r.k].city = [k, c]; });
  rankWithin(classRows, (r) => `${r.city}|${r.district}`, (r) => r.v, () => 0, (r, k, c) => { classRank[r.k].district = [k, c]; });
  rankWithin(classRows, (r) => r.inst, (r) => r.v, () => 0, (r, k, c) => { classRank[r.k].school = [k, c]; });
  const countsOf = (list: typeof students) => ({ students: list.length, classes: new Set(list.map((s) => `${s.inst}|${s.cls}`)).size, schools: new Set(list.map((s) => s.inst)).size, districts: new Set(list.map((s) => `${s.city}|${s.district}`)).size, cities: new Set(list.map((s) => s.city)).size });

  // Topics and items from per-question counts.
  const qById = new Map(raw.questions.map((q) => [q.id, q]));
  const keyA = new Map<string, { answer: string; printed: number }>();
  const firstBooklet = raw.keys.find((k) => k.booklet === 'A')?.booklet ?? raw.keys[0]?.booklet;
  for (const k of raw.keys) if (k.booklet === firstBooklet) keyA.set(k.questionId, { answer: k.answer, printed: k.printed });
  type Tally = { n: number; d: number; y: number; dist: Record<string, number> };
  const tally = () => ({ n: 0, d: 0, y: 0, dist: {} as Record<string, number> });
  const itemGen = new Map<string, Tally>(), itemInst = new Map<string, Tally>(), itemCls = new Map<string, Tally>();
  for (const r of raw.items) {
    const add = (m: Map<string, Tally>, k: string) => { const t = m.get(k) || tally(); t.n += r.c; if (r.status === 'CORRECT') t.d += r.c; else if (r.status === 'WRONG') t.y += r.c; const a = r.answer && r.status !== 'BLANK' ? String(r.answer).toUpperCase() : '-'; t.dist[a] = (t.dist[a] || 0) + r.c; m.set(k, t); };
    if (r.inst == null) add(itemGen, r.q); else { add(itemInst, `${r.inst}|${r.q}`); add(itemCls, `${r.inst}|${r.cls || ''}|${r.q}`); }
  }
  const activeQs = raw.questions.filter((q) => q.status === 'ACTIVE').sort((a, b) => (raw.subjects.findIndex((s) => s.id === a.subjectId) - raw.subjects.findIndex((s) => s.id === b.subjectId)) || a.no - b.no);
  const topicOf = (m: Map<string, Tally>, prefix: string) => {
    const out: Array<{ subjectId: string; section: string | null; topic: string; s: number; d: number; y: number; n: number }> = [];
    for (const q of activeQs) {
      const t = m.get(prefix + q.id); if (!t) continue;
      let row = out.find((x) => x.subjectId === q.subjectId && x.section === q.section && x.topic === q.topic);
      if (!row) out.push(row = { subjectId: q.subjectId, section: q.section, topic: q.topic, s: 0, d: 0, y: 0, n: 0 });
      row.s++; row.d += t.d; row.y += t.y; row.n = Math.max(row.n, t.n);
    }
    // averages per student: correct/wrong per student over the topic's questions
    return out.map((r) => ({ ...r, d: r.n ? r2(r.d / r.n) : 0, y: r.n ? r2(r.y / r.n) : 0, p: r.n && r.s ? Math.round((100 * r.d) / (r.s * r.n)) : 0 }));
  };
  const items = (inst: string) => activeQs.map((q) => {
    const g = itemGen.get(q.id) || tally(), s = itemInst.get(`${inst}|${q.id}`) || tally(), k = keyA.get(q.id);
    const wrongTop = Object.entries(s.dist).filter(([a]) => a !== '-' && a !== (k?.answer || '').toUpperCase()).sort((a, b) => b[1] - a[1])[0];
    return { id: q.id, subjectId: q.subjectId, section: q.section, topic: q.topic, no: k?.printed ?? q.no, key: k?.answer || '', school: { n: s.n, p: s.n ? Math.round((100 * s.d) / s.n) : 0, dist: s.dist }, general: { n: g.n, p: g.n ? Math.round((100 * g.d) / g.n) : 0, dist: g.dist }, topWrong: wrongTop ? { answer: wrongTop[0], share: s.n ? Math.round((100 * wrongTop[1]) / s.n) : 0 } : null };
  });

  // Per-student grid (answer string against the key of the student's booklet).
  const keyBy = new Map<string, Map<string, { answer: string; printed: number }>>();
  for (const k of raw.keys) { const m = keyBy.get(k.booklet) || new Map(); m.set(k.questionId, { answer: k.answer, printed: k.printed }); keyBy.set(k.booklet, m); }
  const answersBy = new Map<string, Map<string, { answer: string | null; status: string }>>();
  for (const a of raw.answers) { const m = answersBy.get(a.p) || new Map(); m.set(a.q, { answer: a.answer, status: a.status }); answersBy.set(a.p, m); }
  const gridOf = (p: string, booklet: string | null) => {
    const key = keyBy.get(booklet || '') || keyBy.get(firstBooklet || '') || new Map(), own = answersBy.get(p) || new Map();
    const out: Record<string, Array<{ no: number; answer: string; key: string; status: string }>> = {};
    for (const q of raw.questions) {
      const k = key.get(q.id), a = own.get(q.id);
      (out[q.subjectId] ||= []).push({ no: k?.printed ?? q.no, answer: a?.answer || '', key: q.status !== 'ACTIVE' ? '-' : (k?.answer || ''), status: q.status !== 'ACTIVE' ? 'CANCELLED' : (a?.status || 'BLANK') });
    }
    for (const rows of Object.values(out)) rows.sort((x, y) => x.no - y.no);
    return out;
  };
  const studentTopics = (p: string) => {
    const own = answersBy.get(p) || new Map();
    const out: Array<{ subjectId: string; section: string | null; topic: string; s: number; d: number; y: number; p: number }> = [];
    for (const q of activeQs) { const a = own.get(q.id); let row = out.find((x) => x.subjectId === q.subjectId && x.section === q.section && x.topic === q.topic); if (!row) out.push(row = { subjectId: q.subjectId, section: q.section, topic: q.topic, s: 0, d: 0, y: 0, p: 0 }); row.s++; if (a?.status === 'CORRECT') row.d++; else if (a?.status === 'WRONG') row.y++; }
    return out.map((r) => ({ ...r, p: r.s ? Math.round((100 * r.d) / r.s) : 0 }));
  };

  const pub = (s: typeof students[number]) => ({ id: s.id, name: s.name, number: s.no, className: s.cls, booklet: s.booklet, institutionId: s.inst, tests: s.tests, cols: s.cols, total: s.total, scores: s.scores, ranks: s.ranks, counts: s.counts, tytSource: s.tytSource });
  const institutions = raw.selected.filter((id) => byInst.has(id)).map((id) => {
    const list = byInst.get(id)!, first = list[0];
    const classes = [...new Set(list.map((s) => s.cls))].sort((a, b) => a.localeCompare(b, 'tr'));
    return {
      id, name: first.iname, city: first.city, district: first.district,
      avg: average(list), rank: instRank[id],
      counts: { school: countsOf(list), district: countsOf(byDistrict.get(`${first.city}|${first.district}`) || []), city: countsOf(byCity.get(first.city) || []), general: countsOf(students) },
      refs: { district: average(byDistrict.get(`${first.city}|${first.district}`) || []), city: average(byCity.get(first.city) || []) },
      classes: classes.map((c) => ({ name: c, avg: average(byClass.get(`${id}|${c}`) || []), rank: classRank[`${id}|${c}`], topics: topicOf(itemCls, `${id}|${c}|`) })),
      topics: topicOf(itemInst, `${id}|`), items: items(id),
      students: list.slice().sort((a, b) => ((b.scores[primary] ?? -1e9) - (a.scores[primary] ?? -1e9)) || (b.total.d - a.total.d) || a.name.localeCompare(b.name, 'tr'))
        .map((s) => ({ ...pub(s), grid: gridOf(s.id, s.booklet), topics: studentTopics(s.id) })),
    };
  });
  // Schools of the same districts, for the dealer's "kurum ortalamaları" list.
  const districtSchools = [...new Set(institutions.map((i) => `${i.city}|${i.district}`))].map((k) => ({ key: k, city: k.split('|')[0], district: k.split('|')[1], avg: average(byDistrict.get(k) || []), cityAvg: average(byCity.get(k.split('|')[0]) || []),
    schools: instRows.filter((r) => `${r.city}|${r.district}` === k && raw.selected.includes(r.id)).map((r) => ({ id: r.id, name: r.name, count: r.avg.count, avg: r.avg, rank: instRank[r.id] })).sort((a, b) => (b.avg.scores[primary] ?? b.avg.total.n) - (a.avg.scores[primary] ?? a.avg.total.n)) }));

  return {
    exam: raw.exam, family, aytMode: family === 'AYT' ? raw.aytMode : null, pairExam: raw.pair?.exam || null, provisional: raw.provisional,
    tests, columns, scoreTypes, primary,
    general: { avg: general, topics: topicOf(itemGen, ''), counts: countsOf(students) },
    institutions, districtSchools,
  };
}

const SCORE_RULES: Record<string, string> = { TYT: 'srv_osym_tyt_2627', SAY: 'srv_osym_yks_say_2627', SOZ: 'srv_osym_yks_soz_2627', EA: 'srv_osym_yks_ea_2627' };

async function examMeta(env: Env, examId: string) {
  const exam = await one<any>(env.DB.prepare(`SELECT id,title,academic_year,exam_type,grade_level,publisher_name,exam_date,application_start_at FROM exams WHERE id=?`).bind(examId));
  if (!exam) return null;
  const subjects = (await all<any>(env.DB.prepare(`SELECT es.subject_id id,s.name,COALESCE(s.code,'') code,es.question_count,es.wrong_divisor FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=? ORDER BY es.sort_order,s.name`).bind(examId)))
    .map((s) => ({ id: s.id, name: s.name, code: s.code, questionCount: Number(s.question_count), wrongDivisor: Number(s.wrong_divisor) || 0 }));
  return { exam, subjects };
}

/** TYT values of another exam for pairing: each participant's TYT test nets. */
async function pairData(env: Env, aytExam: any, pairExamId: string | undefined, institutionIds: string[]) {
  let id = pairExamId;
  if (!id) {
    // the TYT exam of the same year (and publisher, when there is one) that shares the most schools
    const row = await one<any>(env.DB.prepare(`SELECT e.id,count(DISTINCT ep.institution_id) shared FROM exams e JOIN exam_participants ep ON ep.exam_id=e.id JOIN exam_results er ON er.participant_id=ep.id
      WHERE upper(e.exam_type) LIKE 'TYT%' AND e.academic_year=? AND ep.institution_id IN (SELECT institution_id FROM exam_participants WHERE exam_id=?)
      GROUP BY e.id ORDER BY (COALESCE(e.publisher_name,'')=COALESCE(?,'')) DESC,shared DESC,COALESCE(e.application_start_at,e.exam_date,e.created_at) DESC LIMIT 1`).bind(aytExam.academic_year, aytExam.id, aytExam.publisher_name || ''));
    id = row?.id;
  }
  if (!id) return null;
  const meta = await examMeta(env, id); if (!meta) return null;
  const comp = new Map(meta.subjects.map((s) => [s.id, { c: componentFor('TYT', s.code) || componentFor('TYT', s.name), q: s.questionCount }]));
  const rows = await all<any>(env.DB.prepare(`SELECT ep.id,ep.institution_id inst,ep.name_snapshot name,ep.student_number_snapshot no,sr.subject_id s,sr.net n FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id JOIN subject_results sr ON sr.participant_id=ep.id WHERE ep.exam_id=?`).bind(id));
  const byP = new Map<string, { inst: string; name: string; no: string | null; comps: Record<string, { net: number; q: number }> }>();
  for (const r of rows) { const c = comp.get(r.s); if (!c?.c) continue; const p = byP.get(r.id) || { inst: r.inst, name: r.name, no: r.no, comps: {} as Record<string, { net: number; q: number }> }; const x = p.comps[c.c] || { net: 0, q: 0 }; x.net += Number(r.n); x.q += c.q; p.comps[c.c] = x; byP.set(r.id, p); }
  void institutionIds;
  return { exam: { id: meta.exam.id, title: meta.exam.title, academic_year: meta.exam.academic_year, publisher_name: meta.exam.publisher_name }, participants: [...byP.values()] };
}

export async function reportBundle(env: Env, opts: { examId: string; institutionIds: string[]; aytMode?: AytMode; pairExamId?: string }) {
  const meta = await examMeta(env, opts.examId); if (!meta) return null;
  const { exam, subjects } = meta;
  const qs = await all<any>(env.DB.prepare(`SELECT q.id,q.subject_id,q.question_no,q.question_status,
      (SELECT pol.label_path_json FROM question_publisher_outcomes qpo JOIN publisher_outcome_labels pol ON pol.id=qpo.publisher_outcome_id WHERE qpo.exam_question_id=q.id ORDER BY pol.created_at LIMIT 1) label,
      (SELECT o.title FROM question_outcomes qo JOIN outcomes o ON o.id=qo.outcome_id WHERE qo.exam_question_id=q.id LIMIT 1) outcome
    FROM exam_questions q WHERE q.exam_id=? ORDER BY q.subject_id,q.question_no`).bind(opts.examId));
  const questions = qs.map((q) => { let l: any = {}; try { l = JSON.parse(q.label || '{}'); } catch { /* */ } return { id: q.id, subjectId: q.subject_id, no: Number(q.question_no), status: q.question_status, section: (String(l.unit || '').trim() || null), topic: String(l.publisherTitle || q.outcome || l.topic || '').trim() || 'Konu belirtilmemiş' }; });
  const keys = (await all<any>(env.DB.prepare(`SELECT ak.exam_question_id q,ak.booklet_code b,ak.correct_answer a,COALESCE(o.printed_question_no,eq.question_no) printed FROM answer_keys ak JOIN exam_questions eq ON eq.id=ak.exam_question_id LEFT JOIN exam_question_booklet_orders o ON o.exam_question_id=ak.exam_question_id AND o.booklet_code=ak.booklet_code WHERE eq.exam_id=? ORDER BY ak.booklet_code`).bind(opts.examId)))
    .map((k) => ({ questionId: k.q, booklet: k.b, answer: k.a, printed: Number(k.printed) }));
  const participants = (await all<any>(env.DB.prepare(`SELECT ep.id,ep.institution_id inst,i.name iname,COALESCE(NULLIF(i.city,''),'İl belirtilmemiş') city,COALESCE(NULLIF(i.district,''),'İlçe belirtilmemiş') district,ep.name_snapshot name,ep.student_number_snapshot no,COALESCE(ep.class_snapshot,'') cls,ep.booklet_code booklet,
      er.correct_count d,er.wrong_count y,er.blank_count b,er.net n,er.score score FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id JOIN institutions i ON i.id=ep.institution_id WHERE ep.exam_id=?`).bind(opts.examId)));
  const subjectRows = await all<any>(env.DB.prepare(`SELECT sr.participant_id p,sr.subject_id s,sr.correct_count d,sr.wrong_count y,sr.blank_count b,sr.net n FROM subject_results sr JOIN exam_participants ep ON ep.id=sr.participant_id WHERE ep.exam_id=?`).bind(opts.examId));
  const sectionMap: Record<string, string> = {};
  for (const q of questions) if (q.section && q.status === 'ACTIVE') sectionMap[q.id] = `${q.subjectId}|${q.section}`;
  const sectionRows = Object.keys(sectionMap).length ? await all<any>(env.DB.prepare(`SELECT sa.participant_id p,m.value k,sum(sa.status='CORRECT') d,sum(sa.status='WRONG') y FROM student_answers sa JOIN json_each(?) m ON m.key=sa.exam_question_id JOIN exam_participants ep ON ep.id=sa.participant_id WHERE ep.exam_id=? GROUP BY sa.participant_id,m.value`).bind(JSON.stringify(sectionMap), opts.examId)) : [];
  const selected = [...new Set(opts.institutionIds)].slice(0, 200);
  const marks = selected.map(() => '?').join(',') || "''";
  const items = [
    ...(await all<any>(env.DB.prepare(`SELECT NULL inst,NULL cls,sa.exam_question_id q,sa.answer answer,sa.status status,count(*) c FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id WHERE ep.exam_id=? GROUP BY sa.exam_question_id,sa.answer,sa.status`).bind(opts.examId))),
    ...(selected.length ? await all<any>(env.DB.prepare(`SELECT ep.institution_id inst,COALESCE(ep.class_snapshot,'') cls,sa.exam_question_id q,sa.answer answer,sa.status status,count(*) c FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id WHERE ep.exam_id=? AND ep.institution_id IN (${marks}) GROUP BY 1,2,3,4,5`).bind(opts.examId, ...selected)) : []),
  ];
  const selIds = participants.filter((p) => selected.includes(p.inst)).map((p) => p.id);
  const answers: any[] = [];
  for (let i = 0; i < selIds.length; i += 90) { const chunk = selIds.slice(i, i + 90); answers.push(...await all<any>(env.DB.prepare(`SELECT participant_id p,exam_question_id q,answer,status FROM student_answers WHERE participant_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk))); }
  const weights: Record<string, Record<string, number>> = {};
  for (const [k, id] of Object.entries(SCORE_RULES)) { const r = await one<any>(env.DB.prepare('SELECT config_json FROM scoring_rule_versions WHERE id=?').bind(id)); try { weights[k] = JSON.parse(r?.config_json || '{}').estimateWeights || {}; } catch { weights[k] = {}; } }
  const family = familyOf(exam.exam_type, exam.grade_level, subjects.map((s) => s.code));
  const aytMode: AytMode = opts.aytMode === 'AYT_ONLY' ? 'AYT_ONLY' : 'COMBINED';
  const pair = family === 'AYT' && aytMode === 'COMBINED' ? await pairData(env, exam, opts.pairExamId, selected) : null;
  const provisional = !(await one<any>(env.DB.prepare(`SELECT 1 FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK' AND ranking_frozen_at IS NOT NULL LIMIT 1`).bind(opts.examId)));
  return buildBundle({ exam, subjects, questions, keys, participants: participants.map((p) => ({ ...p, d: Number(p.d), y: Number(p.y), b: Number(p.b), n: Number(p.n), score: p.score == null ? null : Number(p.score) })), subjectRows, sectionRows, selected, answers, items, weights, aytMode, pair, provisional });
}

/** S034 gelişim: the same students across several exams of one school (matched by student number, else name). */
export async function growthReport(env: Env, examIds: string[], institutionId: string) {
  const exams = (await Promise.all(examIds.slice(0, 12).map((id) => one<any>(env.DB.prepare(`SELECT id,title,academic_year,exam_type,COALESCE(application_start_at,exam_date,created_at) at FROM exams WHERE id=?`).bind(id))))).filter(Boolean)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const institution = await one<any>(env.DB.prepare('SELECT id,name,city,district FROM institutions WHERE id=?').bind(institutionId));
  const students = new Map<string, { name: string; number: string | null; className: string; points: Record<string, { net: number; score: number | null; tests: Record<string, number> }> }>();
  const subjects: Record<string, Array<{ id: string; name: string }>> = {};
  for (const e of exams) {
    subjects[e.id] = (await all<any>(env.DB.prepare(`SELECT es.subject_id id,s.name FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=? ORDER BY es.sort_order`).bind(e.id)));
    const rows = await all<any>(env.DB.prepare(`SELECT ep.id,ep.name_snapshot name,ep.student_number_snapshot no,COALESCE(ep.class_snapshot,'') cls,er.net,er.score FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id WHERE ep.exam_id=? AND ep.institution_id=?`).bind(e.id, institutionId));
    const sr = rows.length ? await all<any>(env.DB.prepare(`SELECT sr.participant_id p,sr.subject_id s,sr.net n FROM subject_results sr JOIN exam_participants ep ON ep.id=sr.participant_id WHERE ep.exam_id=? AND ep.institution_id=?`).bind(e.id, institutionId)) : [];
    const testBy = new Map<string, Record<string, number>>();
    for (const r of sr) { const m = testBy.get(r.p) || {}; m[r.s] = r2(Number(r.n)); testBy.set(r.p, m); }
    for (const r of rows) {
      const key = r.no ? `no:${String(r.no).trim()}` : `ad:${normName(r.name)}`;
      const s = students.get(key) || { name: r.name, number: r.no, className: r.cls, points: {} as Record<string, { net: number; score: number | null; tests: Record<string, number> }> };
      s.className = r.cls || s.className; s.points[e.id] = { net: r2(Number(r.net)), score: r.score == null ? null : r2(Number(r.score)), tests: testBy.get(r.id) || {} };
      students.set(key, s);
    }
  }
  const list = [...students.values()].sort((a, b) => a.className.localeCompare(b.className, 'tr') || a.name.localeCompare(b.name, 'tr'));
  const classAvg: Record<string, Record<string, number | null>> = {};
  for (const s of list) for (const e of exams) { const p = s.points[e.id]; if (!p) continue; const c = (classAvg[s.className] ||= {}); const k = `${e.id}`; const cur = (c as any)[`_${k}`] || { sum: 0, n: 0 }; cur.sum += p.score ?? p.net; cur.n++; (c as any)[`_${k}`] = cur; c[k] = r2(cur.sum / cur.n); }
  for (const c of Object.values(classAvg)) for (const k of Object.keys(c)) if (k.startsWith('_')) delete c[k];
  return { institution, exams, subjects, students: list, classAvg };
}
