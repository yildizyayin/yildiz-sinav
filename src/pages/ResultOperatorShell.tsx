import { useEffect, useState } from 'react';
import { api } from '../api';
import { AnunexBrand } from '../components/AnunexBrand';
import { DataCenter } from '../components/DataCenter';
import { InstitutionCardPanel, InstitutionPinIssuer } from '../components/InstitutionClaim';
import { collectAccessCodePages } from '../lib/access-code-pages';
import { ResultOperatorWorkspace, ResultReportsPanel } from './ResultOperatorWorkspace';
import '../components/report-center.css';
import './result-operator-shell.css';

/**
 * S036 operator menu (owner decision 27 Oct, design "Sol menü · rol bazında"):
 * Bayi — Ana sayfa · Sınav yükleme · Rapor/Veri/Belge Merkezi · Kurum listesi · Giriş PIN'leri · Profil.
 * Kurum — Ana sayfa · Sınav yükleme · Rapor/Veri/Belge Merkezi · Erişim kartları · Kurum bilgileri · Profil.
 */
type Role = 'INSTITUTION' | 'DEALER';
type Section = 'home' | 'upload' | 'reports' | 'data' | 'docs' | 'schools' | 'pins' | 'cards' | 'school' | 'profile';
const when = (s: string) => new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function ResultOperatorShell({ role, access, operator, onLogout }: { role: Role; access: any; operator: any; onLogout: () => void }) {
  const [section, setSection] = useState<Section>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { const go = () => setSection('reports'); window.addEventListener('anunex:toplu-open', go); return () => window.removeEventListener('anunex:toplu-open', go); }, []);
  const groups: Array<[string | null, Array<[Section, string, string?]>]> = role === 'DEALER'
    ? [[null, [['home', 'Ana sayfa', 'bölge özeti']]], ['SINAVLAR', [['upload', 'Sınav yükleme', 'TXT/DAT']]], ['ÇIKTILAR', [['reports', 'Rapor Merkezi'], ['data', 'Veri Merkezi'], ['docs', 'Belge Merkezi']]], ['KURUMLARIM', [['schools', 'Kurum listesi'], ['pins', "Giriş PIN'leri"]]], ['HESAP', [['profile', 'Profil ve parola']]]]
    : [[null, [['home', 'Ana sayfa', 'son sınav']]], ['SINAVLAR', [['upload', 'Sınav yükleme', 'TXT/DAT']]], ['ÇIKTILAR', [['reports', 'Rapor Merkezi'], ['data', 'Veri Merkezi'], ['docs', 'Belge Merkezi']]], ['ÖĞRENCİLER', [['cards', 'Erişim kartları']]], ['HESAP', [['school', 'Kurum bilgileri'], ['profile', 'Profil ve parola']]]];
  const go = (s: Section) => { setSection(s); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return <div className="osh">
    <aside className={`osh-side ${menuOpen ? 'open' : ''}`} aria-label={role === 'DEALER' ? 'Bayi menüsü' : 'Kurum menüsü'}>
      <div className="osh-brand"><AnunexBrand compact inverse /></div>
      <button type="button" className="osh-toggle" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>Menü</button>
      <nav className="osh-nav">
        {groups.map(([title, items], gi) => <div key={gi} className="osh-group">{title && <span className="osh-title">{title}</span>}
          {items.map(([key, label, note]) => <button key={key} type="button" aria-current={section === key ? 'page' : undefined} className={section === key ? 'on' : ''} onClick={() => go(key)}><span>{label}</span>{note && <small>{note}</small>}</button>)}</div>)}
      </nav>
      <div className="osh-foot"><span>{operator?.display_name || operator?.email || ''}</span><small>{role === 'DEALER' ? 'Yalnız yetkili il/ilçedeki kurumlar ve sınavlar görünür.' : 'Yalnız kendi okulunuzun verisi görünür.'}</small><button type="button" onClick={() => void onLogout()}>Çıkış</button></div>
    </aside>
    <main className="osh-main">
      {section === 'home' && <OperatorHome role={role} operator={operator} access={access} go={go} />}
      {section === 'upload' && <ResultOperatorWorkspace mode={role} access={access} />}
      {section === 'reports' && <ResultReportsPanel mode={role} />}
      {section === 'data' && <DataCenter mode={role} tab="DATA" />}
      {section === 'docs' && <DataCenter mode={role} tab="DOCS" />}
      {section === 'schools' && <SchoolList />}
      {section === 'pins' && <><div className="rm"><header className="rm-head"><div><div className="rm-kicker">KURUMLARIM</div><h1 className="rm-title">Giriş PIN'leri</h1><p className="rm-sub">Kurum hesabını açacak tek kullanımlık PIN'i verin.</p></div></header></div><InstitutionPinIssuer /></>}
      {section === 'cards' && <AccessCards />}
      {section === 'school' && access?.institution?.id && <><div className="rm"><header className="rm-head"><div><div className="rm-kicker">HESAP</div><h1 className="rm-title">Kurum bilgileri</h1></div></header></div><InstitutionCardPanel institutionId={access.institution.id} /></>}
      {section === 'profile' && <Profile operator={operator} />}
    </main>
  </div>;
}

