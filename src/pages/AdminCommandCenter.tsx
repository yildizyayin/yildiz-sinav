import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, ArrowRight, BarChart3, BookOpenCheck, CalendarDays, CheckCircle2, ClipboardCheck, FileText, GraduationCap, Layers3, ListChecks, MessageCircle, Network, PlayCircle, Plus, ShieldCheck, Sparkles, Target, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';

type ModuleState = 'ACTIVE' | 'NEXT' | 'CORE';
type AdminModule = { title: string; subtitle: string; description: string; state: ModuleState; color: string; icon: ReactNode; to?: string; action?: string };

const modules: AdminModule[] = [
  { title: 'Sınav Merkezi', subtitle: 'Mars · ölçme operasyonu', description: 'Sınav ekle, yükle, optik/FMT bağla, puanla ve yayınla.', state: 'ACTIVE', color: 'mars', icon: <ClipboardCheck />, to: '/exam-center', action: 'Merkeze git' },
  { title: 'Soru Havuzu & Studio', subtitle: 'Jüpiter · içerik zekâsı', description: 'Soru, şık, zorluk ve kazanım verisini tek kayıtta yönetin.', state: 'ACTIVE', color: 'jupiter', icon: <Layers3 />, to: '/content-center', action: 'Havuzu aç' },
  { title: 'Test & Ödev Merkezi', subtitle: 'Yörünge · uygulama akışı', description: 'Soru havuzundan test üretin, sınıfa veya öğrenciye atayın.', state: 'ACTIVE', color: 'orbit', icon: <BookOpenCheck />, to: '/assignments', action: 'Ödevleri aç' },
  { title: 'RBA & Rehberlik', subtitle: 'Ay · güvenli gelişim', description: 'Rehberlik testlerini, insan onayını ve gelişim sinyallerini yönetin.', state: 'CORE', color: 'moon', icon: <ShieldCheck />, to: '/nibiru-admin', action: 'Yönetimi aç' },
  { title: 'Ders Programı', subtitle: 'Yörünge planlayıcı', description: 'Ders, öğretmen, sınıf ve haftalık zaman ilişkisini kurun.', state: 'NEXT', color: 'schedule', icon: <CalendarDays />, action: 'Sıradaki modül' },
  { title: 'YouTube & Video', subtitle: 'Uydu · içerik bağlantısı', description: 'Video çözümünü soru, kazanım, test veya ödevle eşleştirin.', state: 'NEXT', color: 'video', icon: <PlayCircle />, to: '/content-center', action: 'İçerik merkezine git' },
  { title: 'Kazanım Haritası', subtitle: 'Ortak veri omurgası', description: 'MEB/ÖSYM kazanımlarını, alt kazanımları ve performansı izleyin.', state: 'ACTIVE', color: 'outcome', icon: <Target />, to: '/curriculum', action: 'Haritayı aç' },
  { title: 'Sonuç Ağı & Raporlar', subtitle: 'Satürn · karşılaştırma halkaları', description: 'Kurum, sınıf, ilçe, il ve Türkiye sonuçlarını yönetin.', state: 'ACTIVE', color: 'results', icon: <BarChart3 />, to: '/reports', action: 'Raporları aç' },
];

function stateLabel(state: ModuleState) {
  return state === 'ACTIVE' ? 'Aktif' : state === 'CORE' ? 'Omurga' : 'Sıradaki';
}

function QuickAction({ to, icon, title, text }: { to: string; icon: ReactNode; title: string; text: string }) {
  return <Link to={to} className="admin-command-quick"><span className="admin-command-quick-icon">{icon}</span><span><strong>{title}</strong><small>{text}</small></span><ArrowRight size={16} /></Link>;
}

