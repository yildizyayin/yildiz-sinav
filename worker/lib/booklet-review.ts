import type { CanonicalRecord } from '../types';
import { calculateOverall, calculateSubjectScore } from './scoring';

export const isBookletIssue = (issue: string): boolean => issue.startsWith('Kitapçık:') || /^KRİTİK: (Geçersiz kitapçık|Kitapçık belirlenemedi)/.test(issue);

export function bookletIssue(code: string | undefined, allowedCodes: string[]): string | null {
  const normalized = (code || '').trim().toUpperCase();
  if (!normalized && allowedCodes.length > 1) return 'Kitapçık: işaretlenmemiş; elle seçin.';
  if (normalized && !allowedCodes.includes(normalized)) return `Kitapçık: geçersiz kod (${normalized}); elle seçin.`;
  return null;
}

type Subject = { subject_id: string; code: string; question_count: number; wrong_divisor: number };
type Key = { subject_id: string; booklet_code: string; question_no: number; correct_answer: string };
export function compareBooklets(record: CanonicalRecord, codes: string[], subjects: Subject[], keys: Key[]) {
  return codes.map((code) => {
    const subjectScores = [];
    let incomplete = false;
    for (const subject of subjects) {
      if (!Object.prototype.hasOwnProperty.call(record.answers_by_subject || {}, subject.code)) continue;
      const subjectKeys = keys.filter((key) => key.subject_id === subject.subject_id && key.booklet_code === code);
      const answers = record.answers_by_subject[subject.code] || '';
      const byNumber = new Map(subjectKeys.map((key) => [Number(key.question_no), key.correct_answer]));
      if (Array.from({ length: Number(subject.question_count) }, (_, i) => i + 1).some((n) => !byNumber.get(n))) incomplete = true;
      let correct = 0, wrong = 0, blank = 0;
      for (let i = 0; i < Number(subject.question_count); i++) {
        const answer = (answers[i] || '').toUpperCase();
        if (!answer) blank++;
        else if (answer === String(byNumber.get(i + 1) || '').toUpperCase()) correct++;
        else wrong++;
      }
      subjectScores.push(calculateSubjectScore({ correct, wrong, blank, wrongDivisor: Number(subject.wrong_divisor), questionCount: Number(subject.question_count) }));
    }
    const available = subjectScores.length > 0 && !incomplete;
    return { code, available, reason: available ? null : incomplete ? 'Cevap anahtarı eksik.' : 'Ders yanıtı bulunamadı.', ...(available ? calculateOverall(subjectScores) : { correct: null, wrong: null, blank: null, net: null }) };
  });
}
