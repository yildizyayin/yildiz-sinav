import { useEffect, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { api } from '../api';

/** A083.4: ready-made and saved Studio form settings. Templates hold choices only; creating still re-checks every gate. */
export type TemplateConfig = Record<string, any>;
const KIND: Record<string, string> = { TOPIC_SCAN: 'Konu tarama', PRACTICE_EXAM: 'Deneme', HOMEWORK: 'Ödev', REMEDIAL: 'Telafi', OTHER: 'Diğer' };
export const BUILT_IN: Array<{ kind: string; config: TemplateConfig; hint: string }> = [
  { kind: 'TOPIC_SCAN', hint: '10 soru · tek kitapçık · dengeli', config: { documentType: 'WORKSHEET', questionCount: '10', bookletCodes: 'A', deliveryMode: 'PDF_OPTICAL', difficultyMix: { EASY: 30, MEDIUM: 50, HARD: 20 } } },
  { kind: 'PRACTICE_EXAM', hint: '40 soru · A+B · optik', config: { documentType: 'PRACTICE_EXAM', questionCount: '40', bookletCodes: 'A,B', deliveryMode: 'PDF_OPTICAL', difficultyMix: { EASY: 30, MEDIUM: 50, HARD: 20 } } },
  { kind: 'HOMEWORK', hint: '15 soru · dijital', config: { documentType: 'WORKSHEET', questionCount: '15', bookletCodes: 'A', deliveryMode: 'DIGITAL', difficultyMix: { EASY: 30, MEDIUM: 50, HARD: 20 } } },
  { kind: 'REMEDIAL', hint: '10 soru · kolay ağırlıklı', config: { documentType: 'WORKSHEET', questionCount: '10', bookletCodes: 'A', deliveryMode: 'PDF_OPTICAL', difficultyMix: { EASY: 50, MEDIUM: 40, HARD: 10 } } },
];

export function StudioTemplates({ current, onApply, institutionId, needsInstitution, canShare }: { current: TemplateConfig; onApply: (config: TemplateConfig, label: string) => void; institutionId?: string; needsInstitution: boolean; canShare: boolean }) {
  const [saved, setSaved] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('TOPIC_SCAN');
  const [shared, setShared] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const scope = institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : '';
  const load = () => { if (needsInstitution && !institutionId) { setSaved([]); return; } api<any>(`/api/platform/studio/templates${scope}`).then(r => setSaved(r.templates || [])).catch(() => setSaved([])); };
  useEffect(load, [institutionId, needsInstitution]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setStatus(null);
    try { await api('/api/platform/studio/templates', { method: 'POST', body: JSON.stringify({ name, kind, shared: canShare && shared, config: current, institutionId }) }); setStatus({ kind: 'ok', text: `"${name}" şablonu kaydedildi.` }); setName(''); setOpen(false); load(); }
    catch (e: any) { setStatus({ kind: 'error', text: e?.message || 'Şablon kaydedilemedi.' }); }
  };
  const remove = async (t: any) => { try { await api(`/api/platform/studio/templates/${encodeURIComponent(t.id)}`, { method: 'DELETE' }); load(); } catch (e: any) { setStatus({ kind: 'error', text: e?.message || 'Şablon silinemedi.' }); } };
  return <div className="studio-templates">
    <div className="studio-template-row"><span className="eyebrow">Hazır şablon</span>{BUILT_IN.map(t => <button key={t.kind} type="button" className="studio-template-chip" onClick={() => onApply(t.config, KIND[t.kind])}><strong>{KIND[t.kind]}</strong><small>{t.hint}</small></button>)}</div>
    {saved.length > 0 && <div className="studio-template-row"><span className="eyebrow">Kaydedilenler</span>{saved.map(t => <span key={t.id} className="studio-template-chip saved"><button type="button" onClick={() => onApply(t.config, t.name)}><strong>{t.name}</strong><small>{KIND[t.kind] || t.kind}{t.shared ? ' · kurumla paylaşılan' : ''}</small></button>{t.mine && <button type="button" className="link-button" aria-label={`${t.name} şablonunu sil`} onClick={() => void remove(t)}>Sil</button>}</span>)}</div>}
    <div className="studio-template-row">
      {!open ? <button type="button" className="link-button" onClick={() => setOpen(true)}><Bookmark size={13} /> Bu ayarları şablon olarak kaydet</button> :
        <div className="studio-template-save"><input aria-label="Şablon adı" placeholder="Şablon adı" value={name} maxLength={80} onChange={e => setName(e.target.value)} /><select aria-label="Şablon türü" value={kind} onChange={e => setKind(e.target.value)}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>{canShare && <label className="check"><input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} /> Kurumla paylaş</label>}<button type="button" className="secondary subtle" disabled={!name.trim() || (needsInstitution && !institutionId)} onClick={() => void save()}>Kaydet</button><button type="button" className="link-button" onClick={() => setOpen(false)}>Vazgeç</button></div>}
      {status && <span className={`studio-template-status ${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</span>}
    </div>
  </div>;
}
