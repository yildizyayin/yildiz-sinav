/**
 * A028b: two-session exams (middle school sayısal + sözel) read from one TXT or from two.
 *
 * A school may code the sayısal tests on one form (e.g. Sekonic 7108) and the sözel tests on another
 * (e.g. 840), then upload them separately or as one file. The result must be the same single result per
 * student. Three things make that hold:
 *  1. Subject codes on the form are aligned to the exam (a 7108 file says SOS/ING, an LGS exam says INK/YAB).
 *  2. A test that is blank for every sheet in the upload is not in this upload; it must not overwrite the
 *     same test of the other session with blanks.
 *  3. Two sheets of one student in one upload (one per session) become one record. Each session keeps its
 *     own booklet, because LGS-style sessions have separate booklets.
 */
import type { CanonicalRecord } from '../types';
import { normalizeName } from './db';
import { lostLetterName, sameNameAllowingLostLetters } from './matching';

const ALIAS_GROUPS: string[][] = [['INK', 'SOS'], ['YAB', 'ING']];

export const hasMarks = (sequence: string | undefined): boolean => /[A-E]/i.test(String(sequence || ''));

export function subjectBooklet(record: CanonicalRecord, code: string, fallback?: string): string {
  return String(record.booklet_by_subject?.[code] || record.booklet || fallback || '').trim().toUpperCase();
}

/** The booklet stored on the participant: the shared one, or the first session's when sessions differ. */
export function primaryBooklet(record: CanonicalRecord): string {
  return String(record.booklet || Object.values(record.booklet_by_subject || {})[0] || '').trim().toUpperCase();
}

/** Booklet problem of a record whose sessions may carry different booklets (null when every test has a valid one). */
export function recordBookletIssue(record: CanonicalRecord, allowedCodes: string[], check: (code: string | undefined, allowed: string[]) => string | null): string | null {
  const codes = Object.keys(record.answers_by_subject || {});
  if (!record.booklet_by_subject || !codes.length) return check(record.booklet, allowedCodes);
  for (const code of codes) { const issue = check(subjectBooklet(record, code) || undefined, allowedCodes); if (issue) return issue; }
  return null;
}

export type AlignResult = { records: CanonicalRecord[]; renamed: Record<string, string>; dropped: string[]; missing: string[]; unused: string[]; warnings: string[] };

/**
 * Align file subject codes to the exam and remove tests nobody answered. Both are decided per optical form:
 * in a TXT holding a 7108 sayısal sheet and an 840 sözel sheet, the 7108's empty Türkçe block is not the
 * student's Türkçe, even though Türkçe is answered on the other form.
 */
export function alignRecordsToExam(records: CanonicalRecord[], examCodes: string[]): AlignResult {
  const exam = new Set(examCodes.map((c) => c.toUpperCase()));
  const groups = new Map<string, number[]>();
  records.forEach((r, i) => { const k = r.source_template || ''; groups.set(k, [...(groups.get(k) || []), i]); });
  const renamed: Record<string, string> = {};
  const droppedAll = new Set<string>();
  const out: CanonicalRecord[] = records.map((r) => ({ ...r }));
  for (const indexes of groups.values()) {
    const group = indexes.map((i) => records[i]);
    const fileCodes = new Set(group.flatMap((r) => Object.keys(r.answers_by_subject || {}).map((c) => c.toUpperCase())));
    const rename: Record<string, string> = {};
    for (const code of fileCodes) {
      if (exam.has(code)) continue;
      const aliases = ALIAS_GROUPS.find((g) => g.includes(code));
      const targets = aliases ? aliases.filter((c) => c !== code && exam.has(c) && !fileCodes.has(c)) : [];
      if (targets.length === 1) rename[code] = targets[0];
    }
    // Only exam tests are dropped: other blocks (e.g. the optional TYT philosophy) are read by their own step.
    const dropped = [...fileCodes].filter((code) => exam.has(rename[code] || code) && group.every((r) => !hasMarks(r.answers_by_subject?.[code])));
    for (const i of indexes) {
      const answers: Record<string, string> = {};
      for (const [code, seq] of Object.entries(records[i].answers_by_subject || {})) {
        const upper = code.toUpperCase();
        if (dropped.includes(upper)) continue;
        answers[rename[upper] || upper] = seq;
      }
      out[i] = { ...records[i], answers_by_subject: answers };
    }
    for (const [from, to] of Object.entries(rename)) if (!dropped.includes(from)) renamed[from] = to;
    dropped.forEach((c) => droppedAll.add(rename[c] || c));
  }
  const present = new Set(out.flatMap((r) => Object.keys(r.answers_by_subject)));
  const missing = examCodes.map((c) => c.toUpperCase()).filter((c) => !present.has(c));
  const unused = [...present].filter((c) => !exam.has(c) && c !== 'TYT_FEL' && out.some((r) => hasMarks(r.answers_by_subject[c])));
  const warnings: string[] = [];
  for (const [from, to] of Object.entries(renamed)) warnings.push(`Dosyadaki ${from} cevapları sınavın ${to} dersi olarak okundu.`);
  if (missing.length) warnings.push(`Bu dosyada şu derslerin cevabı yok: ${missing.join(', ')}. Bu dersler bu yüklemeyle değişmez; diğer oturumun dosyası ayrıca yüklenebilir.`);
  if (unused.length) warnings.push(`Dosyadaki ${unused.join(', ')} alanları sınavda tanımlı değil ve değerlendirilmeyecek.`);
  return { records: out, renamed, dropped: [...droppedAll], missing, unused, warnings };
}

