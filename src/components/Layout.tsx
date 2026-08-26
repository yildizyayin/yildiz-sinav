import { useEffect,useMemo,useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, Bell, BookMarked, BookOpenCheck, Bot, Building2, CalendarDays, CalendarRange, Camera, ClipboardCheck, Database, FileUp, FlaskConical, GraduationCap, Home, KeyRound, Layers3, ListChecks, LogOut, Megaphone, MessageCircle, Printer, ScanLine, ShieldCheck, Target, UserCheck, UserCog, UserRound, Users, UserRoundCheck } from 'lucide-react';
import { useAuth, type Role } from '../auth';
import { api } from '../api';
import { LicenseBoundary } from './LicenseBoundary';

type NavItem={to:string;label:string;icon:any;feature?:string};
const nav: Record<Role, NavItem[]> = {
  SUPER_ADMIN: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/standard-readiness', label: 'Standard Hazırlık', icon: ShieldCheck },
    { to: '/exam-center', label: 'Sınav Merkezi', icon: ClipboardCheck },
    { to: '/nibiru', label: 'Nibiru AI', icon: Bot }, { to: '/nibiru-admin', label: 'Nibiru Yönetimi', icon: MessageCircle }, { to: '/licenses', label: 'Lisanslar', icon: KeyRound },
    { to: '/feature-lab', label: 'Feature Lab', icon: FlaskConical }, { to: '/content-center', label: 'Soru Havuzu & Studio', icon: Layers3, feature:'QUESTION_BANK' }, { to: '/enterprise', label: 'Enterprise', icon: Building2, feature:'ENTERPRISE' }, { to: '/board', label: 'Akıllı Tahta', icon: GraduationCap, feature:'BOARD' },
    { to: '/academic-target-admin', label: 'Resmî Hedef Verileri', icon: Target }, { to: '/official-question-intelligence', label: 'Çıkmış Soru & Kazanım', icon: BarChart3 }, { to: '/institutions', label: 'Kurumlar', icon: Building2 }, { to: '/curriculum', label: 'Müfredat & Kazanımlar', icon: BookMarked },
    { to: '/exam-definitions', label: 'Gelişmiş Sınav Tanımı', icon: ClipboardCheck }, { to: '/exams', label: 'Eski Sınav Listesi', icon: ClipboardCheck },
    { to: '/students', label: 'Öğrenciler', icon: Users }, { to: '/activation-requests', label: 'Aktivasyon Talepleri', icon: UserCheck }, { to: '/users', label: 'Kullanıcılar', icon: UserCog }, { to: '/access-accounts', label: 'Öğrenci/Veli Erişimi', icon: KeyRound }, { to: '/teacher-assignments', label: 'Öğretmen Yetkileri', icon: ShieldCheck }, { to: '/seasons', label: 'Sezonlar', icon: CalendarRange },
    { to: '/opticals', label: 'Optik Tanıtma', icon: ScanLine }, { to: '/optical-prepare', label: 'Optik Hazırla / Bas', icon: Printer }, { to: '/camera-test', label: 'Kamera Test Optiği', icon: Camera }, { to: '/calibration', label: 'Kalibrasyon', icon: Printer },
    { to: '/worksheet-admin', label: 'Föy Merkezi', icon: BookOpenCheck }, { to: '/worksheet-calendar', label: 'Föy Takvimi', icon: CalendarDays }, { to: '/bulk-operations', label: 'Toplu İşlemler', icon: Layers3 }, { to: '/demo-mode', label: 'Sentetik Demo', icon: FlaskConical }, { to: '/scale', label: 'Ölçek Altyapısı', icon: Database },
    { to: '/transfers', label: 'Veri Transferi', icon: FileUp }, { to: '/reports', label: 'Raporlar', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  INSTITUTION_MANAGER: [
    { to: '/', label: 'Kurum Paneli V2', icon: Home }, { to: '/exam-center', label: 'Sınav Merkezi', icon: ClipboardCheck }, { to: '/nibiru', label: 'Nibiru AI', icon: Bot }, { to: '/nibiru-admin', label: 'Nibiru Yönetimi', icon: MessageCircle },
    { to: '/content-center', label: 'Soru Havuzu & Studio', icon: Layers3,feature:'QUESTION_BANK' }, { to: '/enterprise', label: 'Enterprise / Campus', icon: Building2,feature:'ENTERPRISE' }, { to: '/board', label: 'Akıllı Tahta', icon: GraduationCap,feature:'BOARD' },
    { to: '/announcements', label: 'Duyuru Merkezi', icon: Megaphone }, { to: '/worksheet-calendar', label: 'Föy Takvimi', icon: CalendarDays }, { to: '/exam-definitions', label: 'Kendi Sınavını Oluştur', icon: ClipboardCheck }, { to: '/students', label: 'Öğrenciler', icon: Users },
    { to: '/activation-requests', label: 'Aktivasyon Talepleri', icon: UserCheck }, { to: '/users', label: 'Kullanıcılar', icon: UserCog }, { to: '/access-accounts', label: 'Öğrenci/Veli Erişimi', icon: KeyRound }, { to: '/teacher-assignments', label: 'Öğretmen Yetkileri', icon: ShieldCheck }, { to: '/seasons', label: 'Sezonlar', icon: CalendarRange }, { to: '/optical-prepare', label: 'Optik Hazırla / Bas', icon: Printer },
    { to: '/camera-test', label: 'Kamera Test Optiği', icon: Camera }, { to: '/calibration', label: 'Kalibrasyon', icon: ScanLine }, { to: '/bulk-operations', label: 'Toplu İşlemler', icon: Layers3 }, { to: '/reports', label: 'Raporlar', icon: BarChart3 },
    { to: '/worksheets', label: 'Föy Merkezi', icon: BookOpenCheck }, { to: '/transfers', label: 'Veri Transferi', icon: FileUp }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  TEACHER: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/nibiru', label: 'Nibiru AI', icon: Bot }, { to: '/content-center', label: 'Soru Havuzu & Studio', icon: Layers3,feature:'QUESTION_BANK' }, { to: '/board', label: 'Akıllı Tahta', icon: GraduationCap,feature:'BOARD' }, { to: '/announcements', label: 'Duyurular', icon: Megaphone }, { to: '/worksheet-calendar', label: 'Föy Takvimi', icon: CalendarDays }, { to: '/classes', label: 'Sınıflarım', icon: GraduationCap }, { to: '/exams', label: 'Sınavlar', icon: ClipboardCheck },
    { to: '/outcomes', label: 'Kazanımlar', icon: Target }, { to: '/worksheets', label: 'Föyler', icon: BookOpenCheck }, { to: '/reports', label: 'Branş Gelişimi', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  GUIDANCE_TEACHER: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/nibiru', label: 'Nibiru AI', icon: Bot }, { to: '/guidance-tests', label: 'RBA & Rehberlik Onayları', icon: ListChecks,feature:'GUIDANCE_TESTS' }, { to: '/content-center', label: 'Soru Havuzu & Studio', icon: Layers3,feature:'QUESTION_BANK' }, { to: '/board', label: 'Akıllı Tahta', icon: GraduationCap,feature:'BOARD' }, { to: '/announcements', label: 'Duyurular', icon: Megaphone }, { to: '/worksheet-calendar', label: 'Föy Takvimi', icon: CalendarDays }, { to: '/classes', label: 'Sınıflarım', icon: GraduationCap }, { to: '/exams', label: 'Sınavlar', icon: ClipboardCheck },
    { to: '/outcomes', label: 'Kazanımlar', icon: Target }, { to: '/worksheets', label: 'Föyler', icon: BookOpenCheck }, { to: '/reports', label: 'Öğrenci Gelişimi', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  STUDENT: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/nibiru', label: 'Nibiru AI', icon: Bot }, { to: '/academic-target', label: 'Hedeflerim', icon: Target }, { to: '/my-books', label: 'Benim Kitaplarım', icon: BookOpenCheck }, { to: '/student-growth', label: 'Gelişim & Recovery', icon: Target,feature:'LEARNING_GRAPH' }, { to: '/guidance-tests', label: 'Rehberlik Testleri', icon: ListChecks,feature:'GUIDANCE_TESTS' }, { to: '/premium', label: 'Gold / Premium / Live', icon: KeyRound,feature:'MEMBERSHIP' }, { to: '/my-results', label: 'Sonuçlarım', icon: ClipboardCheck }, { to: '/wrong-answers', label: 'Yanlış / Boş Sorularım', icon: ListChecks }, { to: '/worksheets', label: 'Föylerim', icon: BookOpenCheck }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  PARENT: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/nibiru', label: 'Nibiru AI', icon: Bot }, { to: '/children', label: 'Çocuklarım', icon: UserRoundCheck }, { to: '/weekly-summary', label: 'Haftalık Özet', icon: CalendarDays }, { to: '/reports', label: 'Gelişim', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
};

export function Layout() {
  const { user, institution, logout } = useAuth();
  const navigate = useNavigate();
  const [enabledFeatures,setEnabledFeatures]=useState<Set<string>>(new Set());
  useEffect(()=>{if(!user||user.role==='SUPER_ADMIN')return;void api<any>('/api/platform/features').then(r=>setEnabledFeatures(new Set((r.features||[]).filter((f:any)=>Number(f.effective_enabled||0)===1).map((f:any)=>String(f.feature_key))))).catch(()=>setEnabledFeatures(new Set()));},[user?.id,user?.role]);
  const visibleNav=useMemo(()=>user?nav[user.role].filter(item=>!item.feature||user.role==='SUPER_ADMIN'||enabledFeatures.has(item.feature)):[],[user,enabledFeatures]);
  if (!user) return null;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">Ö</div><div><strong>Ölçme Platformu</strong><span>V2 · Nibiru AI</span></div></div>
      <nav>{visibleNav.map((item) => { const Icon=item.icon; return <NavLink key={item.to} to={item.to} end={item.to==='/' } className={({isActive})=>isActive?'nav-item active':'nav-item'}><Icon size={19}/><span>{item.label}</span></NavLink>; })}</nav>
      <div className="sidebar-footer">
        <div className="user-card"><div className="avatar">{user.display_name.charAt(0)}</div><div><strong>{user.display_name}</strong><small>{roleName(user.role)}{institution?.name ? ` · ${institution.name}` : ''}</small></div></div>
        <button className="ghost sidebar-logout" onClick={async()=>{await logout();navigate('/login');}}><LogOut size={18}/>Çıkış</button>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><span className="eyebrow">2026–2027</span><strong>{institution?.name || (user.role==='SUPER_ADMIN'?'Platform Yönetimi':'')}</strong></div><div className="status neutral"><Bot size={14}/> Nibiru AI</div></header>
      <div className="page-wrap"><LicenseBoundary><Outlet/></LicenseBoundary></div>
    </main>
  </div>;
}

function roleName(role: Role) {
  return ({ SUPER_ADMIN:'Süper Admin',INSTITUTION_MANAGER:'Kurum Yöneticisi',TEACHER:'Branş Öğretmeni',GUIDANCE_TEACHER:'Rehber Öğretmeni',STUDENT:'Öğrenci',PARENT:'Veli' } as const)[role];
}