function OperatorHome({ role, operator, access, go }: { role: Role; operator: any; access: any; go: (s: Section) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void api<any>(`/api/admin/result-network/operations/data/batches?mode=${role}`).then((r) => setRows(r.batches || [])).catch(() => undefined); }, [role]);
  const committed = rows.filter((r) => r.status === 'COMMITTED');
  const students = committed.reduce((n, r) => n + Number(r.total || 0) - Number(r.set_aside || 0), 0);
  return <div className="rm">
    <header className="rm-head"><div><div className="rm-kicker">{role === 'DEALER' ? 'BAYİ · BÖLGEM' : 'KURUM · OKULUM'}</div><h1 className="rm-title">Hoş geldiniz{operator?.display_name ? `, ${operator.display_name}` : ''}</h1>
      <p className="rm-sub">{role === 'DEALER' ? `${access?.dealer?.displayName || 'Bayi'} · ${access?.dealer?.scopeCount || 0} yetki kapsamı` : access?.institution?.name || ''}</p></div></header>
    <div className="osh-kpis">
      <div className="rm-card"><span className="osh-k">Değerlendirilen yükleme</span><b className="osh-v">{committed.length}</b></div>
      <div className="rm-card"><span className="osh-k">Değerlendirilen öğrenci</span><b className="osh-v">{students}</b></div>
      <div className="rm-card"><span className="osh-k">{role === 'DEALER' ? 'Kurum' : 'Bekleyen yükleme'}</span><b className="osh-v">{role === 'DEALER' ? new Set(rows.map((r) => r.institution_id)).size : rows.filter((r) => r.status !== 'COMMITTED').length}</b></div>
    </div>
    <div className="osh-quick">
      <button type="button" onClick={() => go('upload')}><b>Sınav yükle</b><span>TXT/DAT dosyasını yükleyip değerlendirin.</span></button>
      <button type="button" onClick={() => go('reports')}><b>Rapor Merkezi</b><span>Liste, karne ve analizleri tek PDF olarak alın.</span></button>
      <button type="button" onClick={() => go('data')}><b>Veri Merkezi</b><span>Orijinal dosya, okunan veri ve sonuçları indirin.</span></button>
    </div>
    <section className="rm-card" aria-labelledby="osh-last"><div className="rm-card-head"><h2 id="osh-last">Son yüklemeler</h2><button type="button" className="rm-link" onClick={() => go('data')}>Tümü</button></div>
      {rows.length ? <ul className="osh-last">{rows.slice(0, 5).map((r) => <li key={r.id}><span className="rm-row-main"><b>{r.title}</b><span>{r.institution_name} · {when(r.created_at)}</span></span><span className="osh-st">{r.status === 'COMMITTED' ? 'Değerlendirildi' : 'Bekliyor'}</span></li>)}</ul> : <p className="rm-empty">Henüz yükleme yok. "Sınav yükle" ile başlayın.</p>}
    </section>
  </div>;
}

function SchoolList() {
  const [rows, setRows] = useState<any[]>([]); const [q, setQ] = useState('');
  useEffect(() => { void api<any>('/api/admin/result-network/operations/data/batches?mode=DEALER').then((r) => setRows(r.batches || [])).catch(() => undefined); }, []);
  const schools = [...rows.reduce((m: Map<string, any>, r: any) => { const s = m.get(r.institution_id) || { id: r.institution_id, name: r.institution_name, code: r.institution_code, city: r.city, district: r.district, uploads: 0, last: r.created_at }; s.uploads++; if (r.created_at > s.last) s.last = r.created_at; m.set(r.institution_id, s); return m; }, new Map()).values()]
    .filter((s: any) => !q.trim() || `${s.name} ${s.code} ${s.city} ${s.district}`.toLocaleLowerCase('tr-TR').includes(q.trim().toLocaleLowerCase('tr-TR')));
  return <div className="rm dc">
    <header className="rm-head"><div><div className="rm-kicker">KURUMLARIM</div><h1 className="rm-title">Kurum listesi</h1><p className="rm-sub">Bölgenizde sınav yüklenmiş kurumlar. Yeni kurum için "Giriş PIN'leri"nden PIN verin.</p></div></header>
    <label className="rm-search"><span className="rm-visually-hidden">Ara</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20 16 16" /></svg><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kurum, MEB kodu, il veya ilçe" /></label>
    <section className="rm-card"><div className="dc-table-wrap"><table className="dc-table"><thead><tr><th>Kurum</th><th>MEB kodu</th><th>İl / İlçe</th><th className="r">Yükleme</th><th>Son yükleme</th></tr></thead>
      <tbody>{schools.map((s: any) => <tr key={s.id}><td><b>{s.name}</b></td><td className="num">{s.code}</td><td>{s.city} / {s.district}</td><td className="r num">{s.uploads}</td><td className="dc-muted">{when(s.last)}</td></tr>)}</tbody></table>
      {!schools.length && <p className="rm-empty">Henüz sınav yüklenmiş kurum yok.</p>}</div></section>
  </div>;
}

