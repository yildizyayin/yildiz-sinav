import { useEffect,useState } from 'react';
import { BarChart3,BookOpenCheck,BrainCircuit,ClipboardCheck,Layers3,Printer,Sparkles,Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export function InstitutionPanelV2(){
 const{institution}=useAuth();const[data,setData]=useState<any>(null);const[error,setError]=useState('');
 useEffect(()=>{void api<any>('/api/v2/institution-dashboard').then(setData).catch(e=>setError(e.message))},[]);
 if(error)return <div className="alert error">{error}</div>;
 return <>
  <div className="page-head"><div><span className="eyebrow">Anunex · Kurum Yönetimi</span><h1>{institution?.name||'Kurum Yönetimi'}</h1><p><strong>Bilginin yörüngesinde.</strong> Sınav, öğrenci, optik, soru havuzu, föy, Nibiru analizi ve rapor süreçlerini tek kontrol merkezinden yönetin.</p></div></div>
  <div className="kpi-grid">{(data?.cards||[]).map((c:any)=><div className="kpi-card" key={c.label}><span>{c.label}</span><strong>{c.value}</strong></div>)}</div>

  <div className="section-head"><div><span className="eyebrow">Nibiru AI</span><h2>Kurum ölçme ve gelişim zekâsı</h2><p>Nibiru yalnız yetkiniz kapsamındaki ANUNEX verilerini kullanır; eksik veri varsa tahmin üretmez.</p></div><Link className="link-button" to="/nibiru">Nibiru’yu Aç</Link></div>
  <div className="action-grid">
   <Link className="quick-card" to="/nibiru"><div className="quick-icon"><BrainCircuit/></div><div><h3>Kurum Analizi</h3><p>“Bu ay hangi sınıflar geriledi, neden ve ne yapmalıyız?” gibi soruları gerçek sınav ve kazanım verisiyle analiz edin.</p></div></Link>
   <Link className="quick-card" to="/reports"><div className="quick-icon"><Sparkles/></div><div><h3>Risk & Gelişim</h3><p>Sınıf, ders ve kazanım düzeyindeki gelişim sinyallerini raporlarla doğrulayın; Nibiru ile aksiyona dönüştürün.</p></div></Link>
   <Link className="quick-card" to="/worksheet-calendar"><div className="quick-icon"><BookOpenCheck/></div><div><h3>Föy Aksiyonu</h3><p>Zayıf kazanımları haftalık föy planı ve ölç–iyileştir–yeniden ölç döngüsüne bağlayın.</p></div></Link>
  </div>

  <div className="section-head"><div><h2>Hızlı işlemler</h2><p>Günlük ölçme ve değerlendirme operasyonlarının tamamı burada başlar.</p></div></div>
  <div className="action-grid">
   <Link className="quick-card" to="/exam-definitions"><div className="quick-icon"><ClipboardCheck/></div><div><h3>Sınav Oluştur</h3><p>Sınavı, kitapçıkları ve cevap anahtarını tanımlayın.</p></div></Link>
   <Link className="quick-card" to="/exams"><div className="quick-icon"><ClipboardCheck/></div><div><h3>Sınav Değerlendir</h3><p>Kamera, TXT/DAT ve kayıtlı optiklerden değerlendirme yapın.</p></div></Link>
   <Link className="quick-card" to="/optical-prepare"><div className="quick-icon"><Printer/></div><div><h3>Optik Hazırla / Bas</h3><p>Öğrenci bilgileri ve kitapçık kodu işlenmiş optikleri tekil veya toplu basın.</p></div></Link>
   <Link className="quick-card" to="/students"><div className="quick-icon"><Users/></div><div><h3>Öğrenciler</h3><p>Aktif ve misafir öğrencileri yönetin.</p></div></Link>
   <Link className="quick-card" to="/content-center"><div className="quick-icon"><Layers3/></div><div><h3>Soru Havuzu & Studio</h3><p>Kurum sorularını ekleyin; inceleme akışına gönderin ve sınav/föy taslağı üretin.</p></div></Link>
   <Link className="quick-card" to="/worksheets"><div className="quick-icon"><BookOpenCheck/></div><div><h3>Föy Merkezi</h3><p>Yayınlanmış haftalık föyleri ve video bağlantılarını kullanın.</p></div></Link>
   <Link className="quick-card" to="/bulk-operations"><div className="quick-icon"><Layers3/></div><div><h3>Toplu İşlemler</h3><p>Sınıflara toplu sınav katılımcısı veya föy atayın.</p></div></Link>
   <Link className="quick-card" to="/reports"><div className="quick-icon"><BarChart3/></div><div><h3>Rapor Merkezi</h3><p>Öğrenci, sınıf ve kurum gelişimini inceleyin.</p></div></Link>
  </div>
  <div className="section-head"><div><h2>Son sınavlar</h2><p>Kurumunuzun son sınav hareketleri.</p></div></div>
  <div className="cards-list">{(data?.recentExams||[]).map((e:any)=><div className="list-card" key={e.id}><div><strong>{e.title}</strong><span>{e.exam_type} · {e.exam_date||'Tarih yok'} · {e.status}</span></div><Link className="link-button" to={`/exams/${e.id}/evaluate`}>Aç</Link></div>)}{!data?.recentExams?.length&&<div className="empty">Henüz sınav hareketi bulunmuyor.</div>}</div>
 </>;
}