function sameStudent(a: CanonicalRecord, b: CanonicalRecord): boolean {
  const ta = (a.tckn || '').replace(/\D/g, ''), tb = (b.tckn || '').replace(/\D/g, '');
  const na = normalizeName(a.name || ''), nb = normalizeName(b.name || '');
  const ma = lostLetterName(a.name || '') || na, mb = lostLetterName(b.name || '') || nb;
  const namesAgree = !na || !nb || na === nb || sameNameAllowingLostLetters(ma, nb) || sameNameAllowingLostLetters(mb, na);
  if (ta && tb) return ta === tb && namesAgree;
  const sa = (a.student_number || '').replace(/^0+/, ''), sb = (b.student_number || '').replace(/^0+/, '');
  if (sa && sb) return sa === sb && namesAgree;
  return !!na && na === nb && normalizeName(a.class_name || '') === normalizeName(b.class_name || '');
}

const markedCodes = (r: CanonicalRecord) => Object.entries(r.answers_by_subject || {}).filter(([, v]) => hasMarks(v)).map(([k]) => k);

/**
 * Merge the sheets of one student whose answered tests do not overlap. Sheets with overlapping tests are
 * left alone so the duplicate-student review (A028) shows them. Each sheet keeps its booklet for its own tests.
 */
export function mergeSessionRecords(records: CanonicalRecord[]): { records: CanonicalRecord[]; merged: Array<{ kept: number; absorbed: number }> } {
  const out: CanonicalRecord[] = [];
  const merged: Array<{ kept: number; absorbed: number }> = [];
  for (const record of records) {
    const mine = markedCodes(record);
    const partners = out.filter((o) => sameStudent(o, record));
    const target = partners.length === 1 && mine.length > 0 && !markedCodes(partners[0]).some((c) => mine.includes(c)) ? partners[0] : null;
    if (!target) { out.push({ ...record, answers_by_subject: { ...record.answers_by_subject }, issues: [...record.issues] }); continue; }
    const targetBooklet = (target.booklet || '').toUpperCase(), ownBooklet = (record.booklet || '').toUpperCase();
    // Each test remembers the booklet of the sheet its answers came from.
    const byCode: Record<string, string> = target.booklet_by_subject ? { ...target.booklet_by_subject } : Object.fromEntries(Object.keys(target.answers_by_subject).filter(() => targetBooklet).map((c) => [c, targetBooklet]));
    for (const [code, seq] of Object.entries(record.answers_by_subject)) {
      if (hasMarks(seq) || !(code in target.answers_by_subject)) {
        target.answers_by_subject[code] = seq;
        if (ownBooklet) byCode[code] = ownBooklet; else delete byCode[code];
      }
    }
    if (targetBooklet !== ownBooklet || target.booklet_by_subject) {
      target.booklet_by_subject = byCode;
      // The shared booklet stays only when both sheets agree; otherwise tests without a readable booklet
      // fall back to it, so it is cleared and the booklet review asks.
      if (targetBooklet !== ownBooklet) target.booklet = undefined;
    }
    target.tckn ||= record.tckn; target.student_number ||= record.student_number;
    if (!target.name && record.name) target.name = record.name;
    target.class_name ||= record.class_name; target.grade_level ??= record.grade_level; target.section ||= record.section;
    target.confidence = Math.min(target.confidence, record.confidence);
    target.issues.push(...record.issues);
    target.merged_rows = [...(target.merged_rows || []), record.row_no];
    merged.push({ kept: target.row_no, absorbed: record.row_no });
  }
  return { records: out, merged };
}

/**
 * When one student still has several sheets in a batch (separate rows matched to the same student),
 * a test that is entirely blank on one sheet but answered on another belongs to the other sheet.
 * Returns, per scan record id, the subject codes that sheet must not write.
 */
export function blankSubjectsCoveredElsewhere(rows: Array<{ id: string; matched_student_id?: string | null; resolution_status?: string; canonical_json?: string }>): Map<string, Set<string>> {
  const byStudent = new Map<string, Array<{ id: string; marked: Set<string>; present: string[] }>>();
  for (const row of rows) {
    if (!row.matched_student_id || row.resolution_status === 'CANCELLED') continue;
    let answers: Record<string, string> = {};
    try { answers = JSON.parse(row.canonical_json || '{}').answers_by_subject || {}; } catch { /* unreadable row is reported elsewhere */ }
    const list = byStudent.get(row.matched_student_id) || [];
    list.push({ id: row.id, marked: new Set(Object.entries(answers).filter(([, v]) => hasMarks(v)).map(([k]) => k)), present: Object.keys(answers) });
    byStudent.set(row.matched_student_id, list);
  }
  const skip = new Map<string, Set<string>>();
  for (const list of byStudent.values()) {
    if (list.length < 2) continue;
    for (const sheet of list) {
      const covered = sheet.present.filter((code) => !sheet.marked.has(code) && list.some((other) => other !== sheet && other.marked.has(code)));
      if (covered.length) skip.set(sheet.id, new Set(covered));
    }
  }
  return skip;
}
