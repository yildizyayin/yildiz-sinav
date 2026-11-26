/**
 * Ustalık Yıldızları (owner, 26 Nov 2026: bireysel ilerleme). The six learning stages the karne and teachers already
 * use, shown as three stars, so one rule holds everywhere: started/developing = Tanışma, consolidating = Pekiştirme,
 * learned = Ustalık. A learned outcome whose review is due keeps its stars, dimmed, until a review lights them again.
 */
export const STAR_LABEL = ['Henüz başlamadın', 'Tanışma', 'Pekiştirme', 'Ustalık'];
export function starsOf(stage: string, reviewDue = false) {
  const stars = stage === 'LEARNED' || stage === 'REVIEW_NEEDED' ? 3 : stage === 'CONSOLIDATING' ? 2 : stage === 'STARTED' || stage === 'DEVELOPING' ? 1 : 0;
  return { stars, starsLabel: STAR_LABEL[stars], dim: stars > 0 && (reviewDue || stage === 'REVIEW_NEEDED') };
}
