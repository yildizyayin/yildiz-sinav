import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, Bell, BookMarked, BookOpenCheck, Building2, CalendarDays, CalendarRange, Camera, ClipboardCheck, Database, FileUp, FlaskConical, GraduationCap, Home, KeyRound, Layers3, ListChecks, LogOut, Printer, ScanLine, ShieldCheck, Target, UserCheck, UserCog, UserRound, Users, UserRoundCheck } from 'lucide-react';
import { useAuth, type Role } from '../auth';

const nav: Record<Role, Array<{ to: string; label: string; icon: any }>> = {
  SUPER_ADMIN: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/institutions', label: 'Kurumlar', icon: Building2 }, { to: '/curriculum', label: 'Müfredat & Kazanımlar', icon: BookMarked }, { to: '/exam-definitions', label: 'Sınav Oluştur', icon: ClipboardCheck }, { to: '/exams', label: 'Sınavlar', icon: ClipboardCheck },
    { to: '/students', label: 'Öğrenciler', icon: Users }, { to: '/activation-requests', label: 'Aktivasyon Talepleri', icon: UserCheck }, { to: '/users', label: 'Kullanıcılar', icon: UserCog }, { to: '/access-accounts', label: 'Öğrenci/Veli Erişimi', icon: KeyRound }, { to: '/teacher-assignments', label: 'Öğretmen Yetkileri', icon: ShieldCheck }, { to: '/seasons', label: 'Sezonlar', icon: CalendarRange },
    { to: '/opticals', label: 'Optik Tanıtma', icon: ScanLine }, { to: '/optical-prepare', label: 'Optik Hazırla / Bas', icon: Printer }, { to: '/camera-test', label: 'Kamera Test Optiği', icon: Camera }, { to: '/calibration', label: 'Kalibrasyon', icon: Printer },
    { to: '/worksheet-admin', label: 'Föy Merkezi', icon: BookOpenCheck }, { to: '/bulk-operations', label: 'Toplu İşlemler', icon: Layers3 }, { to: '/demo-mode', label: 'Demo Modu', icon: FlaskConical }, { to: '/scale', label: 'Ölçek Altyapısı', icon: Database },
    { to: '/transfers', label: 'Veri Transferi', icon: FileUp }, { to: '/reports', label: 'Raporlar', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  INSTITUTION_MANAGER: [
    { to: '/', label: 'Kurum Paneli V2', icon: Home }, { to: '/exam-definitions', label: 'Sınav Oluştur', icon: ClipboardCheck }, { to: '/exams', label: 'Sınavlar', icon: ClipboardCheck }, { to: '/students', label: 'Öğrenciler', icon: Users },
    { to: '/activation-requests', label: 'Aktivasyon Talepleri', icon: UserCheck }, { to: '/users', label: 'Kullanıcılar', icon: UserCog }, { to: '/access-accounts', label: 'Öğrenci/Veli Erişimi', icon: KeyRound }, { to: '/teacher-assignments', label: 'Öğretmen Yetkileri', icon: ShieldCheck }, { to: '/seasons', label: 'Sezonlar', icon: CalendarRange }, { to: '/optical-prepare', label: 'Optik Hazırla / Bas', icon: Printer },
    { to: '/camera-test', label: 'Kamera Test Optiği', icon: Camera }, { to: '/calibration', label: 'Kalibrasyon', icon: ScanLine }, { to: '/bulk-operations', label: 'Toplu İşlemler', icon: Layers3 }, { to: '/reports', label: 'Raporlar', icon: BarChart3 },
    { to: '/worksheets', label: 'Föy Merkezi', icon: BookOpenCheck }, { to: '/transfers', label: 'Veri Transferi', icon: FileUp }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  TEACHER: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/classes', label: 'Sınıflarım', icon: GraduationCap }, { to: '/exams', label: 'Sınavlar', icon: ClipboardCheck },
    { to: '/outcomes', label: 'Kazanımlar', icon: Target }, { to: '/worksheets', label: 'Föyler', icon: BookOpenCheck }, { to: '/reports', label: 'Branş Gelişimi', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  GUIDANCE_TEACHER: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/classes', label: 'Sınıflarım', icon: GraduationCap }, { to: '/exams', label: 'Sınavlar', icon: ClipboardCheck },
    { to: '/outcomes', label: 'Kazanımlar', icon: Target }, { to: '/worksheets', label: 'Föyler', icon: BookOpenCheck }, { to: '/reports', label: 'Öğrenci Gelişimi', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  STUDENT: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/my-results', label: 'Sonuçlarım', icon: ClipboardCheck }, { to: '/wrong-answers', label: 'Yanlış / Boş Sorularım', icon: ListChecks }, { to: '/worksheets', label: 'Föylerim', icon: BookOpenCheck }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
  PARENT: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/children', label: 'Çocuklarım', icon: UserRoundCheck }, { to: '/weekly-summary', label: 'Haftalık Özet', icon: CalendarDays }, { to: '/reports', label: 'Gelişim', icon: BarChart3 }, { to: '/notifications', label: 'Bildirimler', icon: Bell }, { to: '/profile', label: 'Profil', icon: UserRound },
  ],
};

export function Layout() {
  const { user, institution, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">Ö</div><div><strong>Ölçme Platformu</strong><span>V2</span></div></div>
      <nav>{nav[user.role].map((item) => { const Icon=item.icon; return <NavLink key={item.to} to={item.to} end={item.to==='/' } className={({isActive})=>isActive?'nav-item active':'nav-item'}><Icon size={19}/><span>{item.label}</span></NavLink>; })}</nav>
      <div className="sidebar-footer">
        <div className="user-card"><div className="avatar">{user.display_name.charAt(0)}</div><div><strong>{user.display_name}</strong><small>{roleName(user.role)}{institution?.name ? ` · ${institution.name}` : ''}</small></div></div>
        <button className="ghost sidebar-logout" onClick={async()=>{await logout();navigate('/login');}}><LogOut size={18}/>Çıkış</button>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><span className="eyebrow">2026–2027</span><strong>{institution?.name || (user.role==='SUPER_ADMIN'?'Platform Yönetimi':'')}</strong></div></header>
      <div className="page-wrap"><Outlet/></div>
    </main>
  </div>;
}

function roleName(role: Role) {
  return ({ SUPER_ADMIN:'Süper Admin',INSTITUTION_MANAGER:'Kurum Yöneticisi',TEACHER:'Branş Öğretmeni',GUIDANCE_TEACHER:'Rehber Öğretmeni',STUDENT:'Öğrenci',PARENT:'Veli' } as const)[role];
}
