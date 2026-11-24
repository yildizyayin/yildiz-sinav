/**
 * What a student sees, by grade (owner, 10 Nov 2026). One place for the panel, the worker and Nibiru, so the screens
 * never guess the grade on their own:
 *  - academic target (hedef lise / hedef üniversite) and the exam countdown only for 8 (LGS) and 12 + graduates (YKS);
 *  - every other grade gets its interests (meslekler) instead, with no "this grade cannot…" dead end;
 *  - design group A (4–6), B (7–8), C (9–12) for the age-appropriate look;
 *  - Nibiru's quick questions follow the grade.
 * Curriculum content is not here: outcomes, questions and games come from the database by grade and academic year.
 */
export type DesignGroup = 'A' | 'B' | 'C';
export type GradeProfile = {
  grade: number | null;
  known: boolean;
  designGroup: DesignGroup | null;
  academicTarget: 'LGS_SCHOOL' | 'YKS_PROGRAM' | null;
  academicTargetSlots: number;
  officialExam: 'LGS' | 'YKS' | null;
  countdown: boolean;
  professions: boolean;
  nibiruPrompts: string[];
};

const BASE_PROMPTS = ['Bugün ne çalışayım?', 'Zorlandığım kazanımlar hangileri?', 'Bu soruyu neden yanlış yaptım?', 'Gelişimim nasıl?'];
const YOUNG_PROMPTS = ['Bugün ne çalışayım?', 'Hangi konuda zorlanıyorum?', 'Bana kısa bir tekrar öner', 'Gelişimim nasıl?'];

export function gradeProfile(gradeLevel: unknown, graduated = false): GradeProfile {
  const n = Number(gradeLevel);
  const grade = Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
  if (graduated) return { grade, known: true, designGroup: 'C', academicTarget: 'YKS_PROGRAM', academicTargetSlots: 3, officialExam: 'YKS', countdown: true, professions: true, nibiruPrompts: ['YKS hedefime ne kadar kaldı?', 'Bugün ne çalışayım?', 'Zorlandığım konular hangileri?', 'Gelişimim nasıl?'] };
  if (grade == null) return { grade: null, known: false, designGroup: null, academicTarget: null, academicTargetSlots: 0, officialExam: null, countdown: false, professions: false, nibiruPrompts: BASE_PROMPTS };
  const designGroup: DesignGroup = grade <= 6 ? 'A' : grade <= 8 ? 'B' : 'C';
  if (grade === 8) return { grade, known: true, designGroup, academicTarget: 'LGS_SCHOOL', academicTargetSlots: 1, officialExam: 'LGS', countdown: true, professions: true, nibiruPrompts: ['LGS hedefime ne kadar kaldı?', 'Bugün ne çalışayım?', 'Zorlandığım kazanımlar hangileri?', 'Gelişimim nasıl?'] };
  if (grade === 12) return { grade, known: true, designGroup, academicTarget: 'YKS_PROGRAM', academicTargetSlots: 3, officialExam: 'YKS', countdown: true, professions: true, nibiruPrompts: ['YKS hedefime ne kadar kaldı?', 'Bugün ne çalışayım?', 'Zorlandığım konular hangileri?', 'Gelişimim nasıl?'] };
  return { grade, known: true, designGroup, academicTarget: null, academicTargetSlots: 0, officialExam: null, countdown: false, professions: grade >= 4, nibiruPrompts: designGroup === 'A' ? YOUNG_PROMPTS : BASE_PROMPTS };
}

/** Nibiru's quick questions: the grade's set, led by the student's own weakest outcome when one is known. */
export function nibiruStudentPrompts(profile: GradeProfile, weakOutcomeTitle?: string | null) {
  const title = String(weakOutcomeTitle || '').trim();
  if (!title) return profile.nibiruPrompts;
  const short = title.length > 48 ? `${title.slice(0, 46).trimEnd()}…` : title;
  return [`“${short}” konusunu nasıl güçlendiririm?`, ...profile.nibiruPrompts.filter((p) => p !== 'Zorlandığım kazanımlar hangileri?' && p !== 'Hangi konuda zorlanıyorum?' && p !== 'Zorlandığım konular hangileri?')].slice(0, 4);
}
