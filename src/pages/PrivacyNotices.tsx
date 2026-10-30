import { useEffect, useState } from 'react';
import { FileText, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../api';

const AUDIENCES: Record<string, string> = { STUDENT: 'Öğrenci', PARENT: 'Veli', TEACHER: 'Öğretmen', GUIDANCE_TEACHER: 'Rehber öğretmen', INSTITUTION_MANAGER: 'Kurum yöneticisi', PLATFORM_STAFF: 'Platform personeli' };
const STATUS: Record<string, string> = { DRAFT: 'Taslak', LEGAL_REVIEW: 'Hukuk incelemesinde', ACTIVE: 'Yayında', RETIRED: 'Kaldırıldı' };

/** A starting point only. Marked as a draft; it must be completed and approved by a lawyer before publication. */
function template(audience: string) {
  const who = AUDIENCES[audience] || 'Kullanıcı';
  return `TASLAK — Hukuk incelemesinden geçmeden yayımlanmaz.

KİŞİSEL VERİLERİN İŞLENMESİNE İLİŞKİN AYDINLATMA METNİ (${who})

1. Veri sorumlusu
[Veri sorumlusunun unvanı, adresi, MERSİS no, iletişim e-postası]

2. İşlenen kişisel veriler
[Kimlik (ad soyad, öğrenci no), iletişim (telefon, e-posta), eğitim ve sınav sonuçları, işlem güvenliği (giriş kayıtları) — kategori bazında yazılacak]

3. İşleme amaçları
[Ölçme-değerlendirme ve raporlama, eğitim hizmetinin yürütülmesi, veli bilgilendirme, bilgi güvenliği, mevzuattan doğan yükümlülükler]

4. Hukuki sebepler (KVKK m. 5–6)
[Sözleşmenin ifası, hukuki yükümlülük, meşru menfaat; açık rızaya dayanan işlemler ayrıca belirtilir]

5. Aktarım
[Kurum, veli, hizmet sağlayıcılar (barındırma: Cloudflare; SMS: Netgsm; e-posta: …). Yurt dışına aktarım ve dayanağı (standart sözleşme) belirtilecek]

6. Toplama yöntemi
[Kurum tarafından yükleme, optik form, uygulama içi giriş, SMS doğrulama]

7. Saklama süresi
[Saklama ve imha politikasına atıf]

8. Haklarınız (KVKK m. 11)
Bilgi talep etme, düzeltme, silme, itiraz ve diğer haklarınız için [başvuru kanalı] üzerinden başvurabilirsiniz.`;
}

/** S047: Super Admin manages KVKK aydınlatma metinleri: draft → legal review → publish (one active per audience). */
export function PrivacyNotices() {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ audience: 'STUDENT', version: '1.0', title: 'Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni', body: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = () => api<any>('/api/admin/privacy/notices').then((r) => setRows(r.items || [])).catch((e) => setError(e instanceof ApiError ? e.message : 'Liste yüklenemedi.'));
  useEffect(() => { void load(); }, []);
  const run = async (path: string, body: unknown, ok: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await api(path, { method: 'POST', body: JSON.stringify(body) }); setNotice(ok); await load(); return true; }
    catch (e) { setError(e instanceof ApiError ? e.message : 'İşlem tamamlanamadı.'); return false; }
    finally { setBusy(false); }
  };
  const create = async (e: React.FormEvent) => { e.preventDefault(); if (await run('/api/admin/privacy/notices', form, 'Taslak kaydedildi.')) setForm((f) => ({ ...f, body: '' })); };
  const move = (id: string, status: string, label: string) => { if (status !== 'ACTIVE' || confirm('Bu metin yayımlansın mı? Bu rol için önceki yayındaki metin kaldırılır ve kullanıcılar girişte yeni metni onaylar.')) void run(`/api/admin/privacy/notices/${id}/status`, { status }, label); };

  return <div className="page">
    <div className="page-head"><div><span className="eyebrow">Sistem Yönetimi · KVKK</span><h1>Aydınlatma Metinleri</h1><p className="muted">Her rol için bir metin yayında olur. Kullanıcı girişte metni görür ve "Okudum, bilgilendirildim" ile onaylar; onay kaydı tutulur.</p></div><ShieldCheck size={40} /></div>
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}
    <section className="panel">
      <h2><FileText size={18} /> Yeni sürüm</h2>
      <form className="form-grid" onSubmit={create}>
        <label>Rol<select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>{Object.entries(AUDIENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Sürüm<input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} required /></label>
        <label style={{ gridColumn: '1 / -1' }}>Başlık<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
        <label style={{ gridColumn: '1 / -1' }}>Metin<textarea rows={14} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required /></label>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}><button type="button" className="secondary" onClick={() => setForm({ ...form, body: template(form.audience) })}>Taslak şablonu doldur</button><button className="primary" disabled={busy || !form.body.trim()}>Taslak olarak kaydet</button></div>
      </form>
      <p className="muted">Şablon yalnız başlangıç içindir; köşeli parantezli alanlar avukat tarafından doldurulmalı ve metin hukuk incelemesinden geçmelidir.</p>
    </section>
    <section className="panel">
      <h2>Sürümler</h2>
      <div className="table-card"><table><thead><tr><th>Rol</th><th>Sürüm</th><th>Başlık</th><th>Durum</th><th>Onaylayan kişi</th><th>İşlem</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td>{AUDIENCES[r.audience] || r.audience}</td><td>{r.version}</td><td>{r.title}</td><td>{STATUS[r.status] || r.status}</td><td>{r.receipt_count ?? '—'}</td><td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {r.status === 'DRAFT' && <button className="secondary" disabled={busy} onClick={() => move(r.id, 'LEGAL_REVIEW', 'Hukuk incelemesine gönderildi.')}>Hukuk incelemesine</button>}
          {r.status === 'LEGAL_REVIEW' && <button className="primary" disabled={busy} onClick={() => move(r.id, 'ACTIVE', 'Metin yayımlandı.')}>Hukuk onayladı · yayımla</button>}
          {r.status === 'ACTIVE' && <button className="secondary" disabled={busy} onClick={() => move(r.id, 'RETIRED', 'Metin yayından kaldırıldı.')}>Yayından kaldır</button>}
        </td></tr>)}
        {!rows.length && <tr><td colSpan={6} className="muted">Henüz metin yok.</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
