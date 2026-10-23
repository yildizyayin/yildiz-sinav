import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { physicalLinkTarget } from '../lib/physicalLink';

/** A078: a printed book's QR code opens the matching content in the app (the key is checked on the server). */
export function PhysicalLink() {
  const { key = '' } = useParams();
  const [link, setLink] = useState<any>(null); const [error, setError] = useState('');
  useEffect(() => { api<any>(`/api/platform/physical?key=${encodeURIComponent(key)}`).then((r) => setLink(r.link)).catch((e) => setError(e.message)); }, [key]);
  if (error) return <div className="alert error">Bu karekod için içerik bulunamadı veya erişim yetkiniz yok. ({error})</div>;
  if (!link) return <p>Yükleniyor…</p>;
  const target = physicalLinkTarget(link);
  if (target.kind === 'route' && target.to) return <Navigate to={target.to} replace />;
  return <div className="panel"><h2>{link.content_title}</h2>{link.page_from ? <p>Sayfa {link.page_from}{link.page_to && link.page_to !== link.page_from ? `–${link.page_to}` : ''}</p> : null}
    {target.kind === 'external' && target.to ? <a className="primary" href={target.to} target="_blank" rel="noreferrer">İçeriği aç</a> : <p>Bu karekodun bağlı olduğu içerik henüz tanımlanmamış.</p>}</div>;
}
