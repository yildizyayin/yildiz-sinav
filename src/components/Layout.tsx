import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, BookOpenCheck, Building2, CalendarRange, ClipboardCheck, FileUp, GraduationCap, Home, KeyRound, LogOut, Printer, ScanLine, ShieldCheck, Target, UserCog, Users, UserRoundCheck } from 'lucide-react';
import { useAuth, type Role } from '../auth';

const nav: Record<Role, Array<{ to: string; label: string; icon: any }>> = {
  SUPER_ADMIN: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/institutions', label: 'Kurumlar', icon: Building2 }, { to: '/exams', label: 'Sınavlar', icon: ClipboardCheck },
    { to: '/students', label: 'Öğrenciler', icon: Users }, { to: '/users', label: 'Kullanıcılar', icon: UserCog }, { to: '/access-accounts', label: 'Öğrenci/Veli Erişimi', icon: KeyRound }, { to: '/teacher-assignments', label: 'Öğretmen Yetkileri', icon: ShieldCheck }, { to: '/seasons', label: 'Sezonlar', icon: CalendarRange },
    { to: '/opticals', label: 'Optikler', icon: ScanLine }, { to: '/calibration', label: 'Kalibrasyon', icon: Printer },
    { to: '/worksheets', label: 'Föyler', icon: BookOpenCheck }, { to: '/transfers', label: 'Veri Transferi', icon: FileUp }, { to: '/reports', label: 'Raporlar', icon: BarChart3 },
  ],
  INSTITUTION_MANAGER: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/exams', label: 'Sınavlar', icon: ClipboardCheck }, { to: '/students', label: 'Öğrenciler', icon: Users },
    { to: '/users', label: 'Kullanıcılar', icon: UserCog }, { to: '/access-accounts', label: 'Öğrenci/Veli Erişimi', icon: KeyRound }, { to: '/teacher-assignments', label: 'Öğretmen Yetkileri', icon: ShieldCheck }, { to: '/seasons', label: 'Sezonlar', icon: CalendarRange }, { to: '/optical-prepare', label: 'Optik Hazırla', icon: Printer },
    { to: '/calibration', label: 'Kalibrasyon', icon: ScanLine }, { to: '/reports', label: 'Raporlar', icon: BarChart3 },
    { to: '/worksheets', label: 'Föyler', icon: BookOpenCheck }, { to: '/transfers', label: 'Veri Transferi', icon: FileUp },
  ],
  TEACHER: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/classes', label: 'Sınıflarım', icon: GraduationCap }, { to: '/exams', label: 'Sınavlar', icon: ClipboardCheck },
    { to: '/outcomes', label: 'Kazanımlar', icon: Target }, { to: '/worksheets', label: 'Föyler', icon: BookOpenCheck },
  ],
  GUIDANCE_TEACHER: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/classes', label: 'Sınıflarım', icon: GraduationCap }, { to: '/exams', label: 'Sınavlar', icon: ClipboardCheck },
    { to: '/reports', label: 'Öğrenci Gelişimi', icon: BarChart3 }, { to: '/outcomes', label: 'Kazanımlar', icon: Target }, { to: '/worksheets', label: 'Föyler', icon: BookOpenCheck },
  ],
  STUDENT: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/my-results', label: 'Sonuçlarım', icon: ClipboardCheck }, { to: '/outcomes', label: 'Kazanımlarım', icon: Target },
    { to: '/worksheets', label: 'Föylerim', icon: BookOpenCheck },
  ],
  PARENT: [
    { to: '/', label: 'Ana Sayfa', icon: Home }, { to: '/children', label: 'Çocuklarım', icon: UserRoundCheck }, { to: '/reports', label: 'Gelişim', icon: BarChart3 },
  ],
};

export function Layout() {
  const { user, institution, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">Ö</div><div><strong>Ölçme Platformu</strong><span>V1</span></div></div>
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
