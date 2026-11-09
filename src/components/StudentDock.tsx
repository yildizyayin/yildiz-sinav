import { BarChart3, Home, Menu, PenLine } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { NibiruMark } from './NibiruMark';

/**
 * Phone bottom bar for students (owner approved the glass draft, 9 Nov 2026): the four places a student goes most,
 * with Soru Çöz in the middle when the institution has the question bank on. "Menü" opens the full side menu,
 * so no page disappears from reach. Hidden on wide screens by CSS.
 */
export function StudentDock({ items, onMenu }: { items: { to: string }[]; onMenu: () => void }) {
  const has = (to: string) => items.some((item) => item.to === to);
  const cls = ({ isActive }: { isActive: boolean }) => `student-dock-link${isActive ? ' active' : ''}`;
  return <nav className="student-dock" aria-label="Hızlı menü">
    <NavLink to="/" end className={cls}><Home size={22} aria-hidden="true"/><span>Ana sayfa</span></NavLink>
    {has('/my-results') ? <NavLink to="/my-results" className={cls}><BarChart3 size={22} aria-hidden="true"/><span>Sonuçlarım</span></NavLink> : <span/>}
    {has('/question-practice') ? <NavLink to="/question-practice" className={({ isActive }) => `student-dock-main${isActive ? ' active' : ''}`} aria-label="Soru çöz"><PenLine size={26} aria-hidden="true"/></NavLink> : <span/>}
    {has('/nibiru') ? <NavLink to="/nibiru" className={cls}><NibiruMark size={22} state="active" title=""/><span>Nibiru</span></NavLink> : <span/>}
    <button type="button" className="student-dock-link" onClick={onMenu} aria-label="Tüm menüyü aç"><Menu size={22} aria-hidden="true"/><span>Menü</span></button>
  </nav>;
}