function AccessCards() {
  const [rows, setRows] = useState<any[]>([]); const [busy, setBusy] = useState(''); const [msg, setMsg] = useState(''); const [error, setError] = useState('');
  useEffect(() => { void api<any>('/api/admin/result-network/operations/data/batches?mode=INSTITUTION').then((r) => setRows((r.batches || []).filter((b: any) => b.status === 'COMMITTED'))).catch((e: any) => setError(e.message)); }, []);
  const make = async (b: any) => {
    setBusy(b.id); setMsg(''); setError('');
    const result = await collectAccessCodePages((cursor) => api<any>(`/api/admin/result-network/operations/scan-batches/${b.id}/access-codes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { method: 'POST' }));
    if (result.codes.length) {
      const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = '﻿' + [['Öğrenci No', 'Ad Soyad', 'Sınıf', 'Erişim Kodu', 'Geçerlilik'], ...result.codes.map((x: any) => [x.studentNumber, x.fullName, x.gradeLevel, x.accessCode, x.expiresAt])].map((r) => r.map(cell).join(';')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'anunex-ogrenci-erisim-kartlari.csv'; a.click(); URL.revokeObjectURL(a.href);
      setMsg(`${result.codes.length} öğrenci erişim kartı üretildi ve indirildi. Kodlar güvenlik gereği yalnız bu indirmede gösterilir.`);
    } else if (!result.error) setMsg('Bu yüklemenin erişim kartları daha önce üretilmiş; mevcut kodlar güvenlik gereği tekrar gösterilmez.');
    if (result.error) setError(result.error.message);
    setBusy('');
  };
  return <div className="rm dc">
    <header className="rm-head"><div><div className="rm-kicker">ÖĞRENCİLER</div><h1 className="rm-title">Erişim kartları</h1><p className="rm-sub">Öğrencilerin sonucu sonuc.anunex.com'da görmesi için kişisel kodlar. Her yükleme için bir kez üretilir.</p></div></header>
    {msg && <div className="rm-card" role="status">{msg}</div>}{error && <div className="rm-alert" role="alert">{error}</div>}
    <section className="rm-card"><div className="dc-table-wrap"><table className="dc-table"><thead><tr><th>Tarih</th><th>Sınav</th><th className="r">Öğrenci</th><th className="r">İşlem</th></tr></thead>
      <tbody>{rows.map((b) => <tr key={b.id}><td className="dc-muted">{when(b.created_at)}</td><td><b>{b.title}</b><small>{b.academic_year}</small></td><td className="r num">{Number(b.total) - Number(b.set_aside)}</td><td className="r"><button type="button" className="dc-btn dc-main" disabled={busy === b.id} onClick={() => void make(b)}>{busy === b.id ? 'Üretiliyor…' : 'Kartları üret ve indir'}</button></td></tr>)}</tbody></table>
      {!rows.length && <p className="rm-empty">Değerlendirilmiş sınav yok.</p>}</div></section>
  </div>;
}

function Profile({ operator }: { operator: any }) {
  const [form, setForm] = useState({ current: '', next: '', again: '' }); const [msg, setMsg] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(''); setError('');
    if (form.next.length < 8) return setError('Yeni şifre en az 8 karakter olmalı.');
    if (form.next !== form.again) return setError('Yeni şifreler aynı değil.');
    setBusy(true);
    try { await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }) }); setForm({ current: '', next: '', again: '' }); setMsg('Şifreniz değişti. Diğer cihazlardaki oturumlar kapatıldı.'); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  return <div className="rm">
    <header className="rm-head"><div><div className="rm-kicker">HESAP</div><h1 className="rm-title">Profil ve parola</h1><p className="rm-sub">{operator?.display_name || ''}{operator?.email ? ` · ${operator.email}` : ''}</p></div></header>
    <form className="rm-card osh-form" onSubmit={save}>
      {msg && <p role="status" className="osh-ok">{msg}</p>}{error && <div className="rm-alert" role="alert">{error}</div>}
      <label>Mevcut şifre<input type="password" autoComplete="current-password" required value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /></label>
      <label>Yeni şifre<input type="password" autoComplete="new-password" required minLength={8} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></label>
      <label>Yeni şifre (tekrar)<input type="password" autoComplete="new-password" required minLength={8} value={form.again} onChange={(e) => setForm({ ...form, again: e.target.value })} /></label>
      <button type="submit" className="rm-primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Şifreyi değiştir'}</button>
    </form>
  </div>;
}
