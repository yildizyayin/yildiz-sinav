import type { Env } from '../types';
import { all, json, one, uuid } from './db';
import type { DejavuPrint, DejavuSection } from './studio-pdf';
import { evidenceRows, outcomeQuestionTarget, unifiedOutcomeEvidence } from './unified-outcome-evidence';

/**
 * Dejavu kişiye özel kitap (owner, 10 Nov 2026). The book is built from the unified karne:
 *  - gaps: outcomes not yet learned, weakest recent success first (published results only, as the student sees them);
 *    when the karne has no outcome evidence yet, the published deneme outcome results are used as before (A058);
 *  - difficulty follows the gap: below 40% easy–medium, 40–70% medium, above 70% medium–hard (preference, not a filter);
 *  - 3–8 questions per outcome by the size of the gap;
 *  - never a question the student has already met: deneme/question bank/mini test/föy/game evidence, earlier books
 *    and coach exposures are all excluded;
 *  - only approved, rights-cleared multiple-choice questions of the student's grade, linked to that outcome, from the
 *    platform or the student's own institution. A shortage is written into the book, nothing is invented.
 * Answers entered back are graded here and become karne evidence (source DEJAVU); an answered item is final.
 */
export const RIGHTS_OK = `('OWNED','LICENSED','PUBLIC_DOMAIN')`;

export type DejavuGap = { outcomeId: string; title: string; subjectId: string | null; subjectName: string | null; topic: string | null; subtopic: string | null; rate: number | null; evidence: number; source: 'KARNE' | 'EXAM' };

export function questionsForGap(rate: number | null) {
  if (rate == null) return 4;
  if (rate < 0.4) return 8;
  if (rate < 0.6) return 6;
  if (rate < 0.7) return 5;
  return 3;
}
export function difficultyCentre(rate: number | null) {
  if (rate == null) return 3;
  if (rate < 0.4) return 2;
  if (rate <= 0.7) return 3;
  return 4;
}

export type ExamGapSource = (studentId: string, limit: number) => Promise<DejavuGap[]>;
export async function dejavuGaps(env: Env, studentId: string, institutionId: string | null, limit: number, subjectIds: string[] | null = null, examGaps?: ExamGapSource): Promise<DejavuGap[]> {
  const inScope = (subjectId: string | null) => !subjectIds || (subjectId != null && subjectIds.includes(subjectId));
  const target = await outcomeQuestionTarget(env, institutionId);
  const karne = (await unifiedOutcomeEvidence(env, studentId, { learnerView: true, target }))
    .map((o) => ({ o, rate: o.recent.uniqueQuestions ? o.recent.rate : (o.uniqueQuestions ? o.correct / Math.max(1, o.correct + o.wrong + o.blank) : null) }))
    .filter(({ o, rate }) => o.status === 'DEVELOPING' && o.uniqueQuestions >= 2 && rate != null && rate < 0.8 && inScope(o.subjectId))
    .sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1) || b.o.attempts - a.o.attempts)
    .slice(0, limit);
  if (karne.length) {
    const meta = await all<any>(env.DB.prepare(`SELECT id,topic,subtopic FROM outcomes WHERE id IN (${karne.map(() => '?').join(',')})`).bind(...karne.map((k) => k.o.outcomeId)));
    return karne.map(({ o, rate }) => { const m = meta.find((x) => x.id === o.outcomeId); return { outcomeId: o.outcomeId, title: o.title, subjectId: o.subjectId, subjectName: o.subjectName, topic: m?.topic ?? null, subtopic: m?.subtopic ?? null, rate, evidence: o.uniqueQuestions, source: 'KARNE' as const }; });
  }
  // no outcome evidence in the karne yet: the caller's deneme outcome results (A058 rule, kept in student-books-entry)
  if (!examGaps) return [];
  return (await examGaps(studentId, subjectIds ? 200 : limit)).filter((g) => inScope(g.subjectId)).slice(0, limit);
}

