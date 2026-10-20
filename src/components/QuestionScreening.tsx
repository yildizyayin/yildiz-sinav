import { ShieldAlert, ShieldCheck } from 'lucide-react';

/** A081: the independent verifier's own scores as a reading aid. Never an approval. */
export const screeningLabels: Record<string, string> = {
  outcomeAlignment: 'Kazanım uyumu', reasoningDemand: 'Akıl yürütme', distractorQuality: 'Çeldiriciler',
  languageAndFairness: 'Dil ve adalet', visualConsistency: 'Görsel tutarlılık', originalityDesign: 'Özgünlük',
};
export const SUSPICION_THRESHOLD = 3;

export function orderForReview<T extends { review_status?: string; screening?: any }>(questions: T[], enabled: boolean): T[] {
  if (!enabled) return questions;
  const rank = (q: T) => q.review_status !== 'REVIEW' ? -1 : q.screening ? Number(q.screening.suspicion) : 0;
  return questions.map((q, i) => ({ q, i })).sort((a, b) => (rank(b.q) - rank(a.q)) || (a.i - b.i)).map(x => x.q);
}

export function ScreeningTag({ screening }: { screening?: any }) {
  if (!screening) return null;
  const suspicious = Number(screening.suspicion) >= SUSPICION_THRESHOLD;
  const weak = (screening.weakest || []).map((k: string) => screeningLabels[k] || k).join(', ');
  const title = [`Bağımsız kontrol puanı ${screening.total}/${screening.max}`, weak ? `En zayıf: ${weak}` : '', screening.rationale || ''].filter(Boolean).join('\n');
  return <em className={`tag screening ${suspicious ? 'suspicious' : 'clean'}`} title={title}>
    {suspicious ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />} Kontrol {screening.total}/{screening.max}{suspicious && weak ? ` · ${weak}` : ''}
  </em>;
}
