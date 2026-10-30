import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../api';

/**
 * KVKK veri işleyenler (30 Oct): the Super Admin records the evidence for each external service and approves it.
 * Nibiru's AI (and any service behind the KVKK gate) receives personal data only when its record is approved here.
 */
const DPA: Record<string, string> = { MISSING: 'Yok', UNDER_REVIEW: 'İncelemede', SIGNED: 'İmzalı / kabul edildi', NOT_APPLICABLE: 'Gerekmiyor' };
const TRAINING: Record<string, string> = { UNKNOWN: 'Bilinmiyor', DISABLED: 'Hayır, eğitimde kullanılmıyor', ENABLED: 'Evet, eğitimde kullanılıyor', NOT_APPLICABLE: 'Uygulanmaz' };
const LEGAL: Record<string, string> = { PENDING: 'Beklemede', APPROVED: 'Onaylandı', REJECTED: 'Reddedildi', NOT_APPLICABLE: 'Gerekmiyor' };
const MECH: Record<string, string> = { TBD: 'Belirlenmedi', NOT_CROSS_BORDER: 'Yurt dışı aktarım yok', ADEQUACY: 'Yeterlilik kararı', STANDARD_CONTRACT: 'Standart sözleşme', BINDING_CORPORATE_RULES: 'Bağlayıcı şirket kuralları', UNDERTAKING_APPROVAL: 'Taahhütname (Kurul izni)', EXCEPTIONAL_CASE: 'Arızi aktarım' };
const XSTATUS: Record<string, string> = { DRAFT: 'Taslak', LEGAL_REVIEW: 'Hukuki incelemede', ACTIVE: 'Etkin', SUSPENDED: 'Askıda', RETIRED: 'Kullanım dışı' };
const opts = (m: Record<string, string>) => Object.entries(m).map(([k, v]) => <option key={k} value={k}>{v}</option>);
const cats = (j: string) => { try { return (JSON.parse(j || '[]') as string[]).join(', '); } catch { return ''; } };

export function PrivacyProcessors() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const load = () => api<any>('/api/admin/privacy/processor-registry').then((r) => setItems(r.items || [])).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const done = (msg: string) => { setNotice(msg); setError(''); void load(); };
  return <>
    <div className="page-head"><div><span className="eyebrow">KVKK</span><h1>Veri işleyenler ve yurt dışı aktarım</h1><p>Kişisel veri gönderilen her dış servis burada kayıtlıdır. Bir servis öğrenci verisini ancak kaydı tamamlanıp sizin tarafınızdan onaylandığında alır. Nibiru'nun yapay zekâ yanıtları "NIBIRU_AI" kaydına bağlıdır. Her değişiklik dayanağıyla birlikte denetim kaydına yazılır.</p></div><ShieldCheck /></div>
    <div className="alert info" role="note">Bu ekran hukuki görüş yerine geçmez. DPA, model eğitimi ve aktarım dayanağı bilgisini belgesine bakarak girin; emin değilseniz kaydı "Beklemede" bırakın.</div>
    {error && <div className="alert error" role="alert">{error}</div>}{notice && <div className="alert success" role="status">{notice}</div>}
    <div className="kvkk-proc-list">{items.map((it) => <section key={it.processor.id} className={`panel kvkk-proc ${it.ready ? 'ready' : 'blocked'}`}>
      <div className="kvkk-proc-head"><div><h2>{it.processor.provider_name} · {it.processor.service_name}</h2><p className="muted">{it.processor.service_code} · {it.processor.purpose}</p></div>
        <span className={`kvkk-badge ${it.processor.active ? (it.ready ? 'ok' : 'bad') : 'off'}`}>{!it.processor.active ? 'Pasif' : it.ready ? 'Veri gönderilebilir' : 'Veri gönderilmez'}</span></div>
      <dl className="kvkk-facts"><div><dt>DPA</dt><dd>{DPA[it.processor.dpa_status]}</dd></div><div><dt>Verilerle model eğitimi</dt><dd>{TRAINING[it.processor.training_on_customer_data]}</dd></div><div><dt>Hukuki inceleme</dt><dd>{LEGAL[it.processor.legal_review_status]}</dd></div><div><dt>Aktarım</dt><dd>{it.transfers.length ? it.transfers.map((t: any) => `${MECH[t.transfer_mechanism]} · ${XSTATUS[t.status]}`).join('; ') : 'Kayıt yok'}</dd></div></dl>
      {it.processor.active && !it.ready && <ul className="kvkk-blockers">{it.blockers.map((b: string) => <li key={b}>{b}</li>)}</ul>}
      <button type="button" className="secondary" aria-expanded={open === it.processor.id} onClick={() => setOpen(open === it.processor.id ? null : it.processor.id)}>{open === it.processor.id ? 'Kapat' : 'Kaydı düzenle'}</button>
      {open === it.processor.id && <><ProcessorForm item={it} onDone={done} onError={setError} />
        {it.transfers.map((t: any) => <TransferForm key={t.id} processorId={it.processor.id} transfer={t} onDone={done} onError={setError} />)}
        <TransferForm processorId={it.processor.id} transfer={null} onDone={done} onError={setError} /></>}
    </section>)}</div>
  </>;
}