/** Every bank question the student has already met, wherever: karne evidence, earlier books, coach exposures. */
export async function seenQuestionIds(env: Env, studentId: string) {
  const seen = new Set<string>();
  for (const r of await evidenceRows(env, studentId, false)) if (r.question_key.startsWith('QB:')) seen.add(r.question_key.slice(3));
  const [books, exposures, practice] = await Promise.all([
    all<any>(env.DB.prepare(`SELECT DISTINCT i.bank_question_id id FROM student_personal_book_items i JOIN student_personal_books b ON b.id=i.book_id WHERE b.student_id=? AND i.bank_question_id IS NOT NULL`).bind(studentId)),
    all<any>(env.DB.prepare(`SELECT question_id id FROM coach_question_exposures WHERE student_id=?`).bind(studentId)),
    all<any>(env.DB.prepare(`SELECT DISTINCT question_id id FROM question_practice_attempts WHERE student_id=?`).bind(studentId)),
  ]);
  for (const r of [...books, ...exposures, ...practice]) if (r.id) seen.add(r.id);
  return seen;
}

function code() { const b = new Uint8Array(9); crypto.getRandomValues(b); return Array.from(b, (x) => 'abcdefghjkmnpqrstuvwxyz23456789'[x % 31]).join(''); }

export type DejavuBuild = { id: string; outcomeCount: number; questionCount: number; status: 'READY' | 'DRAFT'; shortages: Array<{ outcomeId: string; title: string; wanted: number; found: number }> };

