import { columnsOf, f2, pctOf, type Bundle, type Inst } from './shared';

/**
 * S034 Nibiru notes on the report cards. Brand rule: Nibiru listens to verified data, analyses, suggests and directs;
 * without data it does not guess. Every sentence here is a comparison or a ranking of this exam's saved results.
 */
const pts = (x: number) => `${x > 0 ? '+' : ''}${x} puan`;
function diffs(b: Bundle, own: any, ref: any) {
  return columnsOf(b, 'NET').filter((c) => c.q > 0 && own?.cols?.[c.key] && ref?.cols?.[c.key])
    .map((c) => ({ name: c.name, own: pctOf(own.cols[c.key].n, c.q), diff: pctOf(own.cols[c.key].n, c.q) - pctOf(ref.cols[c.key].n, c.q) }));
}
const list = (xs: Array<{ name: string; diff: number }>) => xs.map((x) => `${x.name} (${pts(x.diff)})`).join(', ');
const focusTopics = (topics: any[], n: number) => topics.filter((t) => t.s >= 2 && t.p < 50).sort((a, b) => a.p - b.p || b.s - a.s).slice(0, n);

export function groupAdvice(b: Bundle, own: any, ref: any, refLabel: string, topics: any[], extra: string[] = []): string[] {
  const d = diffs(b, own, ref), out: string[] = [];
  const strong = d.filter((x) => x.diff >= 3).sort((a, b) => b.diff - a.diff).slice(0, 2);
  const weak = d.filter((x) => x.diff <= -3).sort((a, b) => a.diff - b.diff).slice(0, 2);
  if (strong.length) out.push(`${refLabel} ortalamasının en çok üzerinde: ${list(strong)}.`);
  if (weak.length) out.push(`${refLabel} ortalamasının en çok altında: ${list(weak)} — ilk çalışma önceliği bu testler.`);
  else if (d.length) out.push(`Hiçbir testte ${refLabel.toLocaleLowerCase('tr-TR')} ortalamasının belirgin altında değil.`);
  const focus = focusTopics(topics, 4);
  if (focus.length) out.push(`Başarısı %50'nin altındaki kazanımlar: ${focus.map((t) => `${t.topic} (%${t.p})`).join(', ')}.`);
  return [...out, ...extra];
}

export function schoolAdvice(b: Bundle, inst: Inst): string[] {
  const extra: string[] = [];
  const key = b.primary, t = b.scoreTypes[0];
  const cls = (inst.classes as any[]).filter((c) => c.avg.count > 0 && c.avg.scores[key] != null);
  if (cls.length >= 2) {
    const sorted = cls.slice().sort((a, b) => b.avg.scores[key] - a.avg.scores[key]);
    const hi = sorted[0], lo = sorted[sorted.length - 1];
    extra.push(`Şubeler arası fark: ${hi.name} (${f2(hi.avg.scores[key])}) ile ${lo.name} (${f2(lo.avg.scores[key])}) arasında ${f2(hi.avg.scores[key] - lo.avg.scores[key])} ${t.isScore ? 'puan' : 'net'}.`);
  }
  const below = (inst.items as any[]).filter((q) => q.school.n >= 5 && q.general.n > 0 && q.school.p <= q.general.p - 15);
  if (below.length) extra.push(`${below.length} soruda okulun doğru oranı genelin 15 puan veya daha fazla altında; ayrıntı Madde Analizi'nde.`);
  return groupAdvice(b, inst.avg, b.general.avg, 'Genel', inst.topics, extra);
}

export function classAdvice(b: Bundle, inst: Inst, c: any): string[] {
  return groupAdvice(b, c.avg, inst.avg, 'Okul', c.topics);
}

export function studentAdvice(b: Bundle, inst: Inst, s: any): string[] {
  const out: string[] = [];
  const own = { cols: s.cols };
  const d = diffs(b, own, inst.avg);
  const strong = d.filter((x) => x.diff >= 10).sort((a, b) => b.diff - a.diff).slice(0, 2);
  const weak = d.filter((x) => x.diff <= -10).sort((a, b) => a.diff - b.diff).slice(0, 3);
  if (strong.length) out.push(`Okul ortalamasının üzerinde olduğun testler: ${list(strong)}. Bu düzeyi korumak için haftalık kısa tekrar yeterli.`);
  if (weak.length) out.push(`Okul ortalamasının altında kaldığın testler: ${list(weak)}. Önce bu testlere zaman ayır.`);
  const schoolP = new Map((inst.topics as any[]).map((t) => [`${t.subjectId}|${t.section}|${t.topic}`, t.p]));
  const focus = focusTopics(s.topics || [], 5);
  if (focus.length) out.push(`Öncelikli kazanımlar: ${focus.map((t) => { const sp = schoolP.get(`${t.subjectId}|${t.section}|${t.topic}`) as number | undefined; return `${t.topic} (sen %${t.p}${sp != null ? `, okul %${sp}` : ''})`; }).join('; ')}.`);
  if (s.total.b >= 10 && s.total.b > 2 * s.total.y) out.push(`Boş bıraktığın soru sayısı (${s.total.b}) yanlışlarının (${s.total.y}) iki katından fazla; emin olduğun konularda soruyu sonuna kadar çözmeyi dene.`);
  if (s.total.y > 0 && s.total.y >= s.total.d / 2) out.push(`Yanlış sayın (${s.total.y}) netini belirgin düşürüyor; çözdüğün soruları kontrol etmek için süre ayır.`);
  if (s.tytSource === 'SCHOOL') out.push('Kendi TYT sonucun eşleşmediği için alan puanların okulunun TYT ortalamasıyla hesaplandı.');
  return out;
}
