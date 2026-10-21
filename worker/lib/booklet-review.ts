import type { CanonicalRecord } from '../types';
import { evaluateAnswer } from './answer-evaluation';
import { calculateOverall, calculateSubjectScore } from './scoring';

export const isBookletIssue = (issue: string): boolean => issue.startsWith('Kitapçık:') || /^KRİTİK: (Geçersiz kitapçık|Kitapçık belirlenemedi)/.test(issue);

export function bookletIssue(code: string | undefined, allowedCodes: string[]): string | null {
  const normalized = (code || '').trim().toUpperCase();
  if (!normalized && allowedCodes.length > 1) return 'Kitapçık: işaretlenmemiş; elle seçin.';
  if (normalized && !allowedCodes.includes(normalized)) return `Kitapçık: geçersiz kod (${normalized}); elle seçin.`;
  return null;
}

type Subject = { subject_id: string; code: string; question_count: number; wrong_divisor: number };
type Key = { subject_id: string; booklet_code: string; question_no: number; correct_answer: string; printed_question_no?: number; accepted_answers?: string | null; question_status?: string };
export function compareBooklets(record: CanonicalRecord, codes: string[], subjects: Subject[], keys: Key[], wrongDivisorFor: (subject: Subject) => number = (subject) => Number(subject.wrong_divisor)) {
  return codes.map((code) => {
    const subjectScores = [];
    let incomplete = false;
    for (const subject of subjects) {
      if (!Object.prototype.hasOwnProperty.call(record.answers_by_subject || {}, subject.code)) continue;
      // A028b: a test read from the other session's sheet keeps that sheet's booklet.
      const subjectCode = String(record.booklet_by_subject?.[subject.code] || code).toUpperCase();
      const subjectKeys = keys.filter((key) => key.subject_id === subject.subject_id && key.booklet_code === subjectCode);
      const answers = record.answers_by_subject[subject.code] || '';
      // A027: the n-th answer on the sheet belongs to the n-th printed question of the test, exactly as the
      // evaluation reads it. Looking keys up by number 1..n wrongly called a test starting at question 41
      // "cevap anahtarı eksik".
      const ordered = [...subjectKeys].sort((a, b) => Number(a.printed_question_no ?? a.question_no) - Number(b.printed_question_no ?? b.question_no));
      if (ordered.length !== Number(subject.question_count) || ordered.some((key) => !key.correct_answer)) incomplete = true;
      let correct = 0, wrong = 0, blank = 0, activeQuestionCount = 0;
      for (let i = 0; i < Number(subject.question_count); i++) {
        const key = ordered[i];
        if (!key) continue;
        const assessed = evaluateAnswer(answers[i], key);
        if (!assessed.contributesToScore) continue;
        activeQuestionCount++;
        if (assessed.status === 'BLANK') blank++;
        else if (assessed.status === 'CORRECT') correct++;
        else wrong++;
      }
      subjectScores.push(calculateSubjectScore({ correct, wrong, blank, wrongDivisor: wrongDivisorFor(subject), questionCount: activeQuestionCount }));
    }
    const available = subjectScores.length > 0 && !incomplete;
    return { code, available, reason: available ? null : incomplete ? 'Cevap anahtarı eksik.' : 'Ders yanıtı bulunamadı.', ...(available ? calculateOverall(subjectScores) : { correct: null, wrong: null, blank: null, net: null }) };
  });
}
