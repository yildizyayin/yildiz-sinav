import type { Env } from '../types';
import { all, one } from './db';

/**
 * S032: the institution report pack in the familiar publisher layout (owner sample, 26 Oct):
 * - school list: every student with each test's D/Y/N, total, score and ranks (class, school, district, city, overall),
 *   overall and school averages, participation per level;
 * - comparison: test net averages school / district / city / overall, score averages, class comparison;
 * - one report card per student: totals, ranks and participation, each test (and its sections when the key names them)
 *   with success % and class / school / overall averages, the answer grid against the key of the student's booklet,
 *   and a second page with every topic's S / D / Y / B%.
 * Ranks are computed live over everyone who took the exam; before the results are published they are provisional.
 */
type Avg = { d: number; y: number; n: number };
const r2 = (x: unknown) => Math.round(Number(x || 0) * 100) / 100;

export async function reportPack(env: Env, examId: string, institutionId: string) {
  const [exam, institution, subjects] = await Promise.all([
    one<any>(env.DB.prepare(`SELECT id,title,academic_year,exam_type,publisher_name,exam_date FROM exams WHERE id=?`).bind(examId)),
    one<any>(env.DB.prepare(`SELECT id,name,code,city,district FROM institutions WHERE id=?`).bind(institutionId)),
    all<any>(env.DB.prepare(`SELECT es.subject_id id,s.name,es.question_count,es.wrong_divisor FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=? ORDER BY es.sort_order,s.name`).bind(examId)),
  ]);
  if (!exam || !institution) return null;

  // Everyone who took the exam, with live ranks at every level; only this institution's rows come back.
  const students = await all<any>(env.DB.prepare(`WITH p AS MATERIALIZED (
      SELECT ep.id,ep.institution_id,ep.name_snapshot,ep.student_number_snapshot,ep.class_snapshot,ep.booklet_code,er.correct_count,er.wrong_count,er.blank_count,er.net,er.score,
        COALESCE(i.city,'') city,COALESCE(i.district,'') district,COALESCE(er.score,er.net) k
      FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id JOIN institutions i ON i.id=ep.institution_id WHERE ep.exam_id=?),
    r AS (SELECT p.*,
      RANK() OVER(ORDER BY k DESC,correct_count DESC) national_rank,COUNT(*) OVER() national_count,
      RANK() OVER(PARTITION BY city ORDER BY k DESC,correct_count DESC) city_rank,COUNT(*) OVER(PARTITION BY city) city_count,
      RANK() OVER(PARTITION BY city,district ORDER BY k DESC,correct_count DESC) district_rank,COUNT(*) OVER(PARTITION BY city,district) district_count,
      RANK() OVER(PARTITION BY institution_id ORDER BY k DESC,correct_count DESC) school_rank,COUNT(*) OVER(PARTITION BY institution_id) school_count,
      RANK() OVER(PARTITION BY institution_id,COALESCE(class_snapshot,'') ORDER BY k DESC,correct_count DESC) class_rank,COUNT(*) OVER(PARTITION BY institution_id,COALESCE(class_snapshot,'')) class_count
      FROM p)
    SELECT * FROM r WHERE institution_id=? ORDER BY k DESC,correct_count DESC,name_snapshot LIMIT 5000`).bind(examId, institutionId));

  const scopeAverages = async (where: string, args: unknown[]) => {
    const [subjectRows, totals] = await Promise.all([
      all<any>(env.DB.prepare(`SELECT sr.subject_id,AVG(sr.correct_count) d,AVG(sr.wrong_count) y,AVG(sr.net) n FROM subject_results sr JOIN exam_participants ep ON ep.id=sr.participant_id JOIN institutions i ON i.id=ep.institution_id WHERE ep.exam_id=? ${where} GROUP BY sr.subject_id`).bind(examId, ...args)),
      one<any>(env.DB.prepare(`SELECT AVG(er.correct_count) d,AVG(er.wrong_count) y,AVG(er.net) n,AVG(er.score) score,COUNT(*) c FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id JOIN institutions i ON i.id=ep.institution_id WHERE ep.exam_id=? ${where}`).bind(examId, ...args)),
    ]);
    const bySubject: Record<string, Avg> = {};
    for (const row of subjectRows) bySubject[row.subject_id] = { d: r2(row.d), y: r2(row.y), n: r2(row.n) };
    return { subjects: bySubject, total: { d: r2(totals?.d), y: r2(totals?.y), n: r2(totals?.n) }, score: totals?.score == null ? null : r2(totals.score), count: Number(totals?.c || 0) };
  };
  const [general, city, district, school] = await Promise.all([
    scopeAverages('', []),
    scopeAverages('AND i.city=?', [institution.city || '']),
    scopeAverages('AND i.city=? AND i.district=?', [institution.city || '', institution.district || '']),
    scopeAverages('AND ep.institution_id=?', [institutionId]),
  ]);
  const classes = [...new Set(students.map((s) => s.class_snapshot || ''))].sort();
  const byClass: Record<string, Awaited<ReturnType<typeof scopeAverages>>> = {};
  for (const c of classes) byClass[c] = await scopeAverages(`AND ep.institution_id=? AND COALESCE(ep.class_snapshot,'')=?`, [institutionId, c]);

  // Questions: order and key per booklet, topic and section labels.
  const questions = await all<any>(env.DB.prepare(`SELECT q.id,q.subject_id,q.question_no,q.question_status,
      (SELECT pol.label_path_json FROM question_publisher_outcomes qpo JOIN publisher_outcome_labels pol ON pol.id=qpo.publisher_outcome_id WHERE qpo.exam_question_id=q.id ORDER BY pol.created_at LIMIT 1) label,
      (SELECT o.title FROM question_outcomes qo JOIN outcomes o ON o.id=qo.outcome_id WHERE qo.exam_question_id=q.id LIMIT 1) outcome
    FROM exam_questions q WHERE q.exam_id=? ORDER BY q.subject_id,q.question_no`).bind(examId));
  const keys = await all<any>(env.DB.prepare(`SELECT ak.exam_question_id,ak.booklet_code,ak.correct_answer,COALESCE(o.printed_question_no,q.question_no) printed FROM answer_keys ak JOIN exam_questions q ON q.id=ak.exam_question_id LEFT JOIN exam_question_booklet_orders o ON o.exam_question_id=ak.exam_question_id AND o.booklet_code=ak.booklet_code WHERE q.exam_id=?`).bind(examId));
  const meta = new Map<string, { subject: string; section: string | null; topic: string; status: string }>();
  for (const q of questions) {
    let label: any = {}; try { label = JSON.parse(q.label || '{}'); } catch { /* */ }
    meta.set(q.id, { subject: q.subject_id, section: label.unit || null, topic: String(label.publisherTitle || q.outcome || label.topic || '').trim() || 'Konu belirtilmemiş', status: q.question_status });
  }
  const keyBy = new Map<string, Map<string, { answer: string; printed: number }>>();
  for (const k of keys) { const m = keyBy.get(k.booklet_code) || new Map(); m.set(k.exam_question_id, { answer: k.correct_answer, printed: Number(k.printed) }); keyBy.set(k.booklet_code, m); }
  const anyBooklet = keyBy.keys().next().value as string | undefined;

  // This institution's per-subject results and answers.
  const ids = students.map((s) => s.id);
  const subjectResults: any[] = [], answers: any[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90), marks = chunk.map(() => '?').join(',');
    subjectResults.push(...await all<any>(env.DB.prepare(`SELECT participant_id,subject_id,correct_count,wrong_count,blank_count,net FROM subject_results WHERE participant_id IN (${marks})`).bind(...chunk)));
    answers.push(...await all<any>(env.DB.prepare(`SELECT participant_id,exam_question_id,answer,status FROM student_answers WHERE participant_id IN (${marks})`).bind(...chunk)));
  }
  const srBy = new Map<string, Record<string, any>>();
  for (const r of subjectResults) { const m = srBy.get(r.participant_id) || {}; m[r.subject_id] = { d: r.correct_count, y: r.wrong_count, b: r.blank_count, n: r2(r.net) }; srBy.set(r.participant_id, m); }
  const ansBy = new Map<string, any[]>();
  for (const a of answers) { const list = ansBy.get(a.participant_id) || []; list.push(a); ansBy.set(a.participant_id, list); }

  const sectionTotals = (list: any[]) => {
    // sections (e.g. Tarih-1 inside TYT Sosyal) exist only when the answer key named them
    const out: Record<string, Array<{ name: string; s: number; d: number; y: number; n: number }>> = {};
    for (const a of list) {
      const m = meta.get(a.exam_question_id); if (!m?.section || m.status !== 'ACTIVE') continue;
      const rows = out[m.subject] || (out[m.subject] = []);
      let row = rows.find((x) => x.name === m.section); if (!row) rows.push(row = { name: m.section!, s: 0, d: 0, y: 0, n: 0 });
      row.s++; if (a.status === 'CORRECT') row.d++; else if (a.status === 'WRONG') row.y++;
    }
    return out;
  };
  const topicTotals = (list: any[]) => {
    const out: Record<string, Array<{ topic: string; section: string | null; s: number; d: number; y: number }>> = {};
    for (const a of list) {
      const m = meta.get(a.exam_question_id); if (!m || m.status !== 'ACTIVE') continue;
      const rows = out[m.subject] || (out[m.subject] = []);
      let row = rows.find((x) => x.topic === m.topic && x.section === m.section); if (!row) rows.push(row = { topic: m.topic, section: m.section, s: 0, d: 0, y: 0 });
      row.s++; if (a.status === 'CORRECT') row.d++; else if (a.status === 'WRONG') row.y++;
    }
    return out;
  };
  const grid = (list: any[], booklet: string | null) => {
    const key = keyBy.get(booklet || '') || (anyBooklet ? keyBy.get(anyBooklet)! : new Map());
    const own = new Map(list.map((a) => [a.exam_question_id, a]));
    const out: Record<string, Array<{ no: number; answer: string; key: string; status: string }>> = {};
    for (const q of questions) {
      const k = key.get(q.id); const a = own.get(q.id);
      (out[q.subject_id] || (out[q.subject_id] = [])).push({ no: k?.printed ?? q.question_no, answer: a?.answer || '', key: q.question_status !== 'ACTIVE' ? '-' : (k?.answer || ''), status: q.question_status !== 'ACTIVE' ? 'CANCELLED' : (a?.status || 'BLANK') });
    }
    for (const rows of Object.values(out)) { rows.sort((x, y) => x.no - y.no); rows.forEach((r, i) => { r.no = i + 1; }); }
    return out;
  };

  return {
    exam, institution,
    provisional: !(await one<any>(env.DB.prepare(`SELECT 1 FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK' AND ranking_frozen_at IS NOT NULL LIMIT 1`).bind(examId))),
    subjects: subjects.map((s) => ({ id: s.id, name: s.name, questionCount: Number(s.question_count), wrongDivisor: Number(s.wrong_divisor) || 0 })),
    participation: { school: school.count, district: district.count, city: city.count, overall: general.count },
    averages: { general, city, district, school, byClass },
    students: students.map((s) => {
      const list = ansBy.get(s.id) || [];
      return {
        id: s.id, name: s.name_snapshot, number: s.student_number_snapshot, className: s.class_snapshot, booklet: s.booklet_code,
        total: { d: s.correct_count, y: s.wrong_count, b: s.blank_count, n: r2(s.net) }, score: s.score == null ? null : r2(s.score),
        ranks: { class: s.class_rank, school: s.school_rank, district: s.district_rank, city: s.city_rank, overall: s.national_rank },
        counts: { class: s.class_count, school: s.school_count, district: s.district_count, city: s.city_count, overall: s.national_count },
        subjects: srBy.get(s.id) || {}, sections: sectionTotals(list), topics: topicTotals(list), grid: grid(list, s.booklet_code),
      };
    }),
  };
}
