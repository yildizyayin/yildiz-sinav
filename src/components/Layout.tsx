import { useEffect,useMemo,useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, Bell, BookMarked, BookOpenCheck, Building2, CalendarDays, CalendarRange, Camera, ClipboardCheck, Database, FileUp, FlaskConical, GraduationCap, Home, KeyRound, Layers3, ListChecks, LogOut, Megaphone, MessageCircle, Printer, ScanLine, Search, ShieldCheck, Target, UserCheck, UserCog, UserRound, Users, UserRoundCheck } from 'lucide-react';
import { useAuth, type Role } from '../auth';
import { api } from '../api';
import { LicenseBoundary } from './LicenseBoundary';
import { NibiruMark,NibiruNavIcon } from './NibiruMark';

type NavItem={to:string;label:string;icon:any;feature?:string};
const nav: Record<Role, NavItem[]> = {
  SUPER_ADMIN: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/standard-readiness', label: 'Standard Hazırlık', icon: ShieldCheck },
    { to: '/exam-center', label: 'Sınav Merkezi', icon: ClipboardCheck },
    { to: '/nibiru', label: 'Nibiru', icon: NibiruNavIcon }, { to: '/nibiru-admin', label: 'Nibiru Yönetimi', icon: MessageCircle }, { to: '/licenses', label: 'Lisanslar', icon: KeyRound },
    { to: '/feature-lab', label: 'Feature Lab', icon: FlaskConical }, { to: '/content-center', label: 'Soru Havuzu & Studio', icon: Layers3, feature:'QUESTION_BANK' }, { to: '/enterprise', label: 'Enterprise', icon: Building2, feature:'ENTERPRISE' }, { to: '/board', label: 'Akıllı Tahta', icon: GraduationCap, feature:'BOARD' },
    { to: '/academic-target-admin', label: 'Resmî Hedef Verileri', icon: Target }, { to: '/official-question-intelligence', label: 'Çıkmış Soru & Kazanım', icon: BarChart3 }, { to: '/institutions', label: 'Kurumlar', icon: Building2 }, { to: '/curriculum', label: 'Müfredat & Kazanımlar', icon: BookMarked },
    { to: '/exam-definitions', label: 'Gelişmiş Sınav Tanımı', icon: ClipboardCheck }, { to: '/exams', label: 'Eski Sınav Listesi', icon: ClipboardCheck },
    { to: '/students', label: 'Öğrenciler', icon: Users }, { to: '/activation-requests', label: 'Aktivasyon Talepleri', icon: UserCheck }, { to: '/users', label: 'Kullanıcılar', icon: UserCog }, { to: '/access-accounts', label: 'Öğrenci/Veli Erişimi', icon: KeyRound }, { to: '/teacher-assignments', label: 'Öğretmen Yetkileri', icon: ShieldCheck }, { to: '/seasons', label: 'Sezonlar', icon: CalendarRange },
    { to: '/opticals', label: 'Optik Tanıtma', icon: ScanLine }, { to: '/optical-prepare', label: 'Optik Hazırla / Bas', icon: Printer }, { to: '/camera-test', label: 'Kamera Test Optiği', icon: Camera }, { to: '/calibration', label: 'Kalibrasyon', icon: Printer },
    { to: '/worksheet-admin', label: 'Föy Merkezi', icon: BookOpenCheck }, { to: '/worksheet-calendar', label: 'Föy Takvimi', icon: CalendarDays }, { to: '/bulk-operations', label: 'Toplu İşlemler', icon: Layers3 }, { to: '/demo-mode', label: 'Sentetik Demo', icon: FlaskConical }, { to: '/scale', label: 'Ölçek Altyapısı', icon: Database },
    { to: '/transfers', label: 'Veri Transferi', icon: FileUp }, { to: '/reports', label: 'Raporlar', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  INSTITUTION_MANAGER: [
    { to: '/', label: 'Kurum Paneli V2', icon: Home }, { to: '/exam-center', label: 'Sınav Merkezi', icon: ClipboardCheck }, { to: '/nibiru', label: 'Nibiru', icon: NibiruNavIcon }, { to: '/nibiru-admin', label: 'Nibiru Yönetimi', icon: MessageCircle },
    { to: '/content-center', label: 'Soru Havuzu & Studio', icon: Layers3,feature:'QUESTION_BANK' }, { to: '/enterprise', label: 'Enterprise / Campus', icon: Building2,feature:'ENTERPRISE' }, { to: '/board', label: 'Akıllı Tahta', icon: GraduationCap,feature:'BOARD' },
    { to: '/announcements', label: 'Duyuru Merkezi', icon: Megaphone }, { to: '/worksheet-calendar', label: 'Föy Takvimi', icon: CalendarDays }, { to: '/exam-definitions', label: 'Kendi Sınavını Oluştur', icon: ClipboardCheck }, { to: '/students', label: 'Öğrenciler', icon: Users },
    { to: '/activation-requests', label: 'Aktivasyon Talepleri', icon: UserCheck }, { to: '/users', label: 'Kullanıcılar', icon: UserCog }, { to: '/access-accounts', label: 'Öğrenci/Veli Erişimi', icon: KeyRound }, { to: '/teacher-assignments', label: 'Öğretmen Yetkileri', icon: ShieldCheck }, { to: '/seasons', label: 'Sezonlar', icon: CalendarRange }, { to: '/optical-prepare', label: 'Optik Hazırla / Bas', icon: Printer },
    { to: '/camera-test', label: 'Kamera Test Optiği', icon: Camera }, { to: '/calibration', label: 'Kalibrasyon', icon: ScanLine }, { to: '/bulk-operations', label: 'Toplu İşlemler', icon: Layers3 }, { to: '/reports', label: 'Raporlar', icon: BarChart3 },
    { to: '/worksheets', label: 'Föy Merkezi', icon: BookOpenCheck }, { to: '/transfers', label: 'Veri Transferi', icon: FileUp }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  TEACHER: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/nibiru', label: 'Nibiru', icon: NibiruNavIcon }, { to: '/content-center', label: 'Soru Havuzu & Studio', icon: Layers3,feature:'QUESTION_BANK' }, { to: '/board', label: 'Akıllı Tahta', icon: GraduationCap,feature:'BOARD' }, { to: '/announcements', label: 'Duyurular', icon: Megaphone }, { to: '/worksheet-calendar', label: 'Föy Takvimi', icon: CalendarDays }, { to: '/classes', label: 'Sınıflarım', icon: GraduationCap }, { to: '/exams', label: 'Sınavlar', icon: ClipboardCheck },
    { to: '/outcomes', label: 'Kazanımlar', icon: Target }, { to: '/worksheets', label: 'Föyler', icon: BookOpenCheck }, { to: '/reports', label: 'Branş Gelişimi', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  GUIDANCE_TEACHER: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/nibiru', label: 'Nibiru', icon: NibiruNavIcon }, { to: '/guidance-tests', label: 'RBA & Rehberlik Onayları', icon: ListChecks,feature:'GUIDANCE_TESTS' }, { to: '/content-center', label: 'Soru Havuzu & Studio', icon: Layers3,feature:'QUESTION_BANK' }, { to: '/board', label: 'Akıllı Tahta', icon: GraduationCap,feature:'BOARD' }, { to: '/announcements', label: 'Duyurular', icon: Megaphone }, { to: '/worksheet-calendar', label: 'Föy Takvimi', icon: CalendarDays }, { to: '/classes', label: 'Sınıflarım', icon: GraduationCap }, { to: '/exams', label: 'Sınavlar', icon: ClipboardCheck },
    { to: '/outcomes', label: 'Kazanımlar', icon: Target }, { to: '/worksheets', label: 'Föyler', icon: BookOpenCheck }, { to: '/reports', label: 'Öğrenci Gelişimi', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  STUDENT: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/nibiru', label: 'Nibiru', icon: NibiruNavIcon }, { to: '/academic-target', label: 'Hedeflerim', icon: Target }, { to: '/my-books', label: 'Benim Kitaplarım', icon: BookOpenCheck }, { to: '/student-growth', label: 'Gelişim & Recovery', icon: Target,feature:'LEARNING_GRAPH' }, { to: '/guidance-tests', label: 'Rehberlik Testleri', icon: ListChecks,feature:'GUIDANCE_TESTS' }, { to: '/premium', label: 'Gold / Premium / Live', icon: KeyRound,feature:'MEMBERSHIP' }, { to: '/my-results', label: 'Sonuçlarım', icon: ClipboardCheck }, { to: '/wrong-answers', label: 'Yanlış / Boş Sorularım', icon: ListChecks }, { to: '/worksheets', label: 'Föylerim', icon: BookOpenCheck }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  PARENT: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/nibiru', label: 'Nibiru', icon: NibiruNavIcon }, { to: '/children', label: 'Çocuklarım', icon: UserRoundCheck }, { to: '/weekly-summary', label: 'Haftalık Özet', icon: CalendarDays }, { to: '/reports', label: 'Gelişim', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
};

export function Layout() {
  const { user, institution, logout } = useAuth();
  const navigate = useNavigate();
  const [enabledFeatures,setEnabledFeatures]=useState<Set<string>>(new Set());
  const [logoutBusy,setLogoutBusy]=useState(false);
  const [logoutError,setLogoutError]=useState('');
  const [navSearch,setNavSearch]=useState('');
  useEffect(()=>{if(!user||user.role==='SUPER_ADMIN')return;void api<any>('/api/platform/features').then(r=>setEnabledFeatures(new Set((r.features||[]).filter((f:any)=>Number(f.effective_enabled||0)===1).map((f:any)=>String(f.feature_key))))).catch(()=>setEnabledFeatures(new Set()));},[user?.id,user?.role]);
  const visibleNav=useMemo(()=>user?nav[user.role].filter(item=>!item.feature||user.role==='SUPER_ADMIN'||enabledFeatures.has(item.feature)):[],[user,enabledFeatures]);
  const filteredNav=useMemo(()=>{const query=navSearch.trim().toLocaleLowerCase('tr-TR');return query?visibleNav.filter(item=>item.label.toLocaleLowerCase('tr-TR').includes(query)):visibleNav},[visibleNav,navSearch]);
  const groupedNav=useMemo(()=>{const groups=new Map<string,NavItem[]>();for(const item of filteredNav){const group=navGroup(item.to);groups.set(group,[...(groups.get(group)||[]),item])}return [...groups.entries()]},[filteredNav]);
  const signOut=async()=>{
    if(logoutBusy||!window.confirm('Bu cihazdaki güvenli oturumu sonlandırmak istiyor musunuz?'))return;
    try{
      setLogoutBusy(true);setLogoutError('');
      await logout();
      navigate('/login',{replace:true});
    }catch{
      setLogoutError('Oturum sunucuda sonlandırılamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.');
    }finally{setLogoutBusy(false)}
  };
  if (!user) return null;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><span>A</span><NibiruMark size={17} state="active" title="Anunex Nibiru AI"/></div><div><strong>ANUNEX</strong><span>Bilginin yörüngesinde · Nibiru AI</span></div></div>
      <label className="nav-search"><Search size={15}/><input value={navSearch} onChange={e=>setNavSearch(e.target.value)} placeholder="Menüde ara" aria-label="Menüde ara"/></label>
      <nav>{groupedNav.map(([group,items])=><div className="nav-group" key={group}><strong>{group}</strong>{items.map((item) => { const Icon=item.icon; return <NavLink key={item.to} to={item.to} end={item.to==='/' } className={({isActive})=>isActive?'nav-item active':'nav-item'}><Icon size={19}/><span>{item.label}</span></NavLink>; })}</div>)}</nav>
      <div className="sidebar-footer">
        <div className="user-card"><div className="avatar">{user.display_name.charAt(0)}</div><div><strong>{user.display_name}</strong><small>{roleName(user.role)}{institution?.name ? ` · ${institution.name}` : ''}</small></div></div>
        {logoutError&&<div className="sidebar-session-error" role="alert">{logoutError}</div>}
        <button className="ghost sidebar-logout" onClick={signOut} disabled={logoutBusy}><LogOut size={18}/>{logoutBusy?'Oturum kapatılıyor…':'Güvenli Çıkış'}</button>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><span className="eyebrow">2026–2027</span><strong>{institution?.name || (user.role==='SUPER_ADMIN'?'Anunex Platform Yönetimi':'')}</strong></div><div className="topbar-actions"><div className="status neutral"><NibiruMark size={18} state="active" title="Nibiru AI Akademik Zekâ"/> Nibiru AI</div><button className="topbar-logout" onClick={signOut} disabled={logoutBusy} title="Bu cihazdaki oturumu güvenli biçimde sonlandır"><LogOut size={17}/><span>{logoutBusy?'Kapatılıyor…':'Çıkış'}</span></button></div></header>
      <div className="page-wrap"><LicenseBoundary><Outlet/></LicenseBoundary></div>
    </main>
  </div>;
}

function roleName(role: Role) {
  return ({ SUPER_ADMIN:'Süper Admin',INSTITUTION_MANAGER:'Kurum Yöneticisi',TEACHER:'Branş Öğretmeni',GUIDANCE_TEACHER:'Rehber Öğretmeni',STUDENT:'Öğrenci',PARENT:'Veli' } as const)[role];
}

function navGroup(path:string){
 if(path==='/')return 'Genel Bakış';
 if(['/institutions','/students','/users','/access-accounts','/teacher-assignments','/activation-requests','/seasons','/classes','/children','/announcements'].includes(path))return 'Kurum & Kullanıcı';
 if(['/licenses','/membership-orders','/premium'].includes(path))return 'Lisans & Paketler';
 if(path.includes('exam')||['/opticals','/optical-prepare','/camera-test','/calibration'].includes(path))return 'Sınav & Optik';
 if(['/content-center','/curriculum','/outcomes','/worksheet-admin','/worksheet-calendar','/worksheets','/my-books','/wrong-answers','/board'].includes(path))return 'İçerik & Öğrenme';
 if(path.includes('nibiru')||path.includes('academic-target')||path.includes('guidance')||path==='/student-growth')return 'Nibiru AI';
 if(['/reports','/weekly-summary','/my-results','/notifications'].includes(path))return 'Rapor & Bildirim';
 return 'Sistem & Araçlar';
}
