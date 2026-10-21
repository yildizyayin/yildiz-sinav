/** A083.2: difficulty mix for a Studio document. Bands are the editorial estimate; say so plainly. */
export type Mix = { EASY: number; MEDIUM: number; HARD: number };
export type Bands = Partial<Mix>;
const KEYS = ['EASY', 'MEDIUM', 'HARD'] as const;
const LABEL = { EASY: 'Kolay', MEDIUM: 'Orta', HARD: 'Zor' } as const;
export const MIX_PRESETS: Array<{ id: string; label: string; mix: Mix | null }> = [
  { id: 'ANY', label: 'Fark etmez', mix: null },
  { id: 'BALANCED', label: 'Dengeli · %30 / %50 / %20', mix: { EASY: 30, MEDIUM: 50, HARD: 20 } },
  { id: 'EASY', label: 'Kolay ağırlıklı · %50 / %40 / %10', mix: { EASY: 50, MEDIUM: 40, HARD: 10 } },
  { id: 'HARD', label: 'Zor ağırlıklı · %15 / %45 / %40', mix: { EASY: 15, MEDIUM: 45, HARD: 40 } },
  { id: 'CUSTOM', label: 'Özel', mix: null },
];

export function mixTargets(total: number, mix: Mix): Mix {
  const raw = KEYS.map(k => ({ k, exact: total * mix[k] / 100 }));
  const out = { EASY: 0, MEDIUM: 0, HARD: 0 } as Mix; let used = 0;
  for (const r of raw) { out[r.k] = Math.floor(r.exact); used += out[r.k]; }
  raw.sort((x, y) => (y.exact - Math.floor(y.exact)) - (x.exact - Math.floor(x.exact)) || KEYS.indexOf(x.k) - KEYS.indexOf(y.k));
  for (let i = 0; used < total; i++, used++) out[raw[i % raw.length].k]++;
  return out;
}
export const mixSum = (m: Mix) => m.EASY + m.MEDIUM + m.HARD;
export function mixProblem(mix: Mix | null, total: number, bands: Bands | null): string {
  if (!mix) return '';
  if (mixSum(mix) !== 100) return `Zorluk yüzdelerinin toplamı 100 olmalı (şu an ${mixSum(mix)}).`;
  if (!bands) return '';
  const t = mixTargets(total, mix); const short = KEYS.filter(k => t[k] > Number(bands[k] || 0));
  return short.length ? `Zorluk karışımı karşılanamıyor: ${short.map(k => `${LABEL[k]} ${t[k]} gerekli, ${Number(bands[k] || 0)} var`).join('; ')}.` : '';
}

export function StudioDifficultyMix({ preset, mix, onChange, total, bands }: { preset: string; mix: Mix | null; onChange: (preset: string, mix: Mix | null) => void; total: number; bands: Bands | null }) {
  const targets = mix && mixSum(mix) === 100 ? mixTargets(total, mix) : null;
  return <div className="studio-mix">
    <label>Zorluk karışımı<select value={preset} onChange={e => { const p = MIX_PRESETS.find(x => x.id === e.target.value)!; onChange(p.id, p.id === 'CUSTOM' ? (mix || { EASY: 30, MEDIUM: 50, HARD: 20 }) : p.mix); }}>
      {MIX_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    {preset === 'CUSTOM' && mix && <div className="studio-mix-custom">{KEYS.map(k => <label key={k}>{LABEL[k]} %<input type="number" min={0} max={100} value={mix[k]} onChange={e => onChange('CUSTOM', { ...mix, [k]: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })} /></label>)}</div>}
    <div className="studio-mix-bands">{KEYS.map(k => { const need = targets?.[k]; const have = bands ? Number(bands[k] || 0) : null; const short = need !== undefined && have !== null && need > have;
      return <span key={k} className={short ? 'short' : ''}><b>{LABEL[k]}</b>{need !== undefined ? ` ${need} soru` : ''}{have !== null ? ` · stok ${have}` : ''}</span>; })}</div>
    <small className="muted">Zorluk, sorunun editoryal tahminidir; henüz öğrenci cevaplarından ölçülmüş zorluk verisi yok.</small>
  </div>;
}