function Evidence({ value, onChange, confirm, setConfirm, needsConfirm }: { value: string; onChange: (v: string) => void; confirm: boolean; setConfirm: (v: boolean) => void; needsConfirm: boolean }) {
  return <>
    <label className="kvkk-wide">Dayanak (zorunlu)<textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ör. Cloudflare DPA, hesapta kabul tarihi; Workers AI gizlilik belgesi bağlantısı; hukuki görüş no" /></label>
    {needsConfirm && <label className="kvkk-confirm"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /><span>Bu kaydı onaylıyorum. Onaydan sonra bu servise öğrenci verisi gönderilebilir.</span></label>}
  </>;
}

function ProcessorForm({ item, onDone, onError }: { item: any; onDone: (m: string) => void; onError: (m: string) => void }) {
  const p = item.processor;
  const [f, setF] = useState({ dpaStatus: p.dpa_status, trainingOnCustomerData: p.training_on_customer_data, legalReviewStatus: p.legal_review_status, processingRegion: p.processing_region || '', retentionNote: p.retention_note || '' });
  const [evidence, setEvidence] = useState(''); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  const approving = f.legalReviewStatus === 'APPROVED' && p.legal_review_status !== 'APPROVED';
  const save = async () => { setBusy(true); try { await api(`/api/admin/privacy/processors/${p.id}`, { method: 'POST', body: JSON.stringify({ ...f, evidence, confirmApproval: confirm }) }); setEvidence(''); setConfirm(false); onDone(`${p.service_code} kaydı güncellendi.`); } catch (e: any) { onError(e.message); } finally { setBusy(false); } };
  return <div className="kvkk-form"><h3>Veri işleyen bilgisi</h3><div className="form-grid">
    <label>DPA (veri işleme sözleşmesi)<select value={f.dpaStatus} onChange={(e) => setF({ ...f, dpaStatus: e.target.value })}>{opts(DPA)}</select></label>
    <label>Verilerle model eğitimi<select value={f.trainingOnCustomerData} onChange={(e) => setF({ ...f, trainingOnCustomerData: e.target.value })}>{opts(TRAINING)}</select></label>
    <label>Hukuki inceleme<select value={f.legalReviewStatus} onChange={(e) => setF({ ...f, legalReviewStatus: e.target.value })}>{opts(LEGAL)}</select></label>
    <label>İşleme bölgesi<input value={f.processingRegion} onChange={(e) => setF({ ...f, processingRegion: e.target.value })} placeholder="Ör. Cloudflare küresel ağı" /></label>
    <label className="kvkk-wide">Saklama notu<input value={f.retentionNote} onChange={(e) => setF({ ...f, retentionNote: e.target.value })} placeholder="Ör. Standart istekte girdi/çıktı saklanmaz" /></label>
    <Evidence value={evidence} onChange={setEvidence} confirm={confirm} setConfirm={setConfirm} needsConfirm={approving} />
  </div><button type="button" className="primary" disabled={busy || evidence.trim().length < 10 || (approving && !confirm)} onClick={() => void save()}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button></div>;
}