export async function buildDejavuBook(env: Env, args: { studentId: string; generatedBy: string; title?: string; outcomeLimit?: number; questionsPerOutcome?: number | null; sourceMode?: string; subjectIds?: string[] | null; examGaps?: ExamGapSource }): Promise<DejavuBuild | { error: 'ENROLLMENT_REQUIRED' | 'INSUFFICIENT_EVIDENCE' }> {
  const enr = await one<any>(env.DB.prepare(`SELECT e.institution_id,e.grade_level,s.academic_year FROM student_enrollments e LEFT JOIN institution_seasons s ON s.id=e.season_id
    WHERE e.student_id=? AND e.status='ACTIVE' ORDER BY e.created_at DESC LIMIT 1`).bind(args.studentId));
  if (!enr) return { error: 'ENROLLMENT_REQUIRED' };
  const outcomeLimit = Math.max(1, Math.min(16, Number(args.outcomeLimit || 8)));
  const fixed = args.questionsPerOutcome ? Math.max(1, Math.min(8, Number(args.questionsPerOutcome))) : null;
  const gaps = await dejavuGaps(env, args.studentId, enr.institution_id, outcomeLimit, args.subjectIds ?? null, args.examGaps);
  if (!gaps.length) return { error: 'INSUFFICIENT_EVIDENCE' };
  const seen = await seenQuestionIds(env, args.studentId);
  const used = new Set<string>();
  const id = uuid('pbook');
  const title = String(args.title || 'Dejavu · Kişiye Özel Kitabım').trim() || 'Dejavu · Kişiye Özel Kitabım';
  const st: D1PreparedStatement[] = [env.DB.prepare(`INSERT INTO student_personal_books(id,student_id,institution_id,academic_year,grade_level,title,source_mode,status,outcome_count,question_count,config_json,generated_by) VALUES(?,?,?,?,?,?,?,'DRAFT',?,?,?,?)`)
    .bind(id, args.studentId, enr.institution_id, enr.academic_year || null, enr.grade_level || null, title, ['WEAK_OUTCOMES','TARGET_GAPS','MIXED'].includes(String(args.sourceMode)) ? args.sourceMode : 'WEAK_OUTCOMES', gaps.length, 0, JSON.stringify({ outcomeLimit, questionsPerOutcome: fixed, engine: 'DEJAVU_1' }), args.generatedBy)];
  const shortages: DejavuBuild['shortages'] = [];
  let order = 1, total = 0;
  for (const g of gaps) {
    const wanted = fixed ?? questionsForGap(g.rate), centre = difficultyCentre(g.rate);
    const pool = await all<any>(env.DB.prepare(`SELECT q.id,COALESCE(q.difficulty_level,q.difficulty,3) difficulty FROM question_bank q
      WHERE q.review_status='APPROVED' AND q.grade_level=? AND (q.subject_id=? OR ? IS NULL) AND q.copyright_status IN ${RIGHTS_OK}
        AND COALESCE(q.question_type,'MULTIPLE_CHOICE')='MULTIPLE_CHOICE' AND q.correct_answer IS NOT NULL AND q.options_json IS NOT NULL
        AND (q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?))
        AND EXISTS(SELECT 1 FROM question_learning_links l WHERE l.question_id=q.id AND l.node_id='ln_'||?)
      ORDER BY ABS(COALESCE(q.difficulty_level,q.difficulty,3)-?),RANDOM() LIMIT 200`).bind(enr.grade_level, g.subjectId, g.subjectId, enr.institution_id, g.outcomeId, centre));
    const chosen = pool.filter((q) => !seen.has(q.id) && !used.has(q.id)).slice(0, wanted);
    if (chosen.length < wanted) shortages.push({ outcomeId: g.outcomeId, title: g.title, wanted, found: chosen.length });
    st.push(env.DB.prepare(`INSERT INTO student_personal_book_items(id,book_id,outcome_id,subject_id,item_type,sort_order,payload_json) VALUES(?,?,?,?,'OUTCOME_HEADER',?,?)`)
      .bind(uuid('pbi'), id, g.outcomeId, g.subjectId, order++, JSON.stringify({ title: g.title, subject: g.subjectName, topic: g.topic, subtopic: g.subtopic, successRate: g.rate, evidenceCount: g.evidence, gapSource: g.source, wanted, found: chosen.length, difficultyCentre: centre })));
    for (const q of chosen) {
      used.add(q.id); total++;
      st.push(env.DB.prepare(`INSERT INTO student_personal_book_items(id,book_id,outcome_id,subject_id,bank_question_id,item_type,difficulty,sort_order,payload_json,solution_code) VALUES(?,?,?,?,?,'PRACTICE_QUESTION',?,?,?,?)`)
        .bind(uuid('pbi'), id, g.outcomeId, g.subjectId, q.id, q.difficulty, order++, JSON.stringify({ source: 'APPROVED_QUESTION_BANK' }), code()));
    }
  }
  const status = total > 0 ? 'READY' : 'DRAFT';
  st.push(env.DB.prepare(`UPDATE student_personal_books SET question_count=?,status=?,config_json=json_set(config_json,'$.shortages',json(?)),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(total, status, JSON.stringify(shortages), id));
  await env.DB.batch(st);
  return { id, outcomeCount: gaps.length, questionCount: total, status, shortages };
}

/**
 * Grades the student's answers for a book. Only practice items of that book; an item already answered keeps its
 * first answer (the key is in the book, so a second try would not be evidence). Blank answers stay unanswered.
 */
export async function gradeDejavuAnswers(env: Env, bookId: string, studentId: string, answers: unknown) {
  const list = Array.isArray(answers) ? answers : [];
  const given = new Map<string, string>();
  for (const a of list) { const k = String((a as any)?.itemId || ''); const v = String((a as any)?.answer ?? '').trim().toLocaleUpperCase('tr-TR'); if (k && /^[A-E]$/.test(v)) given.set(k, v); }
  const items = await all<any>(env.DB.prepare(`SELECT i.id,i.student_answer,q.correct_answer FROM student_personal_book_items i JOIN student_personal_books b ON b.id=i.book_id
    LEFT JOIN question_bank q ON q.id=i.bank_question_id WHERE i.book_id=? AND b.student_id=? AND i.item_type='PRACTICE_QUESTION'`).bind(bookId, studentId));
  const st: D1PreparedStatement[] = [];
  let newly = 0;
  for (const it of items) {
    const a = given.get(it.id); if (!a || it.student_answer) continue;
    const ok = a === String(it.correct_answer || '').trim().toUpperCase() ? 1 : 0;
    st.push(env.DB.prepare(`UPDATE student_personal_book_items SET student_answer=?,correct=?,answered_at=CURRENT_TIMESTAMP WHERE id=? AND student_answer IS NULL`).bind(a, ok, it.id));
    newly++;
  }
  if (st.length) await env.DB.batch(st);
  const sum = await one<any>(env.DB.prepare(`SELECT count(*) total,sum(CASE WHEN student_answer IS NOT NULL THEN 1 ELSE 0 END) answered,sum(COALESCE(correct,0)) correct FROM student_personal_book_items WHERE book_id=? AND item_type='PRACTICE_QUESTION'`).bind(bookId));
  return { newlyAnswered: newly, total: Number(sum?.total || 0), answered: Number(sum?.answered || 0), correct: Number(sum?.correct || 0) };
}

/** Everything the Dejavu PDF needs for one book; shared by the student and staff downloads. */
export async function dejavuPrintInput(env:Env,bookId:string,origin:string,answerKey:'APPEND'|'NONE'):Promise<{error:Response}|{book:any;input:DejavuPrint}>{
 const fail=(status:number,code:string,message:string)=>json({ok:false,error:{code,message}},status);
 const book=await one<any>(env.DB.prepare(`SELECT b.*,st.first_name,st.last_name,i.name institution_name FROM student_personal_books b JOIN student_entities st ON st.id=b.student_id LEFT JOIN institutions i ON i.id=b.institution_id WHERE b.id=?`).bind(bookId));
 if(!book)return {error:fail(404,'BOOK_NOT_FOUND','Kişiye Özel Kitap bulunamadı.')};
 const items=await all<any>(env.DB.prepare(`SELECT i.item_type,i.outcome_id,i.bank_question_id,i.payload_json,i.solution_code,q.review_status,q.copyright_status FROM student_personal_book_items i LEFT JOIN question_bank q ON q.id=i.bank_question_id WHERE i.book_id=? ORDER BY i.sort_order`).bind(bookId));
 const cls=await one<any>(env.DB.prepare(`SELECT c.name FROM student_enrollments e LEFT JOIN classes c ON c.id=e.class_id WHERE e.student_id=? AND e.status='ACTIVE' ORDER BY e.created_at DESC LIMIT 1`).bind(book.student_id));
 const sections:DejavuSection[]=[];
 for(const it of items){
  if(it.item_type==='OUTCOME_HEADER'){const p=JSON.parse(it.payload_json||'{}');const short=Number(p.found)<Number(p.wanted)?`Bu kazanımda şimdilik ${p.found} yeni onaylı soru var.`:null;sections.push({heading:[p.subject,p.title].filter(Boolean).join(' · ')||'Kazanım',note:short,items:[]});continue;}
  if(it.item_type!=='PRACTICE_QUESTION')continue;
  if(it.review_status!=='APPROVED'||!['OWNED','LICENSED','PUBLIC_DOMAIN'].includes(it.copyright_status))return {error:fail(409,'BOOK_CONTENT_CHANGED','Kitaptaki bir sorunun onayı veya kullanım hakkı değişti; kitabı yeniden oluşturun.')};
  sections[sections.length-1]?.items.push({questionId:it.bank_question_id,solutionUrl:it.solution_code?`${origin}/dejavu/cozum/${it.solution_code}`:null});
 }
 const filled=sections.filter(x=>x.items.length);if(!filled.length)return {error:fail(409,'BOOK_EMPTY','Kitapta basılabilir soru yok.')};
 const name=[book.first_name,book.last_name].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').replace(/(^|\s)\S/g,(c:string)=>c.toLocaleUpperCase('tr-TR'));
 const date=new Date(String(book.created_at||'').replace(' ','T')+'Z');
 const input:DejavuPrint={title:book.title||'Dejavu · Kişiye Özel Kitabım',studentName:name||'Öğrenci',classLine:[cls?.name||(book.grade_level?`${book.grade_level}. sınıf`:''),book.academic_year].filter(Boolean).join(' · ')||'—',institutionName:book.institution_name||null,dateLabel:Number.isNaN(date.getTime())?'':date.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}),bookUrl:`${origin}/my-books`,sections:filled,answerKey};
 return {book,input};
}

