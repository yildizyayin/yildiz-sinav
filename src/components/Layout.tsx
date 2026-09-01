import { useEffect,useMemo,useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, Bell, BookMarked, BookOpenCheck, Building2, CalendarDays, CalendarRange, Camera, ChevronRight, ClipboardCheck, Database, FileUp, FlaskConical, Globe2, GraduationCap, Home, KeyRound, Layers3, ListChecks, LogOut, Megaphone, Menu, MessageCircle, Palette, Printer, ScanLine, ShieldCheck, Sparkles, Target, UserCheck, UserCog, UserRound, Users, UserRoundCheck, X } from 'lucide-react';
import { useAuth, type Role } from '../auth';
import { api } from '../api';
import { LicenseBoundary } from './LicenseBoundary';
import { NibiruMark,NibiruNavIcon } from './NibiruMark';
import { AnunexBrand } from './AnunexBrand';

type NavItem={to:string;label:string;icon:any;feature?:string};
const nav: Record<Role, NavItem[]> = {
  SUPER_ADMIN: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/standard-readiness', label: 'Standard Hazırlık', icon: ShieldCheck },
    { to: '/exam-center', label: 'Sınav Merkezi', icon: ClipboardCheck },
    { to: '/result-network', label: 'Sonuç Ağı', icon: Globe2 },
    { to: '/attendance', label: 'Yoklama Gözetimi', icon: UserCheck },
    { to: '/nibiru', label: 'Nibiru', icon: NibiruNavIcon }, { to: '/nibiru-admin', label: 'Nibiru Yönetimi', icon: MessageCircle }, { to: '/licenses', label: 'Lisanslar', icon: KeyRound },
    { to: '/theme-management', label: 'Tema & Özel Günler', icon: Palette },
    { to: '/feature-lab', label: 'Feature Lab', icon: FlaskConical }, { to: '/content-center', label: 'Soru Havuzu & Studio', icon: Layers3, feature:'QUESTION_BANK' }, { to: '/enterprise', label: 'Enterprise', icon: Building2, feature:'ENTERPRISE' },
    { to: '/academic-target-admin', label: 'Resmî Hedef Verileri', icon: Target }, { to: '/official-question-intelligence', label: 'Çıkmış Soru & Kazanım', icon: BarChart3 }, { to: '/institutions', label: 'Kurumlar', icon: Building2 }, { to: '/curriculum', label: 'Müfredat & Kazanımlar', icon: BookMarked },
    { to: '/exam-definitions', label: 'Gelişmiş Sınav Tanımı', icon: ClipboardCheck }, { to: '/exams', label: 'Eski Sınav Listesi', icon: ClipboardCheck },
    { to: '/students', label: 'Öğrenciler', icon: Users }, { to: '/activation-requests', label: 'Aktivasyon Talepleri', icon: UserCheck }, { to: '/users', label: 'Kullanıcılar', icon: UserCog }, { to: '/access-accounts', label: 'Öğrenci/Veli Erişimi', icon: KeyRound }, { to: '/teacher-assignments', label: 'Öğretmen Yetkileri', icon: ShieldCheck }, { to: '/seasons', label: 'Sezonlar', icon: CalendarRange },
    { to: '/opticals', label: 'Optik Tanıtma', icon: ScanLine }, { to: '/optical-prepare', label: 'Optik Hazırla / Bas', icon: Printer }, { to: '/camera-test', label: 'Kamera Test Optiği', icon: Camera }, { to: '/calibration', label: 'Kalibrasyon', icon: Printer },
    { to: '/worksheet-admin', label: 'Föy Merkezi', icon: BookOpenCheck }, { to: '/worksheet-calendar', label: 'Föy Takvimi', icon: CalendarDays }, { to: '/bulk-operations', label: 'Toplu İşlemler', icon: Layers3 }, { to: '/demo-mode', label: 'Sentetik Demo', icon: FlaskConical }, { to: '/scale', label: 'Ölçek Altyapısı', icon: Database },
    { to: '/transfers', label: 'Veri Transferi', icon: FileUp }, { to: '/reports', label: 'Raporlar', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  INSTITUTION_MANAGER: [
    { to: '/', label: 'Kurum Paneli V2', icon: Home }, { to: '/exam-center', label: 'Sınav Merkezi', icon: ClipboardCheck }, { to: '/nibiru', label: 'Nibiru', icon: NibiruNavIcon }, { to: '/nibiru-admin', label: 'Nibiru Yönetimi', icon: MessageCircle },
    { to: '/content-center', label: 'Soru Havuzu & Studio', icon: Layers3,feature:'QUESTION_BANK' }, { to: '/enterprise', label: 'Enterprise / Campus', icon: Building2,feature:'ENTERPRISE' },
    { to: '/announcements', label: 'Duyuru Merkezi', icon: Megaphone }, { to: '/worksheet-calendar', label: 'Föy Takvimi', icon: CalendarDays }, { to: '/exam-definitions', label: 'Kendi Sınavını Oluştur', icon: ClipboardCheck }, { to: '/students', label: 'Öğrenciler', icon: Users },
    { to: '/attendance', label: 'Yoklama', icon: UserCheck }, { to: '/assignments', label: 'Ödev Merkezi', icon: BookOpenCheck },
    { to: '/activation-requests', label: 'Aktivasyon Talepleri', icon: UserCheck }, { to: '/users', label: 'Kullanıcılar', icon: UserCog }, { to: '/access-accounts', label: 'Öğrenci/Veli Erişimi', icon: KeyRound }, { to: '/teacher-assignments', label: 'Öğretmen Yetkileri', icon: ShieldCheck }, { to: '/seasons', label: 'Sezonlar', icon: CalendarRange }, { to: '/optical-prepare', label: 'Optik Hazırla / Bas', icon: Printer },
    { to: '/camera-test', label: 'Kamera Test Optiği', icon: Camera }, { to: '/calibration', label: 'Kalibrasyon', icon: ScanLine }, { to: '/bulk-operations', label: 'Toplu İşlemler', icon: Layers3 }, { to: '/reports', label: 'Raporlar', icon: BarChart3 },
    { to: '/worksheets', label: 'Föy Merkezi', icon: BookOpenCheck }, { to: '/transfers', label: 'Veri Transferi', icon: FileUp }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  TEACHER: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/nibiru', label: 'Nibiru', icon: NibiruNavIcon }, { to: '/content-center', label: 'Soru Havuzu & Studio', icon: Layers3,feature:'QUESTION_BANK' }, { to: '/announcements', label: 'Duyurular', icon: Megaphone }, { to: '/worksheet-calendar', label: 'Föy Takvimi', icon: CalendarDays }, { to: '/classes', label: 'Sınıflarım', icon: GraduationCap }, { to: '/exams', label: 'Sınavlar', icon: ClipboardCheck },
    { to: '/outcomes', label: 'Kazanımlar', icon: Target }, { to: '/worksheets', label: 'Föyler', icon: BookOpenCheck }, { to: '/reports', label: 'Branş Gelişimi', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
    { to: '/attendance', label: 'Yoklama', icon: UserCheck }, { to: '/assignments', label: 'Ödev Merkezi', icon: BookOpenCheck },
  ],
  GUIDANCE_TEACHER: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/nibiru', label: 'Nibiru', icon: NibiruNavIcon }, { to: '/guidance-tests', label: 'RBA & Rehberlik Onayları', icon: ListChecks,feature:'GUIDANCE_TESTS' }, { to: '/content-center', label: 'Soru Havuzu & Studio', icon: Layers3,feature:'QUESTION_BANK' }, { to: '/announcements', label: 'Duyurular', icon: Megaphone }, { to: '/worksheet-calendar', label: 'Föy Takvimi', icon: CalendarDays }, { to: '/classes', label: 'Sınıflarım', icon: GraduationCap }, { to: '/exams', label: 'Sınavlar', icon: ClipboardCheck },
    { to: '/outcomes', label: 'Kazanımlar', icon: Target }, { to: '/worksheets', label: 'Föyler', icon: BookOpenCheck }, { to: '/reports', label: 'Öğrenci Gelişimi', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
    { to: '/attendance', label: 'Yoklama', icon: UserCheck }, { to: '/assignments', label: 'Ödev Merkezi', icon: BookOpenCheck },
  ],
  STUDENT: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/nibiru', label: 'Nibiru', icon: NibiruNavIcon }, { to: '/academic-target', label: 'Hedeflerim', icon: Target }, { to: '/assignments', label: 'Ödevlerim', icon: BookOpenCheck }, { to: '/my-books', label: 'Benim Kitaplarım', icon: BookOpenCheck }, { to: '/student-growth', label: 'Gelişim & Recovery', icon: Target,feature:'LEARNING_GRAPH' }, { to: '/guidance-tests', label: 'Rehberlik Testleri', icon: ListChecks,feature:'GUIDANCE_TESTS' }, { to: '/premium', label: 'Gold / Premium / Live', icon: KeyRound,feature:'MEMBERSHIP' }, { to: '/my-results', label: 'Sonuçlarım', icon: ClipboardCheck }, { to: '/wrong-answers', label: 'Yanlış / Boş Sorularım', icon: ListChecks }, { to: '/worksheets', label: 'Föylerim', icon: BookOpenCheck }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  PARENT: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/nibiru', label: 'Nibiru', icon: NibiruNavIcon }, { to: '/children', label: 'Çocuklarım', icon: UserRoundCheck }, { to: '/weekly-summary', label: 'Haftalık Özet', icon: CalendarDays }, { to: '/reports', label: 'Gelişim', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
};

export function Layout() {
  const { user, institution, logout } = useAuth();
  const navigate = useNavigate();
  const [enabledFeatures,setEnabledFeatures]=useState<Set<string>>(new Set());
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const [panelExperience,setPanelExperience]=useState<any>(null);
  const [themeRevision,setThemeRevision]=useState(0);
  useEffect(()=>{if(!user||user.role==='SUPER_ADMIN')return;void api<any>('/api/platform/features').then(r=>setEnabledFeatures(new Set((r.features||[]).filter((f:any)=>Number(f.effective_enabled||0)===1).map((f:any)=>String(f.feature_key))))).catch(()=>setEnabledFeatures(new Set()));},[user?.id,user?.role]);
  useEffect(()=>{if(!user)return;void api<any>('/api/panel-experience').then(setPanelExperience).catch(()=>setPanelExperience(null))},[user?.id,user?.role,user?.institution_id]);
  useEffect(()=>{const refresh=()=>setThemeRevision(value=>value+1);window.addEventListener('anunex-theme-change',refresh);return()=>window.removeEventListener('anunex-theme-change',refresh)},[]);
  const visibleNav=useMemo(()=>user?nav[user.role].filter(item=>!item.feature||user.role==='SUPER_ADMIN'||enabledFeatures.has(item.feature)):[],[user,enabledFeatures]);
  if (!user) return null;
  const allowedThemeKeys=(panelExperience?.allowedThemes||[]).map((theme:any)=>String(theme.theme_key));
  const storedTheme=useMemo(()=>typeof window==='undefined'?null:window.localStorage.getItem('anunex-panel-theme'),[themeRevision]);
  const activeTheme=panelExperience?.specialDay?.theme_key||(storedTheme&&allowedThemeKeys.includes(storedTheme)?storedTheme:panelExperience?.defaultTheme||'ANUNEX_STANDARD');
  return <div className={`app-shell role-${user.role.toLowerCase()} ${mobileNavOpen?'nav-open':''}`} data-panel-theme={activeTheme}>
    <button className="nav-scrim" aria-label="Menüyü kapat" onClick={()=>setMobileNavOpen(false)}/>
    <aside className="sidebar" aria-label="Ana menü">
      <div className="brand"><AnunexBrand compact inverse tagline/><button className="mobile-nav-close" aria-label="Menüyü kapat" onClick={()=>setMobileNavOpen(false)}><X size={20}/></button></div>
      <div className="nibiru-sidebar-card"><NibiruMark size={36} state="active"/><div><strong>Nibiru AI</strong><span>Canlı akademik zekâ</span></div><ChevronRight size={16}/></div>
      <nav>{visibleNav.map((item) => { const Icon=item.icon; return <NavLink key={item.to} to={item.to} end={item.to==='/' } onClick={()=>setMobileNavOpen(false)} className={({isActive})=>isActive?'nav-item active':'nav-item'}><Icon size={19}/><span>{item.label}</span></NavLink>; })}</nav>
      <div className="sidebar-footer">
        <div className="user-card"><div className="avatar">{user.display_name.charAt(0)}</div><div><strong>{user.display_name}</strong><small>{roleName(user.role)}{institution?.name ? ` · ${institution.name}` : ''}</small></div></div>
        <button className="ghost sidebar-logout" onClick={async()=>{await logout();navigate('/login');}}><LogOut size={18}/>Çıkış</button>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu-button" aria-label="Menüyü aç" aria-expanded={mobileNavOpen} onClick={()=>setMobileNavOpen(true)}><Menu size={22}/></button><div className="topbar-context"><span className="eyebrow">2026–2027 Eğitim Dönemi</span><strong>{institution?.name || (user.role==='SUPER_ADMIN'?'Anunex Platform Yönetimi':'')}</strong></div><div className="topbar-actions"><div className="status neutral"><Sparkles size={15}/> Sistem hazır</div><NavLink to="/notifications" className="topbar-icon" aria-label="Bildirimler"><Bell size={19}/><i/></NavLink><NavLink to="/nibiru" className="nibiru-topbar"><NibiruMark size={23} state="active" title="Nibiru AI Akademik Zekâ"/><span>Nibiru AI</span></NavLink></div></header>
      {panelExperience?.specialDay&&<div className="special-day-banner" style={{background:`linear-gradient(90deg,${panelExperience.specialDay.accent_color},${panelExperience.specialDay.accent_color}dd)`}}><Sparkles size={20}/><div><strong>{panelExperience.specialDay.title}</strong><span>{panelExperience.specialDay.short_message}</span></div></div>}
      <div className="page-wrap"><LicenseBoundary><Outlet/></LicenseBoundary></div>
    </main>
  </div>;
}

function roleName(role: Role) {
  return ({ SUPER_ADMIN:'Süper Admin',INSTITUTION_MANAGER:'Kurum Yöneticisi',TEACHER:'Branş Öğretmeni',GUIDANCE_TEACHER:'Rehber Öğretmeni',STUDENT:'Öğrenci',PARENT:'Veli' } as const)[role];
}
