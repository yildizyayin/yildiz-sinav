import type { ReactNode } from 'react';
import { Activity, ArrowRight, BarChart3, Building2, CheckCircle2, ClipboardCheck, FileUp, KeyRound, Plus, ScanLine, ShieldCheck, UserCog, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api';

type DashboardCard = { label: string; value: number | string };
type PendingItem = { label: string; value: number; detail: string; to: string; icon: ReactNode; tone: string };

const actionLabels: Record<string, string> = {
  EXAM_EVALUATED: 'Sınav değerlendirildi',
  EXAM_RESULTS_PUBLISHED: 'Sınav sonuçları yayınlandı',
  OPTICAL_TEMPLATE_CREATED: 'Optik tanımı oluşturuldu',
  OPTICAL_DEFINITION_UPDATED: 'Optik tanımı güncellendi',
  OPTICAL_PARSER_TEST_PASSED: 'Optik parser testi geçti',
  OPTICAL_VERSION_PUBLISHED: 'Optik sürümü yayınlandı',
  INSTITUTION_PAUSED: 'Kurum pasife alındı',
  INSTITUTION_REACTIVATED: 'Kurum yeniden aktifleştirildi',
  USER_CREATED: 'Kullanıcı oluşturuldu',
  CURRICULUM_IMPORT_COMMITTED: 'Müfredat aktarımı tamamlandı',
};

export function AdminCommandCenter() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void api<any>('/api/dashboard').then(setDashboard).catch((e: any) => setError(e.message || 'Yönetim özeti yüklenemedi.'));
  }, []);

  const cards: DashboardCard[] = dashboard?.cards || [];
  const pending = dashboard?.pending || {};
  const summary = dashboard?.institutionSummary || {};
  const pendingItems: PendingItem[] = [
    { label: 'Sınav değerlendirme kontrolü', value: Number(pending.scanReview || 0), detail: 'Önizleme veya eşleştirme bekleyen dosyalar', to: '/exam-center', icon: <ScanLine />, tone: 'mars' },
    { label: 'Optik tanımı', value: Number(pending.opticalDefinitions || 0), detail: 'Tanımı veya doğrulaması eksik optikler', to: '/opticals', icon: <ScanLine />, tone: 'sand' },
    { label: 'Aktivasyon talebi', value: Number(pending.activationRequests || 0), detail: 'Kurum veya öğrenci erişim talepleri', to: '/activation-requests', icon: <Users />, tone: 'blue' },
    { label: 'Lisans uyarısı', value: Number(pending.licenseWarnings || 0), detail: 'Süresi dolan veya 30 gün içinde bitecek lisanslar', to: '/licenses', icon: <KeyRound />, tone: 'amber' },
  ];

  return <div className="admin-command-center admin-operational-home">
    <header className="admin-home-header">
      <div><span className="eyebrow">ANUNEX · SÜPER ADMİN</span><h1>Yönetim özeti</h1></div>
      <div className="admin-home-header-actions"><Link className="primary" to="/exam-definitions"><Plus size={17} /> Sınav Ekle</Link><Link className="secondary" to="/exam-center?mode=upload"><FileUp size={17} /> Sınav Yükle</Link></div>
    </header>

    {error && <div className="alert error">Yönetim özeti yüklenemedi: {error}</div>}

    <section className="admin-home-kpi-grid" aria-label="Platform göstergeleri">
      {cards.map((card) => <div className="admin-home-kpi" key={card.label}><span>{card.label}</span><strong>{formatValue(card.value)}</strong><small>Güncel veri</small></div>)}
      {!cards.length && <div className="admin-home-loading">Göstergeler yükleniyor…</div>}
    </section>

    <section className="admin-home-primary-grid">
      <div className="admin-home-panel">
        <div className="admin-home-panel-head"><div><span className="eyebrow">İŞLEM KUYRUĞU</span><h2>Bekleyen işlemler</h2><p>Doğrudan ilgili çalışma alanına geçin.</p></div><ListBadge count={pendingItems.reduce((total, item) => total + item.value, 0)} /></div>
        <div className="admin-home-pending-list">{pendingItems.map((item) => <Link className="admin-home-pending-row" to={item.to} key={item.label}><span className={`admin-home-pending-icon ${item.tone}`}>{item.icon}</span><span className="admin-home-pending-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><b>{formatValue(item.value)}</b><ArrowRight size={16} /></Link>)}</div>
      </div>

      <div className="admin-home-panel">
        <div className="admin-home-panel-head"><div><span className="eyebrow">CANLI DURUM</span><h2>Sistem sağlığı</h2><p>Yönetim servislerinin son durumu.</p></div><Activity size={20} className="admin-home-panel-mark" /></div>
        <div className="admin-home-health-list">{(dashboard?.systemHealth || []).map((item: any) => <div className="admin-home-health-row" key={item.key}><span className={`admin-home-health-dot ${String(item.status).toLowerCase()}`} /><span><strong>{item.label}</strong><small>{item.detail}</small></span><em>{healthLabel(item.status)}</em></div>)}{!dashboard?.systemHealth && <div className="admin-home-loading">Durum bilgisi yükleniyor…</div>}</div>
      </div>
    </section>

    <section><div className="admin-home-section-head"><div><span className="eyebrow">HIZLI İŞLEMLER</span><h2>Bugün yapılacak işlem</h2></div></div><div className="admin-home-action-grid">
      <QuickAction to="/exam-definitions" icon={<ClipboardCheck />} title="Sınav oluştur" detail="Sınav kartı ve cevap anahtarı" />
      <QuickAction to="/exam-center?mode=upload" icon={<FileUp />} title="Sınav değerlendir" detail="TXT, DAT, FMT veya kamera" />
      <QuickAction to="/opticals" icon={<ScanLine />} title="Optik tanımla" detail="Manuel, FMT ve görsel mapping" />
      <QuickAction to="/institutions" icon={<Building2 />} title="Kurumları yönet" detail="Kurum yaşam döngüsü" />
      <QuickAction to="/users" icon={<UserCog />} title="Kullanıcı ve roller" detail="Yetki ve hesap kapsamı" />
      <QuickAction to="/reports" icon={<BarChart3 />} title="Raporlara git" detail="Kurum ve sonuç raporları" />
    </div></section>

    <section className="admin-home-secondary-grid">
      <div className="admin-home-panel"><div className="admin-home-panel-head"><div><span className="eyebrow">KURUMLAR VE ERİŞİM</span><h2>Kurum özeti</h2></div><Link className="link-button" to="/institutions">Tümünü aç <ArrowRight size={14} /></Link></div><div className="admin-home-summary-grid">
        <Summary label="Toplam kurum" value={summary.total} /><Summary label="Aktif kurum" value={summary.active} tone="good" /><Summary label="Pasif kurum" value={summary.passive} tone="warn" /><Summary label="Aktif kullanıcı" value={summary.activeUsers} /><Summary label="Onaylı bayi" value={summary.approvedDealers} /><Summary label="Misafir öğrenci" value={summary.guests} tone="muted" />
      </div></div>

      <div className="admin-home-panel"><div className="admin-home-panel-head"><div><span className="eyebrow">DENETİM KAYDI</span><h2>Son işlemler</h2></div><Link className="link-button" to="/reports">Raporlar <ArrowRight size={14} /></Link></div><div className="admin-home-activity-list">
        {(dashboard?.recentActivity || []).map((item: any, index: number) => <div className="admin-home-activity-row" key={`${item.created_at}-${item.entity_id || index}`}><span className="admin-home-activity-icon"><CheckCircle2 size={15} /></span><span><strong>{actionLabels[item.action] || item.action}</strong><small>{item.actor_name} · {formatDate(item.created_at)}</small></span></div>)}
        {!dashboard?.recentActivity?.length && <div className="admin-home-empty">Henüz işlem kaydı bulunmuyor.</div>}
      </div></div>
    </section>

    <div className="admin-home-note"><ShieldCheck size={18} /><span>Bu ekran yalnız Süper Admin operasyonlarını gösterir. Öğrenci, kurum veya Nibiru tanıtım metinleri burada yer almaz.</span></div>
  </div>;
}

function QuickAction({ to, icon, title, detail }: { to: string; icon: ReactNode; title: string; detail: string }) { return <Link className="admin-home-action" to={to}><span className="admin-home-action-icon">{icon}</span><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={16} /></Link>; }
function Summary({ label, value, tone = '' }: { label: string; value?: number | string; tone?: string }) { return <div className={`admin-home-summary ${tone}`}><span>{label}</span><strong>{formatValue(value ?? 0)}</strong></div>; }
function ListBadge({ count }: { count: number }) { return <span className={`admin-home-count ${count ? 'has-items' : ''}`}>{formatValue(count)}</span>; }
function formatValue(value: number | string) { return typeof value === 'number' ? value.toLocaleString('tr-TR') : value; }
function formatDate(value?: string) { if (!value) return 'Tarih yok'; const date = new Date(value.replace(' ', 'T') + (value.endsWith('Z') ? '' : 'Z')); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }); }
function healthLabel(status: string) { if (status === 'READY') return 'Hazır'; if (status === 'ACTION') return 'İşlem gerekli'; if (status === 'EMPTY') return 'Veri yok'; return status; }
