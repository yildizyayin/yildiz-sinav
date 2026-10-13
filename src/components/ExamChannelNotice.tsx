import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export function ExamChannelNotice({ examId, refreshKey }: { examId: string; refreshKey?: unknown }) {
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!examId || user?.role !== 'SUPER_ADMIN') return;
    void api<any>(`/api/admin/exams/${encodeURIComponent(examId)}/channels`).then(data => {
      if (cancelled) return;
      setRevision(data.savedRevision);
      setPending((data.channels || []).some((channel: any) => ['PENDING_UPDATE', 'REVISION_UNKNOWN'].includes(channel.status)));
    }).catch(() => { if (!cancelled) setPending(false); });
    return () => { cancelled = true; };
  }, [examId, refreshKey, user?.role]);
  if (!pending || revision === dismissed) return null;
  return <aside className="exam-channel-notice" role="status"><div><strong>Sonuç yayını güncel değil</strong><small>Kaydedilen değişiklikleri inceleyip yayın kanallarını güncelleyin.</small></div><Link to={`/exam-channels?examId=${encodeURIComponent(examId)}`}>İncele / güncelle</Link><button className="ghost" onClick={() => setDismissed(revision)}>Daha sonra</button></aside>;
}
