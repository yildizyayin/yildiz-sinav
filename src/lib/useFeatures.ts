import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';

/**
 * Which institution features are on for the signed-in user. The Super Admin has all of them. While loading, `has`
 * answers false, so a disabled tab never flashes in and then disappears with an error.
 */
export function useFeatures() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!user || user.role === 'SUPER_ADMIN') { setEnabled(null); return; }
    void api<any>('/api/platform/features').then((r) => setEnabled(new Set((r.features || []).filter((f: any) => Number(f.effective_enabled || 0) === 1).map((f: any) => String(f.feature_key))))).catch(() => setEnabled(new Set()));
  }, [user?.id, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps
  return { has: (key: string) => user?.role === 'SUPER_ADMIN' || !!enabled?.has(key) };
}
