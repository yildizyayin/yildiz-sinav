import type { CanonicalRecord, MatchCandidate, MatchResult } from '../types';
import { normalizeName } from './db';

export function matchParticipant(record: CanonicalRecord, candidates: MatchCandidate[]): MatchResult {
  const name = normalizeName(record.name || '');
  if (!name) return { status: 'INVALID', confidence: 0, issues: ['Ad soyad okunamadı.'] };

  const studentNo = (record.student_number || '').trim();
  if (studentNo) {
    const byNo = candidates.filter((c) => (c.student_number || '').trim() === studentNo);
    if (byNo.length === 1) {
      const c = byNo[0];
      const nameScore = c.normalized_name === name ? 1 : similarity(c.normalized_name, name);
      return {
        status: c.status === 'ACTIVE' ? 'ACTIVE_MATCH' : 'GUEST_MATCH',
        student_id: c.student_id,
        confidence: Math.max(0.92, nameScore),
        issues: nameScore < 0.55 ? ['Öğrenci numarası eşleşti ancak ad soyad farklı görünüyor.'] : [],
      };
    }
    if (byNo.length > 1) {
      const exact = byNo.filter((c) => c.normalized_name === name);
      if (exact.length === 1) {
        const c = exact[0];
        return { status: c.status === 'ACTIVE' ? 'ACTIVE_MATCH' : 'GUEST_MATCH', student_id: c.student_id, confidence: 0.99, issues: [] };
      }
      return { status: 'AMBIGUOUS', confidence: 0.4, issues: ['Aynı öğrenci numarasına sahip birden fazla kayıt bulundu.'], candidates: byNo.map((c) => c.student_id) };
    }
  }

  const exactName = candidates.filter((c) => c.normalized_name === name);
  const narrowed = exactName.filter((c) => {
    const gradeOk = record.grade_level == null || c.grade_level == null || c.grade_level === record.grade_level;
    const sectionOk = !record.section || !c.section || c.section.toLocaleUpperCase('tr-TR') === record.section.toLocaleUpperCase('tr-TR');
    return gradeOk && sectionOk;
  });
  if (narrowed.length === 1) {
    const c = narrowed[0];
    return {
      status: c.status === 'ACTIVE' ? 'ACTIVE_MATCH' : 'GUEST_MATCH',
      student_id: c.student_id,
      confidence: studentNo ? 0.86 : 0.82,
      issues: studentNo ? ['Öğrenci numarası bulunamadı; ad soyad ve sınıf ile eşleşti.'] : ['Öğrenci numarası yok; ad soyad ve sınıf ile eşleşti.'],
    };
  }
  if (narrowed.length > 1 || exactName.length > 1) {
    const list = narrowed.length ? narrowed : exactName;
    return { status: 'AMBIGUOUS', confidence: 0.45, issues: ['Aynı ad soyada sahip birden fazla öğrenci bulundu.'], candidates: list.map((c) => c.student_id) };
  }

  return { status: 'NEW_GUEST', confidence: 0.78, issues: ['Kayıtlı öğrenciyle eşleşmedi; misafir katılımcı olarak oluşturulabilir.'] };
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const aParts = new Set(a.split(' '));
  const bParts = new Set(b.split(' '));
  const intersection = [...aParts].filter((x) => bParts.has(x)).length;
  const union = new Set([...aParts, ...bParts]).size;
  return union ? intersection / union : 0;
}
