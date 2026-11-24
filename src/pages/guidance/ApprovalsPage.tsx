import { useEffect, useState } from 'react';
import { api } from '../../api';
import { GuidanceToolReview } from './ToolsViews';
import { GuidanceContentReview } from './ContentViews';
import './guidance.css';

/**
 * Rehberlik Onayları (owner, 12 Nov 2026): every guidance draft waiting for the Super Admin in one place — tests and
 * surveys, class activities, family/teacher/student resources. Nothing reaches a school before it is approved here.
 */
export function GuidanceApprovals() {
  const [counts, setCounts] = useState<{ tools: number; templates: number; activities: number; resources: number } | null>(null);
  useEffect(() => {
    void Promise.all([api<any>('/api/guidance-tools/review-queue').catch(() => null), api<any>('/api/guidance-content/review').catch(() => null)]).then(([t, c]) => setCounts({
      tools: t?.instruments?.length || 0, templates: (t?.templates || []).filter((x: any) => x.kind !== 'RIBA' && !x.active).length,
      activities: c?.activities?.length || 0, resources: c?.resources?.length || 0 }));
  }, []);
  const total = counts ? counts.tools + counts.templates + counts.activities + counts.resources : null;
  return <div className="gd">
    <div className="page-head"><div><span className="eyebrow">Süper Admin</span><h1>Rehberlik Onayları</h1>
      <p className="muted">Rehberlik testleri, anketler, sınıf etkinlikleri ve kaynaklar okullara ancak burada onaylandıktan sonra açılır. Her taslağın maddelerini ya da metnini açıp okuyun; uygun değilse not yazıp reddedin.</p></div></div>
    {counts && <div className="gd-kpis">
      <div><b>{total}</b><span>onay bekleyen</span></div>
      <div><b>{counts.tools}</b><span>test</span></div>
      <div><b>{counts.templates}</b><span>anket şablonu</span></div>
      <div><b>{counts.activities}</b><span>etkinlik</span></div>
      <div><b>{counts.resources}</b><span>kaynak</span></div>
    </div>}
    <GuidanceToolReview />
    <GuidanceContentReview />
  </div>;
}