export function AdminCommandCenter() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => { void api<any>('/api/dashboard').then(setDashboard).catch((e: any) => setError(e.message)); }, []);
  const activeModules = useMemo(() => modules.filter((item) => item.state === 'ACTIVE' || item.state === 'CORE').length, []);
  const cards = dashboard?.cards || [];

  return <div className="admin-command-center">
    <section className="admin-command-hero">
      <div className="admin-command-hero-copy">
        <span className="eyebrow">ANUNEX · SÜPER ADMİN · SAMANYOLU</span>
        <h1>Platformun bütün yörüngeleri burada.</h1>
        <p>Sınav, soru, kazanım, rehberlik, ödev, video ve Nibiru aynı öğrenci–kurum veri omurgasına bağlı çalışır.</p>
        <div className="admin-command-hero-actions"><Link className="primary" to="/exam-definitions"><Plus size={17} /> Sınav Ekle</Link><Link className="ghost light" to="/content-center"><Layers3 size={17} /> Soru Havuzu</Link></div>
      </div>
      <div className="admin-command-nibiru" aria-label="Nibiru ortak veri omurgası"><div className="admin-command-star"><Sparkles size={25} /></div><strong>NIBIRU</strong><span>ortak akademik zekâ</span><small>{activeModules} modül aynı yörüngede</small></div>
    </section>

    {error && <div className="alert error">Yönetim özeti yüklenemedi: {error}</div>}
    <div className="admin-command-kpis">
      {cards.slice(0, 4).map((card: any) => <div className="admin-command-kpi" key={card.label}><span>{card.label}</span><strong>{card.value}</strong><small><Activity size={12} /> canlı veri</small></div>)}
      {!cards.length && <><div className="admin-command-kpi"><span>Aktif modüller</span><strong>{activeModules}</strong><small><CheckCircle2 size={12} /> omurga</small></div><div className="admin-command-kpi"><span>Panel sırası</span><strong>01</strong><small><Network size={12} /> Süper Admin</small></div></>}
    </div>

    <section className="admin-command-section-head"><div><span className="eyebrow">HIZLI BAŞLANGIÇ</span><h2>Bugün yapmak istediğiniz işlem</h2><p>En sık kullanılan admin işlemlerine tek adımda ulaşın.</p></div><span className="admin-command-status"><CheckCircle2 size={15} /> Veri omurgası hazır</span></section>
    <div className="admin-command-quick-grid"><QuickAction to="/exam-definitions" icon={<ClipboardCheck />} title="Sınav oluştur" text="Kart, anahtar, puanlama ve belgeler" /><QuickAction to="/content-center" icon={<Layers3 />} title="Test hazırlamaya başla" text="Soru havuzundan hızlı üretim" /><QuickAction to="/assignments" icon={<BookOpenCheck />} title="Ödev ata" text="Sınıf veya öğrenci seçerek" /><QuickAction to="/institutions" icon={<Users />} title="Kurum ve kullanıcı yönet" text="Kapsam ve yetkileri düzenle" /></div>

    <section className="admin-command-section-head"><div><span className="eyebrow">SAMANYOLU MODÜLLERİ</span><h2>Admin çalışma alanları</h2><p>Her modül kendi işini yapar; öğrenci, öğretmen ve veli panelleri aynı kaydı kullanır.</p></div></section>
    <div className="admin-command-module-grid">{modules.map((item) => <article className={`admin-command-module ${item.color}`} key={item.title}><div className="admin-command-module-top"><span className="admin-command-module-icon">{item.icon}</span><span className={`admin-command-state ${item.state.toLowerCase()}`}>{stateLabel(item.state)}</span></div><span className="admin-command-module-subtitle">{item.subtitle}</span><h3>{item.title}</h3><p>{item.description}</p>{item.to ? <Link to={item.to} className="admin-command-module-link">{item.action} <ArrowRight size={15} /></Link> : <span className="admin-command-module-link muted">{item.action}</span>}</article>)}</div>

    <section className="admin-command-flow"><div className="admin-command-flow-head"><div><span className="eyebrow">ORTAK İŞLEM ZİNCİRİ</span><h2>Bir kayıt, altı panele ulaşır</h2></div><MessageCircle size={22} /></div><div className="admin-command-flow-steps"><div><b>01</b><strong>Admin üretir</strong><span>Soru, sınav, ödev veya video</span></div><i /><div><b>02</b><strong>Yetkiliye atanır</strong><span>Kurum, sınıf, öğretmen veya öğrenci</span></div><i /><div><b>03</b><strong>Sonuç işlenir</strong><span>Kazanım ve performans kaydı</span></div><i /><div><b>04</b><strong>Nibiru yönlendirir</strong><span>Rehber, koç ve veli özeti</span></div></div></section>

    <div className="admin-command-note"><GraduationCap size={19} /><span><strong>Geliştirme sırası sabit:</strong> Süper Admin → kurum/zincir kurum → rehber → branş öğretmeni → öğrenci → veli. Bu merkez tamamlanmadan sonraki paneller ayrı veri üretmeyecek.</span></div>
  </div>;
}