function TransferForm({ processorId, transfer, onDone, onError }: { processorId: string; transfer: any; onDone: (m: string) => void; onError: (m: string) => void }) {
  const t = transfer || {};
  const [f, setF] = useState({ destination: t.destination_country_or_region || '', dataCategories: cats(t.data_categories_json), subjectCategories: cats(t.subject_categories_json), mechanism: t.transfer_mechanism || 'TBD', agreementReference: t.agreement_reference || '', signedAt: t.signed_at || '', authorityNotifiedAt: t.authority_notified_at || '', status: t.status || 'DRAFT', minimizationNote: t.minimization_note || '' });
  const [evidence, setEvidence] = useState(''); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  const activating = f.status === 'ACTIVE' && t.status !== 'ACTIVE';
  const save = async () => { setBusy(true); try { await api(`/api/admin/privacy/transfers${transfer ? `/${transfer.id}` : ''}`, { method: 'POST', body: JSON.stringify({ ...f, processorId, signedAt: f.signedAt || null, authorityNotifiedAt: f.authorityNotifiedAt || null, evidence, confirmApproval: confirm }) }); setEvidence(''); setConfirm(false); onDone(transfer ? 'Aktarım kaydı güncellendi.' : 'Aktarım kaydı eklendi.'); } catch (e: any) { onError(e.message); } finally { setBusy(false); } };
  return <div className="kvkk-form"><h3>{transfer ? `Aktarım kaydı · ${XSTATUS[t.status]}` : 'Yeni aktarım kaydı'}</h3><div className="form-grid">
    <label>Aktarım dayanağı<select value={f.mechanism} onChange={(e) => setF({ ...f, mechanism: e.target.value })}>{opts(MECH)}</select></label>
    <label>Durum<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{opts(XSTATUS)}</select></label>
    <label>Gidilen ülke/bölge<input value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} /></label>
    <label>Dayanak belge adı / no<input value={f.agreementReference} onChange={(e) => setF({ ...f, agreementReference: e.target.value })} /></label>
    <label>Veri kategorileri (virgülle)<input value={f.dataCategories} onChange={(e) => setF({ ...f, dataCategories: e.target.value })} placeholder="Akademik sonuç, soru metni" /></label>
    <label>İlgili kişi grupları (virgülle)<input value={f.subjectCategories} onChange={(e) => setF({ ...f, subjectCategories: e.target.value })} placeholder="Öğrenci, veli, öğretmen" /></label>
    {f.mechanism === 'STANDARD_CONTRACT' && <><label>İmza tarihi<input type="date" value={f.signedAt} onChange={(e) => setF({ ...f, signedAt: e.target.value })} /></label>
      <label>Kurul'a bildirim tarihi<input type="date" value={f.authorityNotifiedAt} onChange={(e) => setF({ ...f, authorityNotifiedAt: e.target.value })} /><small className="field-help">Standart sözleşme imzadan sonra 5 iş günü içinde Kurul'a bildirilir.{t.authority_notification_due_at ? ` Son gün: ${t.authority_notification_due_at}.` : ''}</small></label></>}
    <label className="kvkk-wide">Veri en aza indirme notu<input value={f.minimizationNote} onChange={(e) => setF({ ...f, minimizationNote: e.target.value })} placeholder="Ör. Ad, T.C. no ve iletişim bilgisi gönderilmez" /></label>
    <Evidence value={evidence} onChange={setEvidence} confirm={confirm} setConfirm={setConfirm} needsConfirm={activating} />
  </div><button type="button" className="primary" disabled={busy || evidence.trim().length < 10 || (activating && !confirm)} onClick={() => void save()}>{busy ? 'Kaydediliyor…' : transfer ? 'Kaydet' : 'Ekle'}</button></div>;
}